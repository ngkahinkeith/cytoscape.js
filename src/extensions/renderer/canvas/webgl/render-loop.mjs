import { NodeSDFProgram, NODE_STRIDE, SHAPE_ENUM } from './programs/node-sdf.mjs';
import { NodeTextureProgram } from './programs/node-texture.mjs';
import { EdgeProgram, EDGE_STRIDE } from './programs/edge.mjs';
import { TexturePageManager } from './texture-page-manager.mjs';
import { LabelGrid } from './label-grid.mjs';
import { packPremulColor, packColor, packPickIndex } from './color-pack.mjs';
import { getRoundRectangleRadius } from '../../../../math.mjs';

/**
 * WebGLRenderLoop — the main orchestrator for the new WebGL renderer.
 *
 * process(): reads element styles, packs into typed arrays. O(N), runs on data change.
 * render(): sets camera uniform, issues draw calls. O(1), runs every frame.
 * renderPicking(): same buffers, picking shader. O(1), no buffer overwrite.
 * renderLabels(): Canvas 2D labels with LabelGrid culling.
 */
export class WebGLRenderLoop {
  constructor(r, opts = {}) {
    this.r = r;              // canvas renderer reference
    this.nodeSDFProgram = new NodeSDFProgram();
    this.nodeTexProgram = new NodeTextureProgram();
    this.edgeProgram = new EdgeProgram();
    this.texturePageManager = new TexturePageManager({
      maxPageSize: opts.webglTexSize || 4096,
      maxImageSize: opts.maxImageSize || 512,
    });
    this.labelGrid = new LabelGrid(opts.labelGridCellSize || 100);

    this.needsProcess = true;  // true on first frame and after data changes
    this._overlayDirty = true; // set by notify('style'), gates refreshOverlayColors O(N) scan
    this._activeEdges = [];    // edges with :active state, rebuilt by refreshOverlayColors
    this._initialized = false;

    // Label data for Canvas 2D rendering
    this._labelCandidates = [];
  }

  /** Initialize GL resources. Called once when WebGL context is available. */
  init(glNode, glEdge) {
    // glNode = WebGL2 context for node canvas layer
    // glEdge = WebGL2 context for edge canvas layer
    this.glNode = glNode;
    this.glEdge = glEdge;

    this.nodeSDFProgram.init(glNode);
    this.nodeTexProgram.init(glNode);
    this.edgeProgram.init(glEdge);
    this.edgeProgram.initPicking(glNode); // edge picking on node GL context

    // Wire texture page manager to the node texture program
    this.nodeTexProgram.setTextureManager(this.texturePageManager);

    // Wire texture page manager updates
    this.texturePageManager.onUpdate(() => {
      this.nodeTexProgram.needsUpload = true;
      this.needsProcess = true; // re-process to update atlas coordinates
      this._texturesUploaded = false;
      // Trigger a redraw so the render loop picks up the new textures
      if(this.r && this.r.data) {
        this.r.data.canvasNeedsRedraw[this.r.NODE] = true;
        this.r.redraw();
      }
    });

    this._initialized = true;
  }

  /**
   * Process all elements — rebuild typed arrays from element data.
   * This is O(N) and runs ONLY on data changes (add/remove/style).
   * All pstyle() calls happen here, not in render().
   */
  process() {
    const r = this.r;

    const eles = r.getCachedZSortedEles();

    // Count elements by type
    let nodeCount = 0;
    let texturedNodeCount = 0;
    let edgeInstanceCount = 0;
    let overlaySlotCount = 0; // extra SDF instances for overlay/underlay

    // Single counting pass to determine buffer sizes
    for(let i = 0; i < eles.length; i++) {
      const ele = eles[i];
      if(ele.isNode()) {
        nodeCount++;
        const bgImg = ele.pstyle('background-image');
        if(bgImg && bgImg.strValue && bgImg.strValue !== 'none') {
          texturedNodeCount++;
          this.texturePageManager.registerImage(bgImg.strValue);
        }
        overlaySlotCount++; // overlay always pre-allocated
        if(ele.pstyle('underlay-opacity').value > 0) overlaySlotCount++;
      } else {
        const rs = ele._private.rscratch;
        if(rs && !rs.badLine && rs.allpts) {
          edgeInstanceCount += rs.allpts.length === 4 ? 1 : 16;
          if(ele.pstyle('source-arrow-shape').value !== 'none') edgeInstanceCount++;
          if(ele.pstyle('target-arrow-shape').value !== 'none') edgeInstanceCount++;
        }
      }
    }

    // Reallocate buffers
    this.nodeSDFProgram.reallocate(nodeCount + overlaySlotCount);
    this.nodeTexProgram.reallocate(texturedNodeCount);
    this.nodeTexProgram.count = texturedNodeCount;
    this.edgeProgram.reallocate(Math.ceil(edgeInstanceCount * 1.1));

    // Pack data
    let nodeSlot = 0;
    let texNodeSlot = 0;
    let edgeSlot = 0;
    let pickIndex = 1;

    this._labelCandidates = [];

    for(let i = 0; i < eles.length; i++) {
      const ele = eles[i];

      if(ele.isNode()) {
        // Track all SDF slots for this node (body + underlay + overlay)
        const nodeSlots = [];

        // Pack underlay (drawn before/behind the node body)
        const underlayOpacity = ele.pstyle('underlay-opacity').value;
        if(underlayOpacity > 0) {
          this._packOverlayInstance(nodeSlot, ele, 'underlay', pickIndex);
          nodeSlots.push(nodeSlot);
          nodeSlot++;
        }

        // Check if node has bg-image
        const bgImg = ele.pstyle('background-image');
        const hasTexture = bgImg && bgImg.strValue && bgImg.strValue !== 'none';

        // Pack SDF node (renders background-color shape for all nodes)
        this.nodeSDFProgram.processNode(nodeSlot, ele, pickIndex);

        if(hasTexture) {
          // Texture overlay renders the bg-image on top of the SDF shape.
          // With transparent SVGs, the SDF background-color shows through.
          this.nodeTexProgram.processNode(texNodeSlot, ele, pickIndex, this.texturePageManager);
          ele._private._webglTexSlot = texNodeSlot;
          texNodeSlot++;
        } else {
          ele._private._webglTexSlot = undefined;
        }
        nodeSlots.push(nodeSlot);

        nodeSlot++;

        // Always pack overlay slot (transparent if inactive, discarded by fragment shader)
        this._packOverlayInstance(nodeSlot, ele, 'overlay', pickIndex);
        ele._private._webglOverlaySlot = nodeSlot;
        nodeSlots.push(nodeSlot);
        nodeSlot++;

        // Store all SDF slots for position update during drag
        ele._private._webglNodeSlots = nodeSlots;

        // Collect label candidate
        const label = ele.pstyle('label');
        if(label && label.value) {
          this._labelCandidates.push({
            ele,
            screenX: 0, screenY: 0, // filled in renderLabels()
            baseSize: ele.outerWidth(),
            screenSize: 0,
            fontSize: ele.pstyle('font-size').pfValue,
            isNode: true,
          });
        }
      } else {
        // Pack edge data (segments + arrows)
        const prevSlot = edgeSlot;
        edgeSlot = this.edgeProgram.processEdge(edgeSlot, ele, pickIndex, r);
        ele._private._webglEdgeSlot = prevSlot;
        ele._private._webglEdgeInstances = edgeSlot - prevSlot;

        // Collect edge label candidate
        const label = ele.pstyle('label');
        if(label && label.value) {
          // Use a screenSize proportional to edge length so edge labels
          // compete fairly with node labels in the LabelGrid.
          // Approximate edge length from source/target positions.
          const rs = ele._private.rscratch;
          let edgeScreenSize = 20;
          if(rs && rs.allpts && rs.allpts.length >= 4) {
            const dx = rs.allpts[rs.allpts.length-2] - rs.allpts[0];
            const dy = rs.allpts[rs.allpts.length-1] - rs.allpts[1];
            edgeScreenSize = Math.sqrt(dx*dx + dy*dy) * 0.5; // half of edge length
          }
          this._labelCandidates.push({
            ele,
            screenX: 0, screenY: 0,
            baseSize: edgeScreenSize,
            screenSize: 0,
            fontSize: ele.pstyle('font-size').pfValue,
            isNode: false,
          });
        }
      }

      // pickIndex is encoded into buffers via packColor; no need to store on element
      pickIndex++;
    }

    this.nodeSDFProgram.count = nodeSlot;
    this.edgeProgram.count = edgeSlot;

    this.nodeSDFProgram.needsUpload = true;
    this.nodeTexProgram.needsUpload = true;
    this.edgeProgram.needsUpload = true;
    this.needsProcess = false;
  }

  /**
   * Pack an overlay or underlay SDF instance for a node.
   * Uses the same shape as the node body but with expanded size and overlay/underlay color.
   * @param {number} slot - buffer slot index
   * @param {object} node - Cytoscape element
   * @param {string} prefix - 'overlay' or 'underlay'
   * @param {number} pickIndex - pick index (same as the parent node)
   */
  _packOverlayInstance(slot, node, prefix, pickIndex) {
    const buf = this.nodeSDFProgram.buffer;
    const off = slot * NODE_STRIDE;
    const pos = node.position();

    const padding = node.pstyle(`${prefix}-padding`).pfValue;
    const opacity = node.pstyle(`${prefix}-opacity`).value;
    const color = node.pstyle(`${prefix}-color`).value;
    const shape = node.pstyle(`${prefix}-shape`).value;
    const cornerRadius = node.pstyle(`${prefix}-corner-radius`);

    buf[off + 0] = pos.x;
    buf[off + 1] = pos.y;
    const nodePadding = node.padding();
    const overlayW = node.width() + 2 * nodePadding + padding * 2;
    const overlayH = node.height() + 2 * nodePadding + padding * 2;
    buf[off + 2] = overlayW;
    buf[off + 3] = overlayH;
    // Use ele._private.active directly — pstyle('overlay-opacity') may be stale
    // because updateStyle() defers style.apply().
    if(prefix === 'overlay') {
      const isActive = node._private.active;
      buf[off + 4] = isActive
        ? packPremulColor(color, opacity > 0 ? opacity : 0.25)
        : packPremulColor([0, 0, 0], 0);
    } else {
      buf[off + 4] = packPremulColor(color, opacity);
    }
    buf[off + 5] = packColor(0, 0, 0, 0);
    buf[off + 6] = 0;
    buf[off + 7] = SHAPE_ENUM[shape] !== undefined ? SHAPE_ENUM[shape] : 0;
    buf[off + 8] = cornerRadius.value === 'auto'
      ? getRoundRectangleRadius(overlayW, overlayH) : cornerRadius.pfValue;
    buf[off + 9] = 0; // border position: center (irrelevant with no border)
    buf[off + 10] = packPickIndex(pickIndex);

    this.nodeSDFProgram._markDirty(slot);
  }

  /**
   * Render one frame — O(1).
   * Sets camera uniform, uploads dirty buffers, issues draw calls.
   */
  render(panZoomMatrix, zoom) {
    if(!this._initialized) return;

    if(this.needsProcess) {
      this.process();
    }

    // Fix overlay colors AFTER process() — process() uses stale pstyle() cache
    // (because updateStyle() defers style.apply()), so we override with the
    // authoritative ele._private.active flag.
    this.refreshOverlayColors();

    // Upload dirty buffers to GPU — each program checks its own needsUpload flag
    this.edgeProgram.upload(this.glEdge);
    this.nodeSDFProgram.upload(this.glNode);
    this.nodeTexProgram.upload(this.glNode);

    // Upload atlas page textures to GPU if needed
    if(this.texturePageManager.needsTextureUpload()) {
      this.texturePageManager.uploadTextures(this.glNode);
    }

    // (needsUpload is tracked per-program, not on the render loop)

    // Clear and set GL state
    const glEdge = this.glEdge;
    const glNode = this.glNode;

    // Edge canvas
    glEdge.clearColor(0, 0, 0, 0);
    glEdge.enable(glEdge.BLEND);
    glEdge.blendFunc(glEdge.ONE, glEdge.ONE_MINUS_SRC_ALPHA);
    glEdge.clear(glEdge.COLOR_BUFFER_BIT);
    glEdge.viewport(0, 0, glEdge.canvas.width, glEdge.canvas.height);

    // Node canvas
    glNode.clearColor(0, 0, 0, 0);
    glNode.enable(glNode.BLEND);
    glNode.blendFunc(glNode.ONE, glNode.ONE_MINUS_SRC_ALPHA);
    glNode.clear(glNode.COLOR_BUFFER_BIT);
    glNode.viewport(0, 0, glNode.canvas.width, glNode.canvas.height);

    // Draw edges (on edge canvas)
    const bgColor = this._getBGColor();
    this.edgeProgram.draw(glEdge, panZoomMatrix, false, zoom, bgColor);

    // Draw edge :active overlays (wider semi-transparent line on top)
    this._drawEdgeOverlays(glEdge, panZoomMatrix, zoom);

    // Draw nodes (on node canvas)
    this.nodeSDFProgram.draw(glNode, panZoomMatrix, false, zoom);
    this.nodeTexProgram.draw(glNode, panZoomMatrix, false, zoom);
  }

  /**
   * Render picking — O(1), uses SAME buffers, different shader output.
   * Does NOT overwrite screen buffer data.
   *
   * Known limitation: edge picking requires the edge GL context but
   * the picking framebuffer is on the node GL context. This will be
   * addressed in Task 8 (integration). For now, only nodes are picked.
   */
  renderPicking(pickingFrameBuffer, panZoomMatrix, zoom) {
    if(!this._initialized) return;

    const glNode = this.glNode;

    // Picking renders to an offscreen framebuffer
    glNode.bindFramebuffer(glNode.FRAMEBUFFER, pickingFrameBuffer);
    glNode.disable(glNode.BLEND);
    glNode.clearColor(0, 0, 0, 0);
    glNode.clear(glNode.COLOR_BUFFER_BIT);
    glNode.viewport(0, 0, glNode.canvas.width, glNode.canvas.height);

    // Unbind all textures to prevent feedback loop
    for(let i = 0; i < 16; i++) {
      glNode.activeTexture(glNode.TEXTURE0 + i);
      glNode.bindTexture(glNode.TEXTURE_2D, null);
    }

    // Draw edges first (behind nodes) for picking
    this.edgeProgram.drawPicking(glNode, panZoomMatrix, zoom);

    // Draw nodes on top for picking
    this.nodeSDFProgram.draw(glNode, panZoomMatrix, true, zoom);

    // NOTE: do NOT unbind the framebuffer here — the caller (findNearestElementsWebgl)
    // needs it bound for readPixels. The caller manages the framebuffer lifecycle.
  }

  /**
   * Render labels on a Canvas 2D context using LabelGrid culling.
   */
  renderLabels(context, pan, zoom, viewportWidth, viewportHeight) {
    const r = this.r;

    // Update screen coordinates for label candidates.
    // Use model-space position for grid cell assignment (stable during pan).
    // screenSize uses zoom for LOD but screenX/screenY are model-space × zoom
    // with a FIXED grid origin (not pan-dependent) to prevent cell-boundary flicker.
    for(const candidate of this._labelCandidates) {
      let pos;
      if(candidate.ele.isNode()) {
        pos = candidate.ele.position();
      } else {
        // Edge label: use midpoint of the edge
        const rs = candidate.ele._private.rscratch;
        if(rs && rs.midX !== undefined) {
          pos = { x: rs.midX, y: rs.midY };
        } else if(rs && rs.allpts && rs.allpts.length >= 4) {
          const pts = rs.allpts;
          pos = { x: (pts[0] + pts[pts.length-2]) / 2, y: (pts[1] + pts[pts.length-1]) / 2 };
        } else {
          pos = { x: 0, y: 0 };
        }
      }
      // Screen position for viewport culling
      candidate.screenX = pos.x * zoom + pan.x;
      candidate.screenY = pos.y * zoom + pan.y;
      // Model-space grid coordinates (stable during pan, prevents cell-boundary flicker)
      candidate.gridX = pos.x * zoom;
      candidate.gridY = pos.y * zoom;
      // screenSize scales with zoom for LOD (use baseSize to avoid exponential growth)
      candidate.screenSize = candidate.baseSize * zoom;
    }

    // Get visible labels from LabelGrid
    const visible = this.labelGrid.getLabelsToDisplay(
      this._labelCandidates, zoom, viewportWidth, viewportHeight, 4
    );

    // Draw labels on Canvas 2D
    for(const item of visible) {
      r.drawElementText(context, item.ele, null, true);
    }
  }

  /** Mark that element data has changed — triggers process() on next render. */
  invalidate() {
    this.needsProcess = true;
  }

  /** Incrementally update visual style (color/border) for specific elements. O(k).
   *  Avoids full O(N) process() for activate/select/unactivate style changes. */
  updateStyleIncremental(eles) {
    if(!this._initialized || !this.nodeSDFProgram.buffer) return;

    const nodeBuf = this.nodeSDFProgram.buffer;
    const edgeBuf = this.edgeProgram.buffer;

    for(let i = 0; i < eles.length; i++) {
      const ele = eles[i];
      if(ele.isNode && ele.isNode()) {
        const slots = ele._private._webglNodeSlots;
        if(!slots || slots.length === 0) continue;

        // Update body slot color (background-color may change on :selected)
        // Body is the slot after underlay (if exists) — typically slots[0] or slots[1]
        const bodySlot = slots.length > 2 ? slots[1] : slots[0];
        const off = bodySlot * NODE_STRIDE;

        const bgColor = ele.pstyle('background-color').value;
        let bgOpacity = ele.pstyle('background-opacity').value;
        if(bgColor.length > 3 && bgColor[3] < 1) bgOpacity *= bgColor[3];
        nodeBuf[off + 4] = packPremulColor(bgColor, bgOpacity);

        const bw = ele.pstyle('border-width').value;
        let bop = ele.pstyle('border-opacity').value;
        if(bw > 0 && bop > 0) {
          const bc = ele.pstyle('border-color').value;
          if(bc.length > 3 && bc[3] < 1) bop *= bc[3];
          nodeBuf[off + 5] = packPremulColor(bc, bop);
        }

        this.nodeSDFProgram._markDirty(bodySlot);
      } else if(ele.isEdge && ele.isEdge()) {
        this._updateEdgeColor(ele);
      }
    }
  }

  /** Update a single edge's line-color in the buffer (for :selected style change). */
  _updateEdgeColor(edge) {
    const edgeBuf = this.edgeProgram.buffer;
    const slot = edge._private._webglEdgeSlot;
    const count = edge._private._webglEdgeInstances;
    if(slot === undefined || !count || !edgeBuf) return;

    const combinedOpacity = edge.pstyle('opacity').value * edge.pstyle('line-opacity').value;
    const color = packPremulColor(edge.pstyle('line-color').value, combinedOpacity);

    for(let j = 0; j < count; j++) {
      edgeBuf[(slot + j) * EDGE_STRIDE + 8] = color;
    }
    this.edgeProgram._markDirty(slot);
    if(count > 1) this.edgeProgram._markDirty(slot + count - 1);
  }

  /** Refresh overlay colors from live ele._private.active state.
   *  Gated by _overlayDirty flag to avoid O(N) scan every frame. */
  refreshOverlayColors() {
    if(!this._overlayDirty) return false;
    this._overlayDirty = false;
    this._activeEdges = [];

    const buf = this.nodeSDFProgram.buffer;
    if(!buf || !this._initialized) return false;

    let changed = false;
    const eles = this.r.getCachedZSortedEles();
    for(let i = 0; i < eles.length; i++) {
      const ele = eles[i];
      if(ele.isNode()) {
        const overlaySlot = ele._private._webglOverlaySlot;
        if(overlaySlot === undefined) continue;

        const off = overlaySlot * NODE_STRIDE;
        const isActive = ele._private.active;
        const packed = isActive
          ? packPremulColor(ele.pstyle('overlay-color').value || [0, 0, 0], 0.25)
          : packPremulColor([0, 0, 0], 0);
        if(buf[off + 4] !== packed) {
          buf[off + 4] = packed;
          this.nodeSDFProgram._markDirty(overlaySlot);
          changed = true;
        }
      } else {
        // Track active edges for overlay drawing
        if(ele._private.active) {
          this._activeEdges.push(ele);
          changed = true;
        }
      }
    }
    return changed;
  }


  /** Draw edge :active overlays — a wider semi-transparent line on top of normal edges.
   *  Only draws for edges in _activeEdges (typically 0-3 edges). */
  _drawEdgeOverlays(gl, panZoomMatrix, zoom) {
    if(this._activeEdges.length === 0) return;

    const edgeBuf = this.edgeProgram.buffer;
    if(!edgeBuf) return;

    // Save original color+width, replace with overlay values, draw, restore
    const saved = [];
    for(const edge of this._activeEdges) {
      const slot = edge._private._webglEdgeSlot;
      const count = edge._private._webglEdgeInstances;
      if(slot === undefined || !count) continue;

      const overlayColor = edge.pstyle('overlay-color').value || [0, 0, 0];
      const overlayOpacity = edge.pstyle('overlay-opacity').value || 0.25;
      const overlayPadding = edge.pstyle('overlay-padding').pfValue || 10;
      const packedOverlay = packPremulColor(overlayColor, overlayOpacity);
      const overlayWidth = 2 * overlayPadding;

      const typeBuf = this.edgeProgram.typeBuffer;
      for(let j = 0; j < count; j++) {
        if(typeBuf[slot + j] === 2) continue; // skip arrows — Canvas 2D only overlays the line
        const off = (slot + j) * EDGE_STRIDE;
        saved.push({ off, color: edgeBuf[off + 8], width: edgeBuf[off + 9] });
        edgeBuf[off + 8] = packedOverlay;
        edgeBuf[off + 9] = overlayWidth;
      }
    }

    if(saved.length === 0) return;

    // Upload just the modified range and draw
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeProgram.glBuffer);
    const minOff = saved[0].off;
    const maxOff = saved[saved.length - 1].off;
    const startByte = minOff * 4;
    const endByte = (maxOff + EDGE_STRIDE) * 4;
    gl.bufferSubData(gl.ARRAY_BUFFER, startByte,
      edgeBuf.subarray(minOff, maxOff + EDGE_STRIDE));

    const bgColor = this._getBGColor();
    this.edgeProgram.draw(gl, panZoomMatrix, false, zoom, bgColor);

    // Restore original values
    for(const s of saved) {
      edgeBuf[s.off + 8] = s.color;
      edgeBuf[s.off + 9] = s.width;
    }

    // Re-upload restored data
    gl.bufferSubData(gl.ARRAY_BUFFER, startByte,
      edgeBuf.subarray(minOff, maxOff + EDGE_STRIDE));
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** Update just one node's position (for drag). O(1). */
  updateNodePosition(node) {
    const slots = node._private._webglNodeSlots;
    const texSlot = node._private._webglTexSlot;
    if(!slots && texSlot === undefined) return; // no slot assigned yet

    const pos = node.position();

    // Update ALL SDF slots (body + underlay + overlay)
    if(slots) {
      for(let i = 0; i < slots.length; i++) {
        this.nodeSDFProgram.updatePosition(slots[i], pos.x, pos.y);
      }
    }

    // Also update texture overlay position
    if(texSlot !== undefined) {
      this.nodeTexProgram.updatePosition(texSlot, pos.x, pos.y);
    }

    // (needsUpload set per-program via _markDirty)
  }

  /** Update a dragged node's connected edges. O(degree). */
  updateConnectedEdges(node) {
    const edges = node.connectedEdges();
    for(let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const slot = edge._private._webglEdgeSlot;
      const instanceCount = edge._private._webglEdgeInstances;
      if(slot !== undefined && instanceCount !== undefined) {
        this.edgeProgram.updateEdgeEndpoints(slot, instanceCount, edge);
      }
    }
    // (needsUpload set per-program via _markDirty)
  }

  _getBGColor() {
    // Return normalized RGBA [0-1] with 4 components for uniform4fv
    return [1.0, 1.0, 1.0, 1.0];
  }

  destroy() {
    if(this.glNode) {
      this.nodeSDFProgram.destroy(this.glNode);
      this.nodeTexProgram.destroy(this.glNode);
    }
    if(this.glEdge) {
      this.edgeProgram.destroy(this.glEdge);
    }
    this.texturePageManager.destroy();
  }
}
