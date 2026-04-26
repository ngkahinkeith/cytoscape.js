import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  PerfMetrics,
  isMetricsEnabled,
} from '../../src/extensions/renderer/canvas/webgl/perf-metrics.mjs';

describe('PerfMetrics', () => {
  it('is disabled by default (no env flag)', () => {
    expect(isMetricsEnabled()).to.equal(false);
  });

  it('recordChord pushes into histogram bucket', () => {
    const m = new PerfMetrics();
    m.recordChord(150);
    m.recordChord(50);
    expect(m.chordHistogram.totalCount).to.equal(2);
  });

  it('recordPerpOffset pushes signed values into histogram', () => {
    const m = new PerfMetrics();
    m.recordPerpOffset(-30);
    m.recordPerpOffset(30);
    expect(m.perpOffsetHistogram.totalCount).to.equal(2);
  });

  it('recordChordProjection enforces [0, chordLen] bounds and reports outliers', () => {
    const m = new PerfMetrics();
    m.recordChordProjection(0.5, 100);   // mid-chord, in-bounds
    m.recordChordProjection(-5, 100);    // out-of-bounds (negative)
    m.recordChordProjection(120, 100);   // out-of-bounds (overshoot)
    expect(m.chordProjectionOutliers).to.equal(2);
    expect(m.chordProjectionHistogram.totalCount).to.equal(3);
  });

  it('recordObbArea sums per-edge area for fragment-count estimate', () => {
    const m = new PerfMetrics();
    m.recordObbArea(120 * 16);
    m.recordObbArea(60 * 12);
    expect(m.totalObbArea).to.equal(120 * 16 + 60 * 12);
  });

  it('recordUploadBytes accumulates per program key', () => {
    const m = new PerfMetrics();
    m.recordUploadBytes('edge-curve', 1024);
    m.recordUploadBytes('edge-curve', 512);
    m.recordUploadBytes('edge', 256);
    expect(m.uploadBytesPerProgram['edge-curve']).to.equal(1536);
    expect(m.uploadBytesPerProgram['edge']).to.equal(256);
  });

  it('recordPickingRedraw counts how often the picking FBO redraw was triggered', () => {
    const m = new PerfMetrics();
    m.recordPickingRedraw();
    m.recordPickingRedraw();
    expect(m.pickingRedrawCount).to.equal(2);
  });

  it('snapshot returns a frozen plain-object copy', () => {
    const m = new PerfMetrics();
    m.recordChord(100);
    const snap = m.snapshot();
    expect(snap.chordHistogram.totalCount).to.equal(1);
    expect(Object.isFrozen(snap)).to.equal(true);
  });

  it('reset zeros all counters', () => {
    const m = new PerfMetrics();
    m.recordChord(100);
    m.recordObbArea(1000);
    m.reset();
    expect(m.chordHistogram.totalCount).to.equal(0);
    expect(m.totalObbArea).to.equal(0);
  });
});
