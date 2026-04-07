import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import cytoscape from '../../src/index.mjs';

// ===========================================================================
// src/collection/dimensions/bounds.mjs coverage
// ===========================================================================

describe('Bounds (src/collection/dimensions/bounds.mjs)', function () {

  describe('renderedBoundingBox() — scales by zoom and shifts by pan', function () {
    let cy;
    beforeEach(function () {
      cy = cytoscape({
        headless: true,
        styleEnabled: true,
        elements: [
          { data: { id: 'n1' }, position: { x: 100, y: 100 } }
        ],
        style: [{ selector: 'node', style: { width: 30, height: 30 } }]
      });
    });
    afterEach(function () { cy.destroy(); });

    it('rendered bounding box is model bb * zoom + pan', function () {
      cy.zoom(2);
      cy.pan({ x: 10, y: 20 });
      const mbb = cy.$('#n1').boundingBox();
      const rbb = cy.$('#n1').renderedBoundingBox();

      expect(rbb.x1).to.be.closeTo(mbb.x1 * 2 + 10, 0.01);
      expect(rbb.y1).to.be.closeTo(mbb.y1 * 2 + 20, 0.01);
      expect(rbb.x2).to.be.closeTo(mbb.x2 * 2 + 10, 0.01);
      expect(rbb.y2).to.be.closeTo(mbb.y2 * 2 + 20, 0.01);
    });

    it('rendered width and height scale by zoom', function () {
      cy.zoom(3);
      cy.pan({ x: 0, y: 0 });
      const mbb = cy.$('#n1').boundingBox();
      const rbb = cy.$('#n1').renderedBoundingBox();

      expect(rbb.w).to.be.closeTo(mbb.w * 3, 0.01);
      expect(rbb.h).to.be.closeTo(mbb.h * 3, 0.01);
    });

    it('at zoom=1 pan=(0,0), rendered bb equals model bb', function () {
      cy.zoom(1);
      cy.pan({ x: 0, y: 0 });
      const mbb = cy.$('#n1').boundingBox();
      const rbb = cy.$('#n1').renderedBoundingBox();

      expect(rbb.x1).to.be.closeTo(mbb.x1, 0.01);
      expect(rbb.y1).to.be.closeTo(mbb.y1, 0.01);
      expect(rbb.w).to.be.closeTo(mbb.w, 0.01);
      expect(rbb.h).to.be.closeTo(mbb.h, 0.01);
    });
  });

  describe('updateCompoundBounds() with min-width/height', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('compound parent respects min-width', function () {
      cy = cytoscape({
        headless: true,
        styleEnabled: true,
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'child', parent: 'parent' }, position: { x: 0, y: 0 } }
        ],
        style: [
          { selector: '#parent', style: { 'min-width': 500, 'min-height': 500 } },
          { selector: '#child', style: { width: 10, height: 10 } }
        ]
      });

      const parentBB = cy.$('#parent').boundingBox({ includeOverlays: false, includeLabels: false });
      // Parent should be at least 500 wide given the min-width
      expect(parentBB.w).to.be.at.least(500);
      expect(parentBB.h).to.be.at.least(500);
    });

    it('compound parent without min-width wraps children tightly', function () {
      cy = cytoscape({
        headless: true,
        styleEnabled: true,
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'child', parent: 'parent' }, position: { x: 0, y: 0 } }
        ],
        style: [
          { selector: '#child', style: { width: 20, height: 20 } }
        ]
      });

      const parentBB = cy.$('#parent').boundingBox({ includeOverlays: false, includeLabels: false });
      // Without min-width, should be roughly the size of the child + padding
      expect(parentBB.w).to.be.lessThan(500);
    });
  });

  describe('updateCompoundBounds() with percentage padding', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('percentage padding increases compound node size', function () {
      cy = cytoscape({
        headless: true,
        styleEnabled: true,
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'c1', parent: 'parent' }, position: { x: 0, y: 0 } },
          { data: { id: 'c2', parent: 'parent' }, position: { x: 100, y: 0 } }
        ],
        style: [
          { selector: '#parent', style: { padding: '10%', 'padding-relative-to': 'width' } },
          { selector: 'node', style: { width: 20, height: 20 } }
        ]
      });

      const noPadCy = cytoscape({
        headless: true,
        styleEnabled: true,
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'c1', parent: 'parent' }, position: { x: 0, y: 0 } },
          { data: { id: 'c2', parent: 'parent' }, position: { x: 100, y: 0 } }
        ],
        style: [
          { selector: '#parent', style: { padding: 0 } },
          { selector: 'node', style: { width: 20, height: 20 } }
        ]
      });

      const bbPad = cy.$('#parent').boundingBox({ includeOverlays: false, includeLabels: false });
      const bbNoPad = noPadCy.$('#parent').boundingBox({ includeOverlays: false, includeLabels: false });

      // With padding, the bounding box should be larger
      expect(bbPad.w).to.be.greaterThan(bbNoPad.w);
      noPadCy.destroy();
    });
  });

  describe('dirtyCompoundBoundsCache()', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('marks parent compound bounds as dirty', function () {
      cy = cytoscape({
        headless: true,
        styleEnabled: true,
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'child', parent: 'parent' }, position: { x: 50, y: 50 } }
        ]
      });

      // Force compound bounds calculation
      cy.$('#parent').boundingBox();
      // Access element _private via [0], not collection _private
      expect(cy.$('#parent')[0]._private.compoundBoundsClean).to.be.true;

      // Dirty it
      cy.$('#child').dirtyCompoundBoundsCache();
      expect(cy.$('#parent')[0]._private.compoundBoundsClean).to.be.false;
    });

    it('emits bounds event on parent when not silent', function () {
      cy = cytoscape({
        headless: true,
        styleEnabled: true,
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'child', parent: 'parent' }, position: { x: 50, y: 50 } }
        ]
      });

      let boundsEmitted = false;
      cy.$('#parent').on('bounds', function () { boundsEmitted = true; });

      // Force clean first
      cy.$('#parent').boundingBox();

      cy.$('#child').dirtyCompoundBoundsCache();
      expect(boundsEmitted).to.be.true;
    });

    it('returns this for chaining on non-compound graphs', function () {
      cy = cytoscape({
        headless: true,
        styleEnabled: true,
        elements: [{ data: { id: 'n1' }, position: { x: 0, y: 0 } }]
      });
      const result = cy.$('#n1').dirtyCompoundBoundsCache();
      expect(result.length).to.equal(1);
    });
  });
});
