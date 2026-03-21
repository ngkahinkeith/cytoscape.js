import { describe, it } from 'mocha';
import { expect } from 'chai';
import { generateRandom, generateGrid, generateTree, generateScaleFree } from '../../src/extensions/renderer/canvas/webgl/large-graph-generators.mjs';

describe('WebGL Performance Harness', () => {
  describe('Large Graph Generators', () => {
    // Test various sizes
    for (const size of [100, 1000, 5000]) {
      it(`generateRandom produces ${size} nodes`, () => {
        const graph = generateRandom(size);
        expect(graph.nodes).to.have.length(size);
        expect(graph.edges.length).to.be.greaterThan(0);
        // Verify all edge endpoints exist
        const nodeIds = new Set(graph.nodes.map(n => n.data.id));
        for (const edge of graph.edges) {
          expect(nodeIds.has(edge.data.source)).to.be.true;
          expect(nodeIds.has(edge.data.target)).to.be.true;
        }
      });
    }

    it('generateRandom is deterministic', () => {
      const g1 = generateRandom(100);
      const g2 = generateRandom(100);
      expect(g1.nodes.map(n => n.data.id)).to.deep.equal(g2.nodes.map(n => n.data.id));
      expect(g1.edges.map(e => e.data.id)).to.deep.equal(g2.edges.map(e => e.data.id));
    });

    it('generateGrid produces correct node count', () => {
      const graph = generateGrid(10, 10);
      expect(graph.nodes).to.have.length(100);
      // 4-connected grid: (cols-1)*rows + cols*(rows-1) edges
      expect(graph.edges).to.have.length(9 * 10 + 10 * 9);
    });

    it('generateTree produces correct structure', () => {
      const graph = generateTree(3, 2); // depth 3, binary tree
      // nodes: 1 + 2 + 4 = 7
      expect(graph.nodes).to.have.length(7);
      expect(graph.edges).to.have.length(6);
    });

    it('generateScaleFree produces correct counts', () => {
      const graph = generateScaleFree(100, 2);
      expect(graph.nodes).to.have.length(100);
      // BA model: initial m+1 nodes with m edges each for remaining nodes
      expect(graph.edges.length).to.be.greaterThan(0);
    });

    // Validate no duplicate IDs
    for (const [name, fn] of [
      ['random', () => generateRandom(500)],
      ['grid', () => generateGrid(20, 25)],
      ['tree', () => generateTree(5, 3)],
      ['scale-free', () => generateScaleFree(500)],
    ]) {
      it(`${name} graph has no duplicate node IDs`, () => {
        const graph = fn();
        const ids = graph.nodes.map(n => n.data.id);
        expect(new Set(ids).size).to.equal(ids.length);
      });

      it(`${name} graph has no duplicate edge IDs`, () => {
        const graph = fn();
        const ids = graph.edges.map(e => e.data.id);
        expect(new Set(ids).size).to.equal(ids.length);
      });
    }
  });
});
