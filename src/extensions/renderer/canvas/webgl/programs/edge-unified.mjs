import { packPremulColor, packPickIndex } from '../color-pack.mjs';
import { createProgram, UNIT_QUAD } from '../webgl-util.mjs';

export const EDGE_UNIFIED_STRIDE = 12; // source(2) + target(2) + controlPt(2) + color(1) + width(1) + pickId(1) + arrowFlags(1) + overlay(1) + overlayWidth(1)

// Shared buffer for int<->float bit reinterpretation
const _abuf = new ArrayBuffer(4);
const _f32 = new Float32Array(_abuf);
const _i32 = new Int32Array(_abuf);

// ---- Shader Sources ----

export const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform mat3 uPanZoomMatrix;
uniform vec2 uViewportSize;
uniform float uZoom;
uniform vec4 uViewportBounds; // model-space (x1, y1, x2, y2) for viewport culling
uniform float uLODThreshold;  // chord length threshold for LOD polyline path (200.0 idle, 1e9 interacting)

// Unit quad vertex (not instanced)
layout(location = 0) in vec2 aVertex; // [0,0]-[1,1] quad

// Per-instance (divisor=1)
layout(location = 1) in vec2 aSource;      // source node position (model space)
layout(location = 2) in vec2 aTarget;      // target node position (model space)
layout(location = 3) in vec2 aControlPt;   // bezier control point (model space)
layout(location = 4) in float aColor;      // packed RGBA
layout(location = 5) in float aWidth;      // line width
layout(location = 6) in float aPickId;     // pick index
layout(location = 7) in float aArrowFlags; // packed: bit 0 = hasTargetArrow, bits 1-15 = targetNodeRadius * 2
layout(location = 8) in float aOverlay;    // packed overlay RGBA (0.0 = no overlay)
layout(location = 9) in float aOverlayWidth; // overlay width (2 * padding)

flat out vec2 vCpA;  // control point A (source) in viewport pixels
flat out vec2 vCpB;  // control point B (mid) in viewport pixels
flat out vec2 vCpC;  // control point C (target) in viewport pixels
flat out float vColor;
flat out float vWidth;
flat out float vPickId;
flat out float vUseLOD;  // 2.0 = straight line, 1.0 = polyline LOD, 0.0 = full bezier
flat out vec2 vP1;   // polyline bend point 1 (bezier at t=1/3)
flat out vec2 vP2;   // polyline bend point 2 (bezier at t=2/3)
flat out float vOverlay;
flat out float vOverlayWidth;
flat out float vHasArrow;    // 1.0 if target arrow, 0.0 otherwise
flat out float vArrowLen;    // arrow length in screen pixels
flat out vec2 vChordDir;     // chord unit direction in viewport pixels
flat out float vChordLen;    // chord length in viewport pixels
flat out float vMaxCurveDev; // max curve deviation from chord in viewport pixels
out float vEdgeDist;         // smooth: interpolated perpendicular distance for fast path

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
  float padding = screenWidth * 0.5 + 1.5; // half-width + AA margin

  // Check arrow flags — decode once in vertex shader, pass as flat varyings
  int arrowBits = floatBitsToInt(aArrowFlags);
  bool hasArrow = (arrowBits & 1) != 0;
  if(hasArrow) {
    padding += screenWidth; // arrow widens edge to 2x width
  }

  // Overlay width in screen pixels
  float overlayScreenWidth = aOverlayWidth * uZoom;
  padding = max(padding, overlayScreenWidth * 0.5 + 2.0);

  // --- Viewport culling in model space ---
  float margin = aWidth * 2.0;
  vec2 eMin = min(min(aSource, aTarget), aControlPt) - margin;
  vec2 eMax = max(max(aSource, aTarget), aControlPt) + margin;
  if(eMax.x < uViewportBounds.x || eMin.x > uViewportBounds.z ||
     eMax.y < uViewportBounds.y || eMin.y > uViewportBounds.w) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // --- Sub-pixel LOD cull ---
  // During interaction (uLODThreshold > 200), use a more aggressive cull:
  // hide edges shorter than 8px on screen (barely visible during fast motion).
  // When idle, only cull edges < 4px AND sub-pixel width.
  float screenDist = distance(vCpA, vCpC);
  if(uLODThreshold > 200.0) {
    // During interaction: aggressively cull short edges (barely visible during motion)
    if(screenDist < 20.0) {
      gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
      return;
    }
  } else {
    if(screenDist < 4.0 && screenWidth < 1.0) {
      gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
      return;
    }
  }

  // --- Oriented Bounding Box (OBB) along source-to-target chord ---
  vec2 chord = vCpC - vCpA;
  float chordLen = length(chord);

  vec2 viewportPos;
  if(chordLen < 0.001) {
    vec2 minBound = min(min(vCpA, vCpB), vCpC) - padding;
    vec2 maxBound = max(max(vCpA, vCpB), vCpC) + padding;
    viewportPos = mix(minBound, maxBound, aVertex);
    vChordDir = vec2(1.0, 0.0);
    vChordLen = 0.0;
    vMaxCurveDev = padding;
  } else {
    vec2 chordDir = chord / chordLen;
    vec2 chordNorm = vec2(-chordDir.y, chordDir.x);
    vec2 midToCtrl = vCpB - (vCpA + vCpC) * 0.5;
    float perpOffset = dot(midToCtrl, chordNorm);
    float curveBulge = abs(perpOffset) * 0.5;

    // Check if this is a straight/near-straight edge
    float ctrlDeviation = distance(vCpB, (vCpA + vCpC) * 0.5);
    bool isStraight = ctrlDeviation < 1.0;

    if(isStraight) {
      // Tight rectangle for straight edges (sigma.js approach):
      // Vertices placed exactly along edge with perpendicular offset for width.
      // vEdgeDist interpolates from -1 to +1 across the edge for free distance.
      float halfExt = padding;
      if(hasArrow) halfExt = max(halfExt, screenWidth + 1.0);
      float acrossRaw = aVertex.y - 0.5; // [-0.5, +0.5]
      float along = aVertex.x * chordLen;
      float across = acrossRaw * 2.0 * halfExt;
      viewportPos = vCpA + chordDir * along + chordNorm * across;
      vEdgeDist = acrossRaw * 2.0; // [-1, +1], interpolated by GPU
    } else {
      // Half-slab OBB for curved edges
      float convexExtent = curveBulge + padding;
      float concaveExtent = padding;

      float acrossRaw = aVertex.y - 0.5;
      float extent;
      if(perpOffset >= 0.0) {
        extent = acrossRaw > 0.0 ? convexExtent : concaveExtent;
      } else {
        extent = acrossRaw < 0.0 ? convexExtent : concaveExtent;
      }
      float along = (aVertex.x - 0.5) * (chordLen + 2.0 * padding);
      float across = acrossRaw * 2.0 * extent;
      vec2 center = (vCpA + vCpC) * 0.5;
      viewportPos = center + chordDir * along + chordNorm * across;
      vEdgeDist = 0.0; // not used for curved edges
    }

    vChordDir = chordDir;
    vChordLen = chordLen;
    vMaxCurveDev = curveBulge;
  }

  gl_Position = vec4(viewportPos / uViewportSize * 2.0 - 1.0, 0.0, 1.0);

  vColor = aColor;
  vWidth = screenWidth;
  vPickId = aPickId;
  vOverlay = aOverlay;
  vOverlayWidth = overlayScreenWidth;
  vHasArrow = hasArrow ? 1.0 : 0.0;
  vArrowLen = screenWidth * 2.5;

  vP1 = (4.0/9.0)*vCpA + (4.0/9.0)*vCpB + (1.0/9.0)*vCpC;
  vP2 = (1.0/9.0)*vCpA + (4.0/9.0)*vCpB + (4.0/9.0)*vCpC;
  float ctrlDev2 = distance(vCpB, (vCpA + vCpC) * 0.5);
  if(ctrlDev2 < 1.0) {
    vUseLOD = uLODThreshold > 200.0 ? 2.0 : 1.0;
  } else if(chordLen < uLODThreshold) {
    // Short or interacting: use polyline (~15 ops) instead of full bezier (~25 ops)
    vUseLOD = 1.0;
  } else {
    vUseLOD = 0.0;
  }
}
`;

const FRAGMENT_SHADER_HEADER = `#version 300 es
precision highp float;

flat in vec2 vCpA;
flat in vec2 vCpB;
flat in vec2 vCpC;
flat in float vColor;
flat in float vWidth;
flat in float vPickId;
flat in float vUseLOD;
flat in vec2 vP1;
flat in vec2 vP2;
flat in float vOverlay;
flat in float vOverlayWidth;
flat in float vHasArrow;
flat in float vArrowLen;
flat in vec2 vChordDir;
flat in float vChordLen;
flat in float vMaxCurveDev;
in float vEdgeDist;         // smooth: interpolated perpendicular distance

out vec4 outColor;

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

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * t);
}

// Compute the distance from the curve and the effective half-width (with arrow taper)
float computeDist(vec2 p) {
  if(vUseLOD > 1.5) {
    // Ultra-fast: single straight line (~5 ops) — during fast interaction
    return segDist(p, vCpA, vCpC);
  } else if(vUseLOD > 0.5) {
    // LOD: 3-segment polyline (~15 ops)
    return min(segDist(p, vCpA, vP1), min(segDist(p, vP1, vP2), segDist(p, vP2, vCpC)));
  } else {
    // Full quality: bezier SDF (~25 ops)
    return distToQuadraticBezierCurve(p, vCpA, vCpB, vCpC);
  }
}

float computeEffectiveHalf(vec2 p) {
  float halfWidth = vWidth * 0.5;
  if(vHasArrow > 0.5) {
    float distToTarget = distance(p, vCpC);
    if(distToTarget < vArrowLen) {
      float t = distToTarget / vArrowLen;
      halfWidth = max(t * halfWidth * 2.0, 0.5);
    }
  }
  return halfWidth;
}
`;

const FRAGMENT_SHADER_SCREEN_MAIN = `
void main() {
  vec2 p = gl_FragCoord.xy;

  // Fast path for straight edges (~7 ops, matching sigma.js EdgeRectangleProgram).
  // Uses hardware-interpolated vEdgeDist instead of computing segDist().
  if(vUseLOD > 1.5) {
    float halfWidth = vWidth * 0.5;
    float halfExt = halfWidth + 1.0;
    float dist = abs(vEdgeDist) * halfExt; // hardware-interpolated, ~0 ALU cost
    if(vHasArrow > 0.5) {
      float dt = distance(p, vCpC);
      if(dt < vArrowLen) halfWidth = max((dt / vArrowLen) * halfWidth * 2.0, 0.5);
    }
    float alpha = 1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, dist);
    if(alpha < 0.004) { outColor = vec4(0.0); return; }
    vec4 color = unpackColor(vColor);
    outColor = vec4(color.rgb * alpha, color.a * alpha);
    return;
  }

  // Curved edge path: chord-distance pre-reject + full SDF
  vec2 toP = p - vCpA;
  float proj = dot(toP, vChordDir);
  float perpDist = abs(dot(toP, vec2(-vChordDir.y, vChordDir.x)));
  float maxHalfEst = max(vWidth, vOverlayWidth * 0.5) + 2.0;
  if(perpDist > vMaxCurveDev + maxHalfEst || proj < -maxHalfEst || proj > vChordLen + maxHalfEst) {
    outColor = vec4(0.0);
    return;
  }

  float dist = computeDist(p);
  float effectiveHalf = computeEffectiveHalf(p);

  float maxHalf = vOverlay != 0.0 ? max(effectiveHalf, vOverlayWidth * 0.5) : effectiveHalf;
  if(dist > maxHalf + 1.5) {
    outColor = vec4(0.0);
    return;
  }

  vec4 color = unpackColor(vColor);
  float alpha = 1.0 - smoothstep(effectiveHalf - 0.5, effectiveHalf + 0.5, dist);
  // color.rgb is already premultiplied by packPremulColor() — only multiply by coverage
  vec4 edgeColor = vec4(color.rgb * alpha, color.a * alpha);

  // Overlay blending
  if(vOverlay != 0.0) {
    float overlayHalf = vOverlayWidth * 0.5;
    float overlayAlpha = 1.0 - smoothstep(overlayHalf - 0.5, overlayHalf + 0.5, dist);
    vec4 ovColor = unpackColor(vOverlay);
    // ovColor.rgb is already premultiplied — only multiply by coverage
    vec4 overlayPremul = vec4(ovColor.rgb * overlayAlpha, ovColor.a * overlayAlpha);
    outColor = edgeColor + overlayPremul * (1.0 - edgeColor.a);
  } else {
    outColor = edgeColor;
  }
}
`;

const FRAGMENT_SHADER_PICKING_MAIN = `
void main() {
  vec2 p = gl_FragCoord.xy;

  // Fast path for straight edges (hardware-interpolated distance)
  if(vUseLOD > 1.5) {
    float halfWidth = vWidth * 0.5;
    float halfExt = halfWidth + 1.0;
    float dist = abs(vEdgeDist) * halfExt;
    if(vHasArrow > 0.5) {
      float dt = distance(p, vCpC);
      if(dt < vArrowLen) halfWidth = max((dt / vArrowLen) * halfWidth * 2.0, 0.5);
    }
    if(dist > halfWidth + 1.0) discard;
    outColor = unpackColor(vPickId);
    return;
  }

  // Curved edge path
  vec2 toP = p - vCpA;
  float proj = dot(toP, vChordDir);
  float perpDist = abs(dot(toP, vec2(-vChordDir.y, vChordDir.x)));
  float maxHalfEst = max(vWidth, vOverlayWidth * 0.5) + 2.0;
  if(perpDist > vMaxCurveDev + maxHalfEst || proj < -maxHalfEst || proj > vChordLen + maxHalfEst) {
    discard;
  }

  float dist = computeDist(p);
  float effectiveHalf = computeEffectiveHalf(p);
  float overlayHalf = vOverlayWidth * 0.5;
  float maxHalf = max(effectiveHalf, overlayHalf);
  if(dist > maxHalf + 1.0) {
    discard;
  }
  outColor = unpackColor(vPickId);
}
`;

export const FRAGMENT_SHADER_SOURCE = FRAGMENT_SHADER_HEADER + FRAGMENT_SHADER_SCREEN_MAIN;
export const FRAGMENT_SHADER_PICKING_SOURCE = FRAGMENT_SHADER_HEADER + FRAGMENT_SHADER_PICKING_MAIN;

// ---- Lean Interaction Shaders (minimal varyings for low register pressure) ----
// Only 6 varyings vs 18 in the full shader. Same VAO/buffer, just swap program.
// Matches sigma.js's EdgeRectangleProgram approach for maximum GPU occupancy.

const LEAN_VERTEX_SHADER = `#version 300 es
precision highp float;

uniform mat3 uPanZoomMatrix;
uniform vec2 uViewportSize;
uniform float uZoom;
uniform vec4 uViewportBounds;

layout(location = 0) in vec2 aVertex;
layout(location = 1) in vec2 aSource;
layout(location = 2) in vec2 aTarget;
layout(location = 3) in vec2 aControlPt; // unused but must match VAO layout
layout(location = 4) in float aColor;
layout(location = 5) in float aWidth;
layout(location = 6) in float aPickId;
layout(location = 7) in float aArrowFlags;
layout(location = 8) in float aOverlay;   // unused
layout(location = 9) in float aOverlayWidth; // unused

flat out float vColor;
flat out float vWidth;
flat out float vPickId;
flat out float vHasArrow;
flat out float vArrowLen;
out float vEdgeDist; // smooth: hardware-interpolated perpendicular distance

vec2 toViewport(vec2 clipPos) {
  return (clipPos + 1.0) * uViewportSize * 0.5;
}

void main() {
  vec2 srcClip = (uPanZoomMatrix * vec3(aSource, 1.0)).xy;
  vec2 tgtClip = (uPanZoomMatrix * vec3(aTarget, 1.0)).xy;
  vec2 vpA = toViewport(srcClip);
  vec2 vpC = toViewport(tgtClip);

  float screenWidth = aWidth * uZoom;
  float halfExt = screenWidth * 0.5 + 1.5;

  // Arrow decode
  int arrowBits = floatBitsToInt(aArrowFlags);
  bool hasArrow = (arrowBits & 1) != 0;
  if(hasArrow) halfExt = max(halfExt, screenWidth + 1.0);

  // Viewport culling
  float margin = aWidth * 2.0;
  vec2 eMin = min(aSource, aTarget) - margin;
  vec2 eMax = max(aSource, aTarget) + margin;
  if(eMax.x < uViewportBounds.x || eMin.x > uViewportBounds.z ||
     eMax.y < uViewportBounds.y || eMin.y > uViewportBounds.w) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // Sub-pixel cull (aggressive during interaction)
  float screenDist = distance(vpA, vpC);
  if(screenDist < 20.0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // Tight rectangle geometry (sigma.js approach)
  vec2 chord = vpC - vpA;
  float chordLen = length(chord);
  if(chordLen < 0.001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }
  vec2 chordDir = chord / chordLen;
  vec2 chordNorm = vec2(-chordDir.y, chordDir.x);

  float along = aVertex.x * chordLen;
  float across = (aVertex.y - 0.5) * 2.0 * halfExt;
  vec2 viewportPos = vpA + chordDir * along + chordNorm * across;

  gl_Position = vec4(viewportPos / uViewportSize * 2.0 - 1.0, 0.0, 1.0);

  vColor = aColor;
  vWidth = screenWidth;
  vPickId = aPickId;
  vHasArrow = hasArrow ? 1.0 : 0.0;
  vArrowLen = screenWidth * 2.5;
  vEdgeDist = (aVertex.y - 0.5) * 2.0; // [-1, +1] interpolated by GPU
}
`;

const LEAN_FRAGMENT_SCREEN = `#version 300 es
precision highp float;

flat in float vColor;
flat in float vWidth;
flat in float vPickId;
flat in float vHasArrow;
flat in float vArrowLen;
in float vEdgeDist;

out vec4 outColor;

vec4 unpackColor(float f) {
  int rgba = floatBitsToInt(f);
  return vec4(
    float(rgba & 0xFF) / 255.0,
    float((rgba >> 8) & 0xFF) / 255.0,
    float((rgba >> 16) & 0xFF) / 255.0,
    float((rgba >> 24) & 0xFF) / 255.0
  );
}

void main() {
  float halfWidth = vWidth * 0.5;
  float halfExt = halfWidth + 1.5;
  float dist = abs(vEdgeDist) * halfExt;
  float alpha = 1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, dist);
  if(alpha < 0.004) { outColor = vec4(0.0); return; }
  vec4 color = unpackColor(vColor);
  outColor = vec4(color.rgb * alpha, color.a * alpha);
}
`;


export class UnifiedEdgeProgram {

  constructor() {
    this.buffer = null;       // Float32Array (instance data)
    this.capacity = 0;
    this.count = 0;           // number of edge instances
    this.needsUpload = false;
    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this.glBuffer = null;     // WebGL buffer for instance data
    this._gpuBufferSize = 0;  // current GPU buffer size in floats
    this.quadBuffer = null;   // WebGL buffer for unit quad
    this.vao = null;
    this.screenProgram = null;
    this.pickingProgram = null;
    this.leanScreenProgram = null;  // lean interaction shader (minimal varyings)
  }

  /** Initialize GL resources. Called once. */
  init(gl) {
    this.screenProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    this.pickingProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_PICKING_SOURCE);
    this.leanScreenProgram = createProgram(gl, LEAN_VERTEX_SHADER, LEAN_FRAGMENT_SCREEN);

    for(const prog of [this.screenProgram, this.pickingProgram, this.leanScreenProgram]) {
      prog.uPanZoomMatrix = gl.getUniformLocation(prog, 'uPanZoomMatrix');
      prog.uViewportSize = gl.getUniformLocation(prog, 'uViewportSize');
      prog.uZoom = gl.getUniformLocation(prog, 'uZoom');
      prog.uViewportBounds = gl.getUniformLocation(prog, 'uViewportBounds');
      prog.uLODThreshold = gl.getUniformLocation(prog, 'uLODThreshold');
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

    // --- Per-instance float attributes from the interleaved buffer ---
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
    this._setupInstanceAttribs(gl);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  /** Set up per-instance attribute pointers on the currently bound VAO and ARRAY_BUFFER. */
  _setupInstanceAttribs(gl) {
    const stride = EDGE_UNIFIED_STRIDE * 4; // bytes per instance

    const attribs = [
      { loc: 1, size: 2, offset: 0 },   // aSource
      { loc: 2, size: 2, offset: 2 },   // aTarget
      { loc: 3, size: 2, offset: 4 },   // aControlPt
      { loc: 4, size: 1, offset: 6 },   // aColor
      { loc: 5, size: 1, offset: 7 },   // aWidth
      { loc: 6, size: 1, offset: 8 },   // aPickId
      { loc: 7, size: 1, offset: 9 },   // aArrowFlags
      { loc: 8, size: 1, offset: 10 },  // aOverlay
      { loc: 9, size: 1, offset: 11 },  // aOverlayWidth
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
    const newBuffer = new Float32Array(newCap * EDGE_UNIFIED_STRIDE);
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
   */
  processBezierEdge(slot, edge, pickIndex, targetNodeRadius) {
    const rs = edge._private.rscratch;
    if(!rs || !rs.allpts || rs.allpts.length < 6) return slot;

    const pts = rs.allpts;
    const combinedOpacity = edge.pstyle('opacity').value * edge.pstyle('line-opacity').value;
    const lineColor = edge.pstyle('line-color').value;
    const width = edge.pstyle('width').pfValue;
    const color = packPremulColor(lineColor, combinedOpacity);
    const pickId = packPickIndex(pickIndex);

    const srcX = pts[0];
    const srcY = pts[1];
    const tgtX = pts[pts.length - 2];
    const tgtY = pts[pts.length - 1];

    let ctrlX, ctrlY;
    if(pts.length === 6) {
      ctrlX = pts[2];
      ctrlY = pts[3];
    } else if(pts.length === 8) {
      ctrlX = (pts[2] + pts[4]) * 0.5;
      ctrlY = (pts[3] + pts[5]) * 0.5;
    } else {
      const midIdx = Math.floor(pts.length / 2) & ~1;
      ctrlX = pts[midIdx];
      ctrlY = pts[midIdx + 1];
    }

    const tgtArrow = edge.pstyle('target-arrow-shape').value;
    const hasArrow = tgtArrow !== 'none';
    const arrowFlags = this._packArrowFlags(hasArrow, targetNodeRadius);

    this._writeInstance(slot, srcX, srcY, tgtX, tgtY, ctrlX, ctrlY, color, width, pickId, arrowFlags, 0, 0);
    return slot + 1;
  }

  /**
   * Process one straight edge. Writes a single instance with controlPt at midpoint.
   * Returns the next available slot index.
   */
  processStraightEdge(slot, edge, pickIndex, targetNodeRadius) {
    const rs = edge._private.rscratch;
    if(!rs || !rs.allpts || rs.allpts.length < 4) return slot;

    const pts = rs.allpts;
    const combinedOpacity = edge.pstyle('opacity').value * edge.pstyle('line-opacity').value;
    const lineColor = edge.pstyle('line-color').value;
    const width = edge.pstyle('width').pfValue;
    const color = packPremulColor(lineColor, combinedOpacity);
    const pickId = packPickIndex(pickIndex);

    const srcX = pts[0];
    const srcY = pts[1];
    const tgtX = pts[2];
    const tgtY = pts[3];
    const ctrlX = (srcX + tgtX) * 0.5;
    const ctrlY = (srcY + tgtY) * 0.5;

    const tgtArrow = edge.pstyle('target-arrow-shape').value;
    const hasArrow = tgtArrow !== 'none';
    const arrowFlags = this._packArrowFlags(hasArrow, targetNodeRadius);

    this._writeInstance(slot, srcX, srcY, tgtX, tgtY, ctrlX, ctrlY, color, width, pickId, arrowFlags, 0, 0);
    return slot + 1;
  }

  /**
   * Process a segmented (taxi/polyline) edge. Writes one instance per segment
   * from consecutive waypoints in allpts. Arrow on last segment only.
   * Returns the next available slot index.
   */
  processSegmentedEdge(slot, edge, pickIndex, targetNodeRadius) {
    const rs = edge._private.rscratch;
    if(!rs || !rs.allpts || rs.allpts.length < 4) return slot;

    const pts = rs.allpts;
    const combinedOpacity = edge.pstyle('opacity').value * edge.pstyle('line-opacity').value;
    const lineColor = edge.pstyle('line-color').value;
    const width = edge.pstyle('width').pfValue;
    const color = packPremulColor(lineColor, combinedOpacity);
    const pickId = packPickIndex(pickIndex);

    const tgtArrow = edge.pstyle('target-arrow-shape').value;
    const hasArrow = tgtArrow !== 'none';

    // Number of points = pts.length / 2, number of segments = numPoints - 1
    const numPoints = pts.length / 2;
    const numSegments = numPoints - 1;

    for(let i = 0; i < numSegments; i++) {
      const srcX = pts[i * 2];
      const srcY = pts[i * 2 + 1];
      const tgtX = pts[(i + 1) * 2];
      const tgtY = pts[(i + 1) * 2 + 1];
      const ctrlX = (srcX + tgtX) * 0.5;
      const ctrlY = (srcY + tgtY) * 0.5;

      // Arrow only on the last segment
      const isLast = (i === numSegments - 1);
      const arrowFlags = isLast ? this._packArrowFlags(hasArrow, targetNodeRadius) : 0;

      this._writeInstance(slot, srcX, srcY, tgtX, tgtY, ctrlX, ctrlY, color, width, pickId, arrowFlags, 0, 0);
      slot++;
    }

    return slot;
  }

  /**
   * Update overlay attributes for a slot.
   * @param {number} slot - buffer slot index
   * @param {number[]} color - [r, g, b] 0-255
   * @param {number} opacity - 0-1
   * @param {number} padding - overlay padding
   */
  updateOverlay(slot, color, opacity, padding) {
    const off = slot * EDGE_UNIFIED_STRIDE;
    if(opacity <= 0) {
      this.buffer[off + 10] = 0;
      this.buffer[off + 11] = 0;
    } else {
      this.buffer[off + 10] = packPremulColor(color, opacity);
      this.buffer[off + 11] = padding * 2;
    }
    this._markDirty(slot);
  }

  /**
   * Update edge endpoints and control point for drag. O(1) per edge.
   */
  updateEndpoints(slot, edge) {
    const rs = edge._private.rscratch;
    if(!rs || rs.badLine || !rs.allpts || rs.allpts.length < 4) return;

    const pts = rs.allpts;
    const off = slot * EDGE_UNIFIED_STRIDE;

    // Source and target
    this.buffer[off + 0] = pts[0];
    this.buffer[off + 1] = pts[1];
    this.buffer[off + 2] = pts[pts.length - 2];
    this.buffer[off + 3] = pts[pts.length - 1];

    // Control point
    if(pts.length === 4) {
      // Straight: midpoint
      this.buffer[off + 4] = (pts[0] + pts[2]) * 0.5;
      this.buffer[off + 5] = (pts[1] + pts[3]) * 0.5;
    } else if(pts.length === 6) {
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

  /**
   * Write all 12 floats for a single instance at the given slot.
   */
  _writeInstance(slot, srcX, srcY, tgtX, tgtY, ctrlX, ctrlY, color, width, pickId, arrowFlags, overlay, overlayWidth) {
    const off = slot * EDGE_UNIFIED_STRIDE;
    this.buffer[off + 0] = srcX;
    this.buffer[off + 1] = srcY;
    this.buffer[off + 2] = tgtX;
    this.buffer[off + 3] = tgtY;
    this.buffer[off + 4] = ctrlX;
    this.buffer[off + 5] = ctrlY;
    this.buffer[off + 6] = color;
    this.buffer[off + 7] = width;
    this.buffer[off + 8] = pickId;
    this.buffer[off + 9] = arrowFlags;
    this.buffer[off + 10] = overlay;
    this.buffer[off + 11] = overlayWidth;
    this._markDirty(slot);
  }

  /** Mark a slot as dirty for partial upload. */
  _markDirty(slot) {
    if(slot < this._dirtyMin) this._dirtyMin = slot;
    if(slot > this._dirtyMax) this._dirtyMax = slot;
    this.needsUpload = true;
  }

  /**
   * Pack arrow flags into a float.
   * Bit 0 = hasTargetArrow, bits 1-15 = targetNodeRadius * 2.
   * Returns 0 if !hasArrow.
   */
  _packArrowFlags(hasArrow, nodeRadius) {
    if(!hasArrow) return 0;
    const radiusBits = (Math.round((nodeRadius || 0) * 2) & 0x7FFF) << 1;
    const bits = radiusBits | 1;
    _i32[0] = bits;
    return _f32[0];
  }

  /** Upload buffer to GPU if dirty. Uses dirty range for partial uploads. */
  upload(gl) {
    if(!this.needsUpload || !this.buffer || this.count === 0) return;

    const dataSize = this.count * EDGE_UNIFIED_STRIDE;

    if(dataSize > this._gpuBufferSize) {
      const data = this.buffer.subarray(0, dataSize);
      this._gpuBufferSize = dataSize;

      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      this._setupInstanceAttribs(gl);
      gl.bindVertexArray(null);
    } else if(this._dirtyMin <= this._dirtyMax) {
      const startFloat = this._dirtyMin * EDGE_UNIFIED_STRIDE;
      const endFloat = (this._dirtyMax + 1) * EDGE_UNIFIED_STRIDE;
      const dirtyData = this.buffer.subarray(startFloat, Math.min(endFloat, dataSize));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, startFloat * 4, dirtyData);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.buffer.subarray(0, dataSize));
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this.needsUpload = false;
  }

  /** Draw all unified edge instances. GPU vertex shader handles viewport culling. */
  draw(gl, panZoomMatrix, isPicking, zoom, vpBounds, lodThreshold, useLean) {
    if(this.count === 0 || !this.buffer) return;
    let program;
    if(useLean && !isPicking) {
      program = this.leanScreenProgram;
    } else {
      program = isPicking ? this.pickingProgram : this.screenProgram;
    }
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(program.uPanZoomMatrix, false, panZoomMatrix);
    gl.uniform2f(program.uViewportSize, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(program.uZoom, zoom || 1.0);
    if(vpBounds && program.uViewportBounds !== null) {
      gl.uniform4f(program.uViewportBounds, vpBounds[0], vpBounds[1], vpBounds[2], vpBounds[3]);
    }
    gl.uniform1f(program.uLODThreshold, lodThreshold !== undefined ? lodThreshold : 200.0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
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
    if(this.leanScreenProgram) {
      gl.deleteProgram(this.leanScreenProgram);
      this.leanScreenProgram = null;
    }
    this.buffer = null;
    this.capacity = 0;
    this.count = 0;
  }

}
