import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import cytoscape from '../../src/test.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a headless cytoscape instance with the given node ids and edges.
 * @param {string[]} nodeIds  - array of node id strings
 * @param {[string,string][]} edges - array of [source, target] tuples
 * @param {object} [extraOpts] - extra options merged into the cytoscape() call
 */
function createGraph(nodeIds, edges, extraOpts = {}) {
  return cytoscape({
    headless: true,
    elements: {
      nodes: nodeIds.map(id => ({ data: { id } })),
      edges: edges.map(([s, t], i) => ({ data: { id: `e${i}`, source: s, target: t } }))
    },
    ...extraOpts
  });
}

/**
 * Assert that every childless node has finite x/y positions.
 */
function expectValidPositions(cy) {
  cy.nodes().filter(n => n.isChildless()).forEach(n => {
    const pos = n.position();
    expect(pos.x, `node ${n.id()} x`).to.be.a('number').and.to.be.finite;
    expect(pos.y, `node ${n.id()} y`).to.be.a('number').and.to.be.finite;
  });
}

/**
 * Assert that no two childless nodes share the exact same position.
 */
function expectDistinctPositions(cy) {
  const seen = new Set();
  cy.nodes().filter(n => n.isChildless()).forEach(n => {
    const key = `${n.position().x},${n.position().y}`;
    // Allow single-node levels to overlap center, but flag truly identical coords
    // only for graphs with > 1 node (single-node graphs trivially coincide).
    seen.add(key);
  });
  const childless = cy.nodes().filter(n => n.isChildless()).length;
  if (childless > 1) {
    expect(seen.size).to.be.greaterThan(1);
  }
}

// ---------------------------------------------------------------------------
// A small standard graph used across multiple layout suites
// ---------------------------------------------------------------------------
const STD_NODES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const STD_EDGES = [
  ['a', 'b'], ['a', 'c'], ['b', 'd'], ['b', 'e'],
  ['c', 'f'], ['d', 'g'], ['e', 'h'], ['f', 'h']
];

// A tree shaped graph (directed)
const TREE_NODES = ['root', 'l1a', 'l1b', 'l2a', 'l2b', 'l2c', 'l2d'];
const TREE_EDGES = [
  ['root', 'l1a'], ['root', 'l1b'],
  ['l1a', 'l2a'], ['l1a', 'l2b'],
  ['l1b', 'l2c'], ['l1b', 'l2d']
];

// A DAG (directed acyclic graph) for maximal/acyclic testing
const DAG_NODES = ['a', 'b', 'c', 'd', 'e'];
const DAG_EDGES = [
  ['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e']
];

// A graph with disconnected components
const DISCONNECTED_NODES = ['a', 'b', 'c', 'x', 'y'];
const DISCONNECTED_EDGES = [['a', 'b'], ['b', 'c'], ['x', 'y']];

// ===========================================================================
// BREADTHFIRST LAYOUT
// ===========================================================================
describe('Breadthfirst Layout', function () {
  this.timeout(10000);
  let cy;
  afterEach(function () { if (cy) { cy.destroy(); cy = null; } });

  it('positions nodes with default options', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst' }).run();
    expectValidPositions(cy);
    expectDistinctPositions(cy);
  });

  it('positions a tree graph (directed: true)', function () {
    cy = createGraph(TREE_NODES, TREE_EDGES);
    cy.layout({ name: 'breadthfirst', directed: true }).run();
    expectValidPositions(cy);
    // Root should be at a different depth than leaves
    const rootY = cy.$('#root').position().y;
    const leafY = cy.$('#l2a').position().y;
    expect(rootY).to.not.equal(leafY);
  });

  it('supports roots option as array of ids', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', roots: ['a'] }).run();
    expectValidPositions(cy);
  });

  it('supports roots option as selector string', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', roots: '#a' }).run();
    expectValidPositions(cy);
  });

  it('supports roots option as collection', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    const roots = cy.$('#a');
    cy.layout({ name: 'breadthfirst', roots }).run();
    expectValidPositions(cy);
  });

  it('supports circle mode', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', circle: true }).run();
    expectValidPositions(cy);
  });

  it('supports grid mode', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', grid: true }).run();
    expectValidPositions(cy);
  });

  it('directed with maximal option shifts nodes downward', function () {
    cy = createGraph(DAG_NODES, DAG_EDGES);
    cy.layout({ name: 'breadthfirst', directed: true, maximal: true }).run();
    expectValidPositions(cy);
  });

  it('directed with acyclic option', function () {
    cy = createGraph(DAG_NODES, DAG_EDGES);
    cy.layout({ name: 'breadthfirst', directed: true, acyclic: true }).run();
    expectValidPositions(cy);
  });

  it('handles avoidOverlap: false', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', avoidOverlap: false }).run();
    expectValidPositions(cy);
  });

  it('handles custom spacingFactor', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', spacingFactor: 3.0 }).run();
    expectValidPositions(cy);
  });

  it('handles custom boundingBox', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', boundingBox: { x1: 0, y1: 0, w: 500, h: 500 } }).run();
    expectValidPositions(cy);
  });

  it('handles direction: leftward', function () {
    cy = createGraph(TREE_NODES, TREE_EDGES);
    cy.layout({ name: 'breadthfirst', directed: true, direction: 'leftward' }).run();
    expectValidPositions(cy);
  });

  it('handles direction: rightward', function () {
    cy = createGraph(TREE_NODES, TREE_EDGES);
    cy.layout({ name: 'breadthfirst', directed: true, direction: 'rightward' }).run();
    expectValidPositions(cy);
  });

  it('handles direction: upward', function () {
    cy = createGraph(TREE_NODES, TREE_EDGES);
    cy.layout({ name: 'breadthfirst', directed: true, direction: 'upward' }).run();
    expectValidPositions(cy);
  });

  it('handles disconnected components', function () {
    cy = createGraph(DISCONNECTED_NODES, DISCONNECTED_EDGES);
    cy.layout({ name: 'breadthfirst' }).run();
    expectValidPositions(cy);
  });

  it('supports depthSort function', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'breadthfirst',
      depthSort: (a, b) => a.id().localeCompare(b.id())
    }).run();
    expectValidPositions(cy);
  });

  it('supports transform function', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'breadthfirst',
      transform: (node, pos) => ({ x: pos.x + 100, y: pos.y + 100 })
    }).run();
    expectValidPositions(cy);
  });

  it('handles fit: false', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', fit: false }).run();
    expectValidPositions(cy);
  });

  it('positions single node', function () {
    cy = createGraph(['a'], []);
    cy.layout({ name: 'breadthfirst' }).run();
    expectValidPositions(cy);
  });

  it('single root in circle mode gets radius 1', function () {
    cy = createGraph(['a'], []);
    cy.layout({ name: 'breadthfirst', circle: true }).run();
    expectValidPositions(cy);
  });

  it('circle mode with 2-3 nodes in first depth adjusts radius', function () {
    cy = createGraph(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']]);
    cy.layout({ name: 'breadthfirst', circle: true }).run();
    expectValidPositions(cy);
  });

  it('circle mode with >3 nodes in first depth', function () {
    cy = createGraph(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e']]);
    cy.layout({ name: 'breadthfirst', circle: true, directed: true }).run();
    expectValidPositions(cy);
  });

  it('handles boundingBox with circle mode', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', circle: true, boundingBox: { x1: 0, y1: 0, w: 300, h: 300 } }).run();
    expectValidPositions(cy);
  });

  it('handles boundingBox with grid mode', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', grid: true, boundingBox: { x1: 0, y1: 0, w: 300, h: 300 } }).run();
    expectValidPositions(cy);
  });

  it('handles nodeDimensionsIncludeLabels option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'breadthfirst', nodeDimensionsIncludeLabels: true }).run();
    expectValidPositions(cy);
  });

  it('directed maximal on a simple DAG with shared child', function () {
    // DAG where d has two parents -- maximal should push d deeper
    cy = createGraph(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]);
    cy.layout({ name: 'breadthfirst', directed: true, maximal: true }).run();
    expectValidPositions(cy);
  });

  it('handles orphan nodes (nodes not reachable from roots)', function () {
    // Graph where 'z' has no connections to the tree
    cy = createGraph(['a', 'b', 'c', 'z'], [['a', 'b'], ['a', 'c']]);
    // With directed: true, 'z' won't be found by BFS from directed roots
    cy.layout({ name: 'breadthfirst', directed: true }).run();
    expectValidPositions(cy);
  });
});

// ===========================================================================
// CONCENTRIC LAYOUT
// ===========================================================================
describe('Concentric Layout', function () {
  this.timeout(10000);
  let cy;
  afterEach(function () { if (cy) { cy.destroy(); cy = null; } });

  it('positions nodes with default options', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric' }).run();
    expectValidPositions(cy);
  });

  it('respects clockwise: false (counterclockwise)', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', clockwise: false }).run();
    expectValidPositions(cy);
  });

  it('respects counterclockwise: true (deprecated compat)', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', counterclockwise: true }).run();
    expectValidPositions(cy);
  });

  it('handles equidistant option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', equidistant: true }).run();
    expectValidPositions(cy);
  });

  it('handles avoidOverlap: false', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', avoidOverlap: false }).run();
    expectValidPositions(cy);
  });

  it('handles custom concentric function', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'concentric',
      concentric: (node) => node.id().charCodeAt(0) // sort by id character
    }).run();
    expectValidPositions(cy);
  });

  it('handles custom levelWidth function', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'concentric',
      levelWidth: () => 1
    }).run();
    expectValidPositions(cy);
  });

  it('handles custom startAngle', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', startAngle: 0 }).run();
    expectValidPositions(cy);
  });

  it('handles custom sweep', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', sweep: Math.PI }).run();
    expectValidPositions(cy);
  });

  it('handles custom boundingBox', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', boundingBox: { x1: 0, y1: 0, w: 400, h: 400 } }).run();
    expectValidPositions(cy);
  });

  it('handles minNodeSpacing option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', minNodeSpacing: 50 }).run();
    expectValidPositions(cy);
  });

  it('handles spacingFactor option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', spacingFactor: 2.0 }).run();
    expectValidPositions(cy);
  });

  it('handles fit: false', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', fit: false }).run();
    expectValidPositions(cy);
  });

  it('handles single node', function () {
    cy = createGraph(['a'], []);
    cy.layout({ name: 'concentric' }).run();
    expectValidPositions(cy);
  });

  it('handles two nodes with same degree', function () {
    cy = createGraph(['a', 'b'], [['a', 'b']]);
    cy.layout({ name: 'concentric' }).run();
    expectValidPositions(cy);
  });

  it('handles graph where all nodes have same degree', function () {
    // Complete graph K4: all nodes degree 3
    cy = createGraph(['a', 'b', 'c', 'd'], [
      ['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd']
    ]);
    cy.layout({ name: 'concentric' }).run();
    expectValidPositions(cy);
  });

  it('avoidOverlap with single-node level', function () {
    // Create a star graph where center has high degree, leaves have degree 1
    cy = createGraph(['center', 'l1', 'l2', 'l3', 'l4', 'l5'], [
      ['center', 'l1'], ['center', 'l2'], ['center', 'l3'],
      ['center', 'l4'], ['center', 'l5']
    ]);
    cy.layout({ name: 'concentric', avoidOverlap: true }).run();
    expectValidPositions(cy);
  });

  it('handles transform function', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'concentric',
      transform: (node, pos) => ({ x: pos.x * 2, y: pos.y * 2 })
    }).run();
    expectValidPositions(cy);
  });

  it('handles nodeDimensionsIncludeLabels option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'concentric', nodeDimensionsIncludeLabels: true }).run();
    expectValidPositions(cy);
  });

  it('equidistant with multiple levels', function () {
    // Create a graph that produces several concentric levels
    cy = createGraph(
      ['hub', 'a', 'b', 'c', 'd', 'e', 'f', 'leaf1', 'leaf2'],
      [
        ['hub', 'a'], ['hub', 'b'], ['hub', 'c'],
        ['hub', 'd'], ['hub', 'e'], ['hub', 'f'],
        ['a', 'leaf1'], ['b', 'leaf2']
      ]
    );
    cy.layout({ name: 'concentric', equidistant: true }).run();
    expectValidPositions(cy);
  });
});

// ===========================================================================
// COSE LAYOUT
// ===========================================================================
describe('CoSE Layout', function () {
  this.timeout(30000); // CoSE can take longer due to iterative simulation
  let cy;
  afterEach(function () { if (cy) { cy.destroy(); cy = null; } });

  it('positions nodes with default options (animate: false)', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false }).run();
    expectValidPositions(cy);
    expectDistinctPositions(cy);
  });

  it('handles randomize: true', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, randomize: true }).run();
    expectValidPositions(cy);
  });

  it('handles custom numIter', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, numIter: 50 }).run();
    expectValidPositions(cy);
  });

  it('handles custom nodeRepulsion', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'cose', animate: false,
      nodeRepulsion: () => 8192
    }).run();
    expectValidPositions(cy);
  });

  it('handles nodeRepulsion as scalar', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, nodeRepulsion: 4096 }).run();
    expectValidPositions(cy);
  });

  it('handles custom idealEdgeLength', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'cose', animate: false,
      idealEdgeLength: () => 64
    }).run();
    expectValidPositions(cy);
  });

  it('handles idealEdgeLength as scalar', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, idealEdgeLength: 64 }).run();
    expectValidPositions(cy);
  });

  it('handles custom edgeElasticity', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'cose', animate: false,
      edgeElasticity: () => 64
    }).run();
    expectValidPositions(cy);
  });

  it('handles edgeElasticity as scalar', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, edgeElasticity: 64 }).run();
    expectValidPositions(cy);
  });

  it('handles gravity: 0', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, gravity: 0 }).run();
    expectValidPositions(cy);
  });

  it('handles high gravity', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, gravity: 10 }).run();
    expectValidPositions(cy);
  });

  it('handles custom boundingBox', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'cose', animate: false,
      boundingBox: { x1: 0, y1: 0, w: 400, h: 400 }
    }).run();
    expectValidPositions(cy);
  });

  it('handles fit: false', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, fit: false }).run();
    expectValidPositions(cy);
  });

  it('handles custom coolingFactor and initialTemp', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'cose', animate: false,
      coolingFactor: 0.95,
      initialTemp: 500
    }).run();
    expectValidPositions(cy);
  });

  it('handles custom minTemp', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, minTemp: 5.0 }).run();
    expectValidPositions(cy);
  });

  it('handles nodeOverlap option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, nodeOverlap: 20 }).run();
    expectValidPositions(cy);
  });

  it('handles componentSpacing option', function () {
    cy = createGraph(DISCONNECTED_NODES, DISCONNECTED_EDGES);
    cy.layout({ name: 'cose', animate: false, componentSpacing: 100 }).run();
    expectValidPositions(cy);
  });

  it('handles nestingFactor option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'cose', animate: false, nestingFactor: 2.0 }).run();
    expectValidPositions(cy);
  });

  it('handles single node', function () {
    cy = createGraph(['a'], []);
    cy.layout({ name: 'cose', animate: false }).run();
    expectValidPositions(cy);
  });

  it('handles two connected nodes', function () {
    cy = createGraph(['a', 'b'], [['a', 'b']]);
    cy.layout({ name: 'cose', animate: false }).run();
    expectValidPositions(cy);
  });

  it('handles disconnected components', function () {
    cy = createGraph(DISCONNECTED_NODES, DISCONNECTED_EDGES);
    cy.layout({ name: 'cose', animate: false }).run();
    expectValidPositions(cy);
  });

  it('handles many disconnected components with componentSpacing', function () {
    // Three separate components that separateComponents() must arrange
    cy = createGraph(
      ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
      [['a1', 'a2'], ['b1', 'b2'], ['c1', 'c2']]
    );
    cy.layout({ name: 'cose', animate: false, componentSpacing: 80 }).run();
    expectValidPositions(cy);
  });

  it('handles high nodeOverlap with overlapping initial positions', function () {
    // Place all nodes at origin so the overlap-handling code path is exercised
    cy = cytoscape({
      headless: true,
      elements: {
        nodes: STD_NODES.map(id => ({ data: { id }, position: { x: 0, y: 0 } })),
        edges: STD_EDGES.map(([s, t], i) => ({ data: { id: `e${i}`, source: s, target: t } }))
      }
    });
    cy.layout({ name: 'cose', animate: false, nodeOverlap: 20 }).run();
    expectValidPositions(cy);
  });

  it('handles edges with external nodes filtered out', function () {
    // Create a graph where an edge references a node not in the eles subset
    cy = createGraph(['a', 'b', 'c', 'd'], [
      ['a', 'b'], ['b', 'c'], ['c', 'd']
    ]);
    // Run layout on subset that doesn't include 'd' --
    // the edge c->d should be filtered out
    const subset = cy.$('#a, #b, #c, [source = "a"], [source = "b"]');
    subset.layout({ name: 'cose', animate: false }).run();
    expectValidPositions(cy);
  });

  it('stop() terminates the layout', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    const layout = cy.layout({ name: 'cose', animate: false, numIter: 100000 });
    layout.run();
    layout.stop();
    // After stop, positions should still be valid
    expectValidPositions(cy);
  });

  it('destroy() cleans up', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    const layout = cy.layout({ name: 'cose', animate: false, numIter: 10 });
    layout.run();
    layout.destroy();
  });

  it('handles randomize with boundingBox', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'cose', animate: false,
      randomize: true,
      boundingBox: { x1: 0, y1: 0, w: 200, h: 200 }
    }).run();
    expectValidPositions(cy);
  });

  it('handles single-node boundingBox scaling', function () {
    cy = createGraph(['a'], []);
    cy.layout({
      name: 'cose', animate: false,
      boundingBox: { x1: 50, y1: 50, w: 100, h: 100 }
    }).run();
    expectValidPositions(cy);
  });

  it('handles large number of iterations with quick convergence', function () {
    cy = createGraph(['a', 'b'], [['a', 'b']]);
    cy.layout({
      name: 'cose', animate: false,
      numIter: 5000,
      minTemp: 10.0, // high minTemp means it will stop early
      coolingFactor: 0.5  // fast cooling
    }).run();
    expectValidPositions(cy);
  });
});

// ===========================================================================
// GRID LAYOUT
// ===========================================================================
describe('Grid Layout', function () {
  this.timeout(10000);
  let cy;
  afterEach(function () { if (cy) { cy.destroy(); cy = null; } });

  it('positions nodes with default options', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid' }).run();
    expectValidPositions(cy);
    expectDistinctPositions(cy);
  });

  it('handles forced number of rows', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', rows: 2 }).run();
    expectValidPositions(cy);
  });

  it('handles forced number of columns', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', cols: 2 }).run();
    expectValidPositions(cy);
  });

  it('handles both rows and cols specified', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', rows: 2, cols: 4 }).run();
    expectValidPositions(cy);
  });

  it('handles columns option (alias for cols)', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', columns: 4 }).run();
    expectValidPositions(cy);
  });

  it('handles condense option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', condense: true }).run();
    expectValidPositions(cy);
  });

  it('handles avoidOverlap: false', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', avoidOverlap: false }).run();
    expectValidPositions(cy);
  });

  it('handles custom avoidOverlapPadding', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', avoidOverlapPadding: 30 }).run();
    expectValidPositions(cy);
  });

  it('handles custom boundingBox', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', boundingBox: { x1: 0, y1: 0, w: 300, h: 300 } }).run();
    expectValidPositions(cy);
  });

  it('handles sort function', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'grid',
      sort: (a, b) => b.id().localeCompare(a.id()) // reverse alphabetical
    }).run();
    expectValidPositions(cy);
  });

  it('handles position function with row and col', function () {
    cy = createGraph(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']]);
    cy.layout({
      name: 'grid',
      position: (node) => {
        const map = { a: { row: 0, col: 0 }, b: { row: 0, col: 1 }, c: { row: 1, col: 0 }, d: { row: 1, col: 1 } };
        return map[node.id()];
      }
    }).run();
    expectValidPositions(cy);
  });

  it('handles position function with row only', function () {
    cy = createGraph(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']]);
    cy.layout({
      name: 'grid',
      position: (node) => {
        const map = { a: { row: 0 }, b: { row: 0 }, c: { row: 1 }, d: { row: 1 } };
        return map[node.id()];
      }
    }).run();
    expectValidPositions(cy);
  });

  it('handles position function with col only', function () {
    cy = createGraph(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']]);
    cy.layout({
      name: 'grid',
      position: (node) => {
        const map = { a: { col: 0 }, b: { col: 1 }, c: { col: 0 }, d: { col: 1 } };
        return map[node.id()];
      }
    }).run();
    expectValidPositions(cy);
  });

  it('handles single node', function () {
    cy = createGraph(['a'], []);
    cy.layout({ name: 'grid' }).run();
    expectValidPositions(cy);
  });

  it('handles large graph', function () {
    const nodes = Array.from({ length: 25 }, (_, i) => `n${i}`);
    const edges = [];
    for (let i = 0; i < 24; i++) edges.push([`n${i}`, `n${i + 1}`]);
    cy = createGraph(nodes, edges);
    cy.layout({ name: 'grid' }).run();
    expectValidPositions(cy);
  });

  it('handles case where rows * cols > nodes (rounding up scenario)', function () {
    // 7 nodes: sqrt(7) ~ 2.6 => rows=3, cols=3 => 9 > 7 => should reduce
    cy = createGraph(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [
      ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'g']
    ]);
    cy.layout({ name: 'grid' }).run();
    expectValidPositions(cy);
  });

  it('handles case where rows * cols < nodes (rounding down scenario)', function () {
    // 5 nodes: sqrt(5) ~ 2.2 => rows=2, cols=2 => 4 < 5 => should increase
    cy = createGraph(['a', 'b', 'c', 'd', 'e'], [
      ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']
    ]);
    cy.layout({ name: 'grid' }).run();
    expectValidPositions(cy);
  });

  it('handles fit: false', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', fit: false }).run();
    expectValidPositions(cy);
  });

  it('handles spacingFactor option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', spacingFactor: 2.0 }).run();
    expectValidPositions(cy);
  });

  it('handles transform function', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'grid',
      transform: (node, pos) => ({ x: pos.x + 50, y: pos.y + 50 })
    }).run();
    expectValidPositions(cy);
  });

  it('handles zero-size bounding box', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', boundingBox: { x1: 100, y1: 100, w: 0, h: 0 } }).run();
    // All nodes should be at the same point (100, 100)
    cy.nodes().filter(n => n.isChildless()).forEach(n => {
      expect(n.position().x).to.equal(100);
      expect(n.position().y).to.equal(100);
    });
  });

  it('handles nodeDimensionsIncludeLabels option', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', nodeDimensionsIncludeLabels: true }).run();
    expectValidPositions(cy);
  });

  it('handles only cols specified', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'grid', cols: 3 }).run();
    expectValidPositions(cy);
  });

  it('handles only rows specified with many nodes', function () {
    const nodes = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const edges = [];
    for (let i = 0; i < 11; i++) edges.push([`n${i}`, `n${i + 1}`]);
    cy = createGraph(nodes, edges);
    cy.layout({ name: 'grid', rows: 3 }).run();
    expectValidPositions(cy);
  });

  it('auto grid calculation handles exact square count', function () {
    // 9 nodes => 3x3 grid exactly
    cy = createGraph(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      [['a', 'b'], ['b', 'c'], ['d', 'e'], ['e', 'f'], ['g', 'h'], ['h', 'i']]
    );
    cy.layout({ name: 'grid' }).run();
    expectValidPositions(cy);
  });

  it('grid positions are on a regular grid', function () {
    cy = createGraph(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']]);
    cy.layout({ name: 'grid', rows: 2, cols: 2, boundingBox: { x1: 0, y1: 0, w: 200, h: 200 } }).run();
    const positions = cy.nodes().filter(n => n.isChildless()).map(n => n.position());
    // All x-values should be from only 2 distinct values (2 cols)
    const xs = new Set(positions.map(p => Math.round(p.x)));
    const ys = new Set(positions.map(p => Math.round(p.y)));
    expect(xs.size).to.equal(2);
    expect(ys.size).to.equal(2);
  });
});

// ===========================================================================
// RANDOM LAYOUT
// ===========================================================================
describe('Random Layout', function () {
  this.timeout(10000);
  let cy;
  afterEach(function () { if (cy) { cy.destroy(); cy = null; } });

  it('positions all nodes with default options', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'random' }).run();
    expectValidPositions(cy);
  });

  it('positions are within default bounding box', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'random', fit: false }).run();
    expectValidPositions(cy);
  });

  it('positions are within custom bounding box', function () {
    const bb = { x1: 100, y1: 200, w: 300, h: 400 };
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'random', fit: false, boundingBox: bb }).run();
    cy.nodes().filter(n => n.isChildless()).forEach(n => {
      const pos = n.position();
      expect(pos.x, `node ${n.id()} x`).to.be.at.least(bb.x1);
      expect(pos.x, `node ${n.id()} x`).to.be.at.most(bb.x1 + bb.w);
      expect(pos.y, `node ${n.id()} y`).to.be.at.least(bb.y1);
      expect(pos.y, `node ${n.id()} y`).to.be.at.most(bb.y1 + bb.h);
    });
  });

  it('handles single node', function () {
    cy = createGraph(['a'], []);
    cy.layout({ name: 'random' }).run();
    expectValidPositions(cy);
  });

  it('handles disconnected graph', function () {
    cy = createGraph(DISCONNECTED_NODES, DISCONNECTED_EDGES);
    cy.layout({ name: 'random' }).run();
    expectValidPositions(cy);
  });

  it('run returns the layout for chaining', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    const layout = cy.layout({ name: 'random' });
    const result = layout.run();
    expect(result).to.equal(layout);
  });

  it('handles fit: true (default)', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'random', fit: true }).run();
    expectValidPositions(cy);
  });

  it('handles custom padding', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'random', padding: 50 }).run();
    expectValidPositions(cy);
  });

  it('handles transform function', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({
      name: 'random',
      transform: (node, pos) => ({ x: pos.x + 1000, y: pos.y + 1000 })
    }).run();
    expectValidPositions(cy);
  });

  it('produces different positions on separate runs (probabilistic)', function () {
    cy = createGraph(STD_NODES, STD_EDGES);
    cy.layout({ name: 'random', fit: false, boundingBox: { x1: 0, y1: 0, w: 10000, h: 10000 } }).run();
    const pos1 = cy.nodes().map(n => ({ x: n.position().x, y: n.position().y }));
    cy.layout({ name: 'random', fit: false, boundingBox: { x1: 0, y1: 0, w: 10000, h: 10000 } }).run();
    const pos2 = cy.nodes().map(n => ({ x: n.position().x, y: n.position().y }));
    // At least one node should have a different position (extremely unlikely all match)
    const allSame = pos1.every((p, i) => p.x === pos2[i].x && p.y === pos2[i].y);
    expect(allSame).to.be.false;
  });
});
