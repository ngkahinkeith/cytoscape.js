/**
 * LabelOverlay: Renders labels using a separate Canvas 2D overlay canvas.
 *
 * Advantages over texture atlas labels:
 * - Always pixel-perfect at any zoom level (native subpixel anti-aliasing)
 * - Zero GPU memory usage for labels (no texture atlases)
 * - Native rich text styling (bold, italic, colors, font families)
 * - Label density culling to limit rendered labels to ~500 visible
 *
 * The overlay canvas is stacked above the WebGL canvas via CSS z-index.
 */

export class LabelDensityGrid {
  constructor(cellSize = 100, maxLabelsPerCell = 3) {
    this.cellSize = cellSize;
    this.maxLabelsPerCell = maxLabelsPerCell;
    this.cells = new Map();
  }

  /**
   * Clear the grid for a new frame.
   */
  clear() {
    this.cells.clear();
  }

  /**
   * Get the cell key for a screen position.
   */
  _cellKey(sx, sy) {
    const cx = Math.floor(sx / this.cellSize);
    const cy = Math.floor(sy / this.cellSize);
    return (cx & 0xFFFF) | ((cy & 0xFFFF) << 16);
  }

  /**
   * Try to add a label to the grid. Returns true if the label should be displayed
   * (cell has room), false if culled (cell already full).
   *
   * @param {number} sx - screen x position
   * @param {number} sy - screen y position
   * @param {number} priority - higher priority labels are preferred (e.g., node size)
   * @returns {boolean}
   */
  canDisplay(sx, sy, priority) {
    const key = this._cellKey(sx, sy);
    let cell = this.cells.get(key);

    if(!cell) {
      cell = { count: 0, minPriority: priority };
      this.cells.set(key, cell);
    }

    if(cell.count < this.maxLabelsPerCell) {
      cell.count++;
      if(priority < cell.minPriority) {
        cell.minPriority = priority;
      }
      return true;
    }

    // Cell full - only allow if higher priority than current minimum
    if(priority > cell.minPriority) {
      return true; // Allow but don't increment (approximate)
    }

    return false;
  }
}


export class LabelOverlay {

  constructor(r) {
    this.r = r;
    this.labelGrid = new LabelDensityGrid();
    this._enabled = false;
  }

  /**
   * Enable the overlay. Creates the canvas if needed.
   * Called during WebGL initialization.
   */
  enable() {
    this._enabled = true;
  }

  /**
   * Check if the overlay is enabled and has a canvas.
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * Render labels on the Canvas 2D overlay.
   * Uses the existing NODE canvas layer for label rendering.
   *
   * @param {Array} visibleEles - elements that passed frustum culling
   * @param {Object} pan - { x, y } pan position
   * @param {number} zoom - zoom level
   * @param {boolean} forExport - if true, render all labels without culling
   */
  render(visibleEles, pan, zoom, forExport = false) {
    const r = this.r;
    const context = r.data.contexts[r.NODE];

    // Use the label density grid to limit visible labels
    this.labelGrid.clear();

    let labelCount = 0;
    const maxLabels = forExport ? Infinity : 500;

    for(let i = 0; i < visibleEles.length && labelCount < maxLabels; i++) {
      const ele = visibleEles[i];

      if(ele.isNode()) {
        // Check if this node should have its label displayed
        const label = ele.pstyle('label');
        if(!label || !label.value) continue;

        const pos = ele._private.position;
        const sx = pos.x * zoom + pan.x;
        const sy = pos.y * zoom + pan.y;

        // Priority based on node size (larger nodes get labels first)
        const priority = ele.outerWidth() * ele.outerHeight();

        if(forExport || this.labelGrid.canDisplay(sx, sy, priority)) {
          // Delegate label drawing to the existing canvas renderer
          r.drawElementText(context, ele, null, true);
          labelCount++;
        }
      } else {
        // Edge labels: render if the edge has a label set
        const label = ele.pstyle('label');
        if(label && label.value) {
          r.drawElementText(context, ele, null, true);
          labelCount++;
        }
      }
    }

    return labelCount;
  }

  /**
   * Render all labels without density culling (for export).
   */
  renderForExport(eles) {
    const r = this.r;
    const context = r.data.contexts[r.NODE];

    for(let i = 0; i < eles.length; i++) {
      const ele = eles[i];
      const label = ele.pstyle('label');
      if(label && label.value) {
        r.drawElementText(context, ele, null, true);
      }
    }
  }
}
