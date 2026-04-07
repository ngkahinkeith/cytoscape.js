import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  UnifiedEdgeProgram,
  EDGE_UNIFIED_STRIDE,
} from '../../src/extensions/renderer/canvas/webgl/programs/edge-unified.mjs';
import { unpackColor } from '../../src/extensions/renderer/canvas/webgl/color-pack.mjs';

function mockEdge(opts = {}) {
  return {
    _private: {
      rscratch: {
        allpts: opts.allpts || [0, 0, 100, 100],
        badLine: false,
        arrowEndX: opts.arrowEndX || 100,
        arrowEndY: opts.arrowEndY || 100,
        tgtArrowAngle: opts.tgtArrowAngle || Math.PI,
      }
    },
    pstyle: (prop) => {
      const styles = {
        'line-color': { value: opts.lineColor || [200, 100, 50] },
        'opacity': { value: opts.opacity !== undefined ? opts.opacity : 1 },
        'line-opacity': { value: opts.lineOpacity !== undefined ? opts.lineOpacity : 1 },
        'width': { pfValue: opts.width || 2 },
        'target-arrow-shape': { value: opts.tgtArrow || 'triangle' },
        'arrow-scale': { value: opts.arrowScale || 1 },
        'overlay-opacity': { value: opts.overlayOpacity || 0 },
        'overlay-color': { value: opts.overlayColor || [0, 0, 255] },
        'overlay-padding': { pfValue: opts.overlayPadding || 10 },
      };
      return styles[prop] || { value: null, pfValue: 0 };
    },
  };
}

// Mock WebGL2 context for testing init/upload/draw/destroy
function mockGL() {
  const programs = [];
  const buffers = [];
  const vaos = [];
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
    createProgram: () => { const p = {}; programs.push(p); return p; },
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getUniformLocation: (prog, name) => name,
    createBuffer: () => { const b = {}; buffers.push(b); return b; },
    createVertexArray: () => { const v = {}; vaos.push(v); return v; },
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
    deleteVertexArray: (v) => {},
    deleteBuffer: (b) => {},
    deleteProgram: (p) => {},
    _programs: programs,
    _buffers: buffers,
    _vaos: vaos,
  };
}

describe('UnifiedEdgeProgram', () => {
  it('EDGE_UNIFIED_STRIDE is 12', () => {
    expect(EDGE_UNIFIED_STRIDE).to.equal(12);
  });

  describe('processBezierEdge', () => {
    it('writes 1 instance for a quadratic bezier with target arrow', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({
        allpts: [10, 20, 50, 80, 90, 30],
        tgtArrow: 'triangle',
      });
      const nextSlot = prog.processBezierEdge(0, edge, 1, 15);
      expect(nextSlot).to.equal(1);
      expect(prog.buffer[0]).to.equal(10);
      expect(prog.buffer[1]).to.equal(20);
      expect(prog.buffer[2]).to.equal(90);
      expect(prog.buffer[3]).to.equal(30);
      expect(prog.buffer[4]).to.equal(50);
      expect(prog.buffer[5]).to.equal(80);
    });

    it('writes no arrow flag when target-arrow-shape is none', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 50, 50, 100, 0], tgtArrow: 'none' });
      prog.processBezierEdge(0, edge, 1, 0);
      expect(prog.buffer[9]).to.equal(0);
    });

    it('approximates cubic bezier using midpoint of inner control points', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 20, 60, 80, 60, 100, 0], tgtArrow: 'none' });
      prog.processBezierEdge(0, edge, 1, 0);
      expect(prog.buffer[4]).to.equal(50);
      expect(prog.buffer[5]).to.equal(60);
    });

    it('handles multi-segment curves (allpts > 8) using middle control point', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 25, 50, 50, 75, 75, 50, 100, 0], tgtArrow: 'none' });
      const nextSlot = prog.processBezierEdge(0, edge, 1, 0);
      expect(nextSlot).to.equal(1);
      expect(prog.buffer[0]).to.equal(0);   // srcX
      expect(prog.buffer[1]).to.equal(0);   // srcY
      expect(prog.buffer[2]).to.equal(100); // tgtX (last pair)
      expect(prog.buffer[3]).to.equal(0);   // tgtY
      // Middle index: floor(10/2) & ~1 = 4, pts[4]=50, pts[5]=75
      expect(prog.buffer[4]).to.equal(50);
      expect(prog.buffer[5]).to.equal(75);
    });

    it('skips edge with missing rscratch', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = { _private: { rscratch: null }, pstyle: () => ({ value: null, pfValue: 0 }) };
      const nextSlot = prog.processBezierEdge(0, edge, 1, 0);
      expect(nextSlot).to.equal(0); // no instance written
    });

    it('skips edge with allpts too short', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 50, 50] }); // only 4 points, need 6+
      const nextSlot = prog.processBezierEdge(0, edge, 1, 0);
      expect(nextSlot).to.equal(0);
    });

    it('packs arrow flags with non-zero node radius', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 50, 50, 100, 0], tgtArrow: 'triangle' });
      prog.processBezierEdge(0, edge, 1, 25);
      // Arrow flags should be non-zero (has arrow + nodeRadius=25)
      expect(prog.buffer[9]).to.not.equal(0);
    });

    it('writes correct color and width', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({
        allpts: [0, 0, 50, 50, 100, 0],
        lineColor: [255, 0, 0],
        opacity: 0.8,
        lineOpacity: 0.5,
        width: 3,
        tgtArrow: 'none',
      });
      prog.processBezierEdge(0, edge, 1, 0);
      expect(prog.buffer[7]).to.equal(3); // width
      expect(prog.buffer[6]).to.not.equal(0); // color packed
      // Unpack and verify color is premultiplied
      const packed = prog.buffer[6];
      const [r, g, b, a] = unpackColor(packed);
      expect(a).to.be.closeTo(0.4 * 255, 1); // 0.8 * 0.5 = 0.4
      expect(r).to.be.closeTo(255 * 0.4, 1); // premul
    });
  });

  describe('processStraightEdge', () => {
    it('writes 1 instance with controlPt at midpoint', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 100, 200], tgtArrow: 'none' });
      const nextSlot = prog.processStraightEdge(0, edge, 1, 0);
      expect(nextSlot).to.equal(1);
      expect(prog.buffer[0]).to.equal(0);
      expect(prog.buffer[1]).to.equal(0);
      expect(prog.buffer[2]).to.equal(100);
      expect(prog.buffer[3]).to.equal(200);
      expect(prog.buffer[4]).to.equal(50);
      expect(prog.buffer[5]).to.equal(100);
    });
  });

  describe('processStraightEdge edge cases', () => {
    it('skips edge with missing allpts', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = { _private: { rscratch: { allpts: null } }, pstyle: () => ({ value: null, pfValue: 0 }) };
      expect(prog.processStraightEdge(0, edge, 1, 0)).to.equal(0);
    });

    it('writes arrow flags for straight edge with arrow', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 100, 100], tgtArrow: 'triangle' });
      prog.processStraightEdge(0, edge, 1, 20);
      expect(prog.buffer[9]).to.not.equal(0); // has arrow
    });
  });

  describe('processSegmentedEdge', () => {
    it('writes N instances for taxi edge, arrow on last segment', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(20);
      const edge = mockEdge({
        allpts: [0, 0, 50, 0, 50, 100, 100, 100],
        tgtArrow: 'triangle',
      });
      const nextSlot = prog.processSegmentedEdge(0, edge, 1, 15);
      expect(nextSlot).to.equal(3);
      expect(prog.buffer[0]).to.equal(0);
      expect(prog.buffer[2]).to.equal(50);
      expect(prog.buffer[9]).to.equal(0);
      const lastOff = 2 * EDGE_UNIFIED_STRIDE;
      expect(prog.buffer[lastOff + 9]).to.not.equal(0);
    });

    it('writes no arrow when target-arrow-shape is none', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(20);
      const edge = mockEdge({ allpts: [0, 0, 50, 0, 100, 0], tgtArrow: 'none' });
      const nextSlot = prog.processSegmentedEdge(0, edge, 1, 0);
      expect(nextSlot).to.equal(2); // 2 segments
      expect(prog.buffer[9]).to.equal(0); // no arrow on first
      expect(prog.buffer[EDGE_UNIFIED_STRIDE + 9]).to.equal(0); // no arrow on last
    });

    it('handles minimum 2-point edge (1 segment)', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 100, 100], tgtArrow: 'triangle' });
      const nextSlot = prog.processSegmentedEdge(0, edge, 1, 10);
      expect(nextSlot).to.equal(1);
      expect(prog.buffer[9]).to.not.equal(0); // arrow on the only segment
    });

    it('skips edge with missing allpts', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = { _private: { rscratch: { allpts: null } }, pstyle: () => ({ value: null, pfValue: 0 }) };
      expect(prog.processSegmentedEdge(0, edge, 1, 0)).to.equal(0);
    });

    it('writes correct midpoint controlPt for each segment', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(20);
      const edge = mockEdge({ allpts: [0, 0, 100, 0, 100, 100], tgtArrow: 'none' });
      prog.processSegmentedEdge(0, edge, 1, 0);
      // First segment: (0,0)→(100,0), ctrlPt=(50,0)
      expect(prog.buffer[4]).to.equal(50);
      expect(prog.buffer[5]).to.equal(0);
      // Second segment: (100,0)→(100,100), ctrlPt=(100,50)
      expect(prog.buffer[EDGE_UNIFIED_STRIDE + 4]).to.equal(100);
      expect(prog.buffer[EDGE_UNIFIED_STRIDE + 5]).to.equal(50);
    });
  });

  describe('overlay attributes', () => {
    it('writes overlay color and width at offsets 10-11', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 100, 100], tgtArrow: 'none' });
      prog.processStraightEdge(0, edge, 1, 0);
      expect(prog.buffer[10]).to.equal(0);
      expect(prog.buffer[11]).to.equal(0);
      prog.updateOverlay(0, [0, 0, 255], 0.5, 10);
      expect(prog.buffer[10]).to.not.equal(0);
      expect(prog.buffer[11]).to.equal(20);
    });

    it('clears overlay when opacity is 0', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 100, 100], tgtArrow: 'none' });
      prog.processStraightEdge(0, edge, 1, 0);
      prog.updateOverlay(0, [0, 0, 255], 0.5, 10);
      expect(prog.buffer[10]).to.not.equal(0);
      prog.updateOverlay(0, [0, 0, 0], 0, 0);
      expect(prog.buffer[10]).to.equal(0);
      expect(prog.buffer[11]).to.equal(0);
    });
  });

  describe('buffer management', () => {
    it('reallocate grows buffer with amortized doubling', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      expect(prog.capacity).to.be.at.least(10);
      expect(prog.buffer.length).to.equal(prog.capacity * EDGE_UNIFIED_STRIDE);
      const oldCap = prog.capacity;
      prog.reallocate(oldCap + 1);
      expect(prog.capacity).to.be.at.least(oldCap * 2);
    });

    it('dirty tracking marks min/max slots', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      expect(prog._dirtyMin).to.equal(Infinity);
      expect(prog._dirtyMax).to.equal(-1);
      prog._markDirty(3);
      prog._markDirty(7);
      expect(prog._dirtyMin).to.equal(3);
      expect(prog._dirtyMax).to.equal(7);
    });
  });

  describe('updateEndpoints', () => {
    it('updates source/target/controlPt for a bezier edge', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 50, 50, 100, 0] });
      prog.processBezierEdge(0, edge, 1, 0);
      edge._private.rscratch.allpts = [10, 10, 60, 60, 110, 10];
      prog.updateEndpoints(0, edge);
      expect(prog.buffer[0]).to.equal(10);
      expect(prog.buffer[1]).to.equal(10);
      expect(prog.buffer[2]).to.equal(110);
      expect(prog.buffer[3]).to.equal(10);
      expect(prog.buffer[4]).to.equal(60);
      expect(prog.buffer[5]).to.equal(60);
    });

    it('updates straight edge with midpoint controlPt', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 100, 100] });
      prog.processStraightEdge(0, edge, 1, 0);
      edge._private.rscratch.allpts = [10, 20, 110, 120];
      prog.updateEndpoints(0, edge);
      expect(prog.buffer[4]).to.equal(60);
      expect(prog.buffer[5]).to.equal(70);
    });

    it('updates cubic bezier with midpoint of inner control points', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 20, 60, 80, 60, 100, 0] });
      prog.processBezierEdge(0, edge, 1, 0);
      edge._private.rscratch.allpts = [0, 0, 30, 70, 70, 70, 100, 0];
      prog.updateEndpoints(0, edge);
      expect(prog.buffer[4]).to.equal(50); // (30+70)/2
      expect(prog.buffer[5]).to.equal(70); // (70+70)/2
    });

    it('updates multi-segment edge (>8 points) with middle control point', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 25, 50, 50, 75, 75, 50, 100, 0] });
      prog.processBezierEdge(0, edge, 1, 0);
      edge._private.rscratch.allpts = [0, 0, 10, 20, 30, 40, 50, 60, 100, 0];
      prog.updateEndpoints(0, edge);
      // midIdx = floor(10/2) & ~1 = 4, pts[4]=30, pts[5]=40
      expect(prog.buffer[4]).to.equal(30);
      expect(prog.buffer[5]).to.equal(40);
    });

    it('skips edge with badLine', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 50, 50, 100, 0] });
      prog.processBezierEdge(0, edge, 1, 0);
      edge._private.rscratch.badLine = true;
      prog.updateEndpoints(0, edge);
      // Buffer should NOT be updated (still has original values)
      expect(prog.buffer[0]).to.equal(0);
    });

    it('skips edge with short allpts', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 50, 50, 100, 0] });
      prog.processBezierEdge(0, edge, 1, 0);
      edge._private.rscratch.allpts = [0, 0]; // too short
      prog.updateEndpoints(0, edge);
      // Buffer should NOT be updated
      expect(prog.buffer[0]).to.equal(0);
    });
  });

  describe('ensureCapacity', () => {
    it('grows when needed exceeds capacity', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(10);
      const oldCap = prog.capacity;
      prog.ensureCapacity(oldCap + 100);
      expect(prog.capacity).to.be.at.least(oldCap + 100);
    });

    it('does nothing when capacity is sufficient', () => {
      const prog = new UnifiedEdgeProgram();
      prog.reallocate(100);
      const cap = prog.capacity;
      prog.ensureCapacity(50);
      expect(prog.capacity).to.equal(cap);
    });
  });

  describe('_packArrowFlags', () => {
    it('returns 0 when hasArrow is false', () => {
      const prog = new UnifiedEdgeProgram();
      expect(prog._packArrowFlags(false, 25)).to.equal(0);
    });

    it('returns non-zero when hasArrow is true', () => {
      const prog = new UnifiedEdgeProgram();
      expect(prog._packArrowFlags(true, 0)).to.not.equal(0);
    });

    it('encodes nodeRadius in upper bits', () => {
      const prog = new UnifiedEdgeProgram();
      const small = prog._packArrowFlags(true, 10);
      const large = prog._packArrowFlags(true, 100);
      expect(small).to.not.equal(large); // different radii produce different flags
    });
  });

  describe('init / upload / draw / destroy (with mock GL)', () => {
    it('init compiles 3 programs and creates VAO + buffers', () => {
      const prog = new UnifiedEdgeProgram();
      const gl = mockGL();
      prog.init(gl);
      expect(prog.screenProgram).to.not.be.null;
      expect(prog.pickingProgram).to.not.be.null;
      expect(prog.leanScreenProgram).to.not.be.null;
      expect(prog.vao).to.not.be.null;
      expect(prog.glBuffer).to.not.be.null;
      expect(prog.quadBuffer).to.not.be.null;
    });

    it('upload sends data to GPU when needsUpload is true', () => {
      const prog = new UnifiedEdgeProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      const edge = mockEdge({ allpts: [0, 0, 50, 50, 100, 0], tgtArrow: 'none' });
      prog.processBezierEdge(0, edge, 1, 0);
      prog.count = 1;
      prog.needsUpload = true;
      let bufferDataCalled = false;
      gl.bufferData = () => { bufferDataCalled = true; };
      prog.upload(gl);
      expect(bufferDataCalled).to.be.true;
      expect(prog.needsUpload).to.be.false;
      expect(prog._dirtyMin).to.equal(Infinity);
    });

    it('upload uses bufferSubData for dirty range', () => {
      const prog = new UnifiedEdgeProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      // First upload to set _gpuBufferSize
      const edge = mockEdge({ allpts: [0, 0, 50, 50, 100, 0], tgtArrow: 'none' });
      prog.processBezierEdge(0, edge, 1, 0);
      prog.count = 1;
      prog.needsUpload = true;
      prog.upload(gl);
      // Now dirty a slot — should use bufferSubData
      prog._markDirty(0);
      let subDataCalled = false;
      gl.bufferSubData = () => { subDataCalled = true; };
      prog.upload(gl);
      expect(subDataCalled).to.be.true;
    });

    it('upload skips when needsUpload is false', () => {
      const prog = new UnifiedEdgeProgram();
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

    it('draw issues drawArraysInstanced with full shader', () => {
      const prog = new UnifiedEdgeProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 5;
      let drawCount = 0;
      gl.drawArraysInstanced = (mode, first, count, instances) => { drawCount = instances; };
      prog.draw(gl, new Float32Array(9), false, 1.0, [-1e9, -1e9, 1e9, 1e9], 200.0, false);
      expect(drawCount).to.equal(5);
    });

    it('draw uses lean shader when useLean is true', () => {
      const prog = new UnifiedEdgeProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 5;
      let usedProgram = null;
      gl.useProgram = (p) => { usedProgram = p; };
      prog.draw(gl, new Float32Array(9), false, 1.0, null, 1e9, true);
      expect(usedProgram).to.equal(prog.leanScreenProgram);
    });

    it('draw uses full picking shader even when useLean is true', () => {
      const prog = new UnifiedEdgeProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 5;
      let usedProgram = null;
      gl.useProgram = (p) => { usedProgram = p; };
      prog.draw(gl, new Float32Array(9), true, 1.0, null, 200.0, true);
      expect(usedProgram).to.equal(prog.pickingProgram);
    });

    it('draw skips when count is 0', () => {
      const prog = new UnifiedEdgeProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.count = 0;
      let called = false;
      gl.drawArraysInstanced = () => { called = true; };
      prog.draw(gl, new Float32Array(9), false, 1.0, null);
      expect(called).to.be.false;
    });

    it('destroy cleans up all GL resources', () => {
      const prog = new UnifiedEdgeProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.destroy(gl);
      expect(prog.vao).to.be.null;
      expect(prog.glBuffer).to.be.null;
      expect(prog.quadBuffer).to.be.null;
      expect(prog.screenProgram).to.be.null;
      expect(prog.pickingProgram).to.be.null;
      expect(prog.leanScreenProgram).to.be.null;
      expect(prog.buffer).to.be.null;
      expect(prog.capacity).to.equal(0);
      expect(prog.count).to.equal(0);
    });
  });
});
