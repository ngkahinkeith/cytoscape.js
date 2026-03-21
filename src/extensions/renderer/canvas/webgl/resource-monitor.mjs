/**
 * ResourceMonitor — tracks GPU memory usage and enforces budget.
 * Target hardware: 1GB shared GPU memory.
 * Budget: 500MB for renderer (leaves 500MB for OS/browser).
 */
export class ResourceMonitor {
  constructor(opts = {}) {
    this.maxGPUMemoryMB = opts.maxGPUMemoryMB || 500;
    this.buffers = new Map();
    this.atlasPages = [];
    this.canvasBytes = 0;
  }

  trackBuffer(name, bytes) { this.buffers.set(name, bytes); }

  trackAtlasPage(width, height) { this.atlasPages.push(width * height * 4); }

  trackCanvases(count, width, height) { this.canvasBytes = count * width * height * 4; }

  getBufferMemoryMB() {
    let total = 0;
    for(const bytes of this.buffers.values()) total += bytes;
    return total / (1024 * 1024);
  }

  getAtlasMemoryMB() {
    let total = 0;
    for(const bytes of this.atlasPages) total += bytes;
    return total / (1024 * 1024);
  }

  getTotalMB() {
    return this.getBufferMemoryMB() + this.getAtlasMemoryMB() + this.canvasBytes / (1024 * 1024);
  }

  isOverBudget() { return this.getTotalMB() > this.maxGPUMemoryMB; }

  /** Returns 0 (no degradation) to 5 (maximum degradation) */
  getDegradationLevel() {
    const ratio = this.getTotalMB() / this.maxGPUMemoryMB;
    if(ratio <= 1.0) return 0;
    if(ratio <= 1.5) return 1; // reduce atlas page size
    if(ratio <= 2.0) return 2; // reduce image size in atlas
    if(ratio <= 3.0) return 3; // skip bg-images
    if(ratio <= 5.0) return 4; // reduce edge segments
    return 5; // minimal rendering
  }

  getReport() {
    return [
      `GPU Memory: ${this.getTotalMB().toFixed(1)} MB / ${this.maxGPUMemoryMB} MB`,
      `  Buffers: ${this.getBufferMemoryMB().toFixed(1)} MB`,
      `  Atlas: ${this.getAtlasMemoryMB().toFixed(1)} MB (${this.atlasPages.length} pages)`,
      `  Canvases: ${(this.canvasBytes / (1024*1024)).toFixed(1)} MB`,
      `  Degradation: level ${this.getDegradationLevel()}`,
    ].join('\n');
  }

  reset() { this.buffers.clear(); this.atlasPages = []; this.canvasBytes = 0; }
}
