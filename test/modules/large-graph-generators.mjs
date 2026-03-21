import { describe, it } from 'mocha';
import { expect } from 'chai';
import { generateRandom, generateGrid, generateTree, generateScaleFree } from '../../src/extensions/renderer/canvas/webgl/large-graph-generators.mjs';

describe('Large Graph Generators', function() {

  describe('generateRandom', function() {
    for (const size of [100, 1000]) {
      it(`produces ${size} nodes with correct edge count`, function() {
        const graph = generateRandom(size);
        expect(graph.nodes).to.have.length(size);
        expect(graph.edges).to.have.length(Math.floor(size * 1.5));
      });
    }

    it('respects custom edgeFactor', function() {
      const graph = generateRandom(100, 2.0);
      expect(graph.nodes).to.have.length(100);
      expect(graph.edges).to.have.length(200);
    });

    it('all edge endpoints reference existing nodes', function() {
      const graph = generateRandom(100);
      const nodeIds = new Set(graph.nodes.map(n => n.data.id));
      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.data.source)).to.be.true;
        expect(nodeIds.has(edge.data.target)).to.be.true;
      }
    });

    it('is deterministic (same seed produces same output)', function() {
      const g1 = generateRandom(100);
      const g2 = generateRandom(100);
      expect(g1.nodes.map(n => n.data.id)).to.deep.equal(g2.nodes.map(n => n.data.id));
      expect(g1.edges.map(e => e.data.id)).to.deep.equal(g2.edges.map(e => e.data.id));
      expect(g1.edges.map(e => e.data.source)).to.deep.equal(g2.edges.map(e => e.data.source));
      expect(g1.edges.map(e => e.data.target)).to.deep.equal(g2.edges.map(e => e.data.target));
    });

    it('has no duplicate node IDs', function() {
      const graph = generateRandom(500);
      const ids = graph.nodes.map(n => n.data.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });

    it('has no duplicate edge IDs', function() {
      const graph = generateRandom(500);
      const ids = graph.edges.map(e => e.data.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });

    it('produces edges with valid structure', function() {
      const graph = generateRandom(100);
      for (const edge of graph.edges) {
        expect(edge.data).to.have.property('id');
        expect(edge.data).to.have.property('source');
        expect(edge.data).to.have.property('target');
      }
    });
  });

  describe('generateGrid', function() {
    it('produces correct node count for 10x10', function() {
      const graph = generateGrid(10, 10);
      expect(graph.nodes).to.have.length(100);
    });

    it('produces correct edge count for 10x10 (4-connectivity)', function() {
      const graph = generateGrid(10, 10);
      // 4-connected grid: (cols-1)*rows + cols*(rows-1) edges
      expect(graph.edges).to.have.length(9 * 10 + 10 * 9);
    });

    it('produces correct counts for non-square grid', function() {
      const graph = generateGrid(5, 8);
      expect(graph.nodes).to.have.length(40);
      expect(graph.edges).to.have.length(4 * 8 + 5 * 7);
    });

    it('all edge endpoints reference existing nodes', function() {
      const graph = generateGrid(10, 10);
      const nodeIds = new Set(graph.nodes.map(n => n.data.id));
      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.data.source)).to.be.true;
        expect(nodeIds.has(edge.data.target)).to.be.true;
      }
    });

    it('has no duplicate node IDs', function() {
      const graph = generateGrid(20, 25);
      const ids = graph.nodes.map(n => n.data.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });

    it('has no duplicate edge IDs', function() {
      const graph = generateGrid(20, 25);
      const ids = graph.edges.map(e => e.data.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });

    it('handles single row', function() {
      const graph = generateGrid(5, 1);
      expect(graph.nodes).to.have.length(5);
      expect(graph.edges).to.have.length(4);
    });

    it('handles single column', function() {
      const graph = generateGrid(1, 5);
      expect(graph.nodes).to.have.length(5);
      expect(graph.edges).to.have.length(4);
    });
  });

  describe('generateTree', function() {
    it('produces correct structure for binary tree depth 3', function() {
      const graph = generateTree(3, 2);
      // nodes: 1 + 2 + 4 = 7
      expect(graph.nodes).to.have.length(7);
      expect(graph.edges).to.have.length(6);
    });

    it('produces correct structure for ternary tree depth 2', function() {
      const graph = generateTree(2, 3);
      // nodes: 1 + 3 = 4
      expect(graph.nodes).to.have.length(4);
      expect(graph.edges).to.have.length(3);
    });

    it('produces correct structure for depth 1 (single node)', function() {
      const graph = generateTree(1, 2);
      expect(graph.nodes).to.have.length(1);
      expect(graph.edges).to.have.length(0);
    });

    it('produces correct structure for deeper tree', function() {
      const graph = generateTree(5, 3);
      // nodes: 1 + 3 + 9 + 27 + 81 = 121
      expect(graph.nodes).to.have.length(121);
      expect(graph.edges).to.have.length(120);
    });

    it('all edge endpoints reference existing nodes', function() {
      const graph = generateTree(4, 3);
      const nodeIds = new Set(graph.nodes.map(n => n.data.id));
      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.data.source)).to.be.true;
        expect(nodeIds.has(edge.data.target)).to.be.true;
      }
    });

    it('has no duplicate node IDs', function() {
      const graph = generateTree(5, 3);
      const ids = graph.nodes.map(n => n.data.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });

    it('has no duplicate edge IDs', function() {
      const graph = generateTree(5, 3);
      const ids = graph.edges.map(e => e.data.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });
  });

  describe('generateScaleFree', function() {
    it('produces correct node count', function() {
      const graph = generateScaleFree(100, 2);
      expect(graph.nodes).to.have.length(100);
    });

    it('produces edges', function() {
      const graph = generateScaleFree(100, 2);
      expect(graph.edges.length).to.be.greaterThan(0);
    });

    it('all edge endpoints reference existing nodes', function() {
      const graph = generateScaleFree(100, 2);
      const nodeIds = new Set(graph.nodes.map(n => n.data.id));
      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.data.source)).to.be.true;
        expect(nodeIds.has(edge.data.target)).to.be.true;
      }
    });

    it('is deterministic', function() {
      const g1 = generateScaleFree(100, 2);
      const g2 = generateScaleFree(100, 2);
      expect(g1.nodes.map(n => n.data.id)).to.deep.equal(g2.nodes.map(n => n.data.id));
      expect(g1.edges.map(e => e.data.id)).to.deep.equal(g2.edges.map(e => e.data.id));
    });

    it('has no duplicate node IDs', function() {
      const graph = generateScaleFree(500);
      const ids = graph.nodes.map(n => n.data.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });

    it('has no duplicate edge IDs', function() {
      const graph = generateScaleFree(500);
      const ids = graph.edges.map(e => e.data.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });

    it('scales to 1000 nodes', function() {
      const graph = generateScaleFree(1000, 3);
      expect(graph.nodes).to.have.length(1000);
      expect(graph.edges.length).to.be.greaterThan(0);
      const nodeIds = new Set(graph.nodes.map(n => n.data.id));
      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.data.source)).to.be.true;
        expect(nodeIds.has(edge.data.target)).to.be.true;
      }
    });
  });
});
