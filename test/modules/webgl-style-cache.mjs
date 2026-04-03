import { describe, it } from 'mocha';
import { expect } from 'chai';
import { StyleSnapshotCache, SHAPE_MAP } from '../../src/extensions/renderer/canvas/webgl/style-cache.mjs';


// Mock element factory
function createMockNode(id, styles = {}, styleKey = 'key1') {
  const defaultStyles = {
    'background-color': { value: [255, 0, 0] },
    'background-opacity': { value: 1 },
    'border-width': { value: 0 },
    'border-color': { value: [0, 0, 0] },
    'border-opacity': { value: 1 },
    'border-position': { value: 'center' },
    'shape': { value: 'ellipse' },
    'corner-radius': { value: 'auto', pfValue: 0 },
    ...styles,
  };

  return {
    _private: {
      data: { id },
      styleKey,
      style: defaultStyles,
    },
    isNode: () => true,
    isEdge: () => false,
    pstyle(prop) {
      return this._private.style[prop] || { value: null, pfValue: 0 };
    },
  };
}

function createMockEdge(id, styles = {}, styleKey = 'key1') {
  const defaultStyles = {
    'line-color': { value: [100, 100, 100] },
    'width': { value: 2, pfValue: 2 },
    'opacity': { value: 1 },
    'line-opacity': { value: 1 },
    'source-arrow-color': { value: [0, 0, 0] },
    'target-arrow-color': { value: [0, 0, 0] },
    ...styles,
  };

  return {
    _private: {
      data: { id },
      styleKey,
      style: defaultStyles,
    },
    isNode: () => false,
    isEdge: () => true,
    pstyle(prop) {
      return this._private.style[prop] || { value: null, pfValue: 0 };
    },
  };
}


describe('StyleSnapshotCache', () => {

  describe('basic operations', () => {
    it('creates without errors', () => {
      const cache = new StyleSnapshotCache();
      expect(cache).to.be.an.instanceOf(StyleSnapshotCache);
    });

    it('reports new nodes as dirty', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1');
      expect(cache.isNodeDirty(node)).to.be.true;
    });

    it('reports new edges as dirty', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1');
      expect(cache.isEdgeDirty(edge)).to.be.true;
    });
  });


  describe('node caching', () => {
    it('caches background-color correctly', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'background-color': { value: [128, 64, 32] },
      });
      cache.updateNode(node);
      const color = cache.getNodeBgColor(node);
      expect(color).to.deep.equal([128, 64, 32]);
    });

    it('caches background-opacity correctly', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'background-opacity': { value: 0.5 },
      });
      cache.updateNode(node);
      expect(cache.getNodeBgOpacity(node)).to.equal(0.5);
    });

    it('caches border properties correctly', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'border-width': { value: 3 },
        'border-color': { value: [255, 128, 0] },
        'border-opacity': { value: 0.8 },
        'border-position': { value: 'inside' },
      });
      cache.updateNode(node);
      expect(cache.getNodeBorderWidth(node)).to.equal(3);
      expect(cache.getNodeBorderColor(node)).to.deep.equal([255, 128, 0]);
      expect(cache.getNodeBorderOpacity(node)).to.be.closeTo(0.8, 1e-6);
      expect(cache.getNodeBorderPosition(node)).to.equal(1); // 1 = inside
    });

    it('caches border-position outside as 2', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'border-position': { value: 'outside' },
      });
      cache.updateNode(node);
      expect(cache.getNodeBorderPosition(node)).to.equal(2);
    });

    it('caches border-position center as 0', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'border-position': { value: 'center' },
      });
      cache.updateNode(node);
      expect(cache.getNodeBorderPosition(node)).to.equal(0);
    });

    it('caches shape correctly', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'shape': { value: 'rectangle' },
      });
      cache.updateNode(node);
      expect(cache.getNodeShapeEnum(node)).to.equal(SHAPE_MAP['rectangle']);
    });

    it('caches corner-radius auto as -1', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'corner-radius': { value: 'auto', pfValue: 0 },
      });
      cache.updateNode(node);
      expect(cache.getNodeCornerRadius(node)).to.equal(-1);
    });

    it('caches corner-radius numeric value', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'corner-radius': { value: 10, pfValue: 10 },
      });
      cache.updateNode(node);
      expect(cache.getNodeCornerRadius(node)).to.equal(10);
    });
  });


  describe('edge caching', () => {
    it('caches line-color correctly', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1', {
        'line-color': { value: [200, 100, 50] },
      });
      cache.updateEdge(edge);
      expect(cache.getEdgeLineColor(edge)).to.deep.equal([200, 100, 50]);
    });

    it('caches width correctly', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1', {
        'width': { value: 5, pfValue: 5 },
      });
      cache.updateEdge(edge);
      expect(cache.getEdgeWidth(edge)).to.equal(5);
    });

    it('caches opacity and line-opacity', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1', {
        'opacity': { value: 0.7 },
        'line-opacity': { value: 0.5 },
      });
      cache.updateEdge(edge);
      expect(cache.getEdgeOpacity(edge)).to.be.closeTo(0.7, 1e-6);
      expect(cache.getEdgeLineOpacity(edge)).to.be.closeTo(0.5, 1e-6);
    });

    it('caches arrow colors', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1', {
        'source-arrow-color': { value: [255, 0, 0] },
        'target-arrow-color': { value: [0, 255, 0] },
      });
      cache.updateEdge(edge);
      expect(cache.getEdgeSourceArrowColor(edge)).to.deep.equal([255, 0, 0]);
      expect(cache.getEdgeTargetArrowColor(edge)).to.deep.equal([0, 255, 0]);
    });
  });


  describe('dirty tracking', () => {
    it('node not dirty after update', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1');
      cache.updateNode(node);
      expect(cache.isNodeDirty(node)).to.be.false;
    });

    it('node becomes dirty when styleKey changes', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {}, 'key1');
      cache.updateNode(node);
      expect(cache.isNodeDirty(node)).to.be.false;

      // Simulate style change
      node._private.styleKey = 'key2';
      expect(cache.isNodeDirty(node)).to.be.true;
    });

    it('edge not dirty after update', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1');
      cache.updateEdge(edge);
      expect(cache.isEdgeDirty(edge)).to.be.false;
    });

    it('edge becomes dirty when styleKey changes', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1', {}, 'key1');
      cache.updateEdge(edge);
      expect(cache.isEdgeDirty(edge)).to.be.false;

      edge._private.styleKey = 'key2';
      expect(cache.isEdgeDirty(edge)).to.be.true;
    });

    it('updateNode returns true when dirty, false when clean', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1');
      expect(cache.updateNode(node)).to.be.true; // first update
      expect(cache.updateNode(node)).to.be.false; // already cached
    });

    it('updateEdge returns true when dirty, false when clean', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1');
      expect(cache.updateEdge(edge)).to.be.true;
      expect(cache.updateEdge(edge)).to.be.false;
    });

    it('re-reads pstyle when styleKey changes', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1', {
        'background-color': { value: [255, 0, 0] },
      }, 'key1');
      cache.updateNode(node);
      expect(cache.getNodeBgColor(node)).to.deep.equal([255, 0, 0]);

      // Simulate style change
      node._private.styleKey = 'key2';
      node._private.style['background-color'] = { value: [0, 255, 0] };
      cache.updateNode(node);
      expect(cache.getNodeBgColor(node)).to.deep.equal([0, 255, 0]);
    });
  });


  describe('batchUpdate', () => {
    it('updates all elements', () => {
      const cache = new StyleSnapshotCache();
      const eles = [
        createMockNode('n1'),
        createMockNode('n2'),
        createMockEdge('e1'),
      ];
      const dirty = cache.batchUpdate(eles);
      expect(dirty).to.equal(3);
    });

    it('returns 0 dirty count on second call with no changes', () => {
      const cache = new StyleSnapshotCache();
      const eles = [
        createMockNode('n1'),
        createMockNode('n2'),
        createMockEdge('e1'),
      ];
      cache.batchUpdate(eles);
      const dirty = cache.batchUpdate(eles);
      expect(dirty).to.equal(0);
    });

    it('only updates dirty elements', () => {
      const cache = new StyleSnapshotCache();
      const n1 = createMockNode('n1', {}, 'key1');
      const n2 = createMockNode('n2', {}, 'key1');
      const e1 = createMockEdge('e1', {}, 'key1');
      const eles = [n1, n2, e1];

      cache.batchUpdate(eles);

      // Only change one element
      n2._private.styleKey = 'key2';
      const dirty = cache.batchUpdate(eles);
      expect(dirty).to.equal(1);
    });
  });


  describe('capacity management', () => {
    it('handles growing beyond initial capacity', () => {
      const cache = new StyleSnapshotCache();
      const nodes = [];
      for(let i = 0; i < 2000; i++) {
        nodes.push(createMockNode(`n${i}`, {
          'background-color': { value: [i % 256, 0, 0] },
        }));
      }

      for(const node of nodes) {
        cache.updateNode(node);
      }

      // Verify first and last
      expect(cache.getNodeBgColor(nodes[0])).to.deep.equal([0, 0, 0]);
      expect(cache.getNodeBgColor(nodes[255])).to.deep.equal([255, 0, 0]);
    });

    it('handles growing edges beyond initial capacity', () => {
      const cache = new StyleSnapshotCache();
      const edges = [];
      for(let i = 0; i < 2000; i++) {
        edges.push(createMockEdge(`e${i}`, {
          'width': { value: i, pfValue: i },
        }));
      }

      for(const edge of edges) {
        cache.updateEdge(edge);
      }

      expect(cache.getEdgeWidth(edges[0])).to.equal(0);
      expect(cache.getEdgeWidth(edges[1999])).to.equal(1999);
    });
  });


  describe('removeElement', () => {
    it('removes node from tracking', () => {
      const cache = new StyleSnapshotCache();
      const node = createMockNode('n1');
      cache.updateNode(node);
      expect(cache.isNodeDirty(node)).to.be.false;

      cache.removeElement(node);
      expect(cache.isNodeDirty(node)).to.be.true; // treated as new
    });

    it('removes edge from tracking', () => {
      const cache = new StyleSnapshotCache();
      const edge = createMockEdge('e1');
      cache.updateEdge(edge);
      expect(cache.isEdgeDirty(edge)).to.be.false;

      cache.removeElement(edge);
      expect(cache.isEdgeDirty(edge)).to.be.true;
    });
  });


  describe('clear', () => {
    it('clears all cached data', () => {
      const cache = new StyleSnapshotCache();
      cache.updateNode(createMockNode('n1'));
      cache.updateEdge(createMockEdge('e1'));

      cache.clear();
      expect(cache.nodeCount).to.equal(0);
      expect(cache.edgeCount).to.equal(0);
    });
  });


  describe('SHAPE_MAP', () => {
    it('contains all common shapes', () => {
      const shapes = [
        'rectangle', 'ellipse', 'round-rectangle', 'triangle',
        'diamond', 'pentagon', 'hexagon', 'heptagon', 'octagon',
        'star', 'tag', 'vee', 'rhomboid', 'barrel',
      ];
      for(const shape of shapes) {
        expect(SHAPE_MAP[shape]).to.be.a('number');
      }
    });

    it('has unique values for unique shapes', () => {
      // Aliases share values intentionally: roundrectangle/round-rectangle,
      // square/rectangle, round-* variants share enum with base shapes, etc.
      const entries = Object.entries(SHAPE_MAP);
      // Filter to only canonical shape names (no aliases)
      const knownAliases = new Set([
        'roundrectangle', 'square', 'bottomroundrectangle', 'cutrectangle',
        'concavehexagon', 'round-rectangle',
        'round-triangle', 'round-diamond', 'round-pentagon', 'round-hexagon',
        'round-heptagon', 'round-octagon', 'round-tag', 'right-rhomboid', 'polygon'
      ]);
      const canonicalEntries = entries.filter(([k]) => !knownAliases.has(k));
      const values = canonicalEntries.map(([, v]) => v);
      expect(new Set(values).size).to.equal(values.length);
    });
  });


  describe('steady-state pan/zoom scenario', () => {
    it('zero pstyle reads when nothing changes', () => {
      const cache = new StyleSnapshotCache();
      const nodes = [];
      const edges = [];
      let pstyleCalls = 0;

      for(let i = 0; i < 100; i++) {
        const node = createMockNode(`n${i}`);
        const origPstyle = node.pstyle.bind(node);
        node.pstyle = function(prop) {
          pstyleCalls++;
          return origPstyle(prop);
        };
        nodes.push(node);
      }

      for(let i = 0; i < 100; i++) {
        const edge = createMockEdge(`e${i}`);
        const origPstyle = edge.pstyle.bind(edge);
        edge.pstyle = function(prop) {
          pstyleCalls++;
          return origPstyle(prop);
        };
        edges.push(edge);
      }

      const eles = [...nodes, ...edges];

      // First update: all dirty, lots of pstyle calls
      cache.batchUpdate(eles);
      const firstPassCalls = pstyleCalls;
      expect(firstPassCalls).to.be.greaterThan(0);

      // Second update (simulating pan/zoom - no style changes): zero pstyle calls
      pstyleCalls = 0;
      const dirty = cache.batchUpdate(eles);
      expect(dirty).to.equal(0);
      expect(pstyleCalls).to.equal(0);
    });

    it('single element style change: only that element reads pstyle', () => {
      const cache = new StyleSnapshotCache();
      let pstyleCalls = {};

      const eles = [];
      for(let i = 0; i < 50; i++) {
        const node = createMockNode(`n${i}`);
        pstyleCalls[`n${i}`] = 0;
        const origPstyle = node.pstyle.bind(node);
        const nodeId = `n${i}`;
        node.pstyle = function(prop) {
          pstyleCalls[nodeId]++;
          return origPstyle(prop);
        };
        eles.push(node);
      }

      // Initial population
      cache.batchUpdate(eles);

      // Reset counters
      for(const key in pstyleCalls) {
        pstyleCalls[key] = 0;
      }

      // Change style of one element
      eles[25]._private.styleKey = 'changed';

      cache.batchUpdate(eles);

      // Only n25 should have pstyle calls
      expect(pstyleCalls['n25']).to.be.greaterThan(0);
      for(let i = 0; i < 50; i++) {
        if(i !== 25) {
          expect(pstyleCalls[`n${i}`]).to.equal(0, `n${i} should not have pstyle calls`);
        }
      }
    });
  });
});
