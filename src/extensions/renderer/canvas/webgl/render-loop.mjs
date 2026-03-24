import { NodeSDFProgram, NODE_STRIDE, SHAPE_ENUM } from './programs/node-sdf.mjs';
import { NodeTextureProgram } from './programs/node-texture.mjs';
import { EdgeProgram, EDGE_STRIDE } from './programs/edge.mjs';
import { TexturePageManager } from './texture-page-manager.mjs';
import { LabelGrid } from './label-grid.mjs';
import { packPremulColor, packColor, packPickIndex } from './color-pack.mjs';
import { getRoundRectangleRadius } from '../../../../math.mjs';

const WHITE_RGBA = [1.0, 1.0, 1.0, 1.0]; // reused for edge bgColor uniform

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
    this._hasProcessed = false; // false until first process() completes
    this._overlayDirty = true; // set by notify('style'), gates refreshOverlayColors O(N) scan
    this._activeEdges = [];    // edges with :active state, rebuilt by refreshOverlayColors
    this._initialized = false;

    // Label data for Canvas 2D rendering
    this._labelCandidates = [];

    // Label grid zoom-change optimization: cache visible labels and
    // skip full grid rebuild on pan-only frames (zoom unchanged).
    this._lastLabelZoom = null;
    this._lastVisibleLabels = null;
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

    // Ensure edge control points (rs.allpts) are computed before we read them.
    // First call: useCache=false forces ALL edges to compute (initial load).
    // Subsequent calls: skip entirely — the beforeRender callback already
    // processes dirty elements via recalculateRenderedStyle(dirtyEles, true).
    // Without traversal cache, calling recalculateRenderedStyle(allEles, true)
    // triggers O(E × degree) parallelEdges() scans = multi-second freeze.
    if(!this._hasProcessed) {
      r.recalculateRenderedStyle(r.cy.mutableElements(), false);
      this._hasProcessed = true;
    }


    const eles = r.getCachedZSortedEles();

    // Estimate buffer sizes based on element count (avoids a separate counting pass).
    // Nodes need ~3 SDF slots each (body + overlay + possible underlay).
    // Edges need ~10 instances each (bezier segments + arrows).
    // The ensureCapacity() calls during packing handle any underestimate via
    // amortized doubling, so these just need to be in the right ballpark.
    const eleCount = eles.length || 256;
    const estNodeSlots = eleCount * 3;
    const estTexNodes = Math.max(Math.ceil(eleCount * 0.1), 16);
    const estEdgeInstances = eleCount * 10;
    this.nodeSDFProgram.reallocate(estNodeSlots);
    this.nodeTexProgram.reallocate(estTexNodes);
    this.edgeProgram.reallocate(estEdgeInstances);

    // Pack data in a single pass
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

        // Ensure capacity for up to 3 SDF slots (underlay + body + overlay)
        this.nodeSDFProgram.ensureCapacity(nodeSlot + 3);

        // Pack underlay (drawn before/behind the node body)
        const underlayOpacity = ele.pstyle('underlay-opacity').value;
        if(underlayOpacity > 0) {
          this._packOverlayInstance(nodeSlot, ele, 'underlay', pickIndex);
          nodeSlots.push(nodeSlot);
          nodeSlot++;
        }

        // Check if node has bg-image and register with texture manager
        const bgImg = ele.pstyle('background-image');
        const hasTexture = bgImg && bgImg.strValue && bgImg.strValue !== 'none';
        if(hasTexture) {
          this.texturePageManager.registerImage(bgImg.strValue);
        }

        // Pack SDF node (renders background-color shape for all nodes)
        this.nodeSDFProgram.processNode(nodeSlot, ele, pickIndex);

        if(hasTexture) {
          // Ensure texture buffer capacity
          this.nodeTexProgram.ensureCapacity(texNodeSlot + 1);
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
        // Ensure edge buffer has room (worst case: 16 curve segments + 2 arrows)
        this.edgeProgram.ensureCapacity(edgeSlot + 20);

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
    this.nodeTexProgram.count = texNodeSlot;
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
    buf[off + 4] = packPremulColor(color, opacity);
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

    for(const candidate of this._labelCandidates) {
      let px, py;
      if(candidate.ele.isNode()) {
        const p = candidate.ele.position();
        px = p.x; py = p.y;
      } else {
        const rs = candidate.ele._private.rscratch;
        if(rs && rs.midX !== undefined) {
          px = rs.midX; py = rs.midY;
        } else if(rs && rs.allpts && rs.allpts.length >= 4) {
          const pts = rs.allpts;
          px = (pts[0] + pts[pts.length-2]) / 2;
          py = (pts[1] + pts[pts.length-1]) / 2;
        } else {
          px = 0; py = 0;
        }
      }
      candidate.screenX = px * zoom + pan.x;
      candidate.screenY = py * zoom + pan.y;
      candidate.gridX = px * zoom;
      candidate.gridY = py * zoom;
      candidate.screenSize = candidate.baseSize * zoom;
    }

    const visible = this.labelGrid.getLabelsToDisplay(
      this._labelCandidates, zoom, viewportWidth, viewportHeight, 4
    );

    for(const item of visible) {
      r.drawElementText(context, item.ele, null, true);
    }
  }

  /** Mark that element data has changed — triggers process() on next render. */
  invalidate() {
    this.needsProcess = true;
    this._lastVisibleLabels = null; // force full label grid rebuild
    this._lastLabelZoom = null;
  }

  /** Incrementally update visual style (color/border) for specific elements. O(k).
   *  Avoids full O(N) process() for activate/select/unactivate style changes. */
  updateStyleIncremental(eles) {
    if(!this._initialized || !this.nodeSDFProgram.buffer) return;

    // Force style recalculation — updateStyle() sets styleDirty=true AFTER
    // emitAndNotify('style'), so pstyle() returns stale values in our handler.
    // Explicitly apply the stylesheet to get :selected/:active styles.
    const style = this.r.cy.style();
    for(let i = 0; i < eles.length; i++) {
      eles[i]._private.styleDirty = true;
    }

    const nodeBuf = this.nodeSDFProgram.buffer;

    for(let i = 0; i < eles.length; i++) {
      const ele = eles[i];
      if(ele.isNode && ele.isNode()) {
        const slots = ele._private._webglNodeSlots;
        if(!slots || slots.length === 0) continue;
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

  /** Refresh overlay colors from pstyle overlay-opacity (supports :active AND :selected).
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

      // Force style recalc for elements that just changed state
      // (styleDirty was set by updateStyleIncremental in the same notify handler)
      if(ele._private.styleDirty) {
        ele.pstyle('overlay-opacity'); // triggers lazy style.apply()
      }

      if(ele.isNode()) {
        const overlaySlot = ele._private._webglOverlaySlot;
        if(overlaySlot === undefined) continue;

        const off = overlaySlot * NODE_STRIDE;
        const opacity = ele.pstyle('overlay-opacity').value;
        const packed = opacity > 0
          ? packPremulColor(ele.pstyle('overlay-color').value || [0, 0, 0], opacity)
          : packPremulColor([0, 0, 0], 0);
        if(buf[off + 4] !== packed) {
          buf[off + 4] = packed;
          this.nodeSDFProgram._markDirty(overlaySlot);
          changed = true;
        }
      } else {
        // Track edges with overlay (active or selected) for overlay drawing
        const overlayOpacity = ele.pstyle('overlay-opacity').value;
        if(overlayOpacity > 0) {
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
    return WHITE_RGBA;
  }

  destroy() {
    // Delete all GPU resources
    if(this.glNode) {
      this.nodeSDFProgram.destroy(this.glNode);
      this.nodeTexProgram.destroy(this.glNode);
      this.edgeProgram.destroyPicking(this.glNode);
    }
    if(this.glEdge) {
      this.edgeProgram.destroy(this.glEdge);
    }
    this.texturePageManager.destroy(this.glNode);

    // Release CPU-side typed arrays (large buffers — up to 100+ MB)
    this.nodeSDFProgram.buffer = null;
    this.nodeTexProgram.buffer = null;
    this.edgeProgram.buffer = null;
    this.edgeProgram.typeBuffer = null;

    // Clear label candidates (up to 275K objects)
    this._labelCandidates = null;
    this._lastVisibleLabels = null;
    this._lastLabelZoom = null;
    this._activeEdges = null;

    // Clear element references to allow GC of WebGL slot data
    const eles = this.r.cy.mutableElements();
    for(let i = 0; i < eles.length; i++) {
      const p = eles[i]._private;
      delete p._webglNodeSlots;
      delete p._webglOverlaySlot;
      delete p._webglTexSlot;
      delete p._webglEdgeSlot;
      delete p._webglEdgeInstances;
    }

    // Null GL context references
    this.glNode = null;
    this.glEdge = null;
    this.r = null;
    this._initialized = false;
  }
}
