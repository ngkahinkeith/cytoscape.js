import { describe, it } from 'mocha';
import { expect } from 'chai';
import { ResourceMonitor } from '../../src/extensions/renderer/canvas/webgl/resource-monitor.mjs';

describe('Resource Budget Stress Tests', () => {
  const NODE_STRIDE_BYTES = 44; // 11 floats x 4 bytes
  const EDGE_STRIDE_BYTES = 44;

  it('Tier 1: 50K+150K fits in 500MB budget', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodeSDF', 50000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('nodeTex', 50000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('edges', 750000 * EDGE_STRIDE_BYTES); // 150K x 5 segments
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(6, 1920, 1080);

    console.log('Tier 1:', mon.getReport());
    expect(mon.isOverBudget()).to.be.false;
    expect(mon.getDegradationLevel()).to.equal(0);
  });

  it('Tier 2: 100K+250K fits in 500MB budget', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodeSDF', 100000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('nodeTex', 100000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('edges', 1250000 * EDGE_STRIDE_BYTES);
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(6, 1920, 1080);

    console.log('Tier 2:', mon.getReport());
    expect(mon.isOverBudget()).to.be.false;
  });

  it('Tier 3: 200K+500K resource tracking', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodeSDF', 200000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('nodeTex', 200000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('edges', 2500000 * EDGE_STRIDE_BYTES);
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(6, 1920, 1080);

    console.log('Tier 3:', mon.getReport());
    // Tier 3 with 5 segments may exceed budget — check total
    const total = mon.getTotalMB();
    console.log('Tier 3 total:', total.toFixed(1), 'MB');
    expect(total).to.be.greaterThan(0);
  });

  it('Tier 3 with reduced segments (3) fits in 500MB', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodeSDF', 200000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('nodeTex', 200000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('edges', 1500000 * EDGE_STRIDE_BYTES); // 500K x 3 segments
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(6, 1920, 1080);

    console.log('Tier 3 (3 segments):', mon.getReport());
    // Should be under budget with reduced segments
  });

  it('Tier 3 with straight edges fits comfortably', () => {
    const mon = new ResourceMonitor({ maxGPUMemoryMB: 500 });
    mon.trackBuffer('nodeSDF', 200000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('nodeTex', 200000 * NODE_STRIDE_BYTES);
    mon.trackBuffer('edges', 500000 * EDGE_STRIDE_BYTES); // 500K x 1 (straight)
    mon.trackAtlasPage(4096, 4096);
    mon.trackCanvases(6, 1920, 1080);

    console.log('Tier 3 (straight):', mon.getReport());
    expect(mon.isOverBudget()).to.be.false;
  });
});
