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
  });
});
