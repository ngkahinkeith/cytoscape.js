import { describe, it } from 'mocha';
import { expect } from 'chai';
import { SHAPE_MAP } from '../../src/extensions/renderer/canvas/webgl/style-cache.mjs';

/**
 * Tests for the SDF shape support in the WebGL renderer.
 * Since actual GLSL shader execution requires a GPU, these tests validate:
 * 1. The SHAPE_MAP contains all expected shapes
 * 2. The shape-to-vertex-type mapping is consistent
 * 3. Coverage of all Cytoscape.js node shapes
 */

describe('WebGL SDF Shapes', () => {

  describe('SHAPE_MAP coverage', () => {
    const allShapes = [
      'rectangle', 'ellipse', 'round-rectangle', 'roundrectangle',
      'bottom-round-rectangle', 'triangle', 'diamond',
      'pentagon', 'hexagon', 'heptagon', 'octagon',
      'star', 'tag', 'vee', 'rhomboid', 'barrel',
      'cut-rectangle', 'concave-hexagon',
    ];

    for(const shape of allShapes) {
      it(`maps "${shape}" to a numeric enum`, () => {
        expect(SHAPE_MAP[shape]).to.be.a('number');
        expect(SHAPE_MAP[shape]).to.be.at.least(0);
      });
    }

    it('roundrectangle and round-rectangle are aliases', () => {
      expect(SHAPE_MAP['roundrectangle']).to.equal(SHAPE_MAP['round-rectangle']);
    });
  });


  describe('SDF-capable shapes', () => {
    // These shapes should ALL be handled by SDF (no texture fallback needed)
    const sdfShapes = [
      'rectangle', 'ellipse', 'round-rectangle', 'bottom-round-rectangle',
      'triangle', 'diamond', 'pentagon', 'hexagon', 'heptagon', 'octagon',
      'star', 'tag', 'vee', 'rhomboid', 'barrel', 'cut-rectangle',
      'concave-hexagon',
    ];

    for(const shape of sdfShapes) {
      it(`"${shape}" has a SHAPE_MAP entry (SDF-capable)`, () => {
        expect(SHAPE_MAP[shape]).to.be.a('number');
      });
    }

    it('total SDF-capable shapes >= 17', () => {
      // Count unique values (excluding aliases)
      const uniqueValues = new Set(Object.values(SHAPE_MAP));
      expect(uniqueValues.size).to.be.at.least(17);
    });
  });


  describe('shapes that must fall back to texture', () => {
    // Shapes with background-image, gradient, or pie-chart MUST use texture
    // This is enforced by isSimpleShape() in webgl-util.mjs, not by shape type
    // So any shape CAN be rendered as SDF as long as its visual properties are simple

    it('polygon shape (custom) is in SHAPE_MAP', () => {
      expect(SHAPE_MAP['polygon']).to.be.a('number');
    });
  });


  describe('round variants', () => {
    const roundShapes = [
      'round-triangle', 'round-diamond', 'round-pentagon',
      'round-hexagon', 'round-heptagon', 'round-octagon', 'round-tag',
    ];

    for(const shape of roundShapes) {
      it(`"${shape}" is in SHAPE_MAP`, () => {
        expect(SHAPE_MAP[shape]).to.be.a('number');
      });
    }
  });
});
