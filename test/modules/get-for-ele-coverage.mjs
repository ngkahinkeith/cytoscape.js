import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import cytoscape from '../../src/index.mjs';

// ===========================================================================
// src/style/get-for-ele.mjs coverage
// ===========================================================================

describe('Style get-for-ele (src/style/get-for-ele.mjs)', function () {
  let cy;

  beforeEach(function () {
    cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { data: { id: 'n1' }, position: { x: 100, y: 100 } },
        { data: { id: 'n2' }, position: { x: 200, y: 200 } },
        { data: { id: 'e1', source: 'n1', target: 'n2' } }
      ],
      style: [
        { selector: 'node', style: { width: 30, height: 30, label: 'test' } }
      ]
    });
  });

  afterEach(function () { cy.destroy(); });

  describe('getStylePropertyValue() with rendered=true returns scaled values', function () {
    it('returns pixel value multiplied by zoom', function () {
      cy.zoom(2);
      const rendered = cy.$('#n1').renderedStyle('width');
      // 30 * 2 = 60
      expect(rendered).to.equal('60px');
    });

    it('returns correct value at zoom=1', function () {
      cy.zoom(1);
      const rendered = cy.$('#n1').renderedStyle('width');
      expect(rendered).to.equal('30px');
    });

    it('returns correct value at fractional zoom', function () {
      cy.zoom(0.5);
      const rendered = cy.$('#n1').renderedStyle('width');
      expect(rendered).to.equal('15px');
    });

    it('returns non-numeric values without zoom scaling', function () {
      const rendered = cy.$('#n1').renderedStyle('background-color');
      // Color values are returned as strings, not scaled
      expect(rendered).to.be.a('string');
    });

    it('returns null for non-existent element (empty collection)', function () {
      const style = cy.style();
      const result = style.getStylePropertyValue(cy.collection(), 'width', true);
      expect(result).to.be.undefined;
    });
  });

  describe('getRawStyle() returns all properties with dash and camelCase keys', function () {
    it('returns an object with both dash-case and camelCase keys', function () {
      const raw = cy.$('#n1').style();
      // Should have dash-case
      expect(raw).to.have.property('background-color');
      // Should also have camelCase equivalent
      expect(raw).to.have.property('backgroundColor');
    });

    it('dash-case and camelCase values are identical', function () {
      const raw = cy.$('#n1').style();
      expect(raw['background-color']).to.equal(raw['backgroundColor']);
    });

    it('returns width for a node', function () {
      const raw = cy.$('#n1').style();
      expect(raw).to.have.property('width');
      expect(raw['width']).to.equal('30px');
    });

    it('rendered raw style scales values', function () {
      cy.zoom(2);
      const renderedStyle = cy.$('#n1').renderedStyle();
      // Should return an object
      expect(renderedStyle).to.be.an('object');
      // Width should be scaled
      expect(renderedStyle['width']).to.equal('60px');
    });
  });

  describe('getAnimationStartStyle() captures current state', function () {
    it('captures the current style properties needed for animation', function () {
      const style = cy.style();
      const n1 = cy.$('#n1');

      // Build aniProps array like the animation system does
      const aniProps = style.getPropsList({ width: 100 });
      const startStyle = style.getAnimationStartStyle(n1, aniProps);

      expect(startStyle).to.be.an('object');
      expect(startStyle).to.have.property('width');
      expect(startStyle['width']).to.have.property('name', 'width');
    });

    it('captured start style has correct initial value', function () {
      const style = cy.style();
      const n1 = cy.$('#n1');

      const aniProps = style.getPropsList({ width: 100 });
      const startStyle = style.getAnimationStartStyle(n1, aniProps);

      // The start value should be 30 (current width)
      expect(startStyle['width'].value).to.equal(30);
    });

    it('captures style for multiple properties', function () {
      const style = cy.style();
      const n1 = cy.$('#n1');

      const aniProps = style.getPropsList({ width: 100, height: 100 });
      const startStyle = style.getAnimationStartStyle(n1, aniProps);

      expect(startStyle).to.have.property('width');
      expect(startStyle).to.have.property('height');
    });
  });
});
