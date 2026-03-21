/**
 * LODManager: Level-of-Detail manager for the WebGL renderer.
 *
 * Controls adaptive rendering quality during interaction:
 * - Hides edges during fast pan/zoom when hideEdgesOnViewport is enabled
 * - Adapts edge curve segment count based on zoom level
 * - Can be disabled for export (full quality rendering)
 */

export class LODManager {
  constructor(opts = {}) {
    this._isInteracting = false;
    this._hideEdgesOnViewport = opts.hideEdgesOnViewport || false;
    this._textureOnViewport = opts.textureOnViewport || false;
    this._exportMode = false;
    this._minSegments = 3;
    this._maxSegments = 15;
    this._defaultSegments = 15;
  }

  /**
   * Set whether the user is currently interacting (panning, zooming, dragging).
   */
  setInteracting(isInteracting) {
    this._isInteracting = isInteracting;
  }

  /**
   * Check if the user is currently interacting.
   */
  isInteracting() {
    return this._isInteracting;
  }

  /**
   * Enable/disable export mode (full quality, no LOD).
   */
  setExportMode(enabled) {
    this._exportMode = enabled;
  }

  /**
   * Update renderer options.
   */
  updateOptions(opts) {
    if(opts.hideEdgesOnViewport !== undefined) {
      this._hideEdgesOnViewport = opts.hideEdgesOnViewport;
    }
    if(opts.textureOnViewport !== undefined) {
      this._textureOnViewport = opts.textureOnViewport;
    }
  }

  /**
   * Whether edges should be drawn this frame.
   * Returns false if hideEdgesOnViewport is enabled and user is interacting.
   */
  shouldDrawEdges() {
    if(this._exportMode) return true;
    if(this._hideEdgesOnViewport && this._isInteracting) return false;
    return true;
  }

  /**
   * Whether labels should be drawn this frame.
   * Returns false if textureOnViewport is enabled and user is interacting.
   */
  shouldDrawLabels() {
    if(this._exportMode) return true;
    if(this._textureOnViewport && this._isInteracting) return false;
    return true;
  }

  /**
   * Get the number of curve segments for an edge based on zoom level.
   * Lower zoom = fewer segments (edges are smaller on screen).
   * Higher zoom = more segments (edges are larger, need smoother curves).
   *
   * @param {number} screenLength - approximate edge length in screen pixels
   * @returns {number} number of segments
   */
  getEdgeSegmentCount(screenLength) {
    if(this._exportMode) return this._maxSegments;

    // Adaptive: roughly 1 segment per 20 screen pixels, clamped
    const segments = Math.round(screenLength / 20);
    return Math.max(this._minSegments, Math.min(this._maxSegments, segments));
  }
}
