import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import cytoscape from '../../src/index.mjs';

function makeCy(elements, style) {
  return cytoscape({ headless: true, styleEnabled: true, elements, style });
}

// ===========================================================================
// src/style/apply.mjs coverage
// ===========================================================================

describe('Style apply (src/style/apply.mjs)', function () {

  describe('apply() — applies style contexts to elements', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('apply() returns a collection of updated elements', function () {
      cy = makeCy(
        [{ data: { id: 'a' } }, { data: { id: 'b' } }],
        [{ selector: 'node', style: { 'background-color': 'red' } }]
      );
      const style = cy.style();
      const eles = cy.nodes();
      // Force a fresh application by clearing style hints
      eles.forEach(function (ele) { style.clearStyleHints(ele); });
      const updated = style.apply(eles);
      // updated is a collection
      expect(updated).to.have.property('length');
    });

    it('apply() skips removed elements in updateStyleHints', function () {
      cy = makeCy(
        [{ data: { id: 'a' } }],
        [{ selector: 'node', style: { 'background-color': 'red' } }]
      );
      const n = cy.$('#a');
      n.remove();
      const style = cy.style();
      // updateStyleHints should return false for a removed element
      const result = style.updateStyleHints(n);
      expect(result).to.equal(false);
    });
  });

  describe('applyParsedProperty() — mapData color interpolation', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('interpolates color between two values based on data range', function () {
      cy = makeCy(
        [
          { data: { id: 'lo', weight: 0 } },
          { data: { id: 'mid', weight: 50 } },
          { data: { id: 'hi', weight: 100 } }
        ],
        [{
          selector: 'node',
          style: {
            'background-color': 'mapData(weight, 0, 100, red, blue)'
          }
        }]
      );

      // Low end: should be red-ish (255, 0, 0)
      const loColor = cy.$('#lo').numericStyle('background-color');
      expect(loColor[0]).to.equal(255);
      expect(loColor[2]).to.equal(0);

      // High end: should be blue-ish (0, 0, 255)
      const hiColor = cy.$('#hi').numericStyle('background-color');
      expect(hiColor[0]).to.equal(0);
      expect(hiColor[2]).to.equal(255);

      // Mid: should be between
      const midColor = cy.$('#mid').numericStyle('background-color');
      expect(midColor[0]).to.be.lessThan(255);
      expect(midColor[2]).to.be.greaterThan(0);
    });

    it('mapData clamps values outside the range', function () {
      cy = makeCy(
        [
          { data: { id: 'below', weight: -50 } },
          { data: { id: 'above', weight: 200 } }
        ],
        [{
          selector: 'node',
          style: {
            'width': 'mapData(weight, 0, 100, 10, 110)'
          }
        }]
      );

      // Below min should clamp to min value
      const belowW = cy.$('#below').numericStyle('width');
      expect(belowW).to.equal(10);

      // Above max should clamp to max value
      const aboveW = cy.$('#above').numericStyle('width');
      expect(aboveW).to.equal(110);
    });

    it('mapData for numeric properties interpolates correctly', function () {
      cy = makeCy(
        [{ data: { id: 'mid', weight: 50 } }],
        [{
          selector: 'node',
          style: {
            'width': 'mapData(weight, 0, 100, 10, 110)'
          }
        }]
      );

      const w = cy.$('#mid').numericStyle('width');
      expect(w).to.equal(60); // 10 + (110-10)*0.5
    });
  });

  describe('applyParsedProperty() — bypass override and deleteBypassed', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('bypass overrides the stylesheet value', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [{ selector: 'node', style: { 'background-color': 'red' } }]
      );
      const n = cy.$('#n1');
      n.style('background-color', 'blue');
      // The internal format is rgb(r,g,b) without spaces
      const bgc = n.style('background-color');
      expect(bgc).to.satisfy(function (v) {
        return v.indexOf('0,0,255') !== -1 || v.indexOf('0, 0, 255') !== -1;
      });
    });

    it('removeStyle() restores the stylesheet value after bypass', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [{ selector: 'node', style: { width: 50 } }]
      );
      const n = cy.$('#n1');
      n.style('width', '100px');
      expect(n.numericStyle('width')).to.equal(100);
      n.removeStyle();
      expect(n.numericStyle('width')).to.equal(50);
    });

    it('second bypass replaces first bypass, keeping bypassed original', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [{ selector: 'node', style: { width: 30 } }]
      );
      const n = cy.$('#n1');
      n.style('width', '60px');
      expect(n.numericStyle('width')).to.equal(60);
      n.style('width', '90px');
      expect(n.numericStyle('width')).to.equal(90);
      // Removing bypass should still restore original
      n.removeStyle();
      expect(n.numericStyle('width')).to.equal(30);
    });
  });

  describe('Edge curve-style sanity checks', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('loop edge is forced to bezier', function () {
      cy = makeCy(
        [
          { data: { id: 'n1' } },
          { data: { id: 'loop', source: 'n1', target: 'n1' } }
        ],
        [{
          selector: 'edge',
          style: { 'curve-style': 'straight' }
        }]
      );
      const loop = cy.$('#loop');
      expect(loop.style('curve-style')).to.equal('bezier');
    });

    it('haystack is blocked on edges connected to compound parent nodes via bypass', function () {
      cy = makeCy(
        [
          { data: { id: 'parent' } },
          { data: { id: 'child', parent: 'parent' } },
          { data: { id: 'other' } },
          { data: { id: 'e1', source: 'parent', target: 'other' } }
        ],
        [{
          selector: 'edge',
          style: { 'curve-style': 'bezier' }
        }]
      );
      // Setting haystack via bypass on a compound-parent-connected edge
      // should be overridden to bezier by applyParsedProperty
      cy.$('#e1').style('curve-style', 'haystack');
      expect(cy.$('#e1').style('curve-style')).to.equal('bezier');
    });

    it('haystack is allowed on edges between non-compound nodes', function () {
      cy = makeCy(
        [
          { data: { id: 'a' } },
          { data: { id: 'b' } },
          { data: { id: 'e1', source: 'a', target: 'b' } }
        ],
        [{
          selector: 'edge',
          style: { 'curve-style': 'haystack' }
        }]
      );
      expect(cy.$('#e1').style('curve-style')).to.equal('haystack');
    });
  });

  describe('updateStyleHints() — computes styleKey, labelKey, nodeKey', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('elements have a numeric styleKey after style.apply()', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [{ selector: 'node', style: { 'background-color': 'red' } }]
      );
      // Headless mode doesn't auto-compute style keys; trigger via apply()
      cy.style().apply(cy.nodes());
      // cy.$('#n1')._private is the *collection*'s _private; use [0] for element
      const _p = cy.$('#n1')[0]._private;
      expect(_p.styleKey).to.be.a('number');
    });

    it('styleKey changes when style changes', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [{ selector: 'node', style: { 'background-color': 'red' } }]
      );
      const n = cy.$('#n1');
      // Compute initial keys via a bypass (which calls updateStyleHints)
      n.style('background-color', 'green');
      const oldKey = n[0]._private.styleKey;
      n.style('background-color', 'blue');
      expect(n[0]._private.styleKey).to.not.equal(oldKey);
    });

    it('nodes have labelKey and nodeKey', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [{ selector: 'node', style: { label: 'hello' } }]
      );
      // Force style key computation
      cy.style().apply(cy.nodes());
      const _p = cy.$('#n1')[0]._private;
      expect(_p.labelKey).to.be.a('number');
      expect(_p.nodeKey).to.be.a('number');
    });

    it('edges have sourceLabelKey and targetLabelKey', function () {
      cy = makeCy(
        [
          { data: { id: 'a' } },
          { data: { id: 'b' } },
          { data: { id: 'e', source: 'a', target: 'b' } }
        ],
        [{
          selector: 'edge',
          style: { 'source-label': 'S', 'target-label': 'T' }
        }]
      );
      // Force style key computation
      cy.style().apply(cy.edges());
      const _p = cy.$('#e')[0]._private;
      expect(_p.sourceLabelKey).to.be.a('number');
      expect(_p.targetLabelKey).to.be.a('number');
    });
  });

  describe('cleanElements(keepBypasses)', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('keepBypasses=true preserves bypass properties', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [{ selector: 'node', style: { width: 30 } }]
      );
      const n = cy.$('#n1');
      n.style('width', '99px');
      expect(n.numericStyle('width')).to.equal(99);

      const style = cy.style();
      style.cleanElements(cy.nodes(), true);
      // After cleanElements with keepBypasses, the bypass should still exist
      // Access the element's _private, not the collection's
      const styleObj = n[0]._private.style;
      const prop = styleObj['width'];
      expect(prop).to.exist;
      expect(prop.bypass).to.be.true;
      // But the bypassed value should be cleared
      expect(prop.bypassed).to.be.null;
    });

    it('keepBypasses=false clears all style properties', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [{ selector: 'node', style: { width: 30 } }]
      );
      const n = cy.$('#n1');
      n.style('width', '99px');

      const style = cy.style();
      style.cleanElements(cy.nodes(), false);
      // After cleanElements without keepBypasses, style should be a fresh empty object
      const styleObj = n[0]._private.style;
      expect(styleObj).to.be.an('object');
      expect(Object.keys(styleObj).length).to.equal(0);
    });
  });

  describe('getPropertiesDiff() — returns changed properties', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('returns an array of property names', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [
          { selector: 'node', style: { 'background-color': 'red', width: 30 } },
          { selector: '.big', style: { width: 100 } }
        ]
      );
      const style = cy.style();
      // Both contexts present vs only first context present
      const diff = style.getPropertiesDiff('tt', 'tf');
      expect(diff).to.be.an('array');
      // Should contain 'width' since second context changed
      expect(diff).to.include('width');
    });

    it('caches the result for the same key pair', function () {
      cy = makeCy(
        [{ data: { id: 'n1' } }],
        [
          { selector: 'node', style: { 'background-color': 'red' } },
          { selector: '.foo', style: { width: 50 } }
        ]
      );
      const style = cy.style();
      const diff1 = style.getPropertiesDiff('tt', 'tf');
      const diff2 = style.getPropertiesDiff('tt', 'tf');
      expect(diff1).to.equal(diff2); // same reference (cached)
    });
  });

  describe('Trigger cascade: style change triggers zOrder/bounds recalculation', function () {
    let cy;
    afterEach(function () { if (cy) cy.destroy(); });

    it('checkTriggers dirties style cache on property change', function () {
      cy = makeCy(
        [{ data: { id: 'a' }, position: { x: 50, y: 50 } }],
        [{ selector: 'node', style: { 'z-index': 0 } }]
      );
      const n = cy.$('#a');
      // Access initial style to populate cache
      n.style('z-index');
      // Change z-index which triggers checkTriggers -> dirtyStyleCache
      n.style('z-index', 10);
      // The style value should reflect the new bypass
      expect(n.style('z-index')).to.equal('10');
    });

    it('changing width dirties bounding box cache', function () {
      cy = makeCy(
        [{ data: { id: 'a' }, position: { x: 100, y: 100 } }],
        [{ selector: 'node', style: { width: 30, height: 30 } }]
      );
      const n = cy.$('#a');
      // Get initial bounding box to populate cache
      const bb1 = n.boundingBox();
      // Change width (triggers bounds)
      n.style('width', '80px');
      const bb2 = n.boundingBox();
      expect(bb2.w).to.not.equal(bb1.w);
    });
  });
});
