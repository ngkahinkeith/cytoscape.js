/**
 * IncrementalZSort: Optimizes z-ordering for the WebGL renderer.
 *
 * Instead of calling pstyle() in the sort comparator (which is called O(N log N) times),
 * this computes a numeric sort key once per element and caches it. The sort key encodes
 * compound depth, element type, z-index, and pool index into a single comparable number.
 *
 * For incremental updates (add/remove single element), binary insertion is used
 * instead of full resort.
 */

import * as util from '../../../../util/index.mjs';

/**
 * Compute a numeric sort key for an element that produces the same ordering
 * as the existing zIndexSort comparator.
 *
 * Encoding (from most significant to least):
 * - bits 48-63: compound depth (0 for non-compound, mapped from z-compound-depth)
 * - bits 32-47: element depth (0 for edges/manual, 1 for nodes in auto mode)
 * - bits 16-31: z-index (offset by 32768 to handle negatives)
 * - bits 0-15:  pool index (insertion order)
 *
 * Since JS numbers are 64-bit doubles with 53 bits of integer precision,
 * this encoding fits comfortably.
 */
export function computeZSortKey(ele, hasCompoundNodes) {
  // Compound depth
  let compoundDepth;
  const zCompoundDepth = ele.pstyle('z-compound-depth');
  if(zCompoundDepth.value === 'auto') {
    compoundDepth = hasCompoundNodes ? ele.zDepth() : 0;
  } else if(zCompoundDepth.value === 'bottom') {
    compoundDepth = -1;
  } else if(zCompoundDepth.value === 'top') {
    compoundDepth = util.MAX_INT;
  } else { // orphan
    compoundDepth = 0;
  }
  // Clamp and offset to fit in 16 bits (0-65535)
  compoundDepth = Math.min(Math.max(compoundDepth + 1, 0), 65535);

  // Element depth: nodes on top of edges (when z-index-compare is 'auto')
  let eleDepth = 0;
  const zIndexCompare = ele.pstyle('z-index-compare');
  if(zIndexCompare.value === 'auto') {
    eleDepth = ele.isNode() ? 1 : 0;
  }

  // Z-index: offset by 32768 to handle negatives, clamp to 16 bits
  const zIndex = Math.min(Math.max(ele.pstyle('z-index').value + 32768, 0), 65535);

  // Pool index: clamp to 16 bits
  const poolIndex = Math.min(ele.poolIndex(), 65535);

  // Combine into single number: compound * 2^48 + eleDepth * 2^32 + zIndex * 2^16 + poolIndex
  return compoundDepth * 281474976710656 + // 2^48
         eleDepth * 4294967296 +            // 2^32
         zIndex * 65536 +                   // 2^16
         poolIndex;
}


export class IncrementalZSort {
  constructor() {
    this.sortedArray = [];
    this.sortKeys = new Map(); // element id -> sort key
    this._hasCompoundNodes = false;
  }

  /**
   * Set whether the graph has compound nodes (affects sort key computation).
   */
  setHasCompoundNodes(value) {
    this._hasCompoundNodes = value;
  }

  /**
   * Compute and cache the sort key for an element.
   */
  _computeAndCacheKey(ele) {
    const key = computeZSortKey(ele, this._hasCompoundNodes);
    this.sortKeys.set(ele._private.data.id, key);
    return key;
  }

  /**
   * Get the cached sort key for an element.
   */
  getKey(ele) {
    return this.sortKeys.get(ele._private.data.id);
  }

  /**
   * Perform a full sort using cached numeric keys.
   * Much faster than the default sort because the comparator is a simple
   * numeric comparison instead of multiple pstyle() calls.
   */
  fullSort(eles) {
    this._hasCompoundNodes = eles.length > 0 && eles[0].cy().hasCompoundNodes();

    // Compute keys for all elements
    for(let i = 0; i < eles.length; i++) {
      this._computeAndCacheKey(eles[i]);
    }

    // Sort using cached numeric keys
    const keys = this.sortKeys;
    this.sortedArray = Array.from(eles);
    this.sortedArray.sort((a, b) => {
      const ka = keys.get(a._private.data.id);
      const kb = keys.get(b._private.data.id);
      return ka - kb;
    });

    return this.sortedArray;
  }

  /**
   * Insert a single element in sorted order (binary search + splice).
   * O(log N) search + O(N) splice.
   */
  insert(ele) {
    const key = this._computeAndCacheKey(ele);
    const arr = this.sortedArray;

    // Binary search for insertion point
    let lo = 0, hi = arr.length;
    while(lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midKey = this.sortKeys.get(arr[mid]._private.data.id);
      if(midKey < key) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    arr.splice(lo, 0, ele);
    return lo;
  }

  /**
   * Remove a single element from the sorted array.
   */
  remove(ele) {
    const id = ele._private.data.id;
    const idx = this.sortedArray.findIndex(e => e._private.data.id === id);
    if(idx !== -1) {
      this.sortedArray.splice(idx, 1);
    }
    this.sortKeys.delete(id);
  }

  /**
   * Invalidate sort keys for given elements. If the number of invalidated
   * elements exceeds 10% of total, triggers a full resort. Otherwise,
   * removes and re-inserts each element.
   */
  invalidate(eles) {
    if(!eles || eles.length === 0) return;

    if(eles.length > this.sortedArray.length * 0.1) {
      // Too many changes - full resort is more efficient
      // Recompute keys for the changed elements, then resort everything
      for(let i = 0; i < eles.length; i++) {
        this._computeAndCacheKey(eles[i]);
      }
      const keys = this.sortKeys;
      this.sortedArray.sort((a, b) => {
        return keys.get(a._private.data.id) - keys.get(b._private.data.id);
      });
    } else {
      // Incremental: remove and re-insert each changed element
      for(let i = 0; i < eles.length; i++) {
        this.remove(eles[i]);
        this.insert(eles[i]);
      }
    }
  }

  /**
   * Get the current sorted array.
   */
  getSorted() {
    return this.sortedArray;
  }

  /**
   * Clear all cached data.
   */
  clear() {
    this.sortedArray = [];
    this.sortKeys.clear();
  }
}
