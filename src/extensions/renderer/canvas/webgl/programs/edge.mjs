import { packPremulColor, packColor, packPickIndex } from '../color-pack.mjs';
import { createProgram, UNIT_QUAD } from '../webgl-util.mjs';

export const EDGE_STRIDE = 11; // floats per edge instance
export const EDGE_TYPE_STRIDE = 1; // int per instance (vertex type)

// Vertex type constants
const EDGE_STRAIGHT = 0;
const EDGE_CURVE_SEGMENT = 1;
const EDGE_ARROW = 2;

// Number of segments for bezier subdivision
const BEZIER_SEGMENTS = 16;

// ---- Shader Sources ----

export const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform mat3 uPanZoomMatrix;

// Unit quad vertex (not instanced)
layout(location = 0) in vec2 aVertex;

// Per-instance float attributes (divisor=1)
layout(location = 1) in vec4 aPointAB;
layout(location = 2) in vec4 aPointCD;
layout(location = 3) in float aColor;
layout(location = 4) in float aWidth;
layout(location = 5) in float aPickId;

// Per-instance int attribute (divisor=1, separate buffer)
layout(location = 6) in int aVertType;

// To fragment shader
flat out float vColor;
flat out int vVertType;
flat out float vPickId;

void main() {
  vec2 position = aVertex;
  int vid = gl_VertexID % 6;

  if(aVertType == 0) { // EDGE_STRAIGHT
    vec2 source = aPointAB.xy;
    vec2 target = aPointAB.zw;
    position.y -= 0.5;
    vec2 xBasis = target - source;
    vec2 yBasis = normalize(vec2(-xBasis.y, xBasis.x));
    vec2 point = source + xBasis * position.x + yBasis * aWidth * position.y;
    gl_Position = vec4((uPanZoomMatrix * vec3(point, 1.0)).xy, 0.0, 1.0);
  } else if(aVertType == 1) { // EDGE_CURVE_SEGMENT
    vec2 pointA = aPointAB.xy;
    vec2 pointB = aPointAB.zw;
    vec2 pointC = aPointCD.xy;
    vec2 pointD = aPointCD.zw;
    position.y -= 0.5;

    // Left side (position.x == 0): compute perpendicular at B using A-B-C
    // Right side (position.x == 1): compute perpendicular at C using B-C-D (flipped)
    vec2 p0, p1, p2;
    float posY;
    if(position.x == 0.0) {
      p0 = pointA; p1 = pointB; p2 = pointC;
      posY = position.y;
    } else {
      p0 = pointD; p1 = pointC; p2 = pointB;
      posY = -position.y;
    }

    vec2 p01 = p1 - p0;
    vec2 p12 = p2 - p1;
    vec2 p21 = p1 - p2;
    vec2 tangent = normalize(normalize(p12) + normalize(p01));
    vec2 normal = vec2(-tangent.y, tangent.x);
    vec2 p01Norm = normalize(vec2(-p01.y, p01.x));
    float sigma = sign(dot(p01 + p21, normal));
    float w = aWidth;

    if(sign(posY) == -sigma) {
      vec2 point = 0.5 * w * normal * -sigma / dot(normal, p01Norm);
      gl_Position = vec4((uPanZoomMatrix * vec3(p1 + point, 1.0)).xy, 0.0, 1.0);
    } else {
      vec2 point = 0.5 * w * normal * sigma * dot(normal, p01Norm);
      gl_Position = vec4((uPanZoomMatrix * vec3(p1 + point, 1.0)).xy, 0.0, 1.0);
    }
  } else if(aVertType == 2 && vid < 3) { // EDGE_ARROW
    float arrowX = aPointAB.x;
    float arrowY = aPointAB.y;
    float arrowSize = aPointAB.z;
    float arrowAngle = aPointAB.w;
    vec2 triPos;
    if(vid == 0) triPos = vec2(-0.15, -0.3);
    else if(vid == 1) triPos = vec2(0.0, 0.0);
    else triPos = vec2(0.15, -0.3);
    float c = cos(arrowAngle);
    float s = sin(arrowAngle);
    vec2 rotated = vec2(triPos.x*c - triPos.y*s, triPos.x*s + triPos.y*c) * arrowSize;
    gl_Position = vec4((uPanZoomMatrix * vec3(vec2(arrowX, arrowY) + rotated, 1.0)).xy, 0.0, 1.0);
  } else {
    gl_Position = vec4(0.0); // degenerate, invisible
  }

  vColor = aColor;
  vVertType = aVertType;
  vPickId = aPickId;
}
`;

const FRAGMENT_SHADER_HEADER = `#version 300 es
precision highp float;

flat in float vColor;
flat in int vVertType;
flat in float vPickId;

uniform vec4 uBGColor;

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

vec4 blend(vec4 top, vec4 bot) {
  return vec4(
    top.rgb + (bot.rgb * (1.0 - top.a)),
    top.a + (bot.a * (1.0 - top.a))
  );
}
`;

const FRAGMENT_SHADER_MAIN = `
void main() {
  #ifdef PICKING_MODE
    outColor = unpackColor(vPickId);
  #else
    if(vVertType == 2) {
      outColor = blend(unpackColor(vColor), uBGColor);
      outColor.a = 1.0;
    } else {
      outColor = unpackColor(vColor);
    }
  #endif
}
`;

export const FRAGMENT_SHADER_SOURCE = FRAGMENT_SHADER_HEADER + FRAGMENT_SHADER_MAIN;
export const FRAGMENT_SHADER_PICKING_SOURCE = FRAGMENT_SHADER_HEADER + '#define PICKING_MODE\n' + FRAGMENT_SHADER_MAIN;


export class EdgeProgram {

  constructor() {
    this.buffer = null;       // Float32Array (instance data)
    this.typeBuffer = null;   // Int32Array (vertex types per instance)
    this.capacity = 0;
    this.count = 0;           // total instances across all edges
    this.needsUpload = false;
    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this.glBuffer = null;     // WebGL buffer for float instance data
    this.glTypeBuffer = null; // WebGL buffer for int vertex types
    this._gpuFloatSize = 0;
    this._gpuTypeSize = 0;
    this.quadBuffer = null;   // WebGL buffer for unit quad
    this.vao = null;
    this.screenProgram = null;
    this.pickingProgram = null;
    // Picking resources on the node GL context (separate from edge GL context)
    this._pickVao = null;
    this._pickGlBuffer = null;
    this._pickGlTypeBuffer = null;
    this._pickQuadBuffer = null;
    this._pickProgram = null;
    this._pickGpuFloatSize = 0;
    this._pickGpuTypeSize = 0;
  }

  /** Initialize GL resources. Called once. */
  init(gl) {
    this.screenProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    this.pickingProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_PICKING_SOURCE);

    for(const prog of [this.screenProgram, this.pickingProgram]) {
      prog.uPanZoomMatrix = gl.getUniformLocation(prog, 'uPanZoomMatrix');
      prog.uBGColor = gl.getUniformLocation(prog, 'uBGColor');
    }

    this.glBuffer = gl.createBuffer();
    this.glTypeBuffer = gl.createBuffer();

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // --- Unit quad (non-instanced) ---
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);

    const LOC_VERTEX   = 0;
    const LOC_POINT_AB = 1;
    const LOC_POINT_CD = 2;
    const LOC_COLOR    = 3;
    const LOC_WIDTH    = 4;
    const LOC_PICK_ID  = 5;
    const LOC_VERT_TYPE = 6;

    gl.enableVertexAttribArray(LOC_VERTEX);
    gl.vertexAttribPointer(LOC_VERTEX, 2, gl.FLOAT, false, 0, 0);
    // divisor = 0 (default, per-vertex)

    // --- Per-instance float attributes from the interleaved buffer ---
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);

    const stride = EDGE_STRIDE * 4; // bytes per instance

    const floatAttribs = [
      { loc: LOC_POINT_AB, size: 4, offset: 0 },  // pointAx, pointAy, pointBx, pointBy
      { loc: LOC_POINT_CD, size: 4, offset: 4 },  // pointCx, pointCy, pointDx, pointDy
      { loc: LOC_COLOR,    size: 1, offset: 8 },
      { loc: LOC_WIDTH,    size: 1, offset: 9 },
      { loc: LOC_PICK_ID,  size: 1, offset: 10 },
    ];

    for(const attr of floatAttribs) {
      gl.enableVertexAttribArray(attr.loc);
      gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
      gl.vertexAttribDivisor(attr.loc, 1); // per-instance
    }

    // --- Per-instance int attribute from the type buffer ---
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glTypeBuffer);
    gl.enableVertexAttribArray(LOC_VERT_TYPE);
    gl.vertexAttribIPointer(LOC_VERT_TYPE, 1, gl.INT, 0, 0);
    gl.vertexAttribDivisor(LOC_VERT_TYPE, 1); // per-instance

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  /** Initialize picking resources on a DIFFERENT GL context (the node GL context)
   *  so edges can be drawn into the node-context picking framebuffer. */
  initPicking(gl) {
    this._pickProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_PICKING_SOURCE);
    this._pickProgram.uPanZoomMatrix = gl.getUniformLocation(this._pickProgram, 'uPanZoomMatrix');
    this._pickProgram.uBGColor = gl.getUniformLocation(this._pickProgram, 'uBGColor');

    this._pickGlBuffer = gl.createBuffer();
    this._pickGlTypeBuffer = gl.createBuffer();

    this._pickVao = gl.createVertexArray();
    gl.bindVertexArray(this._pickVao);

    this._pickQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._pickQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instance float attribs (same layout as init)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._pickGlBuffer);
    const stride = EDGE_STRIDE * 4;
    const floatAttribs = [
      { loc: 1, size: 4, offset: 0 },
      { loc: 2, size: 4, offset: 4 },
      { loc: 3, size: 1, offset: 8 },
      { loc: 4, size: 1, offset: 9 },
      { loc: 5, size: 1, offset: 10 },
    ];
    for(const attr of floatAttribs) {
      gl.enableVertexAttribArray(attr.loc);
      gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
      gl.vertexAttribDivisor(attr.loc, 1);
    }

    // Instance type attrib
    gl.bindBuffer(gl.ARRAY_BUFFER, this._pickGlTypeBuffer);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribIPointer(6, 1, gl.INT, 0, 0);
    gl.vertexAttribDivisor(6, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  /** Upload edge data to the picking GL context. */
  uploadPicking(gl) {
    if(!this._pickGlBuffer || !this.buffer || this.count === 0) return;
    const floatSize = this.count * EDGE_STRIDE;
    const typeSize = this.count;

    if(floatSize > this._pickGpuFloatSize || typeSize > this._pickGpuTypeSize) {
      this._pickGpuFloatSize = floatSize;
      this._pickGpuTypeSize = typeSize;
      gl.bindVertexArray(this._pickVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._pickGlBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.buffer.subarray(0, floatSize), gl.DYNAMIC_DRAW);
      const stride = EDGE_STRIDE * 4;
      const floatAttribs = [
        { loc: 1, size: 4, offset: 0 },
        { loc: 2, size: 4, offset: 4 },
        { loc: 3, size: 1, offset: 8 },
        { loc: 4, size: 1, offset: 9 },
        { loc: 5, size: 1, offset: 10 },
      ];
      for(const attr of floatAttribs) {
        gl.enableVertexAttribArray(attr.loc);
        gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
        gl.vertexAttribDivisor(attr.loc, 1);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._pickGlTypeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.typeBuffer.subarray(0, typeSize), gl.DYNAMIC_DRAW);
      gl.bindVertexArray(null);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._pickGlBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.buffer.subarray(0, floatSize));
      gl.bindBuffer(gl.ARRAY_BUFFER, this._pickGlTypeBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.typeBuffer.subarray(0, typeSize));
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  /** Draw edges for picking on the node GL context. */
  drawPicking(gl, panZoomMatrix, zoom) {
    if(this.count === 0 || !this.buffer || !this._pickProgram) return;
    gl.useProgram(this._pickProgram);
    gl.bindVertexArray(this._pickVao);
    gl.uniformMatrix3fv(this._pickProgram.uPanZoomMatrix, false, panZoomMatrix);
    if(this._pickProgram.uBGColor !== null) {
      gl.uniform4fv(this._pickProgram.uBGColor, [1.0, 1.0, 1.0, 1.0]);
    }
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  /** Ensure buffers can hold `instanceCount` instances. */
  reallocate(instanceCount) {
    if(instanceCount <= this.capacity) return;
    const newCap = Math.max(instanceCount, this.capacity * 2, 256);
    const newBuffer = new Float32Array(newCap * EDGE_STRIDE);
    const newTypeBuffer = new Int32Array(newCap);
    if(this.buffer) newBuffer.set(this.buffer);
    if(this.typeBuffer) newTypeBuffer.set(this.typeBuffer);
    this.buffer = newBuffer;
    this.typeBuffer = newTypeBuffer;
    this.capacity = newCap;
    this.needsUpload = true;
  }

  /** Grow buffers if needed to hold at least `needed` instances. */
  ensureCapacity(needed) {
    if(needed > this.capacity) {
      this.reallocate(needed);
    }
  }

  /**
   * Process one edge. Writes segment instances + arrow instances to the buffer.
   * Returns the next available slot index.
   * Called during process() only -- NOT per frame.
   */
  processEdge(startSlot, edge, pickIndex, r) {
    const rs = edge._private.rscratch;
    if(!rs || !rs.allpts) return startSlot;

    const controlPoints = rs.allpts;
    const combinedOpacity = edge.pstyle('opacity').value * edge.pstyle('line-opacity').value;
    const color = packPremulColor(edge.pstyle('line-color').value, combinedOpacity);
    const width = edge.pstyle('width').pfValue;
    const pickId = packPickIndex(pickIndex);

    let slot = startSlot;

    if(controlPoints.length === 4) {
      // Straight line: 1 instance
      this._writeInstance(slot, EDGE_STRAIGHT,
        controlPoints[0], controlPoints[1],
        controlPoints[2], controlPoints[3],
        0, 0, 0, 0,
        color, width, pickId
      );
      slot++;
    } else {
      // Bezier: pre-compute segment points, write N instances
      const segmentPoints = this._computeSegments(controlPoints, BEZIER_SEGMENTS);
      for(let i = 0; i < segmentPoints.length - 2; i += 2) {
        let pAx = segmentPoints[i - 2], pAy = segmentPoints[i - 1];
        let pBx = segmentPoints[i], pBy = segmentPoints[i + 1];
        let pCx = segmentPoints[i + 2], pCy = segmentPoints[i + 3];
        let pDx = segmentPoints[i + 4], pDy = segmentPoints[i + 5];
        if(i === 0) { pAx = 2 * pBx - pCx + 0.001; pAy = 2 * pBy - pCy + 0.001; }
        if(i === segmentPoints.length - 4) { pDx = 2 * pCx - pBx + 0.001; pDy = 2 * pCy - pBy + 0.001; }
        this._writeInstance(slot, EDGE_CURVE_SEGMENT,
          pAx, pAy, pBx, pBy, pCx, pCy, pDx, pDy,
          color, width, pickId
        );
        slot++;
      }
    }

    // Arrows
    const srcShape = edge.pstyle('source-arrow-shape').value;
    if(srcShape !== 'none') {
      slot = this._writeArrow(slot, edge, 'source', color, width, pickId, r, combinedOpacity);
    }
    const tgtShape = edge.pstyle('target-arrow-shape').value;
    if(tgtShape !== 'none') {
      slot = this._writeArrow(slot, edge, 'target', color, width, pickId, r, combinedOpacity);
    }

    return slot;
  }

  _writeInstance(slot, type, ax, ay, bx, by, cx, cy, dx, dy, color, width, pickId) {
    const off = slot * EDGE_STRIDE;
    this.buffer[off + 0] = ax;
    this.buffer[off + 1] = ay;
    this.buffer[off + 2] = bx;
    this.buffer[off + 3] = by;
    this.buffer[off + 4] = cx;
    this.buffer[off + 5] = cy;
    this.buffer[off + 6] = dx;
    this.buffer[off + 7] = dy;
    this.buffer[off + 8] = color;
    this.buffer[off + 9] = width;
    this.buffer[off + 10] = pickId;
    this.typeBuffer[slot] = type;
    this._markDirty(slot);
  }

  _markDirty(slot) {
    if(slot < this._dirtyMin) this._dirtyMin = slot;
    if(slot > this._dirtyMax) this._dirtyMax = slot;
    this.needsUpload = true;
  }

  _writeArrow(slot, edge, prefix, edgeColor, edgeWidth, pickId, r, combinedOpacity) {
    const rs = edge._private.rscratch;
    let x, y, angle;
    if(prefix === 'source') {
      x = rs.arrowStartX;
      y = rs.arrowStartY;
      angle = rs.srcArrowAngle;
    } else {
      x = rs.arrowEndX;
      y = rs.arrowEndY;
      angle = rs.tgtArrowAngle;
    }
    if(isNaN(x) || isNaN(y) || isNaN(angle)) return slot;

    const scale = edge.pstyle('arrow-scale').value;
    const arrowColor = packPremulColor(
      edge.pstyle(prefix + '-arrow-color').value,
      combinedOpacity
    );
    const size = r.getArrowWidth(edgeWidth, scale);

    this._writeInstance(slot, EDGE_ARROW,
      x, y, size, angle,
      0, 0, 0, 0,
      arrowColor, edgeWidth, pickId
    );
    return slot + 1;
  }

  /**
   * Compute subdivision points along a bezier curve using De Casteljau's algorithm.
   * Returns an array of (numSegments+1) * 2 values (x,y pairs).
   */
  _computeSegments(controlPoints, numSegments) {
    const n = controlPoints.length;
    // Reuse pre-allocated arrays to avoid GC pressure (called per bezier edge)
    const resultLen = (numSegments + 1) * 2;
    if(!this._segResult || this._segResult.length < resultLen) {
      this._segResult = new Array(resultLen);
    }
    if(!this._segWork || this._segWork.length < n) {
      this._segWork = new Array(n);
    }
    const result = this._segResult;
    const work = this._segWork;

    result[0] = controlPoints[0];
    result[1] = controlPoints[1];
    result[numSegments * 2] = controlPoints[n - 2];
    result[numSegments * 2 + 1] = controlPoints[n - 1];

    for(let s = 1; s < numSegments; s++) {
      const t = s / numSegments;
      const omt = 1 - t;
      for(let j = 0; j < n; j++) work[j] = controlPoints[j];
      for(let level = n; level > 2; level -= 2) {
        for(let j = 0; j < level - 2; j += 2) {
          work[j] = omt * work[j] + t * work[j + 2];
          work[j + 1] = omt * work[j + 1] + t * work[j + 3];
        }
      }
      result[s * 2] = work[0];
      result[s * 2 + 1] = work[1];
    }
    return result;
  }

  /** Upload buffers to GPU if dirty. */
  upload(gl) {
    if(!this.needsUpload || !this.buffer || this.count === 0) return;

    const floatSize = this.count * EDGE_STRIDE;
    const typeSize = this.count;
    const floatData = this.buffer.subarray(0, floatSize);
    const typeData = this.typeBuffer.subarray(0, typeSize);

    const needsRebind = (floatSize > this._gpuFloatSize) || (typeSize > this._gpuTypeSize);

    if(needsRebind) {
      // Recreate buffers and rebind in VAO
      gl.deleteBuffer(this.glBuffer);
      gl.deleteBuffer(this.glTypeBuffer);
      this.glBuffer = gl.createBuffer();
      this.glTypeBuffer = gl.createBuffer();
      this._gpuFloatSize = floatSize;
      this._gpuTypeSize = typeSize;

      gl.bindVertexArray(this.vao);

      // Float buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, floatData, gl.DYNAMIC_DRAW);
      const stride = EDGE_STRIDE * 4;
      const floatAttribs = [
        { loc: 1, size: 4, offset: 0 },  // aPointAB
        { loc: 2, size: 4, offset: 4 },  // aPointCD
        { loc: 3, size: 1, offset: 8 },  // aColor
        { loc: 4, size: 1, offset: 9 },  // aWidth
        { loc: 5, size: 1, offset: 10 }, // aPickId
      ];
      for(const attr of floatAttribs) {
        gl.enableVertexAttribArray(attr.loc);
        gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
        gl.vertexAttribDivisor(attr.loc, 1);
      }

      // Type buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glTypeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, typeData, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(6);
      gl.vertexAttribIPointer(6, 1, gl.INT, 0, 0);
      gl.vertexAttribDivisor(6, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
    } else if(this._dirtyMin <= this._dirtyMax) {
      // Partial upload: only the dirty range
      const startFloat = this._dirtyMin * EDGE_STRIDE;
      const endFloat = (this._dirtyMax + 1) * EDGE_STRIDE;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, startFloat * 4,
        this.buffer.subarray(startFloat, Math.min(endFloat, floatSize)));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glTypeBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, this._dirtyMin * 4,
        this.typeBuffer.subarray(this._dirtyMin, Math.min(this._dirtyMax + 1, typeSize)));
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    } else {
      // Full upload
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, floatData);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glTypeBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, typeData);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this.needsUpload = false;
  }

  /** Draw all edge instances. */
  draw(gl, panZoomMatrix, isPicking, zoom, bgColor) {
    if(this.count === 0 || !this.buffer) return;
    const program = isPicking ? this.pickingProgram : this.screenProgram;
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(program.uPanZoomMatrix, false, panZoomMatrix);
    if(program.uBGColor !== null) {
      gl.uniform4fv(program.uBGColor, bgColor || [1.0, 1.0, 1.0, 1.0]);
    }
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  /** Update edge endpoint positions for drag. */
  updateEdgeEndpoints(slot, instanceCount, edge) {
    const rs = edge._private.rscratch;
    if(!rs || rs.badLine || !rs.allpts) return;

    const controlPoints = rs.allpts;
    let s = slot;

    if(controlPoints.length === 4) {
      const off = s * EDGE_STRIDE;
      this.buffer[off + 0] = controlPoints[0];
      this.buffer[off + 1] = controlPoints[1];
      this.buffer[off + 2] = controlPoints[2];
      this.buffer[off + 3] = controlPoints[3];
      s++;
    } else {
      const segmentPoints = this._computeSegments(controlPoints, BEZIER_SEGMENTS);
      for(let i = 0; i < segmentPoints.length - 2; i += 2) {
        let pAx = segmentPoints[i - 2], pAy = segmentPoints[i - 1];
        let pBx = segmentPoints[i], pBy = segmentPoints[i + 1];
        let pCx = segmentPoints[i + 2], pCy = segmentPoints[i + 3];
        let pDx = segmentPoints[i + 4], pDy = segmentPoints[i + 5];
        if(i === 0) { pAx = 2 * pBx - pCx + 0.001; pAy = 2 * pBy - pCy + 0.001; }
        if(i === segmentPoints.length - 4) { pDx = 2 * pCx - pBx + 0.001; pDy = 2 * pCy - pBy + 0.001; }
        const off = s * EDGE_STRIDE;
        this.buffer[off + 0] = pAx;
        this.buffer[off + 1] = pAy;
        this.buffer[off + 2] = pBx;
        this.buffer[off + 3] = pBy;
        this.buffer[off + 4] = pCx;
        this.buffer[off + 5] = pCy;
        this.buffer[off + 6] = pDx;
        this.buffer[off + 7] = pDy;
        s++;
      }
    }

    // Update arrow positions
    if(s < slot + instanceCount) {
      const srcShape = edge.pstyle('source-arrow-shape').value;
      if(srcShape !== 'none') {
        const off = s * EDGE_STRIDE;
        this.buffer[off + 0] = rs.arrowStartX;
        this.buffer[off + 1] = rs.arrowStartY;
        // size and angle kept from processEdge, but angle may change
        this.buffer[off + 3] = rs.srcArrowAngle;
        s++;
      }
    }
    if(s < slot + instanceCount) {
      const tgtShape = edge.pstyle('target-arrow-shape').value;
      if(tgtShape !== 'none') {
        const off = s * EDGE_STRIDE;
        this.buffer[off + 0] = rs.arrowEndX;
        this.buffer[off + 1] = rs.arrowEndY;
        this.buffer[off + 3] = rs.tgtArrowAngle;
        s++;
      }
    }

    // Mark dirty range for partial upload
    if(slot < this._dirtyMin) this._dirtyMin = slot;
    const endSlot = slot + instanceCount - 1;
    if(endSlot > this._dirtyMax) this._dirtyMax = endSlot;
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
    if(this.glTypeBuffer) {
      gl.deleteBuffer(this.glTypeBuffer);
      this.glTypeBuffer = null;
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
    this.typeBuffer = null;
    this.capacity = 0;
    this.count = 0;
  }

  /** Clean up picking GL resources (on a DIFFERENT GL context than destroy). */
  destroyPicking(gl) {
    if(this._pickVao) { gl.deleteVertexArray(this._pickVao); this._pickVao = null; }
    if(this._pickGlBuffer) { gl.deleteBuffer(this._pickGlBuffer); this._pickGlBuffer = null; }
    if(this._pickGlTypeBuffer) { gl.deleteBuffer(this._pickGlTypeBuffer); this._pickGlTypeBuffer = null; }
    if(this._pickQuadBuffer) { gl.deleteBuffer(this._pickQuadBuffer); this._pickQuadBuffer = null; }
    if(this._pickProgram) { gl.deleteProgram(this._pickProgram); this._pickProgram = null; }
  }
}
