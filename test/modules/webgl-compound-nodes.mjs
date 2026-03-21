import { describe, it } from 'mocha';
import { expect } from 'chai';
import { CompoundBoundsCache } from '../../src/extensions/renderer/canvas/webgl/compound-bounds-cache.mjs';


function createMockNode(id, { x = 0, y = 0, w = 20, h = 20, parent = null, children = [] } = {}) {
  const node = {
    _private: {
      data: { id },
      position: { x, y },
      bodyBounds: {
        x1: x - w / 2, y1: y - h / 2,
        x2: x + w / 2, y2: y + h / 2,
      },
      parent,
      children,
      autoPadding: null,
    },
    isNode: () => true,
    isEdge: () => false,
  };
  return node;
}


describe('CompoundBoundsCache', () => {

  describe('basic operations', () => {
    it('creates without errors', () => {
      const cache = new CompoundBoundsCache();
      expect(cache).to.be.an.instanceOf(CompoundBoundsCache);
    });

    it('new compound node is not dirty', () => {
      const cache = new CompoundBoundsCache();
      const parent = createMockNode('p1');
      expect(cache.isDirty(parent)).to.be.false;
    });
  });


  describe('dirty tracking', () => {
    it('markDirty propagates to parent', () => {
      const cache = new CompoundBoundsCache();
      const parent = createMockNode('p1');
      const child = createMockNode('c1', { parent });

      cache.markDirty(child);
      expect(cache.isDirty(parent)).to.be.true;
    });

    it('markDirty propagates up entire ancestor chain', () => {
      const cache = new CompoundBoundsCache();
      const grandparent = createMockNode('gp');
      const parent = createMockNode('p1', { parent: grandparent });
      const child = createMockNode('c1', { parent });

      cache.markDirty(child);
      expect(cache.isDirty(parent)).to.be.true;
      expect(cache.isDirty(grandparent)).to.be.true;
    });

    it('markDirty does not affect unrelated nodes', () => {
      const cache = new CompoundBoundsCache();
      const parent1 = createMockNode('p1');
      const parent2 = createMockNode('p2');
      const child = createMockNode('c1', { parent: parent1 });

      cache.markDirty(child);
      expect(cache.isDirty(parent1)).to.be.true;
      expect(cache.isDirty(parent2)).to.be.false;
    });

    it('markDirty on element without parent does nothing', () => {
      const cache = new CompoundBoundsCache();
      const orphan = createMockNode('o1');
      cache.markDirty(orphan); // should not throw
      expect(cache.isDirty(orphan)).to.be.false;
    });
  });


  describe('bounds computation', () => {
    it('computes bounds from children', () => {
      const cache = new CompoundBoundsCache();
      const parent = createMockNode('p1', {
        children: [
          createMockNode('c1', { x: 0, y: 0, w: 20, h: 20 }),
          createMockNode('c2', { x: 100, y: 50, w: 20, h: 20 }),
        ],
      });

      cache.markDirtyById('p1');
      const bounds = cache.getBounds(parent);

      // c1: [-10, -10] to [10, 10]
      // c2: [90, 40] to [110, 60]
      expect(bounds.x1).to.equal(-10);
      expect(bounds.y1).to.equal(-10);
      expect(bounds.x2).to.equal(110);
      expect(bounds.y2).to.equal(60);
      expect(bounds.w).to.equal(120);
      expect(bounds.h).to.equal(70);
    });

    it('applies compound padding', () => {
      const cache = new CompoundBoundsCache();
      const parent = createMockNode('p1', {
        children: [
          createMockNode('c1', { x: 0, y: 0, w: 20, h: 20 }),
        ],
      });
      parent._private.autoPadding = 5;

      cache.markDirtyById('p1');
      const bounds = cache.getBounds(parent);

      expect(bounds.x1).to.equal(-15); // -10 - 5
      expect(bounds.y1).to.equal(-15);
      expect(bounds.x2).to.equal(15);  // 10 + 5
      expect(bounds.y2).to.equal(15);
    });

    it('handles node with no children', () => {
      const cache = new CompoundBoundsCache();
      const parent = createMockNode('p1', { x: 50, y: 50, w: 30, h: 30 });

      cache.markDirtyById('p1');
      const bounds = cache.getBounds(parent);

      expect(bounds.x1).to.equal(35); // 50 - 15
      expect(bounds.y1).to.equal(35);
      expect(bounds.x2).to.equal(65);
      expect(bounds.y2).to.equal(65);
    });
  });


  describe('lazy evaluation', () => {
    it('caches bounds after first computation', () => {
      const cache = new CompoundBoundsCache();
      const parent = createMockNode('p1', {
        children: [createMockNode('c1', { x: 0, y: 0 })],
      });

      cache.markDirtyById('p1');
      const bounds1 = cache.getBounds(parent);
      const bounds2 = cache.getBounds(parent);

      // Same object reference (cached)
      expect(bounds1).to.equal(bounds2);
      expect(cache.isDirty(parent)).to.be.false;
    });

    it('recomputes after markDirty', () => {
      const cache = new CompoundBoundsCache();
      const parent = createMockNode('p1');
      const child = createMockNode('c1', { x: 0, y: 0, parent });
      parent._private.children = [child];

      cache.markDirtyById('p1');
      const bounds1 = cache.getBounds(parent);

      // Move child
      child._private.position = { x: 100, y: 100 };
      child._private.bodyBounds = { x1: 90, y1: 90, x2: 110, y2: 110 };
      cache.markDirty(child); // propagates dirty to parent

      const bounds2 = cache.getBounds(parent);
      expect(bounds2.x2).to.equal(110);
      expect(bounds1).to.not.equal(bounds2);
    });
  });


  describe('deeply nested compounds', () => {
    it('handles 10 levels of nesting', () => {
      const cache = new CompoundBoundsCache();
      const nodes = [];

      // Create chain: root -> n1 -> n2 -> ... -> n9 (leaf)
      let prev = null;
      for(let i = 0; i < 10; i++) {
        const node = createMockNode(`n${i}`, {
          x: i * 10, y: i * 10, w: 20, h: 20,
          parent: prev,
        });
        if(prev) {
          prev._private.children = [node];
        }
        nodes.push(node);
        prev = node;
      }

      // Move the leaf
      cache.markDirty(nodes[9]);

      // All ancestors should be dirty
      for(let i = 0; i < 9; i++) {
        expect(cache.isDirty(nodes[i])).to.be.true;
      }
      // Leaf itself is not dirty (it has no bounds to recompute, it's not a parent)
    });
  });


  describe('clear', () => {
    it('clears all state', () => {
      const cache = new CompoundBoundsCache();
      const parent = createMockNode('p1');
      cache.markDirtyById('p1');
      cache.getBounds(parent);

      cache.clear();
      expect(cache.isDirty(parent)).to.be.false;
      expect(cache.cachedBounds.size).to.equal(0);
    });
  });
});
