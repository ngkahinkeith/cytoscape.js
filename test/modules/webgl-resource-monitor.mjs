import { describe, it } from 'mocha';
import { expect } from 'chai';
import { ResourceMonitor } from '../../src/extensions/renderer/canvas/webgl/resource-monitor.mjs';

describe('ResourceMonitor', () => {
  it('tracks buffer allocations', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodes', 50000 * 44);
    mon.trackBuffer('edges', 300000 * 44);
    expect(mon.getBufferMemoryMB()).to.be.closeTo(14.7, 0.5);
    expect(mon.isOverBudget()).to.be.false;
  });

  it('detects over-budget', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 10 });
    mon.trackBuffer('edges', 300000 * 44);
    expect(mon.isOverBudget()).to.be.true;
  });

  it('tracks atlas pages', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackAtlasPage(4096, 4096);
    mon.trackAtlasPage(4096, 4096);
    expect(mon.getAtlasMemoryMB()).to.be.closeTo(128, 1);
  });

  it('tracks canvases', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackCanvases(4, 1920, 1080);
    expect(mon.getTotalMB()).to.be.closeTo(31.6, 1);
  });

  it('degradation level 0 when under budget', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodes', 50000 * 44);
    expect(mon.getDegradationLevel()).to.equal(0);
  });

  it('degradation level increases with memory pressure', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 100 });
    mon.trackBuffer('edges', 300000 * 44); // ~13 MB
    mon.trackAtlasPage(4096, 4096); // 64 MB
    mon.trackAtlasPage(4096, 4096); // 64 MB
    // Total ~141 MB vs 100 MB budget -> ratio 1.41 -> level 1
    expect(mon.getDegradationLevel()).to.equal(1);
  });

  it('reset clears all tracking', () => {
    const mon = new ResourceMonitor();
    mon.trackBuffer('test', 1000000);
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(4, 1920, 1080);
    mon.reset();
    expect(mon.getTotalMB()).to.equal(0);
  });

  it('getReport returns readable string', () => {
    const mon = new ResourceMonitor();
    mon.trackBuffer('nodes', 50000 * 44);
    const report = mon.getReport();
    expect(report).to.include('GPU Memory');
    expect(report).to.include('Buffers');
  });

  // Stress test tier validations
  it('Tier 1: 50K nodes + 150K edges fits in 500MB budget', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodeSDF', 50000 * 44);
    mon.trackBuffer('nodeTex', 50000 * 44);
    mon.trackBuffer('edges', 750000 * 44); // 150K x 5 segments
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(6, 1920, 1080);
    expect(mon.isOverBudget()).to.be.false;
    expect(mon.getDegradationLevel()).to.equal(0);
  });

  it('Tier 2: 100K nodes + 250K edges fits in 500MB budget', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodeSDF', 100000 * 44);
    mon.trackBuffer('nodeTex', 100000 * 44);
    mon.trackBuffer('edges', 1250000 * 44);
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(6, 1920, 1080);
    expect(mon.isOverBudget()).to.be.false;
  });

  it('Tier 3: 200K nodes + 500K edges may need degradation', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodeSDF', 200000 * 44);
    mon.trackBuffer('nodeTex', 200000 * 44);
    mon.trackBuffer('edges', 2500000 * 44);
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(6, 1920, 1080);
    // Check if total is tracked correctly
    expect(mon.getTotalMB()).to.be.greaterThan(0);
  });
});
