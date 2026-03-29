import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  EdgeCurveProgram,
  EDGE_CURVE_STRIDE,
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  FRAGMENT_SHADER_PICKING_SOURCE,
} from '../../src/extensions/renderer/canvas/webgl/programs/edge-curve.mjs';
import { unpackColor } from '../../src/extensions/renderer/canvas/webgl/color-pack.mjs';

// Mock edge for EdgeCurveProgram
function mockCurveEdge(opts = {}) {
  return {
    _private: {
      rscratch: opts.rscratch !== undefined ? opts.rscratch : {
        allpts: opts.allpts || [0, 0, 50, 100, 100, 0], // quadratic bezier
        badLine: opts.badLine || false,
      }
    },
    pstyle: (prop) => {
      const styles = {
        'line-color': { value: opts.lineColor || [200, 100, 50] },
        'opacity': { value: opts.opacity !== undefined ? opts.opacity : 1 },
        'line-opacity': { value: opts.lineOpacity !== undefined ? opts.lineOpacity : 1 },
        'width': { pfValue: opts.width || 2 },
      };
      return styles[prop] || { value: null, pfValue: 0 };
    },
  };
}

describe('EdgeCurveProgram', () => {

  describe('constants', () => {
    it('EDGE_CURVE_STRIDE is 9', () => {
      expect(EDGE_CURVE_STRIDE).to.equal(9);
    });
  });

  describe('processCurveEdge', () => {
    it('writes correct source/target/controlPt for quadratic bezier (allpts.length === 6)', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      // Quadratic: [srcX, srcY, ctrlX, ctrlY, tgtX, tgtY]
      const edge = mockCurveEdge({ allpts: [10, 20, 50, 80, 90, 30] });
      const nextSlot = prog.processCurveEdge(0, edge, 1);
      expect(nextSlot).to.equal(1);
      expect(prog.buffer[0]).to.equal(10);  // srcX
      expect(prog.buffer[1]).to.equal(20);  // srcY
      expect(prog.buffer[2]).to.equal(90);  // tgtX
      expect(prog.buffer[3]).to.equal(30);  // tgtY
      expect(prog.buffer[4]).to.equal(50);  // ctrlX
      expect(prog.buffer[5]).to.equal(80);  // ctrlY
    });

    it('approximates cubic bezier (allpts.length === 8) using midpoint of inner control points', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      // Cubic: [srcX, srcY, cp1X, cp1Y, cp2X, cp2Y, tgtX, tgtY]
      const edge = mockCurveEdge({ allpts: [0, 0, 20, 60, 80, 60, 100, 0] });
      const nextSlot = prog.processCurveEdge(0, edge, 1);
      expect(nextSlot).to.equal(1);
      expect(prog.buffer[0]).to.equal(0);    // srcX
      expect(prog.buffer[1]).to.equal(0);    // srcY
      expect(prog.buffer[2]).to.equal(100);  // tgtX
      expect(prog.buffer[3]).to.equal(0);    // tgtY
      // Control point should be midpoint of (20,60) and (80,60) = (50,60)
      expect(prog.buffer[4]).to.equal(50);   // ctrlX = (20+80)/2
      expect(prog.buffer[5]).to.equal(60);   // ctrlY = (60+60)/2
    });

    it('handles multi-segment curves (allpts.length > 8) using middle control point', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      // 10 values: multi-segment
      const edge = mockCurveEdge({ allpts: [0, 0, 25, 50, 50, 75, 75, 50, 100, 0] });
      const nextSlot = prog.processCurveEdge(0, edge, 1);
      expect(nextSlot).to.equal(1);
      expect(prog.buffer[0]).to.equal(0);    // srcX
      expect(prog.buffer[1]).to.equal(0);    // srcY
      expect(prog.buffer[2]).to.equal(100);  // tgtX
      expect(prog.buffer[3]).to.equal(0);    // tgtY
      // Middle control point: midIdx = floor(10/2) & ~1 = 4
      expect(prog.buffer[4]).to.equal(50);   // pts[4]
      expect(prog.buffer[5]).to.equal(75);   // pts[5]
    });

    it('packs premultiplied alpha color correctly', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog.processCurveEdge(0, mockCurveEdge({
        lineColor: [200, 100, 50],
        opacity: 0.5,
      }), 1);
      const [r, g, b, a] = unpackColor(prog.buffer[6]);
      expect(r).to.equal(100);  // 200 * 0.5
      expect(g).to.equal(50);   // 100 * 0.5
      expect(b).to.equal(25);   // 50 * 0.5
      expect(a).to.be.closeTo(128, 1); // 255 * 0.5
    });

    it('packs line width correctly', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog.processCurveEdge(0, mockCurveEdge({ width: 5 }), 1);
      expect(prog.buffer[7]).to.equal(5);
    });

    it('packs pick index correctly', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog.processCurveEdge(0, mockCurveEdge(), 42);
      const [r] = unpackColor(prog.buffer[8]);
      expect(r).to.equal(42);
    });

    it('packs large pick index across bytes', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const idx = 256 + 42; // 42 in low byte, 1 in second byte
      prog.processCurveEdge(0, mockCurveEdge(), idx);
      const [r, g] = unpackColor(prog.buffer[8]);
      expect(r).to.equal(idx & 0xFF);       // 42
      expect(g).to.equal((idx >> 8) & 0xFF); // 1
    });

    it('skips edge with null rscratch', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ rscratch: null });
      const nextSlot = prog.processCurveEdge(0, edge, 1);
      expect(nextSlot).to.equal(0);
    });

    it('skips edge with null allpts', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge();
      edge._private.rscratch.allpts = null;
      const nextSlot = prog.processCurveEdge(0, edge, 1);
      expect(nextSlot).to.equal(0);
    });

    it('skips edge with allpts.length < 6', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ allpts: [0, 0, 100, 100] }); // straight, only 4 points
      const nextSlot = prog.processCurveEdge(0, edge, 1);
      expect(nextSlot).to.equal(0);
    });

    it('handles line-opacity separately from opacity', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog.processCurveEdge(0, mockCurveEdge({
        lineColor: [200, 100, 50],
        opacity: 1,
        lineOpacity: 0.5,
      }), 1);
      const [r, g, b, a] = unpackColor(prog.buffer[6]);
      // combinedOpacity = 1 * 0.5 = 0.5
      expect(r).to.equal(100);
      expect(g).to.equal(50);
      expect(b).to.equal(25);
    });

    it('processes multiple edges at correct offsets', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      let slot = 0;
      slot = prog.processCurveEdge(slot, mockCurveEdge({
        allpts: [10, 20, 50, 80, 90, 30],
      }), 1);
      slot = prog.processCurveEdge(slot, mockCurveEdge({
        allpts: [110, 120, 150, 180, 190, 130],
      }), 2);
      expect(slot).to.equal(2);
      // Second edge at offset EDGE_CURVE_STRIDE
      expect(prog.buffer[EDGE_CURVE_STRIDE + 0]).to.equal(110); // srcX
      expect(prog.buffer[EDGE_CURVE_STRIDE + 1]).to.equal(120); // srcY
      expect(prog.buffer[EDGE_CURVE_STRIDE + 2]).to.equal(190); // tgtX
      expect(prog.buffer[EDGE_CURVE_STRIDE + 3]).to.equal(130); // tgtY
    });

    it('sets needsUpload after processing', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog.needsUpload = false;
      prog.processCurveEdge(0, mockCurveEdge(), 1);
      expect(prog.needsUpload).to.be.true;
    });

    it('handles self-loop edges (coincident source and target)', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      // Self-loop: source === target, control point offset from center
      const edge = mockCurveEdge({ allpts: [50, 50, 50, 0, 50, 50] });
      const nextSlot = prog.processCurveEdge(0, edge, 1);
      expect(nextSlot).to.equal(1);
      expect(prog.buffer[0]).to.equal(50);  // srcX
      expect(prog.buffer[1]).to.equal(50);  // srcY
      expect(prog.buffer[2]).to.equal(50);  // tgtX (same as src)
      expect(prog.buffer[3]).to.equal(50);  // tgtY (same as src)
      expect(prog.buffer[4]).to.equal(50);  // ctrlX
      expect(prog.buffer[5]).to.equal(0);   // ctrlY
    });
  });

  describe('reallocate', () => {
    it('grows buffer', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      expect(prog.capacity).to.be.at.least(10);
      prog.reallocate(1000);
      expect(prog.capacity).to.be.at.least(1000);
    });

    it('preserves existing data', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog.processCurveEdge(0, mockCurveEdge({ allpts: [10, 20, 50, 80, 90, 30] }), 1);
      const savedSrcX = prog.buffer[0];
      const savedSrcY = prog.buffer[1];
      prog.reallocate(1000);
      expect(prog.buffer[0]).to.equal(savedSrcX);
      expect(prog.buffer[1]).to.equal(savedSrcY);
    });

    it('does not shrink', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(100);
      const cap = prog.capacity;
      prog.reallocate(50);
      expect(prog.capacity).to.equal(cap);
    });

    it('has minimum capacity of 256', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(1);
      expect(prog.capacity).to.be.at.least(256);
    });

    it('sets needsUpload', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      expect(prog.needsUpload).to.be.true;
    });

    it('creates Float32Array buffer', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      expect(prog.buffer).to.be.an.instanceOf(Float32Array);
      expect(prog.buffer.length).to.equal(prog.capacity * EDGE_CURVE_STRIDE);
    });
  });

  describe('ensureCapacity', () => {
    it('triggers reallocation only when needed', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(100);
      const cap = prog.capacity;
      prog.ensureCapacity(50); // should not reallocate
      expect(prog.capacity).to.equal(cap);
      prog.ensureCapacity(cap + 1); // should reallocate
      expect(prog.capacity).to.be.greaterThan(cap);
    });
  });

  describe('_markDirty', () => {
    it('tracks min/max dirty range', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog._dirtyMin = Infinity;
      prog._dirtyMax = -1;
      prog._markDirty(5);
      expect(prog._dirtyMin).to.equal(5);
      expect(prog._dirtyMax).to.equal(5);
      prog._markDirty(2);
      expect(prog._dirtyMin).to.equal(2);
      expect(prog._dirtyMax).to.equal(5);
      prog._markDirty(8);
      expect(prog._dirtyMin).to.equal(2);
      expect(prog._dirtyMax).to.equal(8);
    });

    it('sets needsUpload', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog.needsUpload = false;
      prog._markDirty(0);
      expect(prog.needsUpload).to.be.true;
    });
  });

  describe('_writeInstance', () => {
    it('writes all 9 floats at correct offsets', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog._writeInstance(0, 1, 2, 3, 4, 5, 6, 7.7, 8, 9.9);
      expect(prog.buffer[0]).to.equal(1);    // srcX
      expect(prog.buffer[1]).to.equal(2);    // srcY
      expect(prog.buffer[2]).to.equal(3);    // tgtX
      expect(prog.buffer[3]).to.equal(4);    // tgtY
      expect(prog.buffer[4]).to.equal(5);    // ctrlX
      expect(prog.buffer[5]).to.equal(6);    // ctrlY
      expect(prog.buffer[6]).to.be.closeTo(7.7, 0.001);  // color (packed float, Float32 precision)
      expect(prog.buffer[7]).to.equal(8);    // width
      expect(prog.buffer[8]).to.be.closeTo(9.9, 0.001);  // pickId (packed float, Float32 precision)
    });

    it('writes at correct slot offset', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      prog._writeInstance(3, 10, 20, 30, 40, 50, 60, 70, 80, 90);
      const off = 3 * EDGE_CURVE_STRIDE;
      expect(prog.buffer[off + 0]).to.equal(10);
      expect(prog.buffer[off + 1]).to.equal(20);
      expect(prog.buffer[off + 2]).to.equal(30);
      expect(prog.buffer[off + 3]).to.equal(40);
    });
  });

  describe('updateEndpoints', () => {
    it('updates source/target/controlPt for quadratic bezier', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ allpts: [0, 0, 50, 100, 100, 0] });
      prog.processCurveEdge(0, edge, 1);

      // Now update with new positions
      edge._private.rscratch.allpts = [10, 20, 60, 110, 110, 10];
      prog.updateEndpoints(0, edge);

      expect(prog.buffer[0]).to.equal(10);   // new srcX
      expect(prog.buffer[1]).to.equal(20);   // new srcY
      expect(prog.buffer[2]).to.equal(110);  // new tgtX
      expect(prog.buffer[3]).to.equal(10);   // new tgtY
      expect(prog.buffer[4]).to.equal(60);   // new ctrlX
      expect(prog.buffer[5]).to.equal(110);  // new ctrlY
    });

    it('updates for cubic bezier using midpoint of inner control points', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ allpts: [0, 0, 20, 60, 80, 60, 100, 0] });
      prog.processCurveEdge(0, edge, 1);

      edge._private.rscratch.allpts = [5, 5, 30, 70, 70, 70, 95, 5];
      prog.updateEndpoints(0, edge);

      expect(prog.buffer[0]).to.equal(5);    // srcX
      expect(prog.buffer[1]).to.equal(5);    // srcY
      expect(prog.buffer[2]).to.equal(95);   // tgtX
      expect(prog.buffer[3]).to.equal(5);    // tgtY
      expect(prog.buffer[4]).to.equal(50);   // ctrlX = (30+70)/2
      expect(prog.buffer[5]).to.equal(70);   // ctrlY = (70+70)/2
    });

    it('updates for multi-segment curve using middle control point', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ allpts: [0, 0, 25, 50, 50, 75, 75, 50, 100, 0] });
      prog.processCurveEdge(0, edge, 1);

      edge._private.rscratch.allpts = [5, 5, 30, 55, 55, 80, 80, 55, 105, 5];
      prog.updateEndpoints(0, edge);

      expect(prog.buffer[0]).to.equal(5);    // srcX
      expect(prog.buffer[1]).to.equal(5);    // srcY
      expect(prog.buffer[2]).to.equal(105);  // tgtX
      expect(prog.buffer[3]).to.equal(5);    // tgtY
      // midIdx = floor(10/2) & ~1 = 4
      expect(prog.buffer[4]).to.equal(55);   // pts[4]
      expect(prog.buffer[5]).to.equal(80);   // pts[5]
    });

    it('skips when rs.badLine is true', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ allpts: [0, 0, 50, 100, 100, 0] });
      prog.processCurveEdge(0, edge, 1);
      const savedSrcX = prog.buffer[0];

      edge._private.rscratch.badLine = true;
      edge._private.rscratch.allpts = [999, 999, 999, 999, 999, 999];
      prog.updateEndpoints(0, edge);

      // Should not have updated
      expect(prog.buffer[0]).to.equal(savedSrcX);
    });

    it('skips when rscratch is null', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ allpts: [0, 0, 50, 100, 100, 0] });
      prog.processCurveEdge(0, edge, 1);
      const savedSrcX = prog.buffer[0];

      edge._private.rscratch = null;
      prog.updateEndpoints(0, edge);
      expect(prog.buffer[0]).to.equal(savedSrcX);
    });

    it('skips when allpts.length < 6', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ allpts: [0, 0, 50, 100, 100, 0] });
      prog.processCurveEdge(0, edge, 1);
      const savedSrcX = prog.buffer[0];

      edge._private.rscratch.allpts = [0, 0, 100, 100]; // only 4 pts
      prog.updateEndpoints(0, edge);
      expect(prog.buffer[0]).to.equal(savedSrcX);
    });

    it('marks dirty after update', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge();
      prog.processCurveEdge(0, edge, 1);
      prog._dirtyMin = Infinity;
      prog._dirtyMax = -1;
      prog.needsUpload = false;

      prog.updateEndpoints(0, edge);
      expect(prog._dirtyMin).to.equal(0);
      expect(prog._dirtyMax).to.equal(0);
      expect(prog.needsUpload).to.be.true;
    });
  });

  describe('shader sources', () => {
    it('vertex shader contains GLSL version 300 es', () => {
      expect(VERTEX_SHADER_SOURCE).to.include('#version 300 es');
    });

    it('vertex shader contains expected uniforms', () => {
      expect(VERTEX_SHADER_SOURCE).to.include('uPanZoomMatrix');
      expect(VERTEX_SHADER_SOURCE).to.include('uViewportSize');
      expect(VERTEX_SHADER_SOURCE).to.include('uZoom');
    });

    it('fragment shader contains distToQuadraticBezierCurve', () => {
      expect(FRAGMENT_SHADER_SOURCE).to.include('distToQuadraticBezierCurve');
    });

    it('fragment shader contains smoothstep for anti-aliasing', () => {
      expect(FRAGMENT_SHADER_SOURCE).to.include('smoothstep');
    });

    it('picking shader uses separate main with discard (no PICKING_MODE needed)', () => {
      // Picking and screen shaders use separate main functions,
      // so PICKING_MODE preprocessor define is no longer needed
      expect(FRAGMENT_SHADER_PICKING_SOURCE).to.include('discard');
      expect(FRAGMENT_SHADER_PICKING_SOURCE).to.include('unpackColor(vPickId)');
    });

    it('picking shader contains distToQuadraticBezierCurve', () => {
      expect(FRAGMENT_SHADER_PICKING_SOURCE).to.include('distToQuadraticBezierCurve');
    });

    // Phase 1: OBB vertex shader tests
    it('vertex shader contains OBB computation (chordDir, chordNorm)', () => {
      expect(VERTEX_SHADER_SOURCE).to.include('chordDir');
      expect(VERTEX_SHADER_SOURCE).to.include('chordNorm');
    });

    it('vertex shader uses OBB as primary path (perpOffset computation)', () => {
      // The degenerate fallback still uses minBound/maxBound inside the if-block,
      // but the primary path uses the OBB with perpOffset
      expect(VERTEX_SHADER_SOURCE).to.include('perpOffset');
      expect(VERTEX_SHADER_SOURCE).to.include('halfAcross');
    });

    it('vertex shader contains degenerate fallback for zero-length chord (self-loop safety)', () => {
      // Must handle self-loops where source === target (chordLen < 0.001)
      expect(VERTEX_SHADER_SOURCE).to.include('0.001');
    });

    // Phase 1: discard removal tests
    it('screen fragment shader does NOT contain discard', () => {
      // FRAGMENT_SHADER_SOURCE is the screen path (no PICKING_MODE define)
      // The discard should have been removed — smoothstep zeros alpha for distant fragments
      expect(FRAGMENT_SHADER_SOURCE).to.not.include('discard');
    });

    it('picking fragment shader DOES contain discard (preserved for correctness)', () => {
      // FRAGMENT_SHADER_PICKING_SOURCE has #define PICKING_MODE and must keep discard
      // because blending is disabled during picking
      expect(FRAGMENT_SHADER_PICKING_SOURCE).to.include('discard');
    });

    // Phase 2: Viewport culling tests
    it('vertex shader contains uViewportBounds uniform', () => {
      expect(VERTEX_SHADER_SOURCE).to.include('uViewportBounds');
    });

    it('vertex shader contains viewport cull degenerate pattern', () => {
      expect(VERTEX_SHADER_SOURCE).to.include('vec4(2.0');
    });

    it('draw() method accepts viewport bounds parameter', () => {
      const prog = new EdgeCurveProgram();
      // draw() should accept vpBounds as 5th parameter without error
      // (no GL context, so just verify the method signature exists)
      expect(prog.draw).to.be.a('function');
      expect(prog.draw.length).to.be.at.least(4);
    });

    it('processCurveEdge buffer data unchanged after OBB (shader-only change)', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ allpts: [0, 0, 50, 100, 100, 0] });
      prog.processCurveEdge(0, edge, 42);
      expect(prog.buffer[0]).to.equal(0);
      expect(prog.buffer[1]).to.equal(0);
      expect(prog.buffer[2]).to.equal(100);
      expect(prog.buffer[3]).to.equal(0);
      expect(prog.buffer[4]).to.equal(50);
      expect(prog.buffer[5]).to.equal(100);
      expect(prog.buffer[7]).to.equal(2);
    });
  });

  // Phase 3: pstyle dedup tests
  describe('pstyle dedup (Phase 3)', () => {
    it('processCurveEdge accepts pre-computed style values', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ lineColor: [200, 100, 50], opacity: 0.5, width: 4 });
      // Pass pre-computed values
      prog.processCurveEdge(0, edge, 1, 0.5, [200, 100, 50], 4);
      const [r, g, b] = unpackColor(prog.buffer[6]);
      expect(r).to.equal(100); // 200 * 0.5
      expect(g).to.equal(50);  // 100 * 0.5
      expect(prog.buffer[7]).to.equal(4); // width
    });

    it('processCurveEdge falls back to pstyle when no pre-computed values', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(10);
      const edge = mockCurveEdge({ lineColor: [200, 100, 50], opacity: 1, width: 3 });
      // No pre-computed values — should read from pstyle
      prog.processCurveEdge(0, edge, 1);
      const [r, g, b] = unpackColor(prog.buffer[6]);
      expect(r).to.equal(200);
      expect(g).to.equal(100);
      expect(prog.buffer[7]).to.equal(3);
    });

    it('pre-computed and pstyle paths produce identical buffer output', () => {
      const prog1 = new EdgeCurveProgram();
      prog1.reallocate(10);
      const prog2 = new EdgeCurveProgram();
      prog2.reallocate(10);
      const edge = mockCurveEdge({ lineColor: [200, 100, 50], opacity: 0.8, lineOpacity: 0.5, width: 3 });

      // Path 1: pstyle fallback
      prog1.processCurveEdge(0, edge, 42);
      // Path 2: pre-computed values (combinedOpacity = 0.8 * 0.5 = 0.4)
      prog2.processCurveEdge(0, edge, 42, 0.4, [200, 100, 50], 3);

      // All 9 floats must match
      for(let i = 0; i < EDGE_CURVE_STRIDE; i++) {
        expect(prog2.buffer[i]).to.equal(prog1.buffer[i], `buffer[${i}] mismatch`);
      }
    });
  });

  describe('scale test', () => {
    it('processes 100+ curve edges without error', () => {
      const prog = new EdgeCurveProgram();
      prog.reallocate(200);
      let slot = 0;
      for(let i = 0; i < 150; i++) {
        slot = prog.processCurveEdge(slot, mockCurveEdge({
          allpts: [i * 10, 0, i * 10 + 50, 100, i * 10 + 100, 0],
        }), i + 1);
      }
      expect(slot).to.equal(150);
      // Verify last edge data
      const lastOff = 149 * EDGE_CURVE_STRIDE;
      expect(prog.buffer[lastOff + 0]).to.equal(1490); // srcX = 149 * 10
    });
  });
});
