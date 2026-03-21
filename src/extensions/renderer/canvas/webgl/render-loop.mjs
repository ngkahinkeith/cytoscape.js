import { NodeSDFProgram, NODE_STRIDE, SHAPE_ENUM } from './programs/node-sdf.mjs';
import { NodeTextureProgram } from './programs/node-texture.mjs';
import { EdgeProgram } from './programs/edge.mjs';
import { TexturePageManager } from './texture-page-manager.mjs';
import { LabelGrid } from './label-grid.mjs';
import { packPremulColor, packColor, packPickIndex } from './color-pack.mjs';

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

    // Ensure edge control points are computed before we read them.
    // The base renderer's recalculateRenderedStyle computes node positions,
    // then recalculateEdgeProjections computes edge control points (bezier, etc.).
    // Without this, parallel bezier edges all get straight-line allpts.
    if(r.recalculateRenderedStyle && r.cy.mutableElements) {
      try {
        const allEles = r.cy.mutableElements();
        // useCache=false forces recalculation even if rstyle.clean is true.
        // This is needed because the beforeRender callback may have already
        // marked elements clean without computing edge control points for
        // the WebGL path.
        r.recalculateRenderedStyle(allEles, false);
      } catch(e) {
        // May fail in headless/test environments
      }
    }

    const eles = r.getCachedZSortedEles();

    // Count elements by type
    let nodeCount = 0;
    let texturedNodeCount = 0;
    let edgeInstanceCount = 0;
    let overlaySlotCount = 0; // extra SDF instances for overlay/underlay

    // First pass: count
    for(let i = 0; i < eles.length; i++) {
      const ele = eles[i];
      if(ele.isNode()) {
        nodeCount++;
        // Check if node has background-image
        const bgImg = ele.pstyle('background-image');
        if(bgImg && bgImg.strValue && bgImg.strValue !== 'none') {
          texturedNodeCount++;
          // Register image with texture page manager
          this.texturePageManager.registerImage(bgImg.strValue);
        }
        // Count overlay/underlay slots for active nodes
        if(ele.pstyle('overlay-opacity').value > 0) overlaySlotCount++;
        if(ele.pstyle('underlay-opacity').value > 0) overlaySlotCount++;
      } else {
        // Count instances for this edge
        const rs = ele._private.rscratch;
        if(rs && !rs.badLine && rs.allpts) {
          const pts = rs.allpts;
          if(pts.length === 4) {
            edgeInstanceCount += 1; // straight line
          } else {
            edgeInstanceCount += 16; // bezier segments = curve instances
          }
          // Arrows
          if(ele.pstyle('source-arrow-shape').value !== 'none') edgeInstanceCount++;
          if(ele.pstyle('target-arrow-shape').value !== 'none') edgeInstanceCount++;
        }
      }
    }

    // Reallocate buffers (extra slots for overlay/underlay SDF instances)
    const totalNodeSlots = nodeCount + overlaySlotCount;
    this.nodeSDFProgram.reallocate(totalNodeSlots);
    this.nodeTexProgram.reallocate(texturedNodeCount);
    this.nodeTexProgram.count = texturedNodeCount;
    // Add 10% safety margin for edge instance count estimation
    this.edgeProgram.reallocate(Math.ceil(edgeInstanceCount * 1.1));

    // Second pass: pack data
    let nodeSlot = 0;
    let texNodeSlot = 0;
    let edgeSlot = 0;
    let pickIndex = 1; // 0 reserved for background

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

        // Pack overlay (drawn after/on top of the node body)
        const overlayOpacity = ele.pstyle('overlay-opacity').value;
        if(overlayOpacity > 0) {
          this._packOverlayInstance(nodeSlot, ele, 'overlay', pickIndex);
          nodeSlots.push(nodeSlot);
          nodeSlot++;
        }

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

    // Mark all programs as needing GPU upload
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
    // Expand size by overlay padding on each side
    buf[off + 2] = node.outerWidth() + padding * 2;
    buf[off + 3] = node.outerHeight() + padding * 2;
    buf[off + 4] = packPremulColor(color, opacity);
    // No border on overlays
    buf[off + 5] = packColor(0, 0, 0, 0);
    buf[off + 6] = 0; // border width = 0
    buf[off + 7] = SHAPE_ENUM[shape] !== undefined ? SHAPE_ENUM[shape] : 0;
    buf[off + 8] = cornerRadius.value === 'auto' ? -1 : cornerRadius.pfValue;
    buf[off + 9] = 0; // border position: center (irrelevant with no border)
    buf[off + 10] = packPickIndex(pickIndex);

    this.nodeSDFProgram.needsUpload = true;
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

    // Upload dirty buffers to GPU — each program checks its own needsUpload flag
    this.edgeProgram.upload(this.glEdge);
    this.nodeSDFProgram.upload(this.glNode);
    this.nodeTexProgram.upload(this.glNode);

    // Upload atlas page textures to GPU if needed
    if(this.texturePageManager.needsTextureUpload()) {
      this.texturePageManager.uploadTextures(this.glNode);
    }

    this.needsUpload = false;

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

    // Draw with picking shaders — SAME buffers, different output
    this.nodeSDFProgram.draw(glNode, panZoomMatrix, true, zoom);
    // Skip nodeTexProgram in picking mode — nodes are picked via SDF shape
    // (avoids feedback loop from atlas texture bindings)

    glNode.bindFramebuffer(glNode.FRAMEBUFFER, null);
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

    this.needsUpload = true;
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
    this.needsUpload = true;
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
