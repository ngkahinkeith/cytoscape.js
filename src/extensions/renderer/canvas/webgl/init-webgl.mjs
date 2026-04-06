import { WebGLRenderLoop } from './render-loop.mjs';
import * as util from './webgl-util.mjs';
import { mat3 } from 'gl-matrix';

const CRp = {};

// Pre-allocated mat3 arrays reused every frame (avoids 3 typed-array allocs per frame)
const _transform = mat3.create();
const _projection = mat3.create();
const _product = mat3.create();
const _translateVec = [0, 0];  // reused by createPanZoomMatrix
const _scaleVec = [0, 0];

const PICK_SIZE = 6;
const PICK_PIXELS = PICK_SIZE * PICK_SIZE;

/**
 * Initialize the new WebGL rendering mode after the Canvas renderer has been set up.
 *
 * This replaces the old drawing-redraw-webgl.mjs init. The new architecture:
 * - process() reads all styles once (O(N)), triggered by data change events
 * - render() sets the camera uniform and draws (O(1)), runs every frame
 * - renderPicking() uses the SAME buffers, different shader output
 * - Labels are drawn on a separate Canvas 2D layer with LabelGrid culling
 */
CRp.initWebgl = function(opts) {
  const r = this;
  const glNode = r.data.contexts[r.NODE_WEBGL];
  const glEdge = r.data.contexts[r.EDGE_WEBGL];

  if(!glNode || !glEdge) return;

  // Two-canvas architecture for correct z-ordering:
  //   NODE_WEBGL (z-5): nodes — above labels
  //   NODE_LABELS (z-4): node labels
  //   EDGE_LABELS (z-3): edge labels
  //   EDGE_WEBGL (z-2): edges — below labels
  r.renderLoop = new WebGLRenderLoop(r, opts);
  r.renderLoop.init(glNode, glEdge);

  // Per-instance picking buffers (not shared across cy instances)
  r._pickData = new Uint8Array(PICK_PIXELS * 4);
  r._pickIndexes = new Set();

  // Create picking framebuffers on both contexts
  r.pickingFrameBufferNode = util.createPickingFrameBuffer(glNode);
  r.pickingFrameBufferNode.needsDraw = true;
  r.pickingFrameBufferEdge = util.createPickingFrameBuffer(glEdge);
  r.pickingFrameBufferEdge.needsDraw = true;

  // Override canvas renderer functions to use the new render loop
  overrideRendererFunctions(r);
};


/**
 * Build the combined projection * pan/zoom matrix for WebGL.
 */
function createPanZoomMatrix(r) {
  const width  = r.canvasWidth;
  const height = r.canvasHeight;
  const { pan, zoom } = util.getEffectivePanZoom(r);

  _translateVec[0] = pan.x;
  _translateVec[1] = pan.y;
  _scaleVec[0] = zoom;
  _scaleVec[1] = zoom;
  mat3.identity(_transform);
  mat3.translate(_transform, _transform, _translateVec);
  mat3.scale(_transform, _transform, _scaleVec);

  mat3.projection(_projection, width, height);

  mat3.multiply(_product, _projection, _transform);

  return _product;
}


/**
 * Set the 2D canvas context transform to match the current pan/zoom.
 */
function setContextTransform(r, context) {
  const width  = r.canvasWidth;
  const height = r.canvasHeight;
  const { pan, zoom } = util.getEffectivePanZoom(r);

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.translate(pan.x, pan.y);
  context.scale(zoom, zoom);
}


/**
 * Plug into the canvas renderer by dynamically overriding key functions.
 * This approach requires minimal changes to the canvas renderer source.
 */
function overrideRendererFunctions(r) {
  // --- Override render ---
  const renderCanvas = r.render;
  r.render = function(options) {
    if(r.destroyed || !r.renderLoop) return;
    options = options || {};
    clearCanvasLayers(r);
    renderWebgl(r, options);
  };

  // --- Override matchCanvasSize ---
  const baseMatchCanvas = r.matchCanvasSize;
  r.matchCanvasSize = function(container) {
    baseMatchCanvas.call(r, container);
    if(r.pickingFrameBufferNode) {
      r.pickingFrameBufferNode.setFramebufferAttachmentSizes(r.canvasWidth, r.canvasHeight);
      r.pickingFrameBufferNode.needsDraw = true;
    }
    if(r.pickingFrameBufferEdge) {
      r.pickingFrameBufferEdge.setFramebufferAttachmentSizes(r.canvasWidth, r.canvasHeight);
      r.pickingFrameBufferEdge.needsDraw = true;
    }
  };

  // --- Override findNearestElements for WebGL picking ---
  r.findNearestElements = function(x, y) {
    return findNearestElementsWebgl(r, x, y);
  };

  // --- Override invalidateCachedZSortedEles ---
  const baseInvalidateZ = r.invalidateCachedZSortedEles;
  r.invalidateCachedZSortedEles = function() {
    baseInvalidateZ.call(r);
    r.pickingFrameBufferNode.needsDraw = true;
    r.pickingFrameBufferEdge.needsDraw = true;
    r.renderLoop.invalidate();
  };

  // --- Override notify ---
  const baseNotify = r.notify;
  r.notify = function(eventName, eles) {
    baseNotify.call(r, eventName, eles);

    // After 'destroy', all resources are freed — skip further processing
    if(r.destroyed || !r.renderLoop) return;

    if(eventName === 'viewport') {
      // Camera changed — picking buffer is stale but NO buffer rebuild
      r.pickingFrameBufferNode.needsDraw = true;
      r.pickingFrameBufferEdge.needsDraw = true;

      // LODManager: mark as interacting during viewport changes (pan/zoom),
      // clear after 100ms debounce. When hideEdgesOnViewport is enabled,
      // edges are skipped during interaction for maximum pan/zoom fps.
      r.renderLoop.lodManager.setInteracting(true);
      clearTimeout(r._lodInteractTimeout);
      r._lodInteractTimeout = setTimeout(() => {
        if(r.renderLoop) {
          r.renderLoop.lodManager.setInteracting(false);
          r.data.canvasNeedsRedraw[r.NODE] = true;
          r.redraw();
        }
      }, 500);
    } else if(eventName === 'bounds') {
      // Position change (drag) — update just the moved elements
      r.pickingFrameBufferNode.needsDraw = true;
      r.pickingFrameBufferEdge.needsDraw = true;
      if(eles) {
        for(let i = 0; i < eles.length; i++) {
          const ele = eles[i];
          if(ele.isNode && ele.isNode()) {
            r.renderLoop.updateNodePosition(ele);
            r.renderLoop.updateConnectedEdges(ele);
          }
        }
      }
    } else if(eventName === 'add' || eventName === 'remove') {
      // Structural change — full process() with useCache=false to recompute
      // ALL edge control points (adding a parallel edge changes existing edges' geometry)
      r.renderLoop._hasProcessed = false;
      r.renderLoop.invalidate();
      r.pickingFrameBufferNode.needsDraw = true;
      r.pickingFrameBufferEdge.needsDraw = true;
    } else if(eventName === 'style') {
      // Incremental color update (sets styleDirty so pstyle returns fresh values)
      if(eles && eles.length > 0 && !r.renderLoop.needsProcess) {
        r.renderLoop.updateStyleIncremental(eles);
        // Incremental update sufficient for visual changes (click/select/activate).
        // Don't call invalidate() — avoids full O(N) process() with expensive
        // recalculateRenderedStyle that calls parallelEdges() for every edge.
      } else {
        r.renderLoop.invalidate();
      }
      r.renderLoop._overlayDirty = true;
      r.renderLoop.refreshOverlayColors();
      r.pickingFrameBufferNode.needsDraw = true;
      r.pickingFrameBufferEdge.needsDraw = true;
    } else if(eventName === 'background') {
      // Background image finished loading — rebuild textures
      r.renderLoop.invalidate();
      r.pickingFrameBufferNode.needsDraw = true;
      r.pickingFrameBufferEdge.needsDraw = true;
    }
  };

  // --- onUpdateEleCalcs: NO-OP for rendering ---
  // The new architecture does NOT re-read styles on every frame.
  // Style reads happen only in process(), triggered by data change events.
  // This callback fires on every viewport change; rebuilding would be O(N) per frame.
  // We intentionally do nothing here — atlas GC is handled via the renderLoop's
  // own invalidation events (add/remove/style).
  r.onUpdateEleCalcs(function(willDraw, eles) {
    // No-op: do not invalidate renderLoop or rebuild buffers here.
  });

  // --- Override destroy to clean up ALL WebGL + renderer resources ---
  const baseDestroy = r.destroy;
  r.destroy = function() {
    // 0. Clear LOD debounce timer to prevent post-destroy callback
    clearTimeout(r._lodInteractTimeout);

    // 1. WebGL render loop — frees GPU buffers, CPU typed arrays, element slot refs
    if(r.renderLoop) {
      r.renderLoop.destroy();
      r.renderLoop = null;
    }

    // 2. Picking framebuffers — frees FB + color texture on both contexts
    if(r.pickingFrameBufferNode) {
      r.pickingFrameBufferNode.destroy();
      r.pickingFrameBufferNode = null;
    }
    if(r.pickingFrameBufferEdge) {
      r.pickingFrameBufferEdge.destroy();
      r.pickingFrameBufferEdge = null;
    }

    // 3. Label offscreen canvas
    r._labelBuffer = null;

    // 4. Lose WebGL contexts to release GPU memory immediately
    const glNode = r.data && r.data.contexts && r.data.contexts[r.NODE_WEBGL];
    if(glNode) {
      const ext = glNode.getExtension('WEBGL_lose_context');
      if(ext) ext.loseContext();
    }
    const glEdge = r.data && r.data.contexts && r.data.contexts[r.EDGE_WEBGL];
    if(glEdge) {
      const ext = glEdge.getExtension('WEBGL_lose_context');
      if(ext) ext.loseContext();
    }

    // 5. Null canvas/context references
    if(r.data) {
      r.data.canvases = null;
      r.data.contexts = null;
      r.data.bufferCanvases = null;
      r.data.bufferContexts = null;
    }

    // Element cleanup handled by cy.destroy() — don't duplicate here
    baseDestroy.call(r);
  };
}


/**
 * Clear the Canvas 2D node/drag layers (they are behind WebGL layers).
 */
function clearCanvasLayers(r) {
  const clear = context => {
    if(!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, r.canvasWidth, r.canvasHeight);
    context.restore();
  };
  clear(r.data.contexts[r.NODE]);
  clear(r.data.contexts[r.DRAG]);
}


/**
 * Render one frame via the new WebGL render loop.
 */
function renderWebgl(r, options) {
  if(r.data.canvasNeedsRedraw[r.SELECT_BOX]) {
    r.drawSelectionRectangle(options, context => setContextTransform(r, context));
  }

  // Compute pan/zoom once for all render paths (avoids 3 redundant getEffectivePanZoom calls)
  const { pan, zoom } = util.getEffectivePanZoom(r);

  if(r.data.canvasNeedsRedraw[r.NODE] || r.data.canvasNeedsRedraw[r.DRAG] || r.renderLoop.needsProcess) {
    const rl = r.renderLoop;
    const anyBufferDirty = rl.needsProcess ||
                           rl.edgeProgram.needsUpload ||
                           rl.nodeSDFProgram.needsUpload ||
                           rl.nodeTexProgram.needsUpload;
    const cameraChanged = pan.x !== r._wglLastPanX || pan.y !== r._wglLastPanY || zoom !== r._wglLastZoom;
    const drawEdges = rl.lodManager.shouldDrawEdges();
    const lodChanged = drawEdges !== r._wglLastDrawEdges;

    if(!cameraChanged && !anyBufferDirty && !lodChanged) {
      // Scene state identical to last rendered frame — skip GPU work
    } else {
      const isInteracting = rl.lodManager.isInteracting();
      const needsDataUpdate = rl.needsProcess;
      const now = performance.now();
      const timeSinceRender = now - (r._wglLastRenderTime || 0);

      if(isInteracting && !needsDataUpdate && timeSinceRender < 16) {
        // Skip WebGL draw on throttled frames, but fall through to label CSS transforms
      } else {
        r._wglLastRenderTime = now;
        const panZoomMatrix = createPanZoomMatrix(r);
        rl.render(panZoomMatrix, zoom, pan);
      }

      r._wglLastPanX = pan.x;
      r._wglLastPanY = pan.y;
      r._wglLastZoom = zoom;
      r._wglLastDrawEdges = drawEdges;
    }

    r.data.canvasNeedsRedraw[r.NODE] = false;
    r.data.canvasNeedsRedraw[r.DRAG] = false;
  }

  // --- Labels (Canvas 2D overlay) ---
  // Skip label rendering during interaction — iterating 275K candidates + Canvas 2D
  // text drawing is the dominant per-frame CPU cost (~30-40ms at 275K elements).
  // Labels reappear after interaction stops (100ms debounce via LODManager).
  if(!r.renderLoop.lodManager.shouldDrawLabels()) {
    // During interaction: use CSS transform to move label canvases with pan/zoom.
    // Like Flightradar24 — labels follow nodes without expensive re-rendering.
    // Labels re-render at full quality after interaction stops (1s debounce).
    if(r._lastLabelPan) {
      // pan/zoom values are in device pixels (multiplied by pixelRatio),
      // but CSS transforms operate in CSS pixels. Divide by pixelRatio.
      const pr = r.pixelRatio;
      const dpx = (pan.x - r._lastLabelPan.x) / pr;
      const dpy = (pan.y - r._lastLabelPan.y) / pr;
      const dzoom = zoom / r._lastLabelZoom;
      const originX = r._lastLabelPan.x / pr;
      const originY = r._lastLabelPan.y / pr;
      const tx = `translate(${dpx}px, ${dpy}px) scale(${dzoom})`;
      const nodeLabelCanvas = r.data.canvases[r.NODE_LABELS];
      const edgeLabelCanvas = r.data.canvases[r.EDGE_LABELS];
      if(nodeLabelCanvas) {
        nodeLabelCanvas.style.transformOrigin = `${originX}px ${originY}px`;
        nodeLabelCanvas.style.transform = tx;
      }
      if(edgeLabelCanvas) {
        edgeLabelCanvas.style.transformOrigin = `${originX}px ${originY}px`;
        edgeLabelCanvas.style.transform = tx;
      }
    }
  } else {
    // Cap label rendering at ~60fps (expensive Canvas 2D text drawing)
    const labelNow = performance.now();
    const labelTimeSince = labelNow - (r._wglLastLabelTime || 0);
    if(labelTimeSince < 16) {
      // Skip — labels were just rendered
    } else {
    r._wglLastLabelTime = labelNow;

    // Reset CSS transform and re-render labels at full quality
    const nodeLabelCanvas = r.data.canvases[r.NODE_LABELS];
    const edgeLabelCanvas = r.data.canvases[r.EDGE_LABELS];
    if(nodeLabelCanvas) nodeLabelCanvas.style.transform = '';
    if(edgeLabelCanvas) edgeLabelCanvas.style.transform = '';

    // Helper: render labels to an offscreen buffer then blit to a target canvas
    const blitLabels = (targetCtx, bufferKey, renderFn) => {
      if(!targetCtx) return;
      if(!r[bufferKey] || r[bufferKey].width !== r.canvasWidth || r[bufferKey].height !== r.canvasHeight) {
        r[bufferKey] = r.makeOffscreenCanvas(r.canvasWidth, r.canvasHeight);
      }
      const bufCtx = r[bufferKey].getContext('2d');
      bufCtx.setTransform(1, 0, 0, 1, 0, 0);
      bufCtx.clearRect(0, 0, r.canvasWidth, r.canvasHeight);
      bufCtx.translate(pan.x, pan.y);
      bufCtx.scale(zoom, zoom);
      renderFn(bufCtx);
      targetCtx.save();
      targetCtx.setTransform(1, 0, 0, 1, 0, 0);
      targetCtx.globalCompositeOperation = 'copy';
      targetCtx.drawImage(r[bufferKey], 0, 0);
      targetCtx.globalCompositeOperation = 'source-over';
      targetCtx.restore();
    };

    blitLabels(
      r.data.contexts[r.NODE_LABELS], '_nodeLabelBuffer',
      (ctx) => r.renderLoop.renderLabels(ctx, pan, zoom, r.canvasWidth, r.canvasHeight, true)
    );
    blitLabels(
      r.data.contexts[r.EDGE_LABELS], '_edgeLabelBuffer',
      (ctx) => r.renderLoop.renderLabels(ctx, pan, zoom, r.canvasWidth, r.canvasHeight, false)
    );

    // Track pan/zoom for CSS transform during next interaction
    r._lastLabelPan = { x: pan.x, y: pan.y };
    r._lastLabelZoom = zoom;
    } // end label time cap
  } // end else (shouldDrawLabels)
}


/**
 * Pick elements under or near the cursor using the WebGL picking framebuffer.
 * Arguments (x, y) are in model coordinates.
 */
function findNearestElementsWebgl(r, x, y) {
  // Skip picking during active interaction (pan/zoom/drag) to avoid
  // expensive full re-render of all edges on every mouse move.
  // Picking resumes when interaction ends (needsDraw stays true).
  if(r.hoverData && r.hoverData.dragging) return [];
  if(r.swipePanning) return [];

  // Debounce: if cursor barely moved and last pick was <16ms ago, return cached result
  const now = performance.now();
  if(r._lastPickTime && (now - r._lastPickTime) < 16 && r._lastPickResult) {
    const dx = Math.abs(x - r._lastPickX);
    const dy = Math.abs(y - r._lastPickY);
    if(dx < 2 && dy < 2) return r._lastPickResult;
  }
  r._lastPickTime = now;
  r._lastPickX = x;
  r._lastPickY = y;

  const { pan, zoom } = util.getEffectivePanZoom(r);
  const [ rx, ry ] = util.modelToRenderedPosition(r, pan, zoom, x, y);

  const needsDraw = r.pickingFrameBufferNode.needsDraw || r.pickingFrameBufferEdge.needsDraw;

  if(needsDraw) {
    const panZoomMatrix = createPanZoomMatrix(r);

    // Upload and render picking on both contexts
    const glNode = r.data.contexts[r.NODE_WEBGL];
    r.renderLoop.nodeSDFProgram.upload(glNode);
    r.renderLoop.nodeTexProgram.upload(glNode);

    const glEdge = r.data.contexts[r.EDGE_WEBGL];
    r.renderLoop.edgeProgram.upload(glEdge);

    r.renderLoop.renderPicking(r.pickingFrameBufferNode, r.pickingFrameBufferEdge, panZoomMatrix, zoom);
    r.pickingFrameBufferNode.needsDraw = false;
    r.pickingFrameBufferEdge.needsDraw = false;

    // Picking upload() resets needsUpload flags. If buffer data was modified
    // (e.g., overlay for :selected), the screen render must also re-draw.
    // Invalidate cached state so renderWebgl() doesn't skip the next frame.
    r._wglLastPanX = NaN;
  }

  const px = Math.round(rx - PICK_SIZE / 2);
  const py = Math.round(ry - PICK_SIZE / 2);

  // Read node picks from node FBO
  r._pickIndexes.clear();
  const glNode = r.data.contexts[r.NODE_WEBGL];
  glNode.bindFramebuffer(glNode.FRAMEBUFFER, r.pickingFrameBufferNode);
  glNode.readPixels(px, py, PICK_SIZE, PICK_SIZE, glNode.RGBA, glNode.UNSIGNED_BYTE, r._pickData);
  glNode.bindFramebuffer(glNode.FRAMEBUFFER, null);

  for(let i = 0; i < PICK_PIXELS; i++) {
    const off = i * 4;
    const index = (r._pickData[off] | (r._pickData[off+1] << 8) | (r._pickData[off+2] << 16) | (r._pickData[off+3] << 24)) - 1;
    if(index >= 0) r._pickIndexes.add(index);
  }

  // Read edge picks from edge FBO
  const glEdge = r.data.contexts[r.EDGE_WEBGL];
  glEdge.bindFramebuffer(glEdge.FRAMEBUFFER, r.pickingFrameBufferEdge);
  glEdge.readPixels(px, py, PICK_SIZE, PICK_SIZE, glEdge.RGBA, glEdge.UNSIGNED_BYTE, r._pickData);
  glEdge.bindFramebuffer(glEdge.FRAMEBUFFER, null);

  for(let i = 0; i < PICK_PIXELS; i++) {
    const off = i * 4;
    const index = (r._pickData[off] | (r._pickData[off+1] << 8) | (r._pickData[off+2] << 16) | (r._pickData[off+3] << 24)) - 1;
    if(index >= 0) r._pickIndexes.add(index);
  }

  // Map indices to elements — return topmost (highest z-index) element
  // Higher indices are drawn later and occlude earlier ones
  const eles = r.getCachedZSortedEles();
  let maxNodeIdx = -1;
  let maxEdgeIdx = -1;

  for(const index of r._pickIndexes) {
    const ele = eles[index];
    if(ele) {
      if(ele.isNode() && index > maxNodeIdx) maxNodeIdx = index;
      if(ele.isEdge() && index > maxEdgeIdx) maxEdgeIdx = index;
    }
  }

  let node = maxNodeIdx >= 0 ? eles[maxNodeIdx] : undefined;
  let edge = maxEdgeIdx >= 0 ? eles[maxEdgeIdx] : undefined;

  const result = [node, edge].filter(Boolean);
  r._lastPickResult = result;
  return result;
}

export default CRp;
