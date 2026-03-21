import { describe, it } from 'mocha';
import { expect } from 'chai';
import { LODManager } from '../../src/extensions/renderer/canvas/webgl/lod-manager.mjs';

/**
 * WebGL export tests - validates export-related behavior that can be tested
 * without a browser/GPU. Actual image export tests are in playwright.
 */

describe('WebGL Export', () => {

  describe('LOD disabled during export', () => {
    it('export mode enables full quality rendering', () => {
      const lod = new LODManager({ hideEdgesOnViewport: true, textureOnViewport: true });
      lod.setInteracting(true);

      // During interaction: edges and labels hidden
      expect(lod.shouldDrawEdges()).to.be.false;
      expect(lod.shouldDrawLabels()).to.be.false;

      // During export: everything visible
      lod.setExportMode(true);
      expect(lod.shouldDrawEdges()).to.be.true;
      expect(lod.shouldDrawLabels()).to.be.true;

      // Max segments in export mode
      expect(lod.getEdgeSegmentCount(10)).to.equal(15);
    });

    it('export mode is disabled after export', () => {
      const lod = new LODManager({ hideEdgesOnViewport: true });
      lod.setInteracting(true);
      lod.setExportMode(true);
      expect(lod.shouldDrawEdges()).to.be.true;

      lod.setExportMode(false);
      expect(lod.shouldDrawEdges()).to.be.false;
    });
  });
});
