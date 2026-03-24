/**
 * TexturePageManager
 *
 * An image-URL-keyed texture atlas manager (adapted from sigma.js @sigma/node-image).
 *
 * Key design decisions:
 * - Atlas is keyed by image URL, not style key. 50K nodes sharing one URL = 1 atlas entry.
 * - Multiple texture pages: when one page fills up, a new one is created.
 * - Each page is a Canvas2D offscreen canvas (maxPageSize x maxPageSize).
 * - Images are loaded asynchronously; atlas is rebuilt when images become ready.
 * - Debounced rebuild (100ms) to batch multiple image loads.
 */
export class TexturePageManager {

  constructor(opts = {}) {
    this.maxPageSize = opts.maxPageSize || 4096;
    this.maxImageSize = opts.maxImageSize || 512;
    this.pages = [];           // Array of { canvas, glTexture }
    this.atlas = {};           // imageURL -> { x, y, size, pageIndex }
    this.imageStates = {};     // imageURL -> 'loading' | 'ready' | 'error'
    this.images = {};          // imageURL -> HTMLImageElement
    this._onUpdateCallback = null;
    this._rebuildTimer = null;
  }

  /** Register an image URL. Loads async, triggers atlas rebuild when ready. */
  registerImage(url) {
    if(this.imageStates[url]) return; // already registered
    this.imageStates[url] = 'loading';

    // In Node.js / headless environments, Image may not exist
    if(typeof Image === 'undefined') return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.imageStates[url] = 'ready';
      this.images[url] = img;
      this._scheduleRebuild();
    };
    img.onerror = () => {
      this.imageStates[url] = 'error';
    };
    img.src = url;
  }

  /** Get atlas entry for a URL. Returns { x, y, size, pageIndex } or null. */
  getEntry(url) {
    return this.atlas[url] || null;
  }

  /** Get all texture pages (array of { canvas, glTexture }). */
  getPages() {
    return this.pages;
  }

  /** Get page count. */
  getPageCount() {
    return this.pages.length;
  }

  /** Set callback for when atlas is rebuilt. */
  onUpdate(fn) {
    this._onUpdateCallback = fn;
  }

  /** Compute the smallest power-of-2 page size that fits all images (one page worth). */
  _computePageSize(readyUrls) {
    const maxImgSize = this.maxImageSize;
    const upperBound = this.maxPageSize;
    const sizes = [256, 512, 1024, 2048, 4096];

    // Compute the actual cell size for each image (max of w,h clamped to maxImgSize)
    let maxCellSize = 0;
    const imageCount = readyUrls.length;
    for(const url of readyUrls) {
      const img = this.images[url];
      const cellSize = Math.min(maxImgSize, Math.max(img.width, img.height));
      if(cellSize > maxCellSize) maxCellSize = cellSize;
    }

    if(imageCount === 0) return sizes[0];

    // For each candidate page size, check if all images fit in one page
    for(const pageSize of sizes) {
      if(pageSize > upperBound) break;
      if(pageSize < maxCellSize) continue; // can't even fit one image

      const cellWithMargin = maxCellSize + 1; // 1px margin
      const cols = Math.floor(pageSize / cellWithMargin);
      if(cols === 0) continue;
      const rows = Math.ceil(imageCount / cols);
      const neededHeight = rows * cellWithMargin;
      if(neededHeight <= pageSize) {
        return pageSize;
      }
    }

    // Fall back to the configured max if nothing smaller fits
    return upperBound;
  }

  /** Rebuild atlas from all ready images. */
  rebuild() {
    const maxImgSize = this.maxImageSize;

    this.atlas = {};
    this.pages = [];
    this._texturesUploaded = false;

    // Collect ready images
    const readyUrls = Object.keys(this.imageStates).filter(
      url => this.imageStates[url] === 'ready'
    );
    if(readyUrls.length === 0) return;

    // Compute optimal page size for the actual images
    const pageSize = this._computePageSize(readyUrls);
    this._activePageSize = pageSize;

    let page = this._createPage(pageSize);
    this.pages.push(page);
    let cursorX = 0, cursorY = 0, rowHeight = 0;

    for(const url of readyUrls) {
      const img = this.images[url];
      const size = Math.min(maxImgSize, Math.max(img.width, img.height));

      // Does it fit in current row?
      if(cursorX + size > pageSize) {
        // Move to next row
        cursorX = 0;
        cursorY += rowHeight;
        rowHeight = 0;
      }

      // Does it fit in current page?
      if(cursorY + size > pageSize) {
        // New page
        page = this._createPage(pageSize);
        this.pages.push(page);
        cursorX = 0;
        cursorY = 0;
        rowHeight = 0;
      }

      // Draw image to page canvas (when canvas has a real 2D context)
      if(page.canvas.getContext) {
        const ctx = page.canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height, cursorX, cursorY, size, size);
      }

      this.atlas[url] = {
        x: cursorX,
        y: cursorY,
        size: size,
        pageIndex: this.pages.length - 1,
      };

      cursorX += size + 1; // 1px margin
      rowHeight = Math.max(rowHeight, size + 1);
    }

    if(this._onUpdateCallback) this._onUpdateCallback();
  }

  _createPage(size) {
    const dim = size || this.maxPageSize;
    // In Node.js tests, document may not exist -- handle gracefully
    let canvas;
    if(typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = dim;
      canvas.height = dim;
    } else {
      // Stub for headless / test environments
      canvas = { width: dim, height: dim };
    }
    return { canvas, glTexture: null };
  }

  _scheduleRebuild() {
    if(this._rebuildTimer) return;
    this._rebuildTimer = setTimeout(() => {
      this._rebuildTimer = null;
      this.rebuild();
    }, 100);
  }

  /**
   * Upload all page canvases to WebGL textures.
   * Must be called with a GL context before drawing.
   */
  uploadTextures(gl) {
    for(const page of this.pages) {
      if(!page.canvas || !page.canvas.getContext) continue;

      if(!page.glTexture) {
        page.glTexture = gl.createTexture();
      }

      gl.bindTexture(gl.TEXTURE_2D, page.glTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, page.canvas);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    this._texturesUploaded = true;
  }

  /** Check if textures need uploading. */
  needsTextureUpload() {
    return !this._texturesUploaded || this.pages.some(p => !p.glTexture);
  }

  /** Get total memory used by atlas pages in bytes (RGBA). */
  getMemoryBytes() {
    let total = 0;
    for(const page of this.pages) {
      total += page.canvas.width * page.canvas.height * 4;
    }
    return total;
  }

  /** Clean up all resources. Pass the GL context to delete GPU textures. */
  destroy(gl) {
    if(this._rebuildTimer) clearTimeout(this._rebuildTimer);
    if(gl) {
      for(const page of this.pages) {
        if(page.glTexture) { gl.deleteTexture(page.glTexture); }
      }
    }
    this.pages = [];
    this.atlas = {};
    this.imageStates = {};
    this.images = {};
    this._onUpdateCallback = null;
  }
}
