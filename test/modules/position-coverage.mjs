import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import cytoscape from '../../src/index.mjs';

// ===========================================================================
// src/collection/dimensions/position.mjs coverage
// ===========================================================================

describe('Position (src/collection/dimensions/position.mjs)', function () {
  let cy;

  beforeEach(function () {
    cy = cytoscape({
      headless: true,
      styleEnabled: true,
      layout: { name: 'preset' },
      elements: [
        { data: { id: 'n1' }, position: { x: 100, y: 200 } },
        { data: { id: 'n2' }, position: { x: 300, y: 400 } },
        { data: { id: 'e1', source: 'n1', target: 'n2' } }
      ]
    });
    cy.zoom(2);
    cy.pan({ x: 10, y: 20 });
  });

  afterEach(function () { cy.destroy(); });

  describe('renderedPosition()', function () {
    it('getter returns model*zoom + pan', function () {
      const rp = cy.$('#n1').renderedPosition();
      // model(100,200), zoom=2, pan=(10,20)
      // rendered = model * zoom + pan
      expect(rp.x).to.equal(100 * 2 + 10); // 210
      expect(rp.y).to.equal(200 * 2 + 20); // 420
    });

    it('getter with dim string returns single value', function () {
      const rx = cy.$('#n1').renderedPosition('x');
      expect(rx).to.equal(100 * 2 + 10);
    });

    it('setter with (dim, val) converts rendered to model', function () {
      cy.$('#n1').renderedPosition('x', 510);
      // model = (rendered - pan) / zoom = (510 - 10) / 2 = 250
      expect(cy.$('#n1').position('x')).to.equal(250);
    });

    it('setter with object converts rendered to model', function () {
      cy.$('#n1').renderedPosition({ x: 210, y: 420 });
      // model.x = (210 - 10) / 2 = 100; model.y = (420 - 20) / 2 = 200
      expect(cy.$('#n1').position('x')).to.equal(100);
      expect(cy.$('#n1').position('y')).to.equal(200);
    });

    it('is chainable when setting', function () {
      const result = cy.$('#n1').renderedPosition({ x: 0, y: 0 });
      expect(result.length).to.be.greaterThan(0);
    });
  });

  describe('relativePosition()', function () {
    let cyCpd;
    afterEach(function () { if (cyCpd) cyCpd.destroy(); });

    it('returns position relative to compound parent', function () {
      cyCpd = cytoscape({
        headless: true,
        styleEnabled: true,
        layout: { name: 'preset' },
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'c1', parent: 'parent' }, position: { x: 0, y: 0 } },
          { data: { id: 'c2', parent: 'parent' }, position: { x: 200, y: 200 } }
        ]
      });
      // Parent position = center of children = (100, 100)
      const parentPos = cyCpd.$('#parent').position();
      const c1Rel = cyCpd.$('#c1').relativePosition();
      const c2Rel = cyCpd.$('#c2').relativePosition();
      // c1 relative = c1.pos - parent.pos = (0-100, 0-100) = (-100, -100)
      expect(c1Rel.x).to.equal(0 - parentPos.x);
      expect(c1Rel.y).to.equal(0 - parentPos.y);
      // c2 relative = (200-100, 200-100) = (100, 100)
      expect(c2Rel.x).to.equal(200 - parentPos.x);
      expect(c2Rel.y).to.equal(200 - parentPos.y);
    });

    it('returns position relative to origin when no parent', function () {
      const pos = cy.$('#n1').position();
      const rp = cy.$('#n1').relativePosition();
      // No parent, so relative to origin (0,0) => same as position
      expect(rp.x).to.equal(pos.x);
      expect(rp.y).to.equal(pos.y);
    });

    it('getter with dim string returns single value', function () {
      const pos = cy.$('#n1').position();
      const rx = cy.$('#n1').relativePosition('x');
      expect(rx).to.equal(pos.x);
    });

    it('setter with (dim, val) sets position relative to parent', function () {
      cyCpd = cytoscape({
        headless: true,
        styleEnabled: true,
        layout: { name: 'preset' },
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'c1', parent: 'parent' }, position: { x: 0, y: 0 } },
          { data: { id: 'c2', parent: 'parent' }, position: { x: 200, y: 200 } }
        ]
      });
      const parentX = cyCpd.$('#parent').position('x');
      cyCpd.$('#c1').relativePosition('x', 50);
      // position.x = 50 + parent.position.x
      expect(cyCpd.$('#c1').position('x')).to.equal(50 + parentX);
    });

    it('setter with object sets both dimensions', function () {
      cyCpd = cytoscape({
        headless: true,
        styleEnabled: true,
        layout: { name: 'preset' },
        elements: [
          { data: { id: 'parent' } },
          { data: { id: 'c1', parent: 'parent' }, position: { x: 0, y: 0 } },
          { data: { id: 'c2', parent: 'parent' }, position: { x: 200, y: 200 } }
        ]
      });
      const parentPos = cyCpd.$('#parent').position();
      cyCpd.$('#c1').relativePosition({ x: 10, y: 20 });
      expect(cyCpd.$('#c1').position('x')).to.equal(10 + parentPos.x);
      expect(cyCpd.$('#c1').position('y')).to.equal(20 + parentPos.y);
    });
  });

  describe('silentPositions()', function () {
    it('updates position without emitting events', function () {
      let eventFired = false;
      cy.$('#n1').on('position', function () { eventFired = true; });
      cy.$('#n1').silentPositions({ x: 999, y: 888 });
      // The internal position should update
      expect(cy.$('#n1').position('x')).to.equal(999);
      expect(cy.$('#n1').position('y')).to.equal(888);
      // In silentPositions the settingTriggersEvent is false
      // so the position event should NOT fire
      expect(eventFired).to.be.false;
    });

    it('silentPositions with function updates each element', function () {
      cy.nodes().silentPositions(function (ele, i) {
        return { x: i * 10, y: i * 20 };
      });
      const positions = cy.nodes().map(function (n) { return n.position(); });
      expect(positions[0].x).to.equal(0);
      expect(positions[1].x).to.equal(10);
    });
  });

  describe('Empty collection returns undefined', function () {
    it('renderedPosition() returns undefined for empty collection', function () {
      const empty = cy.collection();
      expect(empty.renderedPosition()).to.be.undefined;
    });

    it('relativePosition() returns undefined for empty collection', function () {
      const empty = cy.collection();
      expect(empty.relativePosition()).to.be.undefined;
    });

    it('renderedPosition on edge returns undefined', function () {
      // renderedPosition requires isNode
      expect(cy.$('#e1').renderedPosition()).to.be.undefined;
    });
  });
});
