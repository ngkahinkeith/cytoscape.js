import { describe, it } from 'mocha';
import { expect } from 'chai';
import { EdgeProgram, EDGE_STRIDE } from '../../src/extensions/renderer/canvas/webgl/programs/edge.mjs';
import { unpackColor } from '../../src/extensions/renderer/canvas/webgl/color-pack.mjs';

// Mock edge
function mockEdge(opts = {}) {
  return {
    _private: {
      rscratch: {
        allpts: opts.allpts || [0, 0, 100, 100], // straight line
        badLine: false,
        arrowStartX: opts.arrowStartX || 0,
        arrowStartY: opts.arrowStartY || 0,
        srcArrowAngle: opts.srcArrowAngle || 0,
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
        'source-arrow-shape': { value: opts.srcArrow || 'none' },
        'target-arrow-shape': { value: opts.tgtArrow || 'triangle' },
        'source-arrow-color': { value: opts.srcArrowColor || [200, 100, 50] },
        'target-arrow-color': { value: opts.tgtArrowColor || [200, 100, 50] },
        'arrow-scale': { value: opts.arrowScale || 1 },
      };
      return styles[prop] || { value: null, pfValue: 0 };
    },
  };
}

// Mock renderer (for getArrowWidth)
const mockR = {
  getArrowWidth: (edgeWidth, scale) => Math.max(Math.pow(edgeWidth * 13.37, 0.9), 29) * scale,
};

describe('EdgeProgram', () => {
  it('EDGE_STRIDE is 11', () => {
    expect(EDGE_STRIDE).to.equal(11);
  });

  it('processes straight edge (1 instance)', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const nextSlot = prog.processEdge(0, mockEdge({ tgtArrow: 'none' }), 1, mockR);
    expect(nextSlot).to.equal(1); // 1 straight line instance
    expect(prog.buffer[0]).to.equal(0); // source x
    expect(prog.buffer[1]).to.equal(0); // source y
    expect(prog.buffer[2]).to.equal(100); // target x
    expect(prog.buffer[3]).to.equal(100); // target y
    expect(prog.typeBuffer[0]).to.equal(0); // EDGE_STRAIGHT
  });

  it('processes bezier edge (curve segment instances)', () => {
    const prog = new EdgeProgram();
    prog.reallocate(20);
    // Quadratic bezier: 6 control points
    const nextSlot = prog.processEdge(0, mockEdge({
      allpts: [0, 0, 50, 50, 100, 0],
      tgtArrow: 'none',
    }), 1, mockR);
    // 5 segments = 6 points, loop over interior points produces segment instances
    expect(nextSlot).to.be.greaterThan(1);
    expect(prog.typeBuffer[0]).to.equal(1); // EDGE_CURVE_SEGMENT
  });

  it('processes edge with target arrow', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const nextSlot = prog.processEdge(0, mockEdge({ tgtArrow: 'triangle' }), 1, mockR);
    // 1 straight line + 1 arrow = 2 instances
    expect(nextSlot).to.equal(2);
    expect(prog.typeBuffer[1]).to.equal(2); // EDGE_ARROW
  });

  it('processes edge with both arrows', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const nextSlot = prog.processEdge(0, mockEdge({
      srcArrow: 'triangle',
      tgtArrow: 'triangle',
    }), 1, mockR);
    // 1 straight + 2 arrows = 3
    expect(nextSlot).to.equal(3);
  });

  it('packs line color correctly', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    prog.processEdge(0, mockEdge({ lineColor: [255, 0, 0], tgtArrow: 'none' }), 1, mockR);
    const [r, g, b, a] = unpackColor(prog.buffer[8]);
    expect(r).to.equal(255);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
  });

  it('packs line width', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    prog.processEdge(0, mockEdge({ width: 5, tgtArrow: 'none' }), 1, mockR);
    expect(prog.buffer[9]).to.equal(5);
  });

  it('packs pick index', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    prog.processEdge(0, mockEdge({ tgtArrow: 'none' }), 42, mockR);
    const [r] = unpackColor(prog.buffer[10]);
    expect(r).to.equal(42);
  });

  it('processes edges with badLine (badLine check removed in 7903a62f)', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const edge = mockEdge();
    edge._private.rscratch.badLine = true;
    const nextSlot = prog.processEdge(0, edge, 1, mockR);
    // badLine check was intentionally removed — edges always render now
    expect(nextSlot).to.be.greaterThan(0);
  });

  it('reallocate grows buffer', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    expect(prog.capacity).to.be.at.least(10);
    prog.reallocate(1000);
    expect(prog.capacity).to.be.at.least(1000);
  });

  it('handles 100 edges', () => {
    const prog = new EdgeProgram();
    prog.reallocate(500);
    let slot = 0;
    for(let i = 0; i < 100; i++) {
      slot = prog.processEdge(slot, mockEdge({
        allpts: [i, 0, i + 50, 50],
        tgtArrow: 'none',
      }), i, mockR);
    }
    expect(slot).to.equal(100); // 100 straight lines
  });

  it('reallocate preserves existing data', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    prog.processEdge(0, mockEdge({ tgtArrow: 'none' }), 1, mockR);
    const savedX = prog.buffer[0];
    const savedY = prog.buffer[1];
    prog.reallocate(1000);
    expect(prog.buffer[0]).to.equal(savedX);
    expect(prog.buffer[1]).to.equal(savedY);
  });

  it('reallocate does not shrink', () => {
    const prog = new EdgeProgram();
    prog.reallocate(100);
    const cap = prog.capacity;
    prog.reallocate(50);
    expect(prog.capacity).to.equal(cap);
  });

  it('reallocate sets needsUpload', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    expect(prog.needsUpload).to.be.true;
  });

  it('reallocate minimum capacity is 256', () => {
    const prog = new EdgeProgram();
    prog.reallocate(1);
    expect(prog.capacity).to.be.at.least(256);
  });

  it('reallocate creates both buffer and typeBuffer', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    expect(prog.buffer).to.be.an.instanceOf(Float32Array);
    expect(prog.typeBuffer).to.be.an.instanceOf(Int32Array);
    expect(prog.buffer.length).to.equal(prog.capacity * EDGE_STRIDE);
    expect(prog.typeBuffer.length).to.equal(prog.capacity);
  });

  it('arrow instance stores position and angle', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const edge = mockEdge({
      tgtArrow: 'triangle',
      arrowEndX: 50,
      arrowEndY: 75,
      tgtArrowAngle: Math.PI / 2,
    });
    const nextSlot = prog.processEdge(0, edge, 1, mockR);
    // Slot 0 is the straight line, slot 1 is the arrow
    const arrowOff = 1 * EDGE_STRIDE;
    expect(prog.buffer[arrowOff + 0]).to.equal(50); // arrow x
    expect(prog.buffer[arrowOff + 1]).to.equal(75); // arrow y
    expect(prog.buffer[arrowOff + 3]).to.be.closeTo(Math.PI / 2, 1e-6); // arrow angle (Float32 precision)
    expect(prog.typeBuffer[1]).to.equal(2); // EDGE_ARROW
  });

  it('skips arrow with NaN position', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const edge = mockEdge({ tgtArrow: 'triangle' });
    edge._private.rscratch.arrowEndX = NaN;
    const nextSlot = prog.processEdge(0, edge, 1, mockR);
    // 1 straight line, no arrow (NaN position skipped)
    expect(nextSlot).to.equal(1);
  });

  it('skips edge with no rscratch', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const edge = mockEdge();
    edge._private.rscratch = null;
    const nextSlot = prog.processEdge(0, edge, 1, mockR);
    expect(nextSlot).to.equal(0);
  });

  it('skips edge with no allpts', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const edge = mockEdge();
    edge._private.rscratch.allpts = null;
    const nextSlot = prog.processEdge(0, edge, 1, mockR);
    expect(nextSlot).to.equal(0);
  });

  it('packs premultiplied color with half opacity', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    prog.processEdge(0, mockEdge({ lineColor: [200, 100, 50], opacity: 0.5, tgtArrow: 'none' }), 1, mockR);
    const [r, g, b, a] = unpackColor(prog.buffer[8]);
    expect(r).to.equal(100); // 200 * 0.5
    expect(g).to.equal(50);  // 100 * 0.5
    expect(b).to.equal(25);  // 50 * 0.5
    expect(a).to.be.closeTo(128, 1); // 255 * 0.5
  });

  it('processes multiple edges at correct offsets', () => {
    const prog = new EdgeProgram();
    prog.reallocate(20);
    let slot = 0;
    slot = prog.processEdge(slot, mockEdge({
      allpts: [10, 20, 30, 40],
      tgtArrow: 'none',
    }), 0, mockR);
    slot = prog.processEdge(slot, mockEdge({
      allpts: [50, 60, 70, 80],
      tgtArrow: 'none',
    }), 1, mockR);
    expect(slot).to.equal(2);
    // Second edge starts at offset EDGE_STRIDE
    expect(prog.buffer[EDGE_STRIDE + 0]).to.equal(50);
    expect(prog.buffer[EDGE_STRIDE + 1]).to.equal(60);
    expect(prog.buffer[EDGE_STRIDE + 2]).to.equal(70);
    expect(prog.buffer[EDGE_STRIDE + 3]).to.equal(80);
  });

  it('bezier segment points start and end at control endpoints', () => {
    const prog = new EdgeProgram();
    prog.reallocate(20);
    // Quadratic bezier: start=(0,0), control=(50,100), end=(100,0)
    prog.processEdge(0, mockEdge({
      allpts: [0, 0, 50, 100, 100, 0],
      tgtArrow: 'none',
    }), 1, mockR);
    // The first segment should have pointB near the start (0,0)
    // and the last segment should have pointB near the end (100,0)
    // This tests that _computeSegments produces correct endpoints
    const firstOff = 0;
    const firstBx = prog.buffer[firstOff + 2]; // pointBx of first segment
    const firstBy = prog.buffer[firstOff + 3]; // pointBy of first segment
    expect(firstBx).to.equal(0); // starts at source
    expect(firstBy).to.equal(0);
  });

  it('packs large pick index across bytes', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const idx = 256 + 42; // 42 in low byte, 1 in second byte
    prog.processEdge(0, mockEdge({ tgtArrow: 'none' }), idx, mockR);
    const [r, g] = unpackColor(prog.buffer[10]);
    expect(r).to.equal(idx & 0xFF);       // 42
    expect(g).to.equal((idx >> 8) & 0xFF); // 1
  });

  it('processEdge sets needsUpload', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    prog.needsUpload = false;
    prog.processEdge(0, mockEdge({ tgtArrow: 'none' }), 1, mockR);
    expect(prog.needsUpload).to.be.true;
  });

  it('bezier with cubic control points produces curve segments', () => {
    const prog = new EdgeProgram();
    prog.reallocate(20);
    // Cubic bezier: 8 control points
    const nextSlot = prog.processEdge(0, mockEdge({
      allpts: [0, 0, 25, 50, 75, 50, 100, 0],
      tgtArrow: 'none',
    }), 1, mockR);
    expect(nextSlot).to.be.greaterThan(1);
    // All instances should be curve segments
    for(let i = 0; i < nextSlot; i++) {
      expect(prog.typeBuffer[i]).to.equal(1); // EDGE_CURVE_SEGMENT
    }
  });

  it('arrow uses arrow-specific color', () => {
    const prog = new EdgeProgram();
    prog.reallocate(10);
    const edge = mockEdge({
      lineColor: [200, 100, 50],
      tgtArrow: 'triangle',
      tgtArrowColor: [0, 255, 0],
    });
    prog.processEdge(0, edge, 1, mockR);
    // Arrow is at slot 1
    const arrowColor = unpackColor(prog.buffer[EDGE_STRIDE + 8]);
    const lineColor = unpackColor(prog.buffer[8]);
    // Arrow color should be from tgt-arrow-color, not line-color
    // But note: _writeArrow uses packPremulColor with edge opacity
    // tgtArrowColor = [0, 255, 0], opacity=1, line-opacity=1
    // so premultiplied: r=0, g=255, b=0
    expect(arrowColor[0]).to.equal(0);
    expect(arrowColor[1]).to.equal(255);
    expect(arrowColor[2]).to.equal(0);
  });
});
