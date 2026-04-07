import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  UNIT_QUAD,
  compileShader,
  createProgram,
  getEffectivePanZoom,
  modelToRenderedPosition,
  vec4ToIndex,
  createPickingFrameBuffer,
} from '../../src/extensions/renderer/canvas/webgl/webgl-util.mjs';
import { extend } from '../../src/util/extend.mjs';
import { mapEmpty, setMap, getMap, pushMap, deleteMap } from '../../src/util/maps.mjs';
import generateCubicBezier from '../../src/core/animation/cubic-bezier.mjs';

// Mock WebGL2 context
function mockGL(overrides = {}) {
  return {
    canvas: { width: 800, height: 600 },
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88E4,
    DYNAMIC_DRAW: 0x88E8,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    UNSIGNED_BYTE: 0x1401,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    COLOR_BUFFER_BIT: 0x4000,
    FRAMEBUFFER: 0x8D40,
    TEXTURE_2D: 0x0DE1,
    TEXTURE0: 0x84C0,
    RGBA: 0x1908,
    BLEND: 0x0BE2,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    NEAREST: 0x2600,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    COLOR_ATTACHMENT0: 0x8CE0,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: overrides.getShaderParameter || (() => true),
    getShaderInfoLog: overrides.getShaderInfoLog || (() => ''),
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: overrides.getProgramParameter || (() => true),
    getUniformLocation: (prog, name) => name,
    createBuffer: () => ({}),
    createVertexArray: () => ({}),
    bindVertexArray: () => {},
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    vertexAttribDivisor: () => {},
    useProgram: () => {},
    uniformMatrix3fv: () => {},
    uniform2f: () => {},
    uniform1f: () => {},
    uniform4f: () => {},
    drawArraysInstanced: () => {},
    deleteVertexArray: () => {},
    deleteBuffer: () => {},
    deleteProgram: () => {},
    clearColor: () => {},
    clear: () => {},
    enable: () => {},
    disable: () => {},
    blendFunc: () => {},
    viewport: () => {},
    bindFramebuffer: () => {},
    readPixels: () => {},
    activeTexture: () => {},
    bindTexture: () => {},
    createTexture: () => ({}),
    texImage2D: () => {},
    texParameteri: () => {},
    createFramebuffer: () => ({}),
    framebufferTexture2D: () => {},
    deleteTexture: () => {},
    deleteFramebuffer: () => {},
  };
}

describe('webgl-util', () => {

  describe('UNIT_QUAD', () => {
    it('is a Float32Array with 12 elements (2 triangles)', () => {
      expect(UNIT_QUAD).to.be.an.instanceOf(Float32Array);
      expect(UNIT_QUAD.length).to.equal(12);
    });

    it('forms a unit square from [0,0] to [1,1]', () => {
      // Triangle 1: (0,0) (1,0) (1,1)
      expect(UNIT_QUAD[0]).to.equal(0);
      expect(UNIT_QUAD[1]).to.equal(0);
      expect(UNIT_QUAD[2]).to.equal(1);
      expect(UNIT_QUAD[3]).to.equal(0);
      expect(UNIT_QUAD[4]).to.equal(1);
      expect(UNIT_QUAD[5]).to.equal(1);
      // Triangle 2: (0,0) (1,1) (0,1)
      expect(UNIT_QUAD[6]).to.equal(0);
      expect(UNIT_QUAD[7]).to.equal(0);
      expect(UNIT_QUAD[8]).to.equal(1);
      expect(UNIT_QUAD[9]).to.equal(1);
      expect(UNIT_QUAD[10]).to.equal(0);
      expect(UNIT_QUAD[11]).to.equal(1);
    });
  });

  describe('compileShader', () => {
    it('returns a shader object on success', () => {
      const gl = mockGL();
      const shader = compileShader(gl, gl.VERTEX_SHADER, 'void main() {}');
      expect(shader).to.be.an('object');
    });

    it('calls shaderSource and compileShader on GL', () => {
      let srcCalled = false, compileCalled = false;
      const gl = mockGL();
      gl.shaderSource = () => { srcCalled = true; };
      gl.compileShader = () => { compileCalled = true; };
      compileShader(gl, gl.VERTEX_SHADER, 'test');
      expect(srcCalled).to.be.true;
      expect(compileCalled).to.be.true;
    });

    it('throws on compilation failure', () => {
      const gl = mockGL({
        getShaderParameter: () => false,
        getShaderInfoLog: () => 'error: bad syntax',
      });
      expect(() => compileShader(gl, gl.VERTEX_SHADER, 'bad'))
        .to.throw('error: bad syntax');
    });
  });

  describe('createProgram', () => {
    it('returns a program object on success', () => {
      const gl = mockGL();
      const prog = createProgram(gl, 'vert src', 'frag src');
      expect(prog).to.be.an('object');
    });

    it('calls attachShader and linkProgram', () => {
      let attachCount = 0, linkCalled = false;
      const gl = mockGL();
      gl.attachShader = () => { attachCount++; };
      gl.linkProgram = () => { linkCalled = true; };
      createProgram(gl, 'vert', 'frag');
      expect(attachCount).to.equal(2);
      expect(linkCalled).to.be.true;
    });

    it('throws on link failure', () => {
      const gl = mockGL({ getProgramParameter: () => false });
      expect(() => createProgram(gl, 'vert', 'frag'))
        .to.throw('Could not initialize shaders');
    });
  });

  describe('getEffectivePanZoom', () => {
    it('scales pan and zoom by pixelRatio', () => {
      const r = {
        pixelRatio: 2,
        cy: {
          zoom: () => 1.5,
          pan: () => ({ x: 100, y: 200 }),
        },
      };
      const result = getEffectivePanZoom(r);
      expect(result.zoom).to.equal(3);     // 1.5 * 2
      expect(result.pan.x).to.equal(200);  // 100 * 2
      expect(result.pan.y).to.equal(400);  // 200 * 2
    });

    it('works with pixelRatio of 1', () => {
      const r = {
        pixelRatio: 1,
        cy: {
          zoom: () => 2,
          pan: () => ({ x: 50, y: 75 }),
        },
      };
      const result = getEffectivePanZoom(r);
      expect(result.zoom).to.equal(2);
      expect(result.pan.x).to.equal(50);
      expect(result.pan.y).to.equal(75);
    });

    it('handles fractional pixelRatio', () => {
      const r = {
        pixelRatio: 1.5,
        cy: {
          zoom: () => 1,
          pan: () => ({ x: 10, y: 20 }),
        },
      };
      const result = getEffectivePanZoom(r);
      expect(result.zoom).to.equal(1.5);
      expect(result.pan.x).to.equal(15);
      expect(result.pan.y).to.equal(30);
    });
  });

  describe('modelToRenderedPosition', () => {
    it('converts model coords to rendered position', () => {
      const r = { canvasHeight: 600 };
      const pan = { x: 100, y: 50 };
      const zoom = 2;
      const [rx, ry] = modelToRenderedPosition(r, pan, zoom, 10, 20);
      // rx = 10 * 2 + 100 = 120
      expect(rx).to.equal(120);
      // ry = round(600 - (20 * 2 + 50)) = round(600 - 90) = 510
      expect(ry).to.equal(510);
    });

    it('handles zero pan', () => {
      const r = { canvasHeight: 400 };
      const [rx, ry] = modelToRenderedPosition(r, { x: 0, y: 0 }, 1, 50, 100);
      expect(rx).to.equal(50);
      expect(ry).to.equal(Math.round(400 - 100));
    });

    it('handles negative model coordinates', () => {
      const r = { canvasHeight: 800 };
      const [rx, ry] = modelToRenderedPosition(r, { x: 400, y: 400 }, 1, -100, -200);
      // rx = -100 * 1 + 400 = 300
      expect(rx).to.equal(300);
      // ry = round(800 - (-200 * 1 + 400)) = round(800 - 200) = 600
      expect(ry).to.equal(600);
    });
  });

  describe('vec4ToIndex', () => {
    it('decodes index 0', () => {
      expect(vec4ToIndex([0, 0, 0, 0])).to.equal(0);
    });

    it('decodes low byte', () => {
      expect(vec4ToIndex([42, 0, 0, 0])).to.equal(42);
    });

    it('decodes second byte', () => {
      expect(vec4ToIndex([0, 1, 0, 0])).to.equal(256);
    });

    it('decodes multi-byte index', () => {
      // 42 + 1*256 = 298
      expect(vec4ToIndex([42, 1, 0, 0])).to.equal(298);
    });

    it('decodes third byte', () => {
      expect(vec4ToIndex([0, 0, 1, 0])).to.equal(65536);
    });
  });

  describe('createPickingFrameBuffer', () => {
    it('returns a framebuffer object', () => {
      const gl = mockGL();
      const fb = createPickingFrameBuffer(gl);
      expect(fb).to.be.an('object');
    });

    it('calls createFramebuffer and createTexture', () => {
      let fbCreated = false, texCreated = false;
      const gl = mockGL();
      gl.createFramebuffer = () => { fbCreated = true; return {}; };
      gl.createTexture = () => { texCreated = true; return {}; };
      createPickingFrameBuffer(gl);
      expect(fbCreated).to.be.true;
      expect(texCreated).to.be.true;
    });

    it('binds and unbinds framebuffer during creation', () => {
      let bindCount = 0, nullBindCount = 0;
      const gl = mockGL();
      gl.bindFramebuffer = (target, fb) => {
        if(fb === null) nullBindCount++;
        else bindCount++;
      };
      createPickingFrameBuffer(gl);
      expect(bindCount).to.be.greaterThan(0);
      expect(nullBindCount).to.be.greaterThan(0);
    });

    it('configures texture with NEAREST filtering and CLAMP_TO_EDGE', () => {
      const params = [];
      const gl = mockGL();
      gl.texParameteri = (target, pname, param) => {
        params.push({ pname, param });
      };
      createPickingFrameBuffer(gl);
      const filterParams = params.filter(p =>
        p.pname === gl.TEXTURE_MIN_FILTER || p.pname === gl.TEXTURE_MAG_FILTER
      );
      expect(filterParams.every(p => p.param === gl.NEAREST)).to.be.true;
      const wrapParams = params.filter(p =>
        p.pname === gl.TEXTURE_WRAP_S || p.pname === gl.TEXTURE_WRAP_T
      );
      expect(wrapParams.every(p => p.param === gl.CLAMP_TO_EDGE)).to.be.true;
    });

    it('attaches texture as COLOR_ATTACHMENT0', () => {
      let attached = false;
      const gl = mockGL();
      gl.framebufferTexture2D = (target, attachment) => {
        if(attachment === gl.COLOR_ATTACHMENT0) attached = true;
      };
      createPickingFrameBuffer(gl);
      expect(attached).to.be.true;
    });

    it('returned fb has setFramebufferAttachmentSizes function', () => {
      const gl = mockGL();
      const fb = createPickingFrameBuffer(gl);
      expect(fb.setFramebufferAttachmentSizes).to.be.a('function');
    });

    it('setFramebufferAttachmentSizes calls texImage2D with correct size', () => {
      let texWidth = 0, texHeight = 0;
      const gl = mockGL();
      gl.texImage2D = (target, level, internalFormat, width, height) => {
        if(typeof width === 'number' && typeof height === 'number') {
          texWidth = width;
          texHeight = height;
        }
      };
      const fb = createPickingFrameBuffer(gl);
      fb.setFramebufferAttachmentSizes(1024, 768);
      expect(texWidth).to.equal(1024);
      expect(texHeight).to.equal(768);
    });

    it('returned fb has destroy function', () => {
      const gl = mockGL();
      const fb = createPickingFrameBuffer(gl);
      expect(fb.destroy).to.be.a('function');
    });

    it('destroy deletes texture and framebuffer', () => {
      let texDeleted = false, fbDeleted = false;
      const gl = mockGL();
      gl.deleteTexture = () => { texDeleted = true; };
      gl.deleteFramebuffer = () => { fbDeleted = true; };
      const fb = createPickingFrameBuffer(gl);
      fb.destroy();
      expect(texDeleted).to.be.true;
      expect(fbDeleted).to.be.true;
    });
  });
});

// ── extend.mjs ─────────────────────────────────────────────────────────────

describe('extend (util/extend.mjs)', () => {
  it('copies properties from source to target', () => {
    const tgt = { a: 1 };
    const result = extend(tgt, { b: 2, c: 3 });
    expect(result).to.equal(tgt);
    expect(result.a).to.equal(1);
    expect(result.b).to.equal(2);
    expect(result.c).to.equal(3);
  });

  it('overwrites existing properties', () => {
    const tgt = { a: 1, b: 2 };
    extend(tgt, { b: 99 });
    expect(tgt.b).to.equal(99);
  });

  it('handles multiple sources', () => {
    const tgt = {};
    extend(tgt, { a: 1 }, { b: 2 }, { c: 3 });
    expect(tgt.a).to.equal(1);
    expect(tgt.b).to.equal(2);
    expect(tgt.c).to.equal(3);
  });

  it('later sources override earlier sources', () => {
    const tgt = {};
    extend(tgt, { x: 1 }, { x: 2 }, { x: 3 });
    expect(tgt.x).to.equal(3);
  });

  it('skips null/undefined sources', () => {
    const tgt = { a: 1 };
    extend(tgt, null, undefined, { b: 2 });
    expect(tgt.a).to.equal(1);
    expect(tgt.b).to.equal(2);
  });

  it('returns the target object', () => {
    const tgt = {};
    const result = extend(tgt, { a: 1 });
    expect(result).to.equal(tgt);
  });

  it('copies arrays by reference (shallow copy)', () => {
    const arr = [1, 2, 3];
    const tgt = {};
    extend(tgt, { arr });
    expect(tgt.arr).to.equal(arr);
  });

  it('copies nested objects by reference (shallow copy)', () => {
    const nested = { x: 1 };
    const tgt = {};
    extend(tgt, { nested });
    expect(tgt.nested).to.equal(nested);
  });

  it('works with empty source', () => {
    const tgt = { a: 1 };
    extend(tgt, {});
    expect(tgt.a).to.equal(1);
  });
});

// ── maps.mjs ───────────────────────────────────────────────────────────────

describe('maps (util/maps.mjs)', () => {

  describe('mapEmpty', () => {
    it('returns true for null', () => {
      expect(mapEmpty(null)).to.be.true;
    });

    it('returns true for undefined', () => {
      expect(mapEmpty(undefined)).to.be.true;
    });

    it('returns true for empty object', () => {
      expect(mapEmpty({})).to.be.true;
    });

    it('returns false for non-empty object', () => {
      expect(mapEmpty({ a: 1 })).to.be.false;
    });
  });

  describe('setMap', () => {
    it('sets a value with a single key', () => {
      const map = {};
      setMap({ map, keys: ['a'], value: 42 });
      expect(map.a).to.equal(42);
    });

    it('sets a value with nested keys', () => {
      const map = {};
      setMap({ map, keys: ['a', 'b', 'c'], value: 'hello' });
      expect(map.a.b.c).to.equal('hello');
    });

    it('creates intermediate objects as needed', () => {
      const map = {};
      setMap({ map, keys: ['x', 'y'], value: 1 });
      expect(map.x).to.be.an('object');
      expect(map.x.y).to.equal(1);
    });

    it('overwrites existing values', () => {
      const map = { a: { b: 1 } };
      setMap({ map, keys: ['a', 'b'], value: 2 });
      expect(map.a.b).to.equal(2);
    });

    it('throws for object keys', () => {
      const map = {};
      expect(() => setMap({ map, keys: [{}], value: 1 })).to.throw('Tried to set map with object key');
    });
  });

  describe('getMap', () => {
    it('gets a value with a single key', () => {
      const map = { a: 42 };
      const val = getMap({ map, keys: ['a'] });
      expect(val).to.equal(42);
    });

    it('gets a value with nested keys', () => {
      const map = { a: { b: { c: 'deep' } } };
      const val = getMap({ map, keys: ['a', 'b', 'c'] });
      expect(val).to.equal('deep');
    });

    it('returns undefined for missing key', () => {
      const map = { a: 1 };
      const val = getMap({ map, keys: ['b'] });
      expect(val).to.be.undefined;
    });

    it('returns undefined for missing nested key', () => {
      const map = { a: {} };
      const val = getMap({ map, keys: ['a', 'b', 'c'] });
      expect(val).to.be.undefined;
    });

    it('returns null when intermediate is null', () => {
      const map = { a: null };
      const val = getMap({ map, keys: ['a', 'b'] });
      expect(val).to.be.null;
    });

    it('throws for object keys', () => {
      const map = {};
      expect(() => getMap({ map, keys: [{}] })).to.throw('Tried to get map with object key');
    });
  });

  describe('pushMap', () => {
    it('creates an array with first value when key does not exist', () => {
      const map = {};
      pushMap({ map, keys: ['a'], value: 1 });
      expect(map.a).to.deep.equal([1]);
    });

    it('appends to existing array', () => {
      const map = { a: [1] };
      pushMap({ map, keys: ['a'], value: 2 });
      expect(map.a).to.deep.equal([1, 2]);
    });

    it('works with nested keys', () => {
      const map = {};
      pushMap({ map, keys: ['a', 'b'], value: 'x' });
      expect(map.a.b).to.deep.equal(['x']);
      pushMap({ map, keys: ['a', 'b'], value: 'y' });
      expect(map.a.b).to.deep.equal(['x', 'y']);
    });
  });

  describe('deleteMap', () => {
    it('deletes a value at a single key', () => {
      const map = { a: 1, b: 2 };
      deleteMap({ map, keys: ['a'] });
      expect(map.a).to.be.undefined;
      expect(map.b).to.equal(2);
    });

    it('deletes a nested value', () => {
      const map = { a: { b: { c: 1 } } };
      deleteMap({ map, keys: ['a', 'b', 'c'] });
      expect(map.a.b.c).to.be.undefined;
    });

    it('keepChildren preserves specified children', () => {
      const map = { x: 1, y: 2, z: 3 };
      deleteMap({ map, keys: ['unused'], keepChildren: { x: true } });
      // y and z should be undefined, x stays
      expect(map.x).to.equal(1);
      expect(map.y).to.be.undefined;
      expect(map.z).to.be.undefined;
    });

    it('throws for object keys', () => {
      const map = {};
      expect(() => deleteMap({ map, keys: [{}] })).to.throw('Tried to delete map with object key');
    });
  });
});

// ── cubic-bezier.mjs ───────────────────────────────────────────────────────

describe('generateCubicBezier (animation/cubic-bezier.mjs)', () => {
  it('returns false when called with fewer than 4 arguments', () => {
    expect(generateCubicBezier(0, 0, 1)).to.be.false;
  });

  it('returns false when called with NaN argument', () => {
    expect(generateCubicBezier(0, NaN, 1, 1)).to.be.false;
  });

  it('returns false when called with Infinity argument', () => {
    expect(generateCubicBezier(0, 0, Infinity, 1)).to.be.false;
  });

  it('returns a function for valid arguments', () => {
    const f = generateCubicBezier(0.25, 0.1, 0.25, 1.0);
    expect(f).to.be.a('function');
  });

  it('f(0) returns 0', () => {
    const f = generateCubicBezier(0.25, 0.1, 0.25, 1.0);
    expect(f(0)).to.equal(0);
  });

  it('f(1) returns 1', () => {
    const f = generateCubicBezier(0.25, 0.1, 0.25, 1.0);
    expect(f(1)).to.equal(1);
  });

  it('linear bezier (0,0,1,1) returns identity', () => {
    const f = generateCubicBezier(0, 0, 1, 1);
    expect(f(0)).to.equal(0);
    expect(f(0.5)).to.equal(0.5);
    expect(f(1)).to.equal(1);
    expect(f(0.25)).to.be.closeTo(0.25, 0.001);
    expect(f(0.75)).to.be.closeTo(0.75, 0.001);
  });

  it('ease-in-out produces S-curve (0.5 maps to ~0.5)', () => {
    // Standard ease-in-out: (0.42, 0, 0.58, 1)
    const f = generateCubicBezier(0.42, 0, 0.58, 1);
    expect(f(0.5)).to.be.closeTo(0.5, 0.05);
  });

  it('ease curve (0.25, 0.1, 0.25, 1.0) produces monotonic output', () => {
    const f = generateCubicBezier(0.25, 0.1, 0.25, 1.0);
    let prev = 0;
    for (let t = 0.1; t <= 1.0; t += 0.1) {
      const val = f(t);
      expect(val).to.be.at.least(prev);
      prev = val;
    }
  });

  it('getControlPoints returns the control points', () => {
    const f = generateCubicBezier(0.25, 0.1, 0.25, 1.0);
    const pts = f.getControlPoints();
    expect(pts).to.have.length(2);
    expect(pts[0].x).to.equal(0.25);
    expect(pts[0].y).to.equal(0.1);
    expect(pts[1].x).to.equal(0.25);
    expect(pts[1].y).to.equal(1.0);
  });

  it('toString returns a descriptive string', () => {
    const f = generateCubicBezier(0.25, 0.1, 0.25, 1.0);
    const str = f.toString();
    expect(str).to.include('generateBezier');
    expect(str).to.include('0.25');
    expect(str).to.include('0.1');
  });

  it('clamps X values to [0, 1]', () => {
    // Pass X values outside [0,1]
    const f = generateCubicBezier(-0.5, 0.5, 1.5, 0.5);
    // Should not throw, and should produce valid output
    expect(f(0.5)).to.be.a('number');
    expect(f(0.5)).to.be.within(0, 1);
  });

  it('handles steep ease-in (0, 0, 0, 1) without throwing', () => {
    const f = generateCubicBezier(0, 0, 0, 1);
    expect(f(0.5)).to.be.a('number');
    expect(f(0.5)).to.be.within(0, 1);
  });

  it('handles steep ease-out (1, 0, 1, 1) without throwing', () => {
    const f = generateCubicBezier(1, 0, 1, 1);
    expect(f(0.5)).to.be.a('number');
    expect(f(0.5)).to.be.within(0, 1);
  });

  it('mid-values are between 0 and 1 for standard curves', () => {
    const f = generateCubicBezier(0.42, 0, 0.58, 1);
    for (let t = 0.1; t < 1.0; t += 0.1) {
      const val = f(t);
      expect(val).to.be.within(0, 1);
    }
  });
});
