import { packPremulColor, packPickIndex } from '../color-pack.mjs';
import { createProgram, UNIT_QUAD } from '../webgl-util.mjs';

export const NODE_TEX_STRIDE = 11; // floats per textured node

// ---- Shader Sources ----

export const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform mat3 uPanZoomMatrix;
uniform float uZoom;

layout(location = 0) in vec2 aVertex;

layout(location = 1) in vec2 aNodePos;
layout(location = 2) in vec2 aNodeSize;
layout(location = 3) in float aColor;
layout(location = 4) in vec2 aTexXY;
layout(location = 5) in vec2 aTexSize;
layout(location = 6) in float aTexPageIndex;
layout(location = 7) in float aPickId;

out vec2 vTexCoord;
flat out float vColor;
flat out float vTexPageIndex;
flat out float vPickId;

void main() {
  // LOD cull: skip bg-image when node is too small for detail to be visible
  float screenSize = max(aNodeSize.x, aNodeSize.y) * uZoom;
  if(screenSize < 10.0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  vec2 modelPos = aNodePos + (aVertex - 0.5) * aNodeSize;
  gl_Position = vec4((uPanZoomMatrix * vec3(modelPos, 1.0)).xy, 0.0, 1.0);

  vTexCoord = aTexXY + aVertex * aTexSize;
  vColor = aColor;
  vTexPageIndex = aTexPageIndex;
  vPickId = aPickId;
}
`;

/**
 * Generate fragment shader source for a given page count.
 * Dynamically recompiled when the texture page count changes (sigma.js approach).
 */
export function getFragmentShaderSource(pageCount) {
  const maxPages = Math.max(pageCount, 1);

  // Build the if-else chain for page selection
  let pageSelection = '';
  for(let i = 0; i < maxPages; i++) {
    const cond = i === 0 ? 'if' : 'else if';
    pageSelection += `    ${cond}(pageIndex == ${i}) texel = texture(u_atlas[${i}], vTexCoord);\n`;
  }

  return `#version 300 es
precision highp float;

in vec2 vTexCoord;
flat in float vColor;
flat in float vTexPageIndex;
flat in float vPickId;

uniform sampler2D u_atlas[${maxPages}];

out vec4 outColor;

vec4 unpackColor(float f) {
  int v = floatBitsToInt(f);
  return vec4(
    float(v & 0xFF) / 255.0,
    float((v >> 8) & 0xFF) / 255.0,
    float((v >> 16) & 0xFF) / 255.0,
    float((v >> 24) & 0xFF) / 255.0
  );
}

void main() {
  int pageIndex = int(vTexPageIndex);
  vec4 texel = vec4(0.0);

${pageSelection}
  #ifdef PICKING_MODE
    if(texel.a < 0.01) discard;
    outColor = unpackColor(vPickId);
  #else
    // Only render where the texture has content (alpha > 0).
    // Transparent areas are discarded — the SDF shape behind shows through.
    if(texel.a < 0.01) discard;
    outColor = texel;
  #endif
}
`;
}

export function getPickingFragmentShaderSource(pageCount) {
  const base = getFragmentShaderSource(pageCount);
  // Insert #define PICKING_MODE after the #version line
  return base.replace(
    'precision highp float;',
    '#define PICKING_MODE\nprecision highp float;'
  );
}


export class NodeTextureProgram {

  constructor() {
    this.buffer = null;       // Float32Array
    this.capacity = 0;
    this.count = 0;
    this.needsUpload = false;
    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this.glBuffer = null;     // WebGL buffer object
    this.quadBuffer = null;   // WebGL buffer for unit quad
    this.vao = null;          // WebGL VAO
    this.screenProgram = null;
    this.pickingProgram = null;
    this._compiledPageCount = 0;
    this._textureManager = null;
    this._gpuBufferSize = 0;
  }

  /** Set reference to the TexturePageManager. */
  setTextureManager(mgr) {
    this._textureManager = mgr;
  }

  /** Initialize GL resources. Called once. */
  init(gl) {
    this._gl = gl;
    this._compileShaders(gl, 1); // start with 1 page

    // Create instance data buffer
    this.glBuffer = gl.createBuffer();

    // Create VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // --- Unit quad (non-instanced) ---
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);

    const LOC_VERTEX        = 0;
    const LOC_NODE_POS      = 1;
    const LOC_NODE_SIZE     = 2;
    const LOC_COLOR         = 3;
    const LOC_TEX_XY        = 4;
    const LOC_TEX_SIZE      = 5;
    const LOC_TEX_PAGE      = 6;
    const LOC_PICK_ID       = 7;

    gl.enableVertexAttribArray(LOC_VERTEX);
    gl.vertexAttribPointer(LOC_VERTEX, 2, gl.FLOAT, false, 0, 0);
    // divisor = 0 (default, per-vertex)

    // --- Per-instance attributes from the interleaved buffer ---
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);

    const stride = NODE_TEX_STRIDE * 4; // bytes per instance

    const attribs = [
      { loc: LOC_NODE_POS,  size: 2, offset: 0 },
      { loc: LOC_NODE_SIZE, size: 2, offset: 2 },
      { loc: LOC_COLOR,     size: 1, offset: 4 },
      { loc: LOC_TEX_XY,    size: 2, offset: 5 },
      { loc: LOC_TEX_SIZE,  size: 2, offset: 7 },
      { loc: LOC_TEX_PAGE,  size: 1, offset: 9 },
      { loc: LOC_PICK_ID,   size: 1, offset: 10 },
    ];

    for(const attr of attribs) {
      gl.enableVertexAttribArray(attr.loc);
      gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
      gl.vertexAttribDivisor(attr.loc, 1); // per-instance
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  /** Compile/recompile shaders for the given page count. */
  _compileShaders(gl, pageCount) {
    // Delete old programs
    if(this.screenProgram) gl.deleteProgram(this.screenProgram);
    if(this.pickingProgram) gl.deleteProgram(this.pickingProgram);

    const fragSrc = getFragmentShaderSource(pageCount);
    const pickFragSrc = getPickingFragmentShaderSource(pageCount);

    this.screenProgram = createProgram(gl, VERTEX_SHADER_SOURCE, fragSrc);
    this.pickingProgram = createProgram(gl, VERTEX_SHADER_SOURCE, pickFragSrc);

    // Cache uniform locations on both programs
    for(const prog of [this.screenProgram, this.pickingProgram]) {
      prog.uPanZoomMatrix = gl.getUniformLocation(prog, 'uPanZoomMatrix');
      prog.uZoom = gl.getUniformLocation(prog, 'uZoom');
      prog.uAtlas = [];
      for(let i = 0; i < pageCount; i++) {
        prog.uAtlas.push(gl.getUniformLocation(prog, `u_atlas[${i}]`));
      }
    }

    this._compiledPageCount = pageCount;
  }

  /** Ensure buffer can hold `count` nodes. */
  reallocate(count) {
    if(count <= this.capacity) return;
    const newCap = Math.max(count, this.capacity * 2, 256);
    const newBuffer = new Float32Array(newCap * NODE_TEX_STRIDE);
    if(this.buffer) newBuffer.set(this.buffer);
    this.buffer = newBuffer;
    this.capacity = newCap;
    this.needsUpload = true;
  }

  /** Grow buffer if needed to hold at least `needed` slots. */
  ensureCapacity(needed) {
    if(needed > this.capacity) {
      this.reallocate(needed);
    }
  }

  /**
   * Pack one textured node's data into the buffer.
   * @param {number} slot - Buffer slot index
   * @param {object} node - Cytoscape node
   * @param {number} pickIndex - Picking identifier
   * @param {object} textureManager - TexturePageManager instance
   */
  processNode(slot, node, pickIndex, textureManager) {
    const buf = this.buffer;
    const off = slot * NODE_TEX_STRIDE;
    const pos = node.position();

    buf[off + 0] = pos.x;
    buf[off + 1] = pos.y;
    buf[off + 2] = node.outerWidth();
    buf[off + 3] = node.outerHeight();

    // Node background color (premultiplied alpha)
    const texBgColor = node.pstyle('background-color').value;
    let texBgOpacity = node.pstyle('background-opacity').value;
    if(texBgColor.length > 3 && texBgColor[3] < 1) {
      texBgOpacity *= texBgColor[3];
    }
    buf[off + 4] = packPremulColor(texBgColor, texBgOpacity);

    // Atlas coordinates
    const imgUrl = node.pstyle('background-image').strValue;
    const entry = textureManager ? textureManager.getEntry(imgUrl) : null;

    if(entry) {
      // Use the actual page canvas size for UV normalization (may be smaller than maxPageSize)
      const pages = textureManager.getPages();
      const pageCanvas = pages[entry.pageIndex] ? pages[entry.pageIndex].canvas : null;
      const pageSize = pageCanvas ? pageCanvas.width : (textureManager._activePageSize || textureManager.maxPageSize);

      // Normalize atlas coordinates to [0,1] range
      buf[off + 5] = entry.x / pageSize;
      buf[off + 6] = entry.y / pageSize;
      buf[off + 7] = entry.size / pageSize;
      buf[off + 8] = entry.size / pageSize;
      buf[off + 9] = entry.pageIndex;
    } else {
      buf[off + 5] = 0;
      buf[off + 6] = 0;
      buf[off + 7] = 0;
      buf[off + 8] = 0;
      buf[off + 9] = 0;
    }

    buf[off + 10] = packPickIndex(pickIndex);

    this._markDirty(slot);
  }

  /** Upload buffer to GPU if dirty. */
  upload(gl) {
    if(!this.needsUpload || !this.buffer || this.count === 0) return;

    const dataSize = this.count * NODE_TEX_STRIDE;
    const data = this.buffer.subarray(0, dataSize);

    if(dataSize > this._gpuBufferSize) {
      gl.deleteBuffer(this.glBuffer);
      this.glBuffer = gl.createBuffer();
      this._gpuBufferSize = dataSize;

      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

      const stride = NODE_TEX_STRIDE * 4;
      const attribs = [
        { loc: 1, size: 2, offset: 0 },   // aNodePos
        { loc: 2, size: 2, offset: 2 },   // aNodeSize
        { loc: 3, size: 1, offset: 4 },   // aColor
        { loc: 4, size: 2, offset: 5 },   // aTexXY
        { loc: 5, size: 2, offset: 7 },   // aTexSize
        { loc: 6, size: 1, offset: 9 },   // aTexPageIndex
        { loc: 7, size: 1, offset: 10 },  // aPickId
      ];
      for(const attr of attribs) {
        gl.enableVertexAttribArray(attr.loc);
        gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
        gl.vertexAttribDivisor(attr.loc, 1);
      }
      gl.bindVertexArray(null);
    } else if(this._dirtyMin <= this._dirtyMax) {
      // Partial upload: only the dirty range
      const startFloat = this._dirtyMin * NODE_TEX_STRIDE;
      const endFloat = (this._dirtyMax + 1) * NODE_TEX_STRIDE;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, startFloat * 4,
        this.buffer.subarray(startFloat, Math.min(endFloat, dataSize)));
    } else {
      // Full upload
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    }

    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this.needsUpload = false;
  }

  /** Draw all textured nodes. */
  draw(gl, panZoomMatrix, isPicking, zoom) {
    if(this.count === 0 || !this.buffer) return;

    // Recompile shaders if page count changed
    const mgr = this._textureManager;
    const pageCount = mgr ? mgr.getPageCount() : 1;
    if(pageCount !== this._compiledPageCount && pageCount > 0) {
      this._compileShaders(gl, pageCount);
    }

    const program = isPicking ? this.pickingProgram : this.screenProgram;
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(program.uPanZoomMatrix, false, panZoomMatrix);
    gl.uniform1f(program.uZoom, zoom || 1.0);

    // Bind all texture pages
    if(mgr) {
      const pages = mgr.getPages();
      for(let i = 0; i < pages.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        if(pages[i].glTexture) {
          gl.bindTexture(gl.TEXTURE_2D, pages[i].glTexture);
        }
        if(program.uAtlas[i] !== undefined) {
          gl.uniform1i(program.uAtlas[i], i);
        }
      }
    }

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  /** Update just position (for drag). */
  updatePosition(slot, x, y) {
    const off = slot * NODE_TEX_STRIDE;
    this.buffer[off + 0] = x;
    this.buffer[off + 1] = y;
    this._markDirty(slot);
  }

  _markDirty(slot) {
    if(slot < this._dirtyMin) this._dirtyMin = slot;
    if(slot > this._dirtyMax) this._dirtyMax = slot;
    this.needsUpload = true;
  }

  /** Clean up GL resources. */
  destroy(gl) {
    if(this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    if(this.glBuffer) {
      gl.deleteBuffer(this.glBuffer);
      this.glBuffer = null;
    }
    if(this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer);
      this.quadBuffer = null;
    }
    if(this.screenProgram) {
      gl.deleteProgram(this.screenProgram);
      this.screenProgram = null;
    }
    if(this.pickingProgram) {
      gl.deleteProgram(this.pickingProgram);
      this.pickingProgram = null;
    }
    this.buffer = null;
    this.capacity = 0;
    this.count = 0;
    this._textureManager = null;
  }
}
