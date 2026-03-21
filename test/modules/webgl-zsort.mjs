import { describe, it } from 'mocha';
import { expect } from 'chai';
import { computeZSortKey, IncrementalZSort } from '../../src/extensions/renderer/canvas/webgl/incremental-zsort.mjs';


function createMockElement(id, opts = {}) {
  const {
    isNode: isN = true,
    zCompoundDepth = 'auto',
    zIndexCompare = 'auto',
    zIndex = 0,
    poolIndex = 0,
    zDepth = 0,
  } = opts;

  return {
    _private: {
      data: { id },
    },
    isNode: () => isN,
    isEdge: () => !isN,
    zDepth: () => zDepth,
    poolIndex: () => poolIndex,
    cy: () => ({ hasCompoundNodes: () => false }),
    pstyle(prop) {
      switch(prop) {
        case 'z-compound-depth': return { value: zCompoundDepth };
        case 'z-index-compare': return { value: zIndexCompare };
        case 'z-index': return { value: zIndex };
        default: return { value: null };
      }
    },
  };
}


describe('IncrementalZSort', () => {

  describe('computeZSortKey', () => {
    it('produces a number', () => {
      const ele = createMockElement('n1');
      const key = computeZSortKey(ele, false);
      expect(key).to.be.a('number');
      expect(isFinite(key)).to.be.true;
    });

    it('edges sort before nodes (z-index-compare: auto)', () => {
      const node = createMockElement('n1', { isNode: true, poolIndex: 0 });
      const edge = createMockElement('e1', { isNode: false, poolIndex: 0 });
      const nodeKey = computeZSortKey(node, false);
      const edgeKey = computeZSortKey(edge, false);
      expect(edgeKey).to.be.lessThan(nodeKey);
    });

    it('higher z-index sorts after lower z-index', () => {
      const lo = createMockElement('n1', { zIndex: 1 });
      const hi = createMockElement('n2', { zIndex: 10 });
      const loKey = computeZSortKey(lo, false);
      const hiKey = computeZSortKey(hi, false);
      expect(loKey).to.be.lessThan(hiKey);
    });

    it('negative z-index sorts before zero', () => {
      const neg = createMockElement('n1', { zIndex: -5 });
      const zero = createMockElement('n2', { zIndex: 0 });
      const negKey = computeZSortKey(neg, false);
      const zeroKey = computeZSortKey(zero, false);
      expect(negKey).to.be.lessThan(zeroKey);
    });

    it('equal z-index: lower pool index sorts first', () => {
      const a = createMockElement('n1', { poolIndex: 0 });
      const b = createMockElement('n2', { poolIndex: 5 });
      const aKey = computeZSortKey(a, false);
      const bKey = computeZSortKey(b, false);
      expect(aKey).to.be.lessThan(bKey);
    });

    it('z-compound-depth bottom sorts before auto', () => {
      const bottom = createMockElement('n1', { zCompoundDepth: 'bottom' });
      const auto = createMockElement('n2', { zCompoundDepth: 'auto' });
      const bottomKey = computeZSortKey(bottom, false);
      const autoKey = computeZSortKey(auto, false);
      expect(bottomKey).to.be.lessThan(autoKey);
    });

    it('z-compound-depth top sorts after auto', () => {
      const top = createMockElement('n1', { zCompoundDepth: 'top' });
      const auto = createMockElement('n2', { zCompoundDepth: 'auto' });
      const topKey = computeZSortKey(top, false);
      const autoKey = computeZSortKey(auto, false);
      expect(topKey).to.be.greaterThan(autoKey);
    });

    it('z-index-compare manual: edges and nodes sort the same', () => {
      const node = createMockElement('n1', { isNode: true, zIndexCompare: 'manual', poolIndex: 5 });
      const edge = createMockElement('e1', { isNode: false, zIndexCompare: 'manual', poolIndex: 5 });
      const nodeKey = computeZSortKey(node, false);
      const edgeKey = computeZSortKey(edge, false);
      expect(nodeKey).to.equal(edgeKey);
    });
  });


  describe('fullSort', () => {
    it('sorts elements correctly', () => {
      const zsort = new IncrementalZSort();
      const eles = [
        createMockElement('n2', { isNode: true, poolIndex: 2 }),
        createMockElement('e1', { isNode: false, poolIndex: 0 }),
        createMockElement('n1', { isNode: true, poolIndex: 1 }),
      ];

      const sorted = zsort.fullSort(eles);
      // Edge first, then nodes by pool index
      expect(sorted[0]._private.data.id).to.equal('e1');
      expect(sorted[1]._private.data.id).to.equal('n1');
      expect(sorted[2]._private.data.id).to.equal('n2');
    });

    it('handles empty array', () => {
      const zsort = new IncrementalZSort();
      const sorted = zsort.fullSort([]);
      expect(sorted).to.have.length(0);
    });

    it('sorts by z-index', () => {
      const zsort = new IncrementalZSort();
      const eles = [
        createMockElement('n3', { zIndex: 10 }),
        createMockElement('n1', { zIndex: -5 }),
        createMockElement('n2', { zIndex: 0 }),
      ];

      const sorted = zsort.fullSort(eles);
      expect(sorted[0]._private.data.id).to.equal('n1');
      expect(sorted[1]._private.data.id).to.equal('n2');
      expect(sorted[2]._private.data.id).to.equal('n3');
    });
  });


  describe('insert', () => {
    it('inserts in correct position', () => {
      const zsort = new IncrementalZSort();
      const eles = [
        createMockElement('n1', { poolIndex: 0 }),
        createMockElement('n3', { poolIndex: 2 }),
      ];
      zsort.fullSort(eles);

      const newEle = createMockElement('n2', { poolIndex: 1 });
      zsort.insert(newEle);

      const sorted = zsort.getSorted();
      expect(sorted).to.have.length(3);
      expect(sorted[0]._private.data.id).to.equal('n1');
      expect(sorted[1]._private.data.id).to.equal('n2');
      expect(sorted[2]._private.data.id).to.equal('n3');
    });

    it('inserts at beginning', () => {
      const zsort = new IncrementalZSort();
      zsort.fullSort([
        createMockElement('n2', { poolIndex: 1 }),
      ]);

      zsort.insert(createMockElement('n1', { poolIndex: 0 }));
      const sorted = zsort.getSorted();
      expect(sorted[0]._private.data.id).to.equal('n1');
    });

    it('inserts at end', () => {
      const zsort = new IncrementalZSort();
      zsort.fullSort([
        createMockElement('n1', { poolIndex: 0 }),
      ]);

      zsort.insert(createMockElement('n2', { poolIndex: 1 }));
      const sorted = zsort.getSorted();
      expect(sorted[1]._private.data.id).to.equal('n2');
    });
  });


  describe('remove', () => {
    it('removes element correctly', () => {
      const zsort = new IncrementalZSort();
      const eles = [
        createMockElement('n1', { poolIndex: 0 }),
        createMockElement('n2', { poolIndex: 1 }),
        createMockElement('n3', { poolIndex: 2 }),
      ];
      zsort.fullSort(eles);

      zsort.remove(eles[1]); // remove n2

      const sorted = zsort.getSorted();
      expect(sorted).to.have.length(2);
      expect(sorted[0]._private.data.id).to.equal('n1');
      expect(sorted[1]._private.data.id).to.equal('n3');
    });

    it('handles removing non-existent element', () => {
      const zsort = new IncrementalZSort();
      zsort.fullSort([createMockElement('n1')]);
      zsort.remove(createMockElement('n99')); // doesn't exist
      expect(zsort.getSorted()).to.have.length(1);
    });
  });


  describe('invalidate', () => {
    it('handles small invalidation incrementally', () => {
      const zsort = new IncrementalZSort();
      const eles = [];
      for(let i = 0; i < 100; i++) {
        eles.push(createMockElement(`n${i}`, { poolIndex: i }));
      }
      zsort.fullSort(eles);

      // Change z-index of one element
      const changed = createMockElement('n50', { poolIndex: 50, zIndex: 100 });
      changed._private.data.id = 'n50';
      zsort.invalidate([changed]);

      const sorted = zsort.getSorted();
      // n50 should now be at the end (highest z-index)
      expect(sorted[sorted.length - 1]._private.data.id).to.equal('n50');
    });

    it('handles large invalidation with full resort', () => {
      const zsort = new IncrementalZSort();
      const eles = [];
      for(let i = 0; i < 20; i++) {
        eles.push(createMockElement(`n${i}`, { poolIndex: i }));
      }
      zsort.fullSort(eles);

      // Invalidate >10% of elements (triggers full resort)
      const changed = [];
      for(let i = 0; i < 5; i++) {
        changed.push(createMockElement(`n${i}`, { poolIndex: i, zIndex: 100 - i }));
        changed[i]._private.data.id = `n${i}`;
      }
      zsort.invalidate(changed);

      const sorted = zsort.getSorted();
      expect(sorted).to.have.length(20);
    });

    it('handles empty invalidation', () => {
      const zsort = new IncrementalZSort();
      zsort.fullSort([createMockElement('n1')]);
      zsort.invalidate([]);
      expect(zsort.getSorted()).to.have.length(1);
    });
  });


  describe('clear', () => {
    it('clears all state', () => {
      const zsort = new IncrementalZSort();
      zsort.fullSort([createMockElement('n1')]);
      zsort.clear();
      expect(zsort.getSorted()).to.have.length(0);
      expect(zsort.sortKeys.size).to.equal(0);
    });
  });


  describe('performance characteristics', () => {
    it('sort with cached keys is faster than N*log(N) pstyle calls', () => {
      // This test verifies that pstyle() is only called once per element during fullSort,
      // not O(N log N) times like in the comparator-based sort.
      const zsort = new IncrementalZSort();
      let pstyleCalls = 0;

      const eles = [];
      for(let i = 0; i < 200; i++) {
        const ele = createMockElement(`n${i}`, { poolIndex: i, zIndex: i % 10 });
        const origPstyle = ele.pstyle.bind(ele);
        ele.pstyle = function(prop) {
          pstyleCalls++;
          return origPstyle(prop);
        };
        eles.push(ele);
      }

      zsort.fullSort(eles);

      // With cached keys: 3 pstyle calls per element (z-compound-depth, z-index-compare, z-index)
      // = 200 * 3 = 600 calls
      // Without caching (original sort): ~200 * log2(200) * 4 * 2 ≈ ~12000 calls
      expect(pstyleCalls).to.equal(200 * 3);
    });
  });
});
