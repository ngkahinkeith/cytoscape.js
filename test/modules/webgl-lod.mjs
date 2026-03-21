import { describe, it } from 'mocha';
import { expect } from 'chai';
import { LODManager } from '../../src/extensions/renderer/canvas/webgl/lod-manager.mjs';
import { LabelDensityGrid } from '../../src/extensions/renderer/canvas/webgl/label-overlay.mjs';


describe('LODManager', () => {

  describe('edge hiding during interaction', () => {
    it('draws edges when not interacting', () => {
      const lod = new LODManager({ hideEdgesOnViewport: true });
      lod.setInteracting(false);
      expect(lod.shouldDrawEdges()).to.be.true;
    });

    it('hides edges during interaction when hideEdgesOnViewport is true', () => {
      const lod = new LODManager({ hideEdgesOnViewport: true });
      lod.setInteracting(true);
      expect(lod.shouldDrawEdges()).to.be.false;
    });

    it('draws edges during interaction when hideEdgesOnViewport is false', () => {
      const lod = new LODManager({ hideEdgesOnViewport: false });
      lod.setInteracting(true);
      expect(lod.shouldDrawEdges()).to.be.true;
    });

    it('always draws edges in export mode', () => {
      const lod = new LODManager({ hideEdgesOnViewport: true });
      lod.setInteracting(true);
      lod.setExportMode(true);
      expect(lod.shouldDrawEdges()).to.be.true;
    });
  });


  describe('label hiding during interaction', () => {
    it('draws labels when not interacting', () => {
      const lod = new LODManager({ textureOnViewport: true });
      lod.setInteracting(false);
      expect(lod.shouldDrawLabels()).to.be.true;
    });

    it('hides labels during interaction when textureOnViewport is true', () => {
      const lod = new LODManager({ textureOnViewport: true });
      lod.setInteracting(true);
      expect(lod.shouldDrawLabels()).to.be.false;
    });

    it('always draws labels in export mode', () => {
      const lod = new LODManager({ textureOnViewport: true });
      lod.setInteracting(true);
      lod.setExportMode(true);
      expect(lod.shouldDrawLabels()).to.be.true;
    });
  });


  describe('adaptive edge segments', () => {
    it('returns more segments for longer edges', () => {
      const lod = new LODManager();
      const short = lod.getEdgeSegmentCount(40);   // ~2 segments → clamped to min
      const long = lod.getEdgeSegmentCount(300);    // ~15 segments

      expect(short).to.be.at.most(long);
    });

    it('clamps to minimum 3 segments', () => {
      const lod = new LODManager();
      expect(lod.getEdgeSegmentCount(10)).to.be.at.least(3);
    });

    it('clamps to maximum 15 segments', () => {
      const lod = new LODManager();
      expect(lod.getEdgeSegmentCount(10000)).to.be.at.most(15);
    });

    it('returns max segments in export mode', () => {
      const lod = new LODManager();
      lod.setExportMode(true);
      expect(lod.getEdgeSegmentCount(10)).to.equal(15);
    });
  });


  describe('updateOptions', () => {
    it('updates hideEdgesOnViewport', () => {
      const lod = new LODManager({ hideEdgesOnViewport: false });
      lod.setInteracting(true);
      expect(lod.shouldDrawEdges()).to.be.true;

      lod.updateOptions({ hideEdgesOnViewport: true });
      expect(lod.shouldDrawEdges()).to.be.false;
    });
  });
});


describe('LabelDensityGrid', () => {

  describe('basic operations', () => {
    it('creates without errors', () => {
      const grid = new LabelDensityGrid();
      expect(grid).to.be.an.instanceOf(LabelDensityGrid);
    });

    it('allows first label in a cell', () => {
      const grid = new LabelDensityGrid(100, 3);
      expect(grid.canDisplay(50, 50, 1)).to.be.true;
    });

    it('allows up to maxLabelsPerCell labels', () => {
      const grid = new LabelDensityGrid(100, 3);
      expect(grid.canDisplay(50, 50, 1)).to.be.true;
      expect(grid.canDisplay(60, 60, 1)).to.be.true;
      expect(grid.canDisplay(70, 70, 1)).to.be.true;
      // 4th label should be rejected (same cell, same priority)
      expect(grid.canDisplay(80, 80, 1)).to.be.false;
    });

    it('different cells are independent', () => {
      const grid = new LabelDensityGrid(100, 1);
      expect(grid.canDisplay(50, 50, 1)).to.be.true;
      expect(grid.canDisplay(150, 150, 1)).to.be.true; // different cell
    });

    it('higher priority label can override full cell', () => {
      const grid = new LabelDensityGrid(100, 1);
      grid.canDisplay(50, 50, 1); // fill the cell with priority 1
      expect(grid.canDisplay(60, 60, 5)).to.be.true; // higher priority passes
    });

    it('lower priority label is rejected from full cell', () => {
      const grid = new LabelDensityGrid(100, 1);
      grid.canDisplay(50, 50, 5); // fill with high priority
      expect(grid.canDisplay(60, 60, 1)).to.be.false; // lower priority rejected
    });
  });


  describe('clear', () => {
    it('resets the grid', () => {
      const grid = new LabelDensityGrid(100, 1);
      grid.canDisplay(50, 50, 1);
      expect(grid.canDisplay(60, 60, 1)).to.be.false; // cell full

      grid.clear();
      expect(grid.canDisplay(50, 50, 1)).to.be.true; // cell available again
    });
  });


  describe('density culling statistics', () => {
    it('limits visible labels to maxLabelsPerCell * cellCount', () => {
      const grid = new LabelDensityGrid(50, 2);
      let displayed = 0;
      const total = 1000;

      for(let i = 0; i < total; i++) {
        // All labels at same position
        if(grid.canDisplay(25, 25, 1)) {
          displayed++;
        }
      }

      expect(displayed).to.equal(2); // only 2 per cell
    });

    it('distributes labels across cells', () => {
      const grid = new LabelDensityGrid(100, 3);
      let displayed = 0;

      // Place labels in a 5x5 grid of cells
      for(let cx = 0; cx < 5; cx++) {
        for(let cy = 0; cy < 5; cy++) {
          for(let i = 0; i < 10; i++) { // 10 labels per cell
            if(grid.canDisplay(cx * 100 + 50, cy * 100 + 50, 1)) {
              displayed++;
            }
          }
        }
      }

      // 25 cells * 3 per cell = 75 max
      expect(displayed).to.equal(75);
    });
  });
});
