import { describe, it } from 'mocha';
import { expect } from 'chai';
import { LabelGrid } from '../../src/extensions/renderer/canvas/webgl/label-grid.mjs';

describe('LabelGrid', () => {
  it('limits labels per cell', () => {
    const grid = new LabelGrid(100); // 100px cell size
    const candidates = [];
    for(let i = 0; i < 50; i++) {
      candidates.push({ screenX: 50, screenY: 50, screenSize: 10 - i * 0.1, ele: { id: () => 'n' + i } });
    }
    const visible = grid.getLabelsToDisplay(candidates, 1.0, 800, 600);
    // At zoom 1.0: maxPerCell = ceil(3*1) = 3
    expect(visible.length).to.equal(3);
  });

  it('shows more labels when zoomed in', () => {
    const grid = new LabelGrid(100);
    const candidates = [];
    // Place 10 candidates in each of a few cells so maxPerCell is the limiting factor
    for(let cx = 0; cx < 3; cx++) {
      for(let i = 0; i < 10; i++) {
        candidates.push({ screenX: cx * 100 + 50, screenY: 50, screenSize: 20 - i, ele: { id: () => `n_${cx}_${i}` } });
      }
    }
    // zoom=0.5: maxPerCell = ceil(3*0.5) = 2 => 3 cells * 2 = 6
    const lowZoomCount = grid.getLabelsToDisplay(candidates, 0.5, 400, 200).length;
    // zoom=3.0: maxPerCell = ceil(3*3) = 9 => 3 cells * 9 = 27
    const highZoomCount = grid.getLabelsToDisplay(candidates, 3.0, 400, 200).length;
    expect(highZoomCount).to.be.greaterThan(lowZoomCount);
  });

  it('respects min screen size threshold', () => {
    const grid = new LabelGrid(100);
    const candidates = [
      { screenX: 50, screenY: 50, screenSize: 2, ele: { id: () => 'n0' } }, // too small
      { screenX: 50, screenY: 50, screenSize: 20, ele: { id: () => 'n1' } },
    ];
    const visible = grid.getLabelsToDisplay(candidates, 1.0, 800, 600, 5); // minSize=5
    expect(visible.length).to.equal(1);
    expect(visible[0].ele.id()).to.equal('n1');
  });

  it('prioritizes larger labels in same cell', () => {
    const grid = new LabelGrid(100);
    const candidates = [
      { screenX: 50, screenY: 50, screenSize: 5, ele: { id: () => 'small' } },
      { screenX: 60, screenY: 60, screenSize: 30, ele: { id: () => 'large' } },
      { screenX: 70, screenY: 70, screenSize: 15, ele: { id: () => 'medium' } },
    ];
    // zoom=0.5: maxPerCell = ceil(3*0.5) = 2
    const visible = grid.getLabelsToDisplay(candidates, 0.5, 800, 600);
    expect(visible.length).to.equal(2);
    expect(visible[0].ele.id()).to.equal('large');
    expect(visible[1].ele.id()).to.equal('medium');
  });

  it('skips candidates outside viewport', () => {
    const grid = new LabelGrid(100);
    const candidates = [
      { screenX: 400, screenY: 300, screenSize: 20, ele: { id: () => 'inside' } },
      { screenX: -200, screenY: 300, screenSize: 20, ele: { id: () => 'left' } },
      { screenX: 1000, screenY: 300, screenSize: 20, ele: { id: () => 'right' } },
      { screenX: 400, screenY: -100, screenSize: 20, ele: { id: () => 'above' } },
      { screenX: 400, screenY: 700, screenSize: 20, ele: { id: () => 'below' } },
    ];
    const visible = grid.getLabelsToDisplay(candidates, 1.0, 800, 600);
    expect(visible.length).to.equal(1);
    expect(visible[0].ele.id()).to.equal('inside');
  });

  it('distributes labels across cells', () => {
    const grid = new LabelGrid(100);
    const candidates = [];
    // 5x5 grid of cells, 10 labels per cell
    for(let cx = 0; cx < 5; cx++) {
      for(let cy = 0; cy < 5; cy++) {
        for(let i = 0; i < 10; i++) {
          candidates.push({
            screenX: cx * 100 + 50,
            screenY: cy * 100 + 50,
            screenSize: 20 - i,
            ele: { id: () => `n_${cx}_${cy}_${i}` }
          });
        }
      }
    }
    // zoom=1.0: maxPerCell=3, 25 cells
    const visible = grid.getLabelsToDisplay(candidates, 1.0, 500, 500);
    expect(visible.length).to.equal(75); // 25 cells * 3 per cell
  });

  it('handles empty candidates', () => {
    const grid = new LabelGrid(100);
    const visible = grid.getLabelsToDisplay([], 1.0, 800, 600);
    expect(visible.length).to.equal(0);
  });

  it('handles custom cell size', () => {
    const grid = new LabelGrid(200); // larger cells = fewer cells = fewer labels
    const candidates = [];
    for(let i = 0; i < 20; i++) {
      candidates.push({ screenX: i * 20, screenY: 50, screenSize: 20, ele: { id: () => 'n' + i } });
    }
    // All 20 candidates fall in cells of size 200
    // At zoom 1: maxPerCell=3, ~2 cells (0-200 and 200-400)
    const visible = grid.getLabelsToDisplay(candidates, 1.0, 400, 100);
    expect(visible.length).to.be.at.most(6); // ~2 cells * 3
  });

  it('includes candidates near viewport edges with margin', () => {
    const grid = new LabelGrid(100);
    const candidates = [
      { screenX: -100, screenY: 300, screenSize: 20, ele: { id: () => 'nearLeft' } },  // within 150px margin
      { screenX: 850, screenY: 300, screenSize: 20, ele: { id: () => 'nearRight' } },   // within 150px margin
      { screenX: 400, screenY: -30, screenSize: 20, ele: { id: () => 'nearTop' } },     // within 50px margin
      { screenX: 400, screenY: 630, screenSize: 20, ele: { id: () => 'nearBottom' } },  // within 50px margin
    ];
    const visible = grid.getLabelsToDisplay(candidates, 1.0, 800, 600);
    expect(visible.length).to.equal(4);
  });
});
