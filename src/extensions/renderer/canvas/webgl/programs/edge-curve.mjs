import { packPremulColor, packPickIndex } from '../color-pack.mjs';
import { createProgram, UNIT_QUAD } from '../webgl-util.mjs';
import { isMetricsEnabled, getMetrics } from '../perf-metrics.mjs';

export const EDGE_CURVE_STRIDE = 9; // source(2) + target(2) + controlPt(2) + color(1) + width(1) + pickId(1)

// ---- Shader Sources ----

export const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform mat3 uPanZoomMatrix;
uniform vec2 uViewportSize;
uniform float uZoom;
uniform vec4 uViewportBounds; // model-space (x1, y1, x2, y2) for viewport culling

// Unit quad vertex (not instanced)
layout(location = 0) in vec2 aVertex; // [0,0]-[1,1] quad

// Per-instance (divisor=1)
layout(location = 1) in vec2 aSource;      // source node position (model space)
layout(location = 2) in vec2 aTarget;      // target node position (model space)
layout(location = 3) in vec2 aControlPt;   // bezier control point (model space)
layout(location = 4) in float aColor;      // packed RGBA
layout(location = 5) in float aWidth;      // line width
layout(location = 6) in float aPickId;     // pick index

out vec2 vCpA;       // control point A (source) in viewport pixels
out vec2 vCpB;       // control point B (mid) in viewport pixels
out vec2 vCpC;       // control point C (target) in viewport pixels
flat out float vColor;
flat out float vWidth;
flat out float vPickId;
flat out float vUseLOD;  // 1.0 = use polyline LOD, 0.0 = full bezier
out vec2 vP1;            // polyline bend point 1 (bezier at t=1/3)
out vec2 vP2;            // polyline bend point 2 (bezier at t=2/3)

vec2 toViewport(vec2 clipPos) {
  return (clipPos + 1.0) * uViewportSize * 0.5;
}

void main() {
  // Transform all 3 control points to clip space
  vec2 srcClip = (uPanZoomMatrix * vec3(aSource, 1.0)).xy;
  vec2 tgtClip = (uPanZoomMatrix * vec3(aTarget, 1.0)).xy;
  vec2 ctlClip = (uPanZoomMatrix * vec3(aControlPt, 1.0)).xy;

  // Convert to viewport pixels for fragment shader distance computation
  vCpA = toViewport(srcClip);
  vCpB = toViewport(ctlClip);
  vCpC = toViewport(tgtClip);

  // Scale width from model space to viewport pixels
  float screenWidth = aWidth * uZoom;
  float padding = screenWidth + 2.0; // line width + AA margin

  // --- Viewport culling in model space ---
  // If the edge's bounding box (src/ctrl/tgt with margin) is entirely outside
  // the viewport, degenerate the quad to an invisible point.
  float margin = aWidth * 2.0;
  vec2 eMin = min(min(aSource, aTarget), aControlPt) - margin;
  vec2 eMax = max(max(aSource, aTarget), aControlPt) + margin;
  if(eMax.x < uViewportBounds.x || eMin.x > uViewportBounds.z ||
     eMax.y < uViewportBounds.y || eMin.y > uViewportBounds.w) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // --- Sub-pixel LOD cull ---
  // Skip edges that are too small to see: if the screen-space distance
  // between source and target is < 4px AND line width is sub-pixel,
  // the edge is invisible. Same pattern as node-sdf.mjs LOD cull.
  float screenDist = distance(vCpA, vCpC);
  if(screenDist < 4.0 && screenWidth < 1.0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // --- Oriented Bounding Box (OBB) along source-to-target chord ---
  vec2 chord = vCpC - vCpA;
  float chordLen = length(chord);

  vec2 viewportPos;
  if(chordLen < 0.001) {
    // Degenerate case (self-loop or coincident endpoints): fall back to AABB
    vec2 minBound = min(min(vCpA, vCpB), vCpC) - padding;
    vec2 maxBound = max(max(vCpA, vCpB), vCpC) + padding;
    viewportPos = mix(minBound, maxBound, aVertex);
  } else {
    // Chord-aligned OBB: much tighter than AABB for curved edges
    vec2 chordDir = chord / chordLen;
    vec2 chordNorm = vec2(-chordDir.y, chordDir.x);

    // Project control point perpendicular offset from chord midpoint
    vec2 midToCtrl = vCpB - (vCpA + vCpC) * 0.5;
    float perpOffset = dot(midToCtrl, chordNorm);

    // Quadratic bezier max deviation from chord = |perpOffset| / 2
    // Add padding for line width + AA margin
    float halfAcross = abs(perpOffset) * 0.5 + padding;

    // Bias center perpendicular to account for control point side
    float centerBias = perpOffset * 0.5;

    // Map unit quad [0,1] to OBB
    float along = (aVertex.x - 0.5) * (chordLen + 2.0 * padding);
    float across = (aVertex.y - 0.5) * 2.0 * halfAcross;
    vec2 center = (vCpA + vCpC) * 0.5 + chordNorm * centerBias;
    viewportPos = center + chordDir * along + chordNorm * across;
  }

  // Convert back to clip space
  gl_Position = vec4(viewportPos / uViewportSize * 2.0 - 1.0, 0.0, 1.0);

  vColor = aColor;
  vWidth = screenWidth;
  vPickId = aPickId;

  // Per-edge LOD: precompute polyline bend points in vertex shader (runs 6x per edge)
  // so the fragment shader (runs 1000s of times) can use cheap polyline distance.
  // Quadratic bezier at t: (1-t)^2*A + 2(1-t)t*B + t^2*C
  vP1 = (4.0/9.0)*vCpA + (4.0/9.0)*vCpB + (1.0/9.0)*vCpC; // t=1/3
  vP2 = (1.0/9.0)*vCpA + (4.0/9.0)*vCpB + (4.0/9.0)*vCpC; // t=2/3
  vUseLOD = (chordLen < 200.0) ? 1.0 : 0.0;
}
`;

const FRAGMENT_SHADER_HEADER = `#version 300 es
precision highp float;

in vec2 vCpA;
in vec2 vCpB;
in vec2 vCpC;
flat in float vColor;
flat in float vWidth;
flat in float vPickId;
flat in float vUseLOD;
in vec2 vP1;
in vec2 vP2;

out vec4 outColor;

// Unpack RGBA from single float (same as node-sdf)
vec4 unpackColor(float f) {
  int rgba = floatBitsToInt(f);
  return vec4(
    float(rgba & 0xFF) / 255.0,
    float((rgba >> 8) & 0xFF) / 255.0,
    float((rgba >> 16) & 0xFF) / 255.0,
    float((rgba >> 24) & 0xFF) / 255.0
  );
}

float det(vec2 a, vec2 b) {
  return a.x * b.y - b.x * a.y;
}

// Compute distance from point p to quadratic bezier curve defined by b0, b1, b2.
// Ported from sigma.js's distToQuadraticBezierCurve().
float distToQuadraticBezierCurve(vec2 p, vec2 b0, vec2 b1, vec2 b2) {
  vec2 b0p = b0 - p, b1p = b1 - p, b2p = b2 - p;
  float a = det(b0p, b2p);
  float b = 2.0 * det(b1p, b0p);
  float d = 2.0 * det(b2p, b1p);
  float f = b * d - a * a;
  vec2 d21 = b2p - b1p, d10 = b1p - b0p, d20 = b2p - b0p;
  vec2 gf = 2.0 * (b * d21 + d * d10 + a * d20);
  gf = vec2(gf.y, -gf.x);
  vec2 pp = -f * gf / dot(gf, gf);
  vec2 d0p = b0p - pp;
  float ap = det(d0p, d20);
  float bp = 2.0 * det(d10, d0p);
  float t = clamp((ap + bp) / (2.0 * a + b + d), 0.0, 1.0);
  vec2 closest = mix(mix(b0p, b1p, t), mix(b1p, b2p, t), t);
  return length(closest);
}
`;

const FRAGMENT_SHADER_SCREEN_MAIN = `
// Distance from point to line segment (~5 ops).
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * t);
}

void main() {
  float halfWidth = vWidth * 0.5;
  // Per-edge LOD decided in vertex shader (flat varying = no warp divergence).
  // LOD path: 3-segment polyline through precomputed bezier(1/3) and bezier(2/3)
  // gives two corners — ~15 ops vs ~20 ops for full bezier, with bend points
  // computed once in vertex shader instead of per-pixel.
  float dist;
  if(vUseLOD > 0.5) {
    vec2 p = gl_FragCoord.xy;
    dist = min(segDist(p, vCpA, vP1), min(segDist(p, vP1, vP2), segDist(p, vP2, vCpC)));
  } else {
    dist = distToQuadraticBezierCurve(gl_FragCoord.xy, vCpA, vCpB, vCpC);
  }
  vec4 color = unpackColor(vColor);
  float alpha = 1.0 - smoothstep(halfWidth - 1.0, halfWidth + 0.5, dist);
  outColor = vec4(color.rgb * color.a * alpha, color.a * alpha);
}
`;

const FRAGMENT_SHADER_PICKING_MAIN = `
float segDistPick(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * t);
}

void main() {
  float halfWidth = vWidth * 0.5;
  float dist;
  if(vUseLOD > 0.5) {
    vec2 p = gl_FragCoord.xy;
    dist = min(segDistPick(p, vCpA, vP1), min(segDistPick(p, vP1, vP2), segDistPick(p, vP2, vCpC)));
  } else {
    dist = distToQuadraticBezierCurve(gl_FragCoord.xy, vCpA, vCpB, vCpC);
  }
  if(dist > halfWidth + 1.0) {
    discard;
  }
  outColor = unpackColor(vPickId);
}
`;

export const FRAGMENT_SHADER_SOURCE = FRAGMENT_SHADER_HEADER + FRAGMENT_SHADER_SCREEN_MAIN;
export const FRAGMENT_SHADER_PICKING_SOURCE = FRAGMENT_SHADER_HEADER + FRAGMENT_SHADER_PICKING_MAIN;


export class EdgeCurveProgram {

  constructor() {
    this.buffer = null;       // Float32Array (instance data)
    this.capacity = 0;
    this.count = 0;           // number of curve edge instances
    this.needsUpload = false;
    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this.glBuffer = null;     // WebGL buffer for instance data
    this._gpuBufferSize = 0;  // current GPU buffer size in floats
    this.quadBuffer = null;   // WebGL buffer for unit quad
    this.vao = null;
    this.screenProgram = null;
    this.pickingProgram = null;
  }

  /** Initialize GL resources. Called once. */
  init(gl) {
    this.screenProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    this.pickingProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_PICKING_SOURCE);

    for(const prog of [this.screenProgram, this.pickingProgram]) {
      prog.uPanZoomMatrix = gl.getUniformLocation(prog, 'uPanZoomMatrix');
      prog.uViewportSize = gl.getUniformLocation(prog, 'uViewportSize');
      prog.uZoom = gl.getUniformLocation(prog, 'uZoom');
      prog.uViewportBounds = gl.getUniformLocation(prog, 'uViewportBounds');
    }

    this.glBuffer = gl.createBuffer();

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // --- Unit quad (non-instanced) ---
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // divisor = 0 (default, per-vertex)

    // --- Per-instance float attributes from the interleaved buffer ---
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
    this._setupInstanceAttribs(gl);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  /** Set up per-instance attribute pointers on the currently bound VAO and ARRAY_BUFFER. */
  _setupInstanceAttribs(gl) {
    const stride = EDGE_CURVE_STRIDE * 4; // bytes per instance

    const attribs = [
      { loc: 1, size: 2, offset: 0 },  // aSource
      { loc: 2, size: 2, offset: 2 },  // aTarget
      { loc: 3, size: 2, offset: 4 },  // aControlPt
      { loc: 4, size: 1, offset: 6 },  // aColor
      { loc: 5, size: 1, offset: 7 },  // aWidth
      { loc: 6, size: 1, offset: 8 },  // aPickId
    ];

    for(const attr of attribs) {
      gl.enableVertexAttribArray(attr.loc);
      gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
      gl.vertexAttribDivisor(attr.loc, 1); // per-instance
    }
  }

  /** Ensure buffers can hold `instanceCount` instances. */
  reallocate(instanceCount) {
    if(instanceCount <= this.capacity) return;
    const newCap = Math.max(instanceCount, this.capacity * 2, 256);
    const newBuffer = new Float32Array(newCap * EDGE_CURVE_STRIDE);
    if(this.buffer) newBuffer.set(this.buffer);
    this.buffer = newBuffer;
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
   * Process one bezier curve edge. Writes a single instance to the buffer.
   * Returns the next available slot index.
   *
   * For quadratic beziers (allpts.length === 6): control point is at indices [2,3].
   * For cubic beziers (allpts.length === 8): use midpoint of the two inner control
   * points as a quadratic approximation.
   * For multi-segment curves (allpts.length > 8): use the middle control point.
   */
  processCurveEdge(slot, edge, pickIndex, combinedOpacity, lineColor, width) {
    const rs = edge._private.rscratch;
    if(!rs || !rs.allpts || rs.allpts.length < 6) return slot;

    const pts = rs.allpts;
    // Use pre-computed values if provided, otherwise read from pstyle
    if(combinedOpacity === undefined) {
      combinedOpacity = edge.pstyle('opacity').value * edge.pstyle('line-opacity').value;
      lineColor = edge.pstyle('line-color').value;
      width = edge.pstyle('width').pfValue;
    }
    const color = packPremulColor(lineColor, combinedOpacity);
    const pickId = packPickIndex(pickIndex);

    // Source and target are always first and last pair
    const srcX = pts[0];
    const srcY = pts[1];
    const tgtX = pts[pts.length - 2];
    const tgtY = pts[pts.length - 1];

    // Extract the quadratic control point
    let ctrlX, ctrlY;
    if(pts.length === 6) {
      // Quadratic bezier: [srcX, srcY, cpX, cpY, tgtX, tgtY]
      ctrlX = pts[2];
      ctrlY = pts[3];
    } else if(pts.length === 8) {
      // Cubic bezier: [srcX, srcY, cp1X, cp1Y, cp2X, cp2Y, tgtX, tgtY]
      // Approximate as quadratic using midpoint of the two inner control points
      ctrlX = (pts[2] + pts[4]) * 0.5;
      ctrlY = (pts[3] + pts[5]) * 0.5;
    } else {
      // Multi-segment: use the middle control point pair
      const midIdx = Math.floor(pts.length / 2) & ~1; // even index
      ctrlX = pts[midIdx];
      ctrlY = pts[midIdx + 1];
    }

    // Phase 0 measurement harness — zero overhead when disabled.
    if(isMetricsEnabled()) {
      const m = getMetrics();
      const dx = tgtX - srcX;
      const dy = tgtY - srcY;
      const chordLen = Math.sqrt(dx * dx + dy * dy);
      m.recordChord(chordLen);
      if(chordLen >= 0.001) {
        const cdx = dx / chordLen;
        const cdy = dy / chordLen;
        const midX = (srcX + tgtX) * 0.5;
        const midY = (srcY + tgtY) * 0.5;
        const mx = ctrlX - midX;
        const my = ctrlY - midY;
        // perp = (-cdy, cdx)
        const perpOffset = mx * (-cdy) + my * cdx;
        m.recordPerpOffset(perpOffset);
        // along-chord projection of ctrl from src (raw, in pixels)
        const t = (ctrlX - srcX) * cdx + (ctrlY - srcY) * cdy;
        m.recordChordProjection(t, chordLen);
      }
    }

    this._writeInstance(slot, srcX, srcY, tgtX, tgtY, ctrlX, ctrlY, color, width, pickId);
    return slot + 1;
  }

  _writeInstance(slot, srcX, srcY, tgtX, tgtY, ctrlX, ctrlY, color, width, pickId) {
    const off = slot * EDGE_CURVE_STRIDE;
    this.buffer[off + 0] = srcX;
    this.buffer[off + 1] = srcY;
    this.buffer[off + 2] = tgtX;
    this.buffer[off + 3] = tgtY;
    this.buffer[off + 4] = ctrlX;
    this.buffer[off + 5] = ctrlY;
    this.buffer[off + 6] = color;
    this.buffer[off + 7] = width;
    this.buffer[off + 8] = pickId;
    this._markDirty(slot);
  }

  /** Mark a slot as dirty for partial upload. */
  _markDirty(slot) {
    if(slot < this._dirtyMin) this._dirtyMin = slot;
    if(slot > this._dirtyMax) this._dirtyMax = slot;
    this.needsUpload = true;
  }

  /** Upload buffer to GPU if dirty. Uses dirty range for partial uploads. */
  upload(gl) {
    if(!this.needsUpload || !this.buffer || this.count === 0) return;

    const dataSize = this.count * EDGE_CURVE_STRIDE;

    // If GPU buffer is too small, orphan and reallocate via bufferData
    if(dataSize > this._gpuBufferSize) {
      const data = this.buffer.subarray(0, dataSize);
      this._gpuBufferSize = dataSize;

      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); // orphans old buffer
      this._setupInstanceAttribs(gl);
      gl.bindVertexArray(null);
    } else if(this._dirtyMin <= this._dirtyMax) {
      // Partial upload: only the dirty range
      const startFloat = this._dirtyMin * EDGE_CURVE_STRIDE;
      const endFloat = (this._dirtyMax + 1) * EDGE_CURVE_STRIDE;
      const dirtyData = this.buffer.subarray(startFloat, Math.min(endFloat, dataSize));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, startFloat * 4, dirtyData);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    } else {
      // Full upload (e.g. after process())
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.buffer.subarray(0, dataSize));
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this.needsUpload = false;
  }

  /** Draw all curve edge instances. GPU vertex shader handles viewport culling. */
  draw(gl, panZoomMatrix, isPicking, zoom, vpBounds) {
    if(this.count === 0 || !this.buffer) return;
    const program = isPicking ? this.pickingProgram : this.screenProgram;
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(program.uPanZoomMatrix, false, panZoomMatrix);
    gl.uniform2f(program.uViewportSize, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(program.uZoom, zoom || 1.0);
    if(vpBounds && program.uViewportBounds !== null) {
      gl.uniform4f(program.uViewportBounds, vpBounds[0], vpBounds[1], vpBounds[2], vpBounds[3]);
    }
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  /** Update edge endpoints and control point for drag. O(1) per edge. */
  updateEndpoints(slot, edge) {
    const rs = edge._private.rscratch;
    if(!rs || rs.badLine || !rs.allpts || rs.allpts.length < 6) return;

    const pts = rs.allpts;
    const off = slot * EDGE_CURVE_STRIDE;

    // Source and target
    this.buffer[off + 0] = pts[0];
    this.buffer[off + 1] = pts[1];
    this.buffer[off + 2] = pts[pts.length - 2];
    this.buffer[off + 3] = pts[pts.length - 1];

    // Control point (same logic as processCurveEdge)
    if(pts.length === 6) {
      this.buffer[off + 4] = pts[2];
      this.buffer[off + 5] = pts[3];
    } else if(pts.length === 8) {
      this.buffer[off + 4] = (pts[2] + pts[4]) * 0.5;
      this.buffer[off + 5] = (pts[3] + pts[5]) * 0.5;
    } else {
      const midIdx = Math.floor(pts.length / 2) & ~1;
      this.buffer[off + 4] = pts[midIdx];
      this.buffer[off + 5] = pts[midIdx + 1];
    }

    this._markDirty(slot);
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
    if(this._drawGLBuffer) {
      gl.deleteBuffer(this._drawGLBuffer);
      this._drawGLBuffer = null;
    }
    this._drawBuffer = null;
    this.buffer = null;
    this.capacity = 0;
    this.count = 0;
  }

}
