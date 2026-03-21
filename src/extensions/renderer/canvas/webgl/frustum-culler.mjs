/**
 * FrustumCuller: Skips elements that are entirely outside the viewport.
 * At typical zoom levels, 70-90% of elements in a large graph are offscreen.
 * Culling is only applied to SCREEN rendering, not PICKING (which needs all elements).
 */

export class FrustumCuller {
  constructor() {
    // Viewport bounds in model coordinates
    this.x1 = 0;
    this.y1 = 0;
    this.x2 = 0;
    this.y2 = 0;
  }

  /**
   * Update the viewport bounds based on current pan, zoom, and canvas size.
   * Adds a margin to catch labels and arrows that extend beyond node bounds.
   * @param {Object} pan - { x, y } pan position
   * @param {number} zoom - zoom level
   * @param {number} canvasWidth - canvas width in pixels
   * @param {number} canvasHeight - canvas height in pixels
   * @param {number} margin - extra margin in model-space units (default 50px / zoom)
   */
  update(pan, zoom, canvasWidth, canvasHeight, margin) {
    if(margin === undefined) {
      margin = 50 / zoom;
    }

    // Convert canvas bounds to model coordinates
    // model = (screen - pan) / zoom
    this.x1 = (0 - pan.x) / zoom - margin;
    this.y1 = (0 - pan.y) / zoom - margin;
    this.x2 = (canvasWidth - pan.x) / zoom + margin;
    this.y2 = (canvasHeight - pan.y) / zoom + margin;
  }

  /**
   * Check if an element's bounding box overlaps the viewport.
   * @param {object} ele - Cytoscape element
   * @returns {boolean} true if the element may be visible
   */
  isVisible(ele) {
    const bb = ele._private.bodyBounds;
    if(!bb) {
      // No bounding box cached - assume visible (safer)
      return true;
    }

    // Fast AABB overlap test
    if(bb.x2 < this.x1 || bb.x1 > this.x2) return false;
    if(bb.y2 < this.y1 || bb.y1 > this.y2) return false;
    return true;
  }

  /**
   * Check if a node is visible, using position and outer dimensions.
   * Falls back to bodyBounds if available, otherwise uses position + width/height.
   * @param {object} node - Cytoscape node
   * @returns {boolean}
   */
  isNodeVisible(node) {
    // Try bodyBounds first
    const bb = node._private.bodyBounds;
    if(bb) {
      if(bb.x2 < this.x1 || bb.x1 > this.x2) return false;
      if(bb.y2 < this.y1 || bb.y1 > this.y2) return false;
      return true;
    }

    // Fallback: use position + outerWidth/outerHeight (already cached by base renderer)
    const pos = node._private.position;
    const w = node.outerWidth();
    const h = node.outerHeight();
    const hw = w / 2;
    const hh = h / 2;

    if(pos.x + hw < this.x1 || pos.x - hw > this.x2) return false;
    if(pos.y + hh < this.y1 || pos.y - hh > this.y2) return false;
    return true;
  }

  /**
   * Check if an edge is visible. An edge is visible if its source or target
   * node is visible, or if its line segment crosses the viewport.
   * @param {object} edge - Cytoscape edge
   * @returns {boolean}
   */
  isEdgeVisible(edge) {
    const rs = edge._private.rscratch;
    if(!rs || !rs.allpts || rs.allpts.length < 4) {
      return true; // no geometry yet, assume visible
    }

    // Quick check: if any control point is inside viewport, edge is visible
    const pts = rs.allpts;
    for(let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if(x >= this.x1 && x <= this.x2 && y >= this.y1 && y <= this.y2) {
        return true;
      }
    }

    // Check edge bounding box (cheaper than full line-rect intersection)
    let minX = pts[0], maxX = pts[0];
    let minY = pts[1], maxY = pts[1];
    for(let i = 2; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if(x < minX) minX = x;
      if(x > maxX) maxX = x;
      if(y < minY) minY = y;
      if(y > maxY) maxY = y;
    }

    if(maxX < this.x1 || minX > this.x2) return false;
    if(maxY < this.y1 || minY > this.y2) return false;
    return true;
  }

  /**
   * Check if any element (node or edge) is visible.
   * @param {object} ele - Cytoscape element
   * @returns {boolean}
   */
  isElementVisible(ele) {
    if(ele.isNode()) {
      return this.isNodeVisible(ele);
    }
    return this.isEdgeVisible(ele);
  }
}
