/**
 * DirtyTracker: Tracks which elements have changed since the last frame,
 * enabling partial buffer updates instead of full rewrites.
 *
 * During steady-state pan/zoom (no element changes), zero buffer uploads
 * are needed - only the pan/zoom uniform is updated.
 *
 * When a single element changes (e.g., drag), only that element's buffer
 * region is re-uploaded via gl.bufferSubData with offset/length.
 */

export class DirtyTracker {
  constructor() {
    this.dirtySet = new Set();   // Set of dirty element IDs
    this.allDirty = true;        // Force full upload on first frame
    this.totalElements = 0;
    this.fullUploadThreshold = 0.1; // If >10% dirty, do full upload
  }

  /**
   * Mark a single element as dirty by its ID.
   */
  markDirty(eleId) {
    this.dirtySet.add(eleId);
  }

  /**
   * Mark all elements as dirty (forces full buffer upload).
   */
  markAllDirty() {
    this.allDirty = true;
  }

  /**
   * Check if a full buffer upload should be done instead of partial updates.
   * Returns true if:
   * - allDirty flag is set (first frame, style reset, etc.)
   * - More than threshold% of elements are dirty
   */
  shouldDoFullUpload() {
    if(this.allDirty) return true;
    if(this.totalElements === 0) return true;
    return this.dirtySet.size > this.totalElements * this.fullUploadThreshold;
  }

  /**
   * Check if there are any dirty elements.
   */
  hasDirtyElements() {
    return this.allDirty || this.dirtySet.size > 0;
  }

  /**
   * Check if a specific element is dirty.
   */
  isDirty(eleId) {
    return this.allDirty || this.dirtySet.has(eleId);
  }

  /**
   * Get the number of dirty elements.
   */
  getDirtyCount() {
    if(this.allDirty) return this.totalElements;
    return this.dirtySet.size;
  }

  /**
   * Clear the dirty state after a frame has been rendered.
   */
  clear() {
    this.dirtySet.clear();
    this.allDirty = false;
  }

  /**
   * Set the total number of elements (used for threshold calculation).
   */
  setTotalElements(count) {
    this.totalElements = count;
  }
}
