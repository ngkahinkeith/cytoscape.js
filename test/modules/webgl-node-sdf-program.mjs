import { describe, it } from 'mocha';
import { expect } from 'chai';
import { NodeSDFProgram, NODE_STRIDE, SHAPE_ENUM } from '../../src/extensions/renderer/canvas/webgl/programs/node-sdf.mjs';
import { unpackColor } from '../../src/extensions/renderer/canvas/webgl/color-pack.mjs';

// Mock node
function mockNode(opts = {}) {
  return {
    position: () => ({ x: opts.x || 0, y: opts.y || 0 }),
    outerWidth: () => opts.w || 30,
    outerHeight: () => opts.h || 30,
    pstyle: (prop) => {
      const styles = {
        'background-color': { value: opts.bgColor || [255, 0, 0] },
        'background-opacity': { value: opts.bgOpacity !== undefined ? opts.bgOpacity : 1 },
        'border-width': { value: opts.borderWidth || 0 },
        'border-color': { value: opts.borderColor || [0, 0, 0] },
        'border-opacity': { value: opts.borderOpacity !== undefined ? opts.borderOpacity : 1 },
        'border-position': { value: opts.borderPos || 'center' },
        'shape': { value: opts.shape || 'ellipse' },
        'corner-radius': { value: opts.cornerRadius || 'auto', pfValue: opts.cornerRadiusPx || 0 },
      };
      return styles[prop] || { value: null, pfValue: 0 };
    },
  };
}

describe('NodeSDFProgram', () => {
  it('NODE_STRIDE is 11', () => {
    expect(NODE_STRIDE).to.equal(11);
  });

  it('SHAPE_ENUM maps all shapes', () => {
    expect(SHAPE_ENUM['rectangle']).to.equal(0);
    expect(SHAPE_ENUM['square']).to.equal(0);
    expect(SHAPE_ENUM['ellipse']).to.equal(3);
    expect(SHAPE_ENUM['triangle']).to.equal(4);
    expect(SHAPE_ENUM['star']).to.equal(10);
    expect(SHAPE_ENUM['round-rectangle']).to.equal(1);
    expect(SHAPE_ENUM['roundrectangle']).to.equal(1);
    expect(SHAPE_ENUM['bottom-round-rectangle']).to.equal(2);
    expect(SHAPE_ENUM['bottomroundrectangle']).to.equal(2);
    expect(SHAPE_ENUM['diamond']).to.equal(5);
    expect(SHAPE_ENUM['pentagon']).to.equal(6);
    expect(SHAPE_ENUM['hexagon']).to.equal(7);
    expect(SHAPE_ENUM['heptagon']).to.equal(8);
    expect(SHAPE_ENUM['octagon']).to.equal(9);
    expect(SHAPE_ENUM['tag']).to.equal(11);
    expect(SHAPE_ENUM['vee']).to.equal(12);
    expect(SHAPE_ENUM['rhomboid']).to.equal(13);
    expect(SHAPE_ENUM['barrel']).to.equal(14);
    expect(SHAPE_ENUM['cut-rectangle']).to.equal(15);
    expect(SHAPE_ENUM['cutrectangle']).to.equal(15);
    expect(SHAPE_ENUM['concave-hexagon']).to.equal(16);
    expect(SHAPE_ENUM['concavehexagon']).to.equal(16);
  });

  it('processNode packs position correctly', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 100, y: 200 }), 0);
    expect(prog.buffer[0]).to.equal(100);
    expect(prog.buffer[1]).to.equal(200);
  });

  it('processNode packs size correctly', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ w: 40, h: 50 }), 0);
    expect(prog.buffer[2]).to.equal(40);
    expect(prog.buffer[3]).to.equal(50);
  });

  it('processNode packs color as packed float', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ bgColor: [255, 0, 0], bgOpacity: 1.0 }), 0);
    const packed = prog.buffer[4];
    expect(typeof packed).to.equal('number');
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(255);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.be.at.least(254);
  });

  it('processNode packs border properties', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ borderWidth: 3, borderColor: [0, 0, 255], borderOpacity: 0.5 }), 0);
    expect(prog.buffer[6]).to.equal(3); // border width
    const [r, g, b, a] = unpackColor(prog.buffer[5]); // border color
    expect(b).to.be.greaterThan(0);
  });

  it('processNode packs zero border as transparent color', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ borderWidth: 0 }), 0);
    const [r, g, b, a] = unpackColor(prog.buffer[5]);
    expect(r).to.equal(0);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.equal(0);
  });

  it('processNode packs zero border opacity as transparent color', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ borderWidth: 3, borderOpacity: 0 }), 0);
    const [r, g, b, a] = unpackColor(prog.buffer[5]);
    expect(r).to.equal(0);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.equal(0);
  });

  it('processNode packs shape enum', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ shape: 'hexagon' }), 0);
    expect(prog.buffer[7]).to.equal(SHAPE_ENUM['hexagon']);
  });

  it('processNode packs unknown shape as 0 (rectangle)', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ shape: 'unknown-shape' }), 0);
    expect(prog.buffer[7]).to.equal(0);
  });

  it('processNode packs corner radius', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ cornerRadius: 10, cornerRadiusPx: 10 }), 0);
    expect(prog.buffer[8]).to.equal(10);
  });

  it('processNode resolves auto corner radius via getRoundRectangleRadius', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    // outerWidth=30, outerHeight=30 → getRoundRectangleRadius(30, 30) = min(7.5, 7.5, 8) = 7.5
    prog.processNode(0, mockNode({ cornerRadius: 'auto' }), 0);
    expect(prog.buffer[8]).to.equal(7.5);
  });

  it('processNode packs border position', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;

    prog.processNode(0, mockNode({ borderPos: 'inside' }), 0);
    expect(prog.buffer[9]).to.equal(1);

    prog.processNode(0, mockNode({ borderPos: 'outside' }), 0);
    expect(prog.buffer[9]).to.equal(2);

    prog.processNode(0, mockNode({ borderPos: 'center' }), 0);
    expect(prog.buffer[9]).to.equal(0);
  });

  it('processNode packs pick index', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode(), 42);
    const [r, g, b, a] = unpackColor(prog.buffer[10]);
    expect(r).to.equal(42);
    expect(g).to.equal(0);
  });

  it('processNode packs large pick index across bytes', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    const idx = 256 + 42; // 42 in second byte, 0+42 in first
    prog.processNode(0, mockNode(), idx);
    const [r, g, b, a] = unpackColor(prog.buffer[10]);
    expect(r).to.equal(idx & 0xFF);       // 42
    expect(g).to.equal((idx >> 8) & 0xFF); // 1
  });

  it('reallocate grows buffer and preserves data', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(10);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 99, y: 88 }), 0);
    prog.reallocate(100);
    expect(prog.buffer[0]).to.equal(99);
    expect(prog.buffer[1]).to.equal(88);
    expect(prog.capacity).to.be.at.least(100);
  });

  it('reallocate does not shrink', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(100);
    const cap = prog.capacity;
    prog.reallocate(50); // should be a no-op
    expect(prog.capacity).to.equal(cap);
  });

  it('reallocate sets needsUpload', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(10);
    expect(prog.needsUpload).to.be.true;
  });

  it('reallocate minimum capacity is 256', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    expect(prog.capacity).to.be.at.least(256);
  });

  it('updatePosition changes only x,y', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 10, y: 20, w: 30, h: 40 }), 0);
    prog.updatePosition(0, 50, 60);
    expect(prog.buffer[0]).to.equal(50);
    expect(prog.buffer[1]).to.equal(60);
    expect(prog.buffer[2]).to.equal(30); // size unchanged
    expect(prog.buffer[3]).to.equal(40);
  });

  it('updatePosition sets needsUpload', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 10, y: 20 }), 0);
    prog.needsUpload = false;
    prog.updatePosition(0, 50, 60);
    expect(prog.needsUpload).to.be.true;
  });

  it('processNode handles 1000 nodes', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1000);
    prog.count = 1000;
    for(let i = 0; i < 1000; i++) {
      prog.processNode(i, mockNode({ x: i, y: i * 2 }), i);
    }
    expect(prog.buffer[0]).to.equal(0);
    expect(prog.buffer[999 * NODE_STRIDE]).to.equal(999);
    expect(prog.buffer[999 * NODE_STRIDE + 1]).to.equal(1998);
  });

  it('processNode packs all shape types', () => {
    const prog = new NodeSDFProgram();
    const shapes = Object.keys(SHAPE_ENUM);
    prog.reallocate(shapes.length);
    prog.count = shapes.length;
    shapes.forEach((shape, i) => {
      prog.processNode(i, mockNode({ shape }), i);
      expect(prog.buffer[i * NODE_STRIDE + 7]).to.equal(SHAPE_ENUM[shape]);
    });
  });

  it('processNode packs premultiplied colors correctly with half opacity', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ bgColor: [200, 100, 50], bgOpacity: 0.5 }), 0);
    const [r, g, b, a] = unpackColor(prog.buffer[4]);
    expect(r).to.equal(100); // 200 * 0.5
    expect(g).to.equal(50);  // 100 * 0.5
    expect(b).to.equal(25);  // 50 * 0.5
    expect(a).to.be.closeTo(128, 1); // 255 * 0.5
  });

  it('buffer layout matches NODE_STRIDE offsets', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(2);
    prog.count = 2;
    prog.processNode(0, mockNode({ x: 1, y: 2, w: 3, h: 4 }), 0);
    prog.processNode(1, mockNode({ x: 10, y: 20, w: 30, h: 40 }), 1);
    // Second node starts at offset NODE_STRIDE
    expect(prog.buffer[NODE_STRIDE + 0]).to.equal(10);
    expect(prog.buffer[NODE_STRIDE + 1]).to.equal(20);
    expect(prog.buffer[NODE_STRIDE + 2]).to.equal(30);
    expect(prog.buffer[NODE_STRIDE + 3]).to.equal(40);
  });

  it('ensureCapacity grows when needed', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(10);
    const oldCap = prog.capacity;
    prog.ensureCapacity(oldCap + 100);
    expect(prog.capacity).to.be.at.least(oldCap + 100);
  });

  it('ensureCapacity does nothing when capacity is sufficient', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(100);
    const cap = prog.capacity;
    prog.ensureCapacity(50);
    expect(prog.capacity).to.equal(cap);
  });

  it('_markDirty tracks min/max slot range', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(10);
    expect(prog._dirtyMin).to.equal(Infinity);
    expect(prog._dirtyMax).to.equal(-1);
    prog._markDirty(3);
    prog._markDirty(7);
    expect(prog._dirtyMin).to.equal(3);
    expect(prog._dirtyMax).to.equal(7);
    prog._markDirty(1);
    expect(prog._dirtyMin).to.equal(1);
  });

  describe('init / upload / draw / destroy (with mock GL)', () => {
    function mockGL() {
      return {
        canvas: { width: 800, height: 600 },
        ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88E4,
        DYNAMIC_DRAW: 0x88E8,
        FLOAT: 0x1406,
        TRIANGLES: 0x0004,
        VERTEX_SHADER: 0x8B31,
        FRAGMENT_SHADER: 0x8B30,
        COMPILE_STATUS: 0x8B81,
        LINK_STATUS: 0x8B82,
        createShader: () => ({}),
        shaderSource: () => {},
        compileShader: () => {},
        getShaderParameter: () => true,
        getShaderInfoLog: () => '',
        createProgram: () => ({}),
        attachShader: () => {},
        linkProgram: () => {},
        getProgramParameter: () => true,
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
        uniform1f: () => {},
        drawArraysInstanced: () => {},
        deleteVertexArray: () => {},
        deleteBuffer: () => {},
        deleteProgram: () => {},
      };
    }

    it('init compiles 2 programs and creates VAO + buffers', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      expect(prog.screenProgram).to.not.be.null;
      expect(prog.pickingProgram).to.not.be.null;
      expect(prog.vao).to.not.be.null;
      expect(prog.glBuffer).to.not.be.null;
      expect(prog.quadBuffer).to.not.be.null;
    });

    it('init caches uniform locations on both programs', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      expect(prog.screenProgram.uPanZoomMatrix).to.equal('uPanZoomMatrix');
      expect(prog.screenProgram.uZoom).to.equal('uZoom');
      expect(prog.pickingProgram.uPanZoomMatrix).to.equal('uPanZoomMatrix');
      expect(prog.pickingProgram.uZoom).to.equal('uZoom');
    });

    it('upload sends full buffer via bufferData when GPU buffer is too small', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.processNode(0, mockNode({ x: 5, y: 10 }), 0);
      prog.count = 1;
      prog.needsUpload = true;
      let bufferDataCalled = false;
      gl.bufferData = () => { bufferDataCalled = true; };
      prog.upload(gl);
      expect(bufferDataCalled).to.be.true;
      expect(prog.needsUpload).to.be.false;
      expect(prog._dirtyMin).to.equal(Infinity);
      expect(prog._dirtyMax).to.equal(-1);
    });

    it('upload uses bufferSubData for dirty range when GPU buffer is large enough', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.processNode(0, mockNode({ x: 5, y: 10 }), 0);
      prog.count = 1;
      prog.needsUpload = true;
      prog.upload(gl); // first upload sets _gpuBufferSize
      // Now dirty a slot
      prog._markDirty(0);
      let subDataCalled = false;
      gl.bufferSubData = () => { subDataCalled = true; };
      prog.upload(gl);
      expect(subDataCalled).to.be.true;
    });

    it('upload does full bufferSubData when no dirty range but needsUpload', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.processNode(0, mockNode({ x: 5, y: 10 }), 0);
      prog.count = 1;
      prog.needsUpload = true;
      prog.upload(gl); // sets _gpuBufferSize
      // Manually set needsUpload without marking dirty (simulates process() aftermath)
      prog.needsUpload = true;
      prog._dirtyMin = Infinity;
      prog._dirtyMax = -1;
      let subDataCalled = false;
      gl.bufferSubData = () => { subDataCalled = true; };
      prog.upload(gl);
      expect(subDataCalled).to.be.true;
    });

    it('upload skips when needsUpload is false', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      prog.needsUpload = false;
      let called = false;
      gl.bufferData = () => { called = true; };
      gl.bufferSubData = () => { called = true; };
      prog.upload(gl);
      expect(called).to.be.false;
    });

    it('upload skips when count is 0', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 0;
      prog.needsUpload = true;
      let called = false;
      gl.bufferData = () => { called = true; };
      prog.upload(gl);
      expect(called).to.be.false;
    });

    it('upload skips when buffer is null', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.count = 1;
      prog.needsUpload = true;
      prog.buffer = null;
      let called = false;
      gl.bufferData = () => { called = true; };
      prog.upload(gl);
      expect(called).to.be.false;
    });

    it('draw issues drawArraysInstanced with screen program', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 5;
      let drawCount = 0;
      let usedProg = null;
      gl.useProgram = (p) => { usedProg = p; };
      gl.drawArraysInstanced = (mode, first, count, instances) => { drawCount = instances; };
      prog.draw(gl, new Float32Array(9), false, 1.0);
      expect(drawCount).to.equal(5);
      expect(usedProg).to.equal(prog.screenProgram);
    });

    it('draw uses picking program when isPicking is true', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 3;
      let usedProg = null;
      gl.useProgram = (p) => { usedProg = p; };
      prog.draw(gl, new Float32Array(9), true, 1.0);
      expect(usedProg).to.equal(prog.pickingProgram);
    });

    it('draw passes high zoom value for picking (disables LOD culling)', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      let zoomValue = 0;
      gl.uniform1f = (loc, val) => {
        if(loc === 'uZoom') zoomValue = val;
      };
      prog.draw(gl, new Float32Array(9), true, 0.5);
      expect(zoomValue).to.equal(1e6);
    });

    it('draw passes actual zoom for screen rendering', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      let zoomValue = 0;
      gl.uniform1f = (loc, val) => {
        if(loc === 'uZoom') zoomValue = val;
      };
      prog.draw(gl, new Float32Array(9), false, 2.5);
      expect(zoomValue).to.equal(2.5);
    });

    it('draw defaults zoom to 1.0 when not provided', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      let zoomValue = -1;
      gl.uniform1f = (loc, val) => {
        if(loc === 'uZoom') zoomValue = val;
      };
      prog.draw(gl, new Float32Array(9), false, undefined);
      expect(zoomValue).to.equal(1.0);
    });

    it('draw skips when count is 0', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.count = 0;
      let called = false;
      gl.drawArraysInstanced = () => { called = true; };
      prog.draw(gl, new Float32Array(9), false, 1.0);
      expect(called).to.be.false;
    });

    it('draw skips when buffer is null', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.count = 5;
      prog.buffer = null;
      let called = false;
      gl.drawArraysInstanced = () => { called = true; };
      prog.draw(gl, new Float32Array(9), false, 1.0);
      expect(called).to.be.false;
    });

    it('destroy cleans up all GL resources', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 5;
      prog.destroy(gl);
      expect(prog.vao).to.be.null;
      expect(prog.glBuffer).to.be.null;
      expect(prog.quadBuffer).to.be.null;
      expect(prog.screenProgram).to.be.null;
      expect(prog.pickingProgram).to.be.null;
      expect(prog.buffer).to.be.null;
      expect(prog.capacity).to.equal(0);
      expect(prog.count).to.equal(0);
    });

    it('destroy is safe to call without prior init', () => {
      const prog = new NodeSDFProgram();
      const gl = mockGL();
      // no init() call
      expect(() => prog.destroy(gl)).to.not.throw();
    });

    it('destroy calls deleteVertexArray, deleteBuffer, deleteProgram', () => {
      let vaoDel = 0, bufDel = 0, progDel = 0;
      const gl = mockGL();
      gl.deleteVertexArray = () => { vaoDel++; };
      gl.deleteBuffer = () => { bufDel++; };
      gl.deleteProgram = () => { progDel++; };
      const prog = new NodeSDFProgram();
      prog.init(gl);
      prog.destroy(gl);
      expect(vaoDel).to.equal(1);
      expect(bufDel).to.equal(2); // glBuffer + quadBuffer
      expect(progDel).to.equal(2); // screenProgram + pickingProgram
    });
  });
});
