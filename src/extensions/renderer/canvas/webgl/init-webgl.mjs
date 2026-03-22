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
const _pickData = new Uint8Array(PICK_PIXELS * 4);

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

  // Create the render loop (reads styles via pstyle(), no callback functions needed)
  r.renderLoop = new WebGLRenderLoop(r, opts);
  r.renderLoop.init(glNode, glEdge);

  // Create picking framebuffer on the node GL context
  r.pickingFrameBuffer = util.createPickingFrameBuffer(glNode);
  r.pickingFrameBuffer.needsDraw = true;

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
    options = options || {};
    const cy = r.cy;

    if(r.webgl && r.renderLoop) {
      // Always use WebGL — SDF shapes are resolution-independent at any zoom
      clearCanvasLayers(r);
      renderWebgl(r, options);
    }
  };

  // --- Override matchCanvasSize ---
  const baseMatchCanvas = r.matchCanvasSize;
  r.matchCanvasSize = function(container) {
    baseMatchCanvas.call(r, container);
    if(r.pickingFrameBuffer) {
      r.pickingFrameBuffer.setFramebufferAttachmentSizes(r.canvasWidth, r.canvasHeight);
      r.pickingFrameBuffer.needsDraw = true;
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
    r.pickingFrameBuffer.needsDraw = true;
    r.renderLoop.invalidate();
  };

  // --- Override notify ---
  const baseNotify = r.notify;
  r.notify = function(eventName, eles) {
    baseNotify.call(r, eventName, eles);

    if(eventName === 'viewport') {
      // Camera changed — picking buffer is stale but NO buffer rebuild
      r.pickingFrameBuffer.needsDraw = true;
    } else if(eventName === 'bounds') {
      // Position change (drag) — update just the moved elements
      r.pickingFrameBuffer.needsDraw = true;
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
      // Structural change — full process() on next render
      r.renderLoop.invalidate();
      r.pickingFrameBuffer.needsDraw = true;
    } else if(eventName === 'style') {
      // Overlay: update immediately via _private.active (O(k) for affected elements)
      r.renderLoop._overlayDirty = true;
      r.renderLoop.refreshOverlayColors();
      // Style: incrementally update affected elements' colors in the buffer (O(k))
      // instead of full O(N) process() rebuild
      if(eles && eles.length > 0) {
        r.renderLoop.updateStyleIncremental(eles);
      } else {
        r.renderLoop.invalidate();
      }
      r.pickingFrameBuffer.needsDraw = true;
    } else if(eventName === 'background') {
      // Background image finished loading — rebuild textures
      r.renderLoop.invalidate();
      r.pickingFrameBuffer.needsDraw = true;
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
  // --- Selection rectangle on its own canvas layer ---
  if(r.data.canvasNeedsRedraw[r.SELECT_BOX]) {
    r.drawSelectionRectangle(options, context => setContextTransform(r, context));
  }

  // --- WebGL ---
  if(r.data.canvasNeedsRedraw[r.NODE] || r.data.canvasNeedsRedraw[r.DRAG] || r.renderLoop.needsProcess) {
    const panZoomMatrix = createPanZoomMatrix(r);
    const { pan, zoom } = util.getEffectivePanZoom(r);

    // Render edges + nodes via WebGL
    r.renderLoop.render(panZoomMatrix, zoom);

    r.data.canvasNeedsRedraw[r.NODE] = false;
    r.data.canvasNeedsRedraw[r.DRAG] = false;
  }

  // --- Labels (Canvas 2D overlay, redrawn every frame) ---
  // Draw to offscreen buffer first, then blit with 'copy' compositing
  // to replace the visible canvas atomically (prevents flicker).
  const labelCtx = r.data.contexts[r.LABELS];
  if(labelCtx) {
    const { pan, zoom } = util.getEffectivePanZoom(r);

    if(!r._labelBuffer || r._labelBuffer.width !== r.canvasWidth || r._labelBuffer.height !== r.canvasHeight) {
      r._labelBuffer = r.makeOffscreenCanvas(r.canvasWidth, r.canvasHeight);
    }
    const bufCtx = r._labelBuffer.getContext('2d');
    bufCtx.setTransform(1, 0, 0, 1, 0, 0);
    bufCtx.clearRect(0, 0, r.canvasWidth, r.canvasHeight);
    bufCtx.translate(pan.x, pan.y);
    bufCtx.scale(zoom, zoom);
    r.renderLoop.renderLabels(bufCtx, pan, zoom, r.canvasWidth, r.canvasHeight);

    // Atomic blit: 'copy' replaces all pixels in one operation
    labelCtx.save();
    labelCtx.setTransform(1, 0, 0, 1, 0, 0);
    labelCtx.globalCompositeOperation = 'copy';
    labelCtx.drawImage(r._labelBuffer, 0, 0);
    labelCtx.globalCompositeOperation = 'source-over';
    labelCtx.restore();
  }
}


/**
 * Pick elements under or near the cursor using the WebGL picking framebuffer.
 * Arguments (x, y) are in model coordinates.
 */
function findNearestElementsWebgl(r, x, y) {
  const { pan, zoom } = util.getEffectivePanZoom(r);
  const [ rx, ry ] = util.modelToRenderedPosition(r, pan, zoom, x, y);

  const gl = r.data.contexts[r.NODE_WEBGL];
  gl.bindFramebuffer(gl.FRAMEBUFFER, r.pickingFrameBuffer);

  if(r.pickingFrameBuffer.needsDraw) {
    // Ensure GPU buffers are current before picking
    const glEdge = r.data.contexts[r.EDGE_WEBGL];
    r.renderLoop.nodeSDFProgram.upload(gl);
    r.renderLoop.nodeTexProgram.upload(gl);
    r.renderLoop.edgeProgram.upload(glEdge);
    r.renderLoop.edgeProgram.uploadPicking(gl); // edge data on node GL context for picking

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    const panZoomMatrix = createPanZoomMatrix(r);
    r.renderLoop.renderPicking(r.pickingFrameBuffer, panZoomMatrix, zoom);
    r.pickingFrameBuffer.needsDraw = false;
  }

  // Read a 6x6 pixel area around the cursor
  const px = Math.round(rx - PICK_SIZE / 2);
  const py = Math.round(ry - PICK_SIZE / 2);
  gl.readPixels(px, py, PICK_SIZE, PICK_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, _pickData);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Decode pick indices (read directly from buffer, no slice)
  const indexes = new Set();
  for(let i = 0; i < PICK_PIXELS; i++) {
    const off = i * 4;
    const index = (_pickData[off] | (_pickData[off+1] << 8) | (_pickData[off+2] << 16) | (_pickData[off+3] << 24)) - 1;
    if(index >= 0) {
      indexes.add(index);
    }
  }

  // Map indices to elements
  const eles = r.getCachedZSortedEles();
  let node, edge;

  for(const index of indexes) {
    const ele = eles[index];
    if(ele) {
      if(!node && ele.isNode()) {
        node = ele;
      }
      if(!edge && ele.isEdge()) {
        edge = ele;
      }
      if(node && edge) {
        break;
      }
    }
  }

  return [node, edge].filter(Boolean);
}

export default CRp;
