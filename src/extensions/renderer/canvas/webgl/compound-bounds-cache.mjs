/**
 * CompoundBoundsCache: Lazy bounds computation for compound (parent) nodes.
 *
 * When a child node moves, only its ancestor chain is marked dirty.
 * Bounds are only recomputed when actually needed for rendering (lazy evaluation).
 * This avoids the O(depth * siblings) eager recomputation on every child move.
 */

export class CompoundBoundsCache {
  constructor() {
    this.dirtySubtrees = new Set(); // IDs of nodes with dirty bounds
    this.cachedBounds = new Map();  // element ID -> { x1, y1, x2, y2, w, h }
  }

  /**
   * Mark a compound node's bounds as dirty.
   * Propagates up the ancestor chain: child -> parent -> grandparent.
   * @param {object} childEle - the element that changed (moved, resized, etc.)
   */
  markDirty(childEle) {
    let parent = childEle._private.parent;
    while(parent) {
      const id = parent._private.data.id;
      this.dirtySubtrees.add(id);
      parent = parent._private.parent;
    }
  }

  /**
   * Mark a specific element's bounds as dirty.
   * @param {string} eleId - element ID
   */
  markDirtyById(eleId) {
    this.dirtySubtrees.add(eleId);
  }

  /**
   * Check if a compound node's bounds are dirty.
   * @param {object} parentEle - the compound node
   * @returns {boolean}
   */
  isDirty(parentEle) {
    return this.dirtySubtrees.has(parentEle._private.data.id);
  }

  /**
   * Get cached bounds for a compound node.
   * If dirty, recomputes from children (lazy evaluation).
   * @param {object} parentEle - the compound node
   * @returns {{ x1, y1, x2, y2, w, h }} bounding box
   */
  getBounds(parentEle) {
    const id = parentEle._private.data.id;

    if(!this.dirtySubtrees.has(id) && this.cachedBounds.has(id)) {
      return this.cachedBounds.get(id);
    }

    // Recompute bounds from children
    const bounds = this._computeBounds(parentEle);
    this.cachedBounds.set(id, bounds);
    this.dirtySubtrees.delete(id);
    return bounds;
  }

  /**
   * Compute bounds from children.
   * @private
   */
  _computeBounds(parentEle) {
    const children = parentEle._private.children;
    if(!children || children.length === 0) {
      // No children - use the node's own position/dimensions
      const pos = parentEle._private.position;
      const bb = parentEle._private.bodyBounds;
      if(bb) {
        return { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2, w: bb.x2 - bb.x1, h: bb.y2 - bb.y1 };
      }
      return { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, w: 0, h: 0 };
    }

    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

    for(let i = 0; i < children.length; i++) {
      const child = children[i];
      const cbb = child._private.bodyBounds;

      if(cbb) {
        if(cbb.x1 < x1) x1 = cbb.x1;
        if(cbb.y1 < y1) y1 = cbb.y1;
        if(cbb.x2 > x2) x2 = cbb.x2;
        if(cbb.y2 > y2) y2 = cbb.y2;
      } else {
        const pos = child._private.position;
        if(pos.x < x1) x1 = pos.x;
        if(pos.y < y1) y1 = pos.y;
        if(pos.x > x2) x2 = pos.x;
        if(pos.y > y2) y2 = pos.y;
      }
    }

    // Apply compound padding if available
    const padding = parentEle._private.autoPadding;
    if(padding) {
      x1 -= padding;
      y1 -= padding;
      x2 += padding;
      y2 += padding;
    }

    return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
  }

  /**
   * Clear all cached data.
   */
  clear() {
    this.dirtySubtrees.clear();
    this.cachedBounds.clear();
  }
}
