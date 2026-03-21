import { describe, it } from 'mocha';
import { expect } from 'chai';
import { FrustumCuller } from '../../src/extensions/renderer/canvas/webgl/frustum-culler.mjs';


function createMockNode(x, y, w, h) {
  return {
    _private: {
      position: { x, y },
      bodyBounds: {
        x1: x - w / 2, y1: y - h / 2,
        x2: x + w / 2, y2: y + h / 2,
      },
    },
    isNode: () => true,
    isEdge: () => false,
    outerWidth: () => w,
    outerHeight: () => h,
  };
}

function createMockEdge(pts) {
  return {
    _private: {
      rscratch: {
        allpts: pts,
      },
    },
    isNode: () => false,
    isEdge: () => true,
  };
}


describe('FrustumCuller', () => {

  describe('constructor', () => {
    it('creates without errors', () => {
      const culler = new FrustumCuller();
      expect(culler).to.be.an.instanceOf(FrustumCuller);
    });
  });

  describe('update', () => {
    it('computes correct viewport bounds', () => {
      const culler = new FrustumCuller();
      // pan = (100, 50), zoom = 2, canvas = 800x600, margin = 0
      culler.update({ x: 100, y: 50 }, 2, 800, 600, 0);

      // model x: (0 - 100)/2 = -50, (800 - 100)/2 = 350
      // model y: (0 - 50)/2 = -25, (600 - 50)/2 = 275
      expect(culler.x1).to.equal(-50);
      expect(culler.y1).to.equal(-25);
      expect(culler.x2).to.equal(350);
      expect(culler.y2).to.equal(275);
    });

    it('applies margin', () => {
      const culler = new FrustumCuller();
      culler.update({ x: 0, y: 0 }, 1, 100, 100, 10);

      expect(culler.x1).to.equal(-10);
      expect(culler.y1).to.equal(-10);
      expect(culler.x2).to.equal(110);
      expect(culler.y2).to.equal(110);
    });
  });

  describe('node visibility', () => {
    let culler;

    beforeEach(() => {
      culler = new FrustumCuller();
      // Viewport: model coords [0, 0] to [100, 100] with no margin
      culler.update({ x: 0, y: 0 }, 1, 100, 100, 0);
    });

    it('node fully inside viewport is visible', () => {
      const node = createMockNode(50, 50, 20, 20);
      expect(culler.isNodeVisible(node)).to.be.true;
    });

    it('node fully outside viewport (right) is not visible', () => {
      const node = createMockNode(200, 50, 20, 20);
      expect(culler.isNodeVisible(node)).to.be.false;
    });

    it('node fully outside viewport (left) is not visible', () => {
      const node = createMockNode(-50, 50, 20, 20);
      expect(culler.isNodeVisible(node)).to.be.false;
    });

    it('node fully outside viewport (above) is not visible', () => {
      const node = createMockNode(50, -50, 20, 20);
      expect(culler.isNodeVisible(node)).to.be.false;
    });

    it('node fully outside viewport (below) is not visible', () => {
      const node = createMockNode(50, 200, 20, 20);
      expect(culler.isNodeVisible(node)).to.be.false;
    });

    it('node partially inside viewport is visible', () => {
      const node = createMockNode(-5, 50, 20, 20); // left edge at -15, right at 5
      expect(culler.isNodeVisible(node)).to.be.true;
    });

    it('node at viewport boundary is visible', () => {
      const node = createMockNode(0, 0, 20, 20); // extends from -10,-10 to 10,10
      expect(culler.isNodeVisible(node)).to.be.true;
    });
  });

  describe('node visibility without bodyBounds', () => {
    it('falls back to position + dimensions', () => {
      const culler = new FrustumCuller();
      culler.update({ x: 0, y: 0 }, 1, 100, 100, 0);

      const node = {
        _private: { position: { x: 50, y: 50 }, bodyBounds: null },
        isNode: () => true,
        isEdge: () => false,
        outerWidth: () => 20,
        outerHeight: () => 20,
      };
      expect(culler.isNodeVisible(node)).to.be.true;

      const offscreen = {
        _private: { position: { x: 200, y: 200 }, bodyBounds: null },
        isNode: () => true,
        isEdge: () => false,
        outerWidth: () => 20,
        outerHeight: () => 20,
      };
      expect(culler.isNodeVisible(offscreen)).to.be.false;
    });
  });

  describe('edge visibility', () => {
    let culler;

    beforeEach(() => {
      culler = new FrustumCuller();
      culler.update({ x: 0, y: 0 }, 1, 100, 100, 0);
    });

    it('edge fully inside viewport is visible', () => {
      const edge = createMockEdge([20, 20, 80, 80]); // straight line
      expect(culler.isEdgeVisible(edge)).to.be.true;
    });

    it('edge fully outside viewport is not visible', () => {
      const edge = createMockEdge([200, 200, 300, 300]);
      expect(culler.isEdgeVisible(edge)).to.be.false;
    });

    it('edge crossing viewport is visible (endpoints outside)', () => {
      // Edge from (-50, 50) to (150, 50) - crosses viewport
      const edge = createMockEdge([-50, 50, 150, 50]);
      expect(culler.isEdgeVisible(edge)).to.be.true;
    });

    it('edge with both endpoints outside but bounding box overlapping is visible', () => {
      // Edge from (-10, -10) to (110, 110) - diagonal across viewport
      const edge = createMockEdge([-10, -10, 110, 110]);
      expect(culler.isEdgeVisible(edge)).to.be.true;
    });

    it('edge with no rscratch is assumed visible', () => {
      const edge = { _private: { rscratch: {} }, isNode: () => false, isEdge: () => true };
      expect(culler.isEdgeVisible(edge)).to.be.true;
    });

    it('curved edge with control point inside is visible', () => {
      // Source and target outside, but control point inside
      const edge = createMockEdge([-50, -50, 50, 50, 200, 200]);
      expect(culler.isEdgeVisible(edge)).to.be.true;
    });
  });

  describe('isElementVisible', () => {
    it('delegates to isNodeVisible for nodes', () => {
      const culler = new FrustumCuller();
      culler.update({ x: 0, y: 0 }, 1, 100, 100, 0);

      const node = createMockNode(50, 50, 20, 20);
      expect(culler.isElementVisible(node)).to.be.true;

      const offNode = createMockNode(200, 200, 20, 20);
      expect(culler.isElementVisible(offNode)).to.be.false;
    });

    it('delegates to isEdgeVisible for edges', () => {
      const culler = new FrustumCuller();
      culler.update({ x: 0, y: 0 }, 1, 100, 100, 0);

      const edge = createMockEdge([50, 50, 80, 80]);
      expect(culler.isElementVisible(edge)).to.be.true;

      const offEdge = createMockEdge([200, 200, 300, 300]);
      expect(culler.isElementVisible(offEdge)).to.be.false;
    });
  });

  describe('culling statistics', () => {
    it('at 2x zoom on center: ~25% of uniformly distributed elements pass cull', () => {
      const culler = new FrustumCuller();
      // Canvas 200x200, pan to center of 200x200 graph, zoom 2
      // At zoom=2, visible area in model coords = 100x100 = 50x50 centered
      culler.update({ x: 100, y: 100 }, 2, 200, 200, 0);
      // Viewport in model: (0-100)/2=-50 to (200-100)/2=50

      let visible = 0;
      const total = 10000;
      for(let i = 0; i < total; i++) {
        // Uniformly distributed nodes in [-100, 100] x [-100, 100]
        const x = (i % 100) * 2 - 100;
        const y = Math.floor(i / 100) * 2 - 100;
        const node = createMockNode(x, y, 2, 2);
        if(culler.isNodeVisible(node)) {
          visible++;
        }
      }

      const fraction = visible / total;
      expect(fraction).to.be.closeTo(0.25, 0.05);
    });
  });
});
