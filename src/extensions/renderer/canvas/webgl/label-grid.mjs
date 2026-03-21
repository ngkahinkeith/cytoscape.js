/**
 * Spatial density grid for label culling (adapted from sigma.js).
 * Divides the viewport into cells. Each cell shows the top-N labels
 * sorted by node screen-size (largest first).
 */
export class LabelGrid {
  constructor(cellSize = 100) {
    this.cellSize = cellSize;
    this._cells = new Map();
    this._result = [];
    this._topBuffer = [];
  }

  getLabelsToDisplay(candidates, zoom, viewportWidth, viewportHeight, minScreenSize = 4) {
    const cellSize = this.cellSize;
    const cells = this._cells;
    cells.clear();

    // Density: more labels per cell when zoomed in
    const maxPerCell = Math.max(1, Math.ceil(3 * zoom));

    for(const candidate of candidates) {
      if(candidate.screenSize < minScreenSize) continue;

      const { screenX, screenY } = candidate;

      // Skip if outside viewport (with margin)
      if(screenX < -150 || screenX > viewportWidth + 150) continue;
      if(screenY < -50 || screenY > viewportHeight + 50) continue;

      // Use model-space grid coordinates for cell assignment (stable during pan).
      // This prevents labels from flickering at cell boundaries as the viewport moves.
      const gx = candidate.gridX !== undefined ? candidate.gridX : screenX;
      const gy = candidate.gridY !== undefined ? candidate.gridY : screenY;
      const cx = Math.floor(gx / cellSize);
      const cy = Math.floor(gy / cellSize);
      const key = (cx & 0xFFFF) | ((cy & 0xFFFF) << 16);

      let cell = cells.get(key);
      if(!cell) {
        cell = [];
        cells.set(key, cell);
      }
      cell.push(candidate);
    }

    const result = this._result;
    result.length = 0;

    for(const cell of cells.values()) {
      if(cell.length <= maxPerCell) {
        // All fit — no selection needed
        for(let i = 0; i < cell.length; i++) result.push(cell[i]);
      } else {
        // Top-N selection: O(N*k) where k = maxPerCell (typically 3)
        // Much faster than O(N log N) sort for small k
        const top = this._topBuffer;
        top.length = maxPerCell;
        for(let i = 0; i < maxPerCell; i++) top[i] = cell[i];
        top.sort((a, b) => b.screenSize - a.screenSize);
        for(let i = maxPerCell; i < cell.length; i++) {
          if(cell[i].screenSize > top[maxPerCell - 1].screenSize) {
            top[maxPerCell - 1] = cell[i];
            // Insertion sort the replaced element into correct position
            for(let j = maxPerCell - 1; j > 0 && top[j].screenSize > top[j - 1].screenSize; j--) {
              const tmp = top[j];
              top[j] = top[j - 1];
              top[j - 1] = tmp;
            }
          }
        }
        for(let i = 0; i < top.length; i++) result.push(top[i]);
      }
    }

    return result;
  }
}
