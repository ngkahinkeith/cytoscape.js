import { packPremulColor, packColor } from '../color-pack.mjs';
import { createProgram } from '../webgl-util.mjs';

export const NODE_STRIDE = 11; // floats per node

// Shape name -> enum mapping
export const SHAPE_ENUM = {
  'rectangle': 0, 'square': 0,
  'roundrectangle': 1, 'round-rectangle': 1,
  'bottom-round-rectangle': 2, 'bottomroundrectangle': 2,
  'ellipse': 3,
  'triangle': 4,
  'diamond': 5,
  'pentagon': 6,
  'hexagon': 7,
  'heptagon': 8,
  'octagon': 9,
  'star': 10,
  'tag': 11,
  'vee': 12,
  'rhomboid': 13,
  'barrel': 14,
  'cut-rectangle': 15, 'cutrectangle': 15,
  'concave-hexagon': 16, 'concavehexagon': 16,
};

// Unit quad: 2 triangles forming a [0,0]-[1,1] square
const UNIT_QUAD = new Float32Array([
  0, 0,  1, 0,  1, 1,
  0, 0,  1, 1,  0, 1,
]);

// ---- Shader Sources ----

export const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform mat3 uPanZoomMatrix;

// Unit quad vertex (not instanced)
layout(location = 0) in vec2 aVertex;

// Per-instance (divisor=1)
layout(location = 1) in vec2 aNodePos;
layout(location = 2) in vec2 aNodeSize;
layout(location = 3) in float aColor;
layout(location = 4) in float aBorderColor;
layout(location = 5) in float aBorderWidth;
layout(location = 6) in float aShape;
layout(location = 7) in float aCornerRadius;
layout(location = 8) in float aBorderPos;
layout(location = 9) in float aPickId;

// To fragment shader
out vec2 vPosition;
flat out vec2 vBotLeft;
flat out vec2 vTopRight;
flat out float vColor;
flat out float vBorderColor;
flat out vec2 vBorderWidth; // [outer, inner]
flat out int vShape;
flat out float vCornerRadius;
flat out float vPickId;

void main() {
  float hw = aNodeSize.x / 2.0;
  float hh = aNodeSize.y / 2.0;
  float outerBorder = 0.0;

  if(aBorderPos == 2.0) outerBorder = aBorderWidth;
  else if(aBorderPos == 0.0) outerBorder = aBorderWidth / 2.0;

  vec2 totalSize = aNodeSize + outerBorder * 2.0;
  vec2 modelPos = aNodePos + (aVertex - 0.5) * totalSize;

  gl_Position = vec4((uPanZoomMatrix * vec3(modelPos, 1.0)).xy, 0.0, 1.0);

  vBotLeft = aNodePos - totalSize / 2.0;
  vTopRight = aNodePos + totalSize / 2.0;
  vPosition = modelPos;
  vColor = aColor;
  vBorderColor = aBorderColor;
  vShape = int(aShape);
  vPickId = aPickId;

  if(aBorderPos == 1.0) {
    vBorderWidth = vec2(0.0, -aBorderWidth);
  } else if(aBorderPos == 2.0) {
    vBorderWidth = vec2(aBorderWidth, 0.0);
  } else {
    float bw2 = aBorderWidth / 2.0;
    vBorderWidth = vec2(bw2, -bw2);
  }

  float cr = aCornerRadius;
  if(cr < 0.0) cr = min(hw, hh) * 0.3333;
  cr = min(cr, min(hw, hh));
  vCornerRadius = cr;
}
`;

const FRAGMENT_SHADER_HEADER = `#version 300 es
precision highp float;

in vec2 vPosition;
flat in vec2 vBotLeft;
flat in vec2 vTopRight;
flat in float vColor;
flat in float vBorderColor;
flat in vec2 vBorderWidth; // [outer, inner]
flat in int vShape;
flat in float vCornerRadius;
flat in float vPickId;

uniform float uZoom;

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

// ---- SDF Functions ----
// https://iquilezles.org/articles/distfunctions2d/

float circleSD(vec2 p, float r) {
  return distance(vec2(0), p) - r;
}

float rectangleSD(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return distance(vec2(0), max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float roundRectangleSD(vec2 p, vec2 b, float cr) {
  vec2 q = abs(p) - b + cr;
  return min(max(q.x, q.y), 0.0) + distance(vec2(0), max(q, 0.0)) - cr;
}

float ellipseSD(vec2 p, vec2 ab) {
  p = abs(p);
  vec2 q = ab * (p - ab);
  float w = (q.x < q.y) ? 1.570796327 : 0.0;
  for(int i = 0; i < 5; i++) {
    vec2 cs = vec2(cos(w), sin(w));
    vec2 u = ab * vec2(cs.x, cs.y);
    vec2 v = ab * vec2(-cs.y, cs.x);
    w = w + dot(p - u, v) / (dot(p - u, u) + dot(v, v));
  }
  float d = length(p - ab * vec2(cos(w), sin(w)));
  return (dot(p / ab, p / ab) > 1.0) ? d : -d;
}

float triangleSD(vec2 p, vec2 b) {
  // Isosceles triangle centered at origin, width=2*b.x, height=2*b.y
  p.y = -p.y; // flip so point is at top
  float hw = b.x;
  float hh = b.y;
  p.y += hh; // shift so base is at y=0, apex at y=2*hh
  vec2 a0 = vec2(hw, 0.0);
  vec2 a1 = vec2(0.0, 2.0 * hh);
  // Edge vectors
  vec2 e0 = vec2(-hw, 2.0 * hh); // left edge
  vec2 e1 = vec2(-hw, -2.0 * hh); // right edge (mirrored)
  p.x = abs(p.x); // use symmetry
  // Clamp to edge
  vec2 v0 = p - a0;
  float t0 = clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 cp0 = a0 + e0 * t0;
  // Bottom edge
  float t1 = clamp(p.x / hw, 0.0, 1.0);
  vec2 cp1 = vec2(t1 * hw, 0.0);
  float d0 = length(p - cp0);
  float d1 = length(p - cp1);
  float d = min(d0, d1);
  // Sign: negative inside
  float s = 1.0;
  // Cross product sign for left edge
  if((cp0.x - p.x) * e0.y - (cp0.y - p.y) * e0.x > 0.0 && p.y > 0.0) s = -1.0;
  if(p.y < 0.0) s = 1.0;
  // Check if inside triangle using cross products
  float cross1 = (-hw - p.x) * (2.0 * hh) - (0.0 - p.y) * (-hw); // not robust
  // Simpler inside test
  if(p.y >= 0.0 && p.y <= 2.0 * hh && p.x <= hw * (1.0 - p.y / (2.0 * hh))) s = -1.0;
  return s * d;
}

float diamondSD(vec2 p, vec2 b) {
  // Rhombus (diamond) SDF
  p = abs(p);
  float ndot = b.x * p.x + b.y * p.y; // not the standard ndot
  vec2 q = vec2(b.x * p.x - b.y * p.y, b.x * p.y + b.y * p.x) / dot(b, b); // rotate
  // Simpler approach: use the standard rhombus formula
  float hx = b.x;
  float hy = b.y;
  // The diamond is defined by |x/hx| + |y/hy| <= 1
  float d = (abs(p.x) / hx + abs(p.y) / hy - 1.0) * min(hx, hy) * 0.7071;
  return d;
}

float polygonSD(vec2 p, float r, float N) {
  // Regular N-gon SDF, radius r
  float an = 3.141593 / N;
  float he = r * tan(an);
  p = vec2(abs(p.x), p.y);
  float a = atan(p.x, p.y) + 3.141593;
  float ia = floor(a / (2.0 * an)) * (2.0 * an);
  float ca = cos(ia - an);
  float sa = sin(ia - an);
  p = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
  p = vec2(p.x - r, p.y - clamp(p.y, -he, he));
  return length(p) * sign(p.x);
}

float starSD(vec2 p, vec2 b) {
  // 5-pointed star using polygon subtraction
  float r = min(b.x, b.y);
  float an = 3.141593 / 5.0; // pi/5 = 36 degrees
  float en = 3.141593 / 2.5; // pi/2.5 = 72 degrees (inner angle)
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

float tagSD(vec2 p, vec2 b) {
  // Tag shape: rectangle with a pointed right side
  float hw = b.x;
  float hh = b.y;
  float pointW = hh * 0.4; // arrow point width
  // Left part is a rectangle, right part is a triangle point
  float rectW = hw - pointW;
  // Shift p so rectangle is centered
  float px = p.x + pointW * 0.5;
  float d = rectangleSD(vec2(px, p.y), vec2(rectW, hh));
  // Right triangle (arrow point)
  if(p.x > rectW - pointW * 0.5) {
    float tx = p.x - (rectW - pointW * 0.5);
    float slope = hh / pointW;
    float edge = hh - tx * slope;
    if(abs(p.y) > edge) {
      d = min(d, length(vec2(max(tx, 0.0), abs(p.y) - edge)));
    } else {
      d = min(d, -min(abs(abs(p.y) - edge), abs(tx)));
    }
  }
  return d;
}

float veeSD(vec2 p, vec2 b) {
  // V-shape (vee)
  float hw = b.x;
  float hh = b.y;
  p.y = -p.y;
  float slope = hh / hw;
  float d = abs(p.y) - hh + abs(p.x) * slope;
  d = d / sqrt(1.0 + slope * slope);
  float dBox = rectangleSD(p, b);
  return max(d, dBox);
}

float rhomboidSD(vec2 p, vec2 b) {
  // Parallelogram / rhomboid shape
  float hw = b.x;
  float hh = b.y;
  float skew = hw * 0.3;
  vec2 q = vec2(p.x - p.y * skew / hh, p.y);
  return rectangleSD(q, vec2(hw - abs(skew), hh));
}

float barrelSD(vec2 p, vec2 b) {
  // Barrel: rectangle with curved sides
  float hw = b.x;
  float hh = b.y;
  float curve = hw * 0.15;
  float adjustedHW = hw - curve + curve * cos(p.y * 3.141593 / (2.0 * hh));
  vec2 d = abs(p) - vec2(adjustedHW, hh);
  return distance(vec2(0), max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float cutRectangleSD(vec2 p, vec2 b) {
  // Rectangle with cut corners
  float hw = b.x;
  float hh = b.y;
  float cut = min(hw, hh) * 0.2;
  float dRect = rectangleSD(p, b);
  // Cut corners: 45-degree cuts
  float dCorner = abs(p.x) + abs(p.y) - (hw + hh - cut);
  dCorner = dCorner * 0.7071; // normalize
  return max(dRect, dCorner);
}

float concaveHexagonSD(vec2 p, vec2 b) {
  // Hexagon with concave sides
  float hw = b.x;
  float hh = b.y;
  float indent = hw * 0.2;
  p = abs(p);
  // Start with hexagon-like shape
  float dRect = rectangleSD(p, b);
  // Add concavity on left/right sides
  float concavity = indent * cos(p.y * 3.141593 / hh);
  float adjustedX = p.x - concavity;
  if(adjustedX > hw) {
    return max(dRect, adjustedX - hw);
  }
  return dRect;
}

// ---- Blending and Interpolation ----

vec4 blend(vec4 top, vec4 bot) {
  return vec4(
    top.rgb + (bot.rgb * (1.0 - top.a)),
    top.a + (bot.a * (1.0 - top.a))
  );
}

vec4 distInterp(vec4 cA, vec4 cB, float d) {
  return mix(cA, cB, 1.0 - smoothstep(0.0, 1.5 / uZoom, abs(d)));
}

// ---- Compute SDF for given shape ----

float computeSDF(vec2 p, vec2 b, int shape, float cr) {
  if(shape == 0) { // RECTANGLE
    return rectangleSD(p, b);
  } else if(shape == 1) { // ROUND_RECTANGLE
    return roundRectangleSD(p, b, cr);
  } else if(shape == 2) { // BOTTOM_ROUND_RECTANGLE
    // Only round bottom corners
    float d1 = roundRectangleSD(p, b, cr);
    float d2 = rectangleSD(p - vec2(0.0, b.y * 0.5), vec2(b.x, b.y * 0.5));
    return (p.y > 0.0) ? d2 : d1;
  } else if(shape == 3) { // ELLIPSE
    if(b.x == b.y) return circleSD(p, b.x);
    return ellipseSD(p, b);
  } else if(shape == 4) { // TRIANGLE
    return triangleSD(p, b);
  } else if(shape == 5) { // DIAMOND
    return diamondSD(p, b);
  } else if(shape == 6) { // PENTAGON
    float r = min(b.x, b.y);
    return polygonSD(p, r, 5.0);
  } else if(shape == 7) { // HEXAGON
    float r = min(b.x, b.y);
    return polygonSD(p, r, 6.0);
  } else if(shape == 8) { // HEPTAGON
    float r = min(b.x, b.y);
    return polygonSD(p, r, 7.0);
  } else if(shape == 9) { // OCTAGON
    float r = min(b.x, b.y);
    return polygonSD(p, r, 8.0);
  } else if(shape == 10) { // STAR
    return starSD(p, b);
  } else if(shape == 11) { // TAG
    return tagSD(p, b);
  } else if(shape == 12) { // VEE
    return veeSD(p, b);
  } else if(shape == 13) { // RHOMBOID
    return rhomboidSD(p, b);
  } else if(shape == 14) { // BARREL
    return barrelSD(p, b);
  } else if(shape == 15) { // CUT_RECTANGLE
    return cutRectangleSD(p, b);
  } else if(shape == 16) { // CONCAVE_HEXAGON
    return concaveHexagonSD(p, b);
  }
  return rectangleSD(p, b); // fallback
}
`;

const FRAGMENT_SHADER_MAIN = `
void main() {
  float outerBorder = vBorderWidth[0];
  float innerBorder = vBorderWidth[1];
  float borderPadding = outerBorder * 2.0;
  float w = vTopRight.x - vBotLeft.x - borderPadding;
  float h = vTopRight.y - vBotLeft.y - borderPadding;
  vec2 b = vec2(w / 2.0, h / 2.0);
  vec2 p = vPosition - vec2(
    vTopRight.x - b.x - outerBorder,
    vTopRight.y - b.y - outerBorder
  );

  float d = computeSDF(p, b, vShape, vCornerRadius);

  vec4 fillColor = unpackColor(vColor);
  vec4 borderColor = unpackColor(vBorderColor);

  #ifdef PICKING_MODE
    // In picking mode, discard transparent pixels
    if(d > outerBorder) discard;
    outColor = unpackColor(vPickId);
  #else
    if(d > 0.0) {
      if(d > outerBorder) {
        discard;
      } else {
        outColor = distInterp(borderColor, vec4(0), d - outerBorder);
      }
    } else {
      if(d > innerBorder) {
        vec4 outerColor = outerBorder == 0.0 ? vec4(0) : borderColor;
        vec4 innerBorderColor = blend(borderColor, fillColor);
        outColor = distInterp(innerBorderColor, outerColor, d);
      } else {
        vec4 outerColor;
        if(innerBorder == 0.0 && outerBorder == 0.0) {
          outerColor = vec4(0);
        } else if(innerBorder == 0.0) {
          outerColor = borderColor;
        } else {
          outerColor = blend(borderColor, fillColor);
        }
        outColor = distInterp(fillColor, outerColor, d - innerBorder);
      }
    }
    // Discard fully transparent pixels (e.g. when background-color is transparent)
    if(outColor.a < 0.004) discard;
  #endif
}
`;

export const FRAGMENT_SHADER_SOURCE = FRAGMENT_SHADER_HEADER + FRAGMENT_SHADER_MAIN;
export const FRAGMENT_SHADER_PICKING_SOURCE = FRAGMENT_SHADER_HEADER + '#define PICKING_MODE\n' + FRAGMENT_SHADER_MAIN;


export class NodeSDFProgram {

  constructor() {
    this.buffer = null;       // Float32Array
    this.capacity = 0;
    this.count = 0;
    this.needsUpload = false;
    this.glBuffer = null;     // WebGL buffer object
    this._gpuBufferSize = 0;  // current GPU buffer size in floats
    this.quadBuffer = null;   // WebGL buffer for unit quad
    this.vao = null;          // WebGL VAO
    this.screenProgram = null;
    this.pickingProgram = null;
  }

  /** Initialize GL resources. Called once. */
  init(gl) {
    // Compile shader programs
    this.screenProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    this.pickingProgram = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_PICKING_SOURCE);

    // Cache uniform locations on both programs
    for(const prog of [this.screenProgram, this.pickingProgram]) {
      prog.uPanZoomMatrix = gl.getUniformLocation(prog, 'uPanZoomMatrix');
      prog.uZoom = gl.getUniformLocation(prog, 'uZoom');
    }

    // Create instance data buffer
    this.glBuffer = gl.createBuffer();

    // Create VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // --- Unit quad (non-instanced) ---
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);

    // Fixed attribute locations (must match layout qualifiers in vertex shader)
    const LOC_VERTEX       = 0;
    const LOC_NODE_POS     = 1;
    const LOC_NODE_SIZE    = 2;
    const LOC_COLOR        = 3;
    const LOC_BORDER_COLOR = 4;
    const LOC_BORDER_WIDTH = 5;
    const LOC_SHAPE        = 6;
    const LOC_CORNER_RAD   = 7;
    const LOC_BORDER_POS   = 8;
    const LOC_PICK_ID      = 9;

    gl.enableVertexAttribArray(LOC_VERTEX);
    gl.vertexAttribPointer(LOC_VERTEX, 2, gl.FLOAT, false, 0, 0);
    // divisor = 0 (default, per-vertex)

    // --- Per-instance attributes from the interleaved buffer ---
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);

    const stride = NODE_STRIDE * 4; // bytes per instance

    const attribs = [
      { loc: LOC_NODE_POS,     size: 2, offset: 0 },
      { loc: LOC_NODE_SIZE,    size: 2, offset: 2 },
      { loc: LOC_COLOR,        size: 1, offset: 4 },
      { loc: LOC_BORDER_COLOR, size: 1, offset: 5 },
      { loc: LOC_BORDER_WIDTH, size: 1, offset: 6 },
      { loc: LOC_SHAPE,        size: 1, offset: 7 },
      { loc: LOC_CORNER_RAD,   size: 1, offset: 8 },
      { loc: LOC_BORDER_POS,   size: 1, offset: 9 },
      { loc: LOC_PICK_ID,      size: 1, offset: 10 },
    ];

    for(const attr of attribs) {
      gl.enableVertexAttribArray(attr.loc);
      gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
      gl.vertexAttribDivisor(attr.loc, 1); // per-instance
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }

  /** Ensure buffer can hold `count` nodes. */
  reallocate(count) {
    if(count <= this.capacity) return;
    const newCap = Math.max(count, this.capacity * 2, 256);
    const newBuffer = new Float32Array(newCap * NODE_STRIDE);
    if(this.buffer) newBuffer.set(this.buffer);
    this.buffer = newBuffer;
    this.capacity = newCap;
    this.needsUpload = true;
  }

  /** Pack one node's data into the buffer. Called during process(). */
  processNode(slot, node, pickIndex) {
    const buf = this.buffer;
    const off = slot * NODE_STRIDE;
    const pos = node.position();

    buf[off + 0] = pos.x;
    buf[off + 1] = pos.y;
    buf[off + 2] = node.outerWidth();
    buf[off + 3] = node.outerHeight();
    const bgColor = node.pstyle('background-color').value;
    let bgOpacity = node.pstyle('background-opacity').value;
    // Honor alpha from color tuple (e.g. 'transparent' → [0,0,0,0])
    if(bgColor.length > 3 && bgColor[3] < 1) {
      bgOpacity *= bgColor[3];
    }
    buf[off + 4] = packPremulColor(bgColor, bgOpacity);

    const bw = node.pstyle('border-width').value;
    let bop = node.pstyle('border-opacity').value;
    if(bw > 0 && bop > 0) {
      const bc = node.pstyle('border-color').value;
      if(bc.length > 3 && bc[3] < 1) bop *= bc[3];
      buf[off + 5] = packPremulColor(bc, bop);
    } else {
      buf[off + 5] = packColor(0, 0, 0, 0);
    }
    buf[off + 6] = bw;

    const shape = node.pstyle('shape').value;
    buf[off + 7] = SHAPE_ENUM[shape] !== undefined ? SHAPE_ENUM[shape] : 0;

    const cr = node.pstyle('corner-radius');
    buf[off + 8] = cr.value === 'auto' ? -1 : cr.pfValue;

    const bp = node.pstyle('border-position').value;
    buf[off + 9] = bp === 'inside' ? 1 : (bp === 'outside' ? 2 : 0);

    // Pick index encoded as packed RGBA
    buf[off + 10] = packColor(
      (pickIndex) & 0xFF,
      (pickIndex >> 8) & 0xFF,
      (pickIndex >> 16) & 0xFF,
      (pickIndex >> 24) & 0xFF
    );

    this.needsUpload = true;
  }

  /** Upload buffer to GPU if dirty. */
  upload(gl) {
    if(!this.needsUpload || !this.buffer || this.count === 0) return;

    const dataSize = this.count * NODE_STRIDE;
    const data = this.buffer.subarray(0, dataSize);

    // If GPU buffer is too small, delete and recreate it, then rebind in VAO
    if(dataSize > this._gpuBufferSize) {
      gl.deleteBuffer(this.glBuffer);
      this.glBuffer = gl.createBuffer();
      this._gpuBufferSize = dataSize;

      // Rebind new buffer into VAO attribute pointers
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

      const stride = NODE_STRIDE * 4;
      const attribs = [
        { loc: 1, size: 2, offset: 0 },  // aNodePos
        { loc: 2, size: 2, offset: 2 },  // aNodeSize
        { loc: 3, size: 1, offset: 4 },  // aColor
        { loc: 4, size: 1, offset: 5 },  // aBorderColor
        { loc: 5, size: 1, offset: 6 },  // aBorderWidth
        { loc: 6, size: 1, offset: 7 },  // aShape
        { loc: 7, size: 1, offset: 8 },  // aCornerRadius
        { loc: 8, size: 1, offset: 9 },  // aBorderPos
        { loc: 9, size: 1, offset: 10 }, // aPickId
      ];
      for(const attr of attribs) {
        gl.enableVertexAttribArray(attr.loc);
        gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, stride, attr.offset * 4);
        gl.vertexAttribDivisor(attr.loc, 1);
      }
      gl.bindVertexArray(null);
    } else {
      // Buffer big enough — just update data
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    }

    this.needsUpload = false;
  }

  /** Draw all nodes. */
  draw(gl, panZoomMatrix, isPicking, zoom) {
    if(this.count === 0 || !this.buffer || this.needsUpload) return;
    const program = isPicking ? this.pickingProgram : this.screenProgram;
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(program.uPanZoomMatrix, false, panZoomMatrix);
    gl.uniform1f(program.uZoom, zoom || 1.0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  /** Update just position (for drag). */
  updatePosition(slot, x, y) {
    const off = slot * NODE_STRIDE;
    this.buffer[off + 0] = x;
    this.buffer[off + 1] = y;
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
  }
}
