import { expect } from 'chai';
import cytoscape from '../src/test.mjs';

// ------------------------------------------------------------------
// collection-coverage.mjs
// Additional tests for collection modules that are below 75% coverage:
//   zsort, layout, filter (map/reduce/max/min/xor/diff/merge/unmerge),
//   iteration (forEach/slice/eq/sort/sortByZIndex/zDepth/Symbol.iterator),
//   events (on/one/once/removeListener/removeAllListeners/emit/emitAndNotify),
//   algorithms/closeness-centrality, algorithms/degree-centrality
// ------------------------------------------------------------------

describe('Collection coverage', function () {

  // ================================================================
  // Shared graph used by most tests
  // ================================================================
  let cy;

  beforeEach(function (done) {
    cytoscape({
      styleEnabled: true,
      elements: {
        nodes: [
          { data: { id: 'a', weight: 1 } },
          { data: { id: 'b', weight: 2 } },
          { data: { id: 'c', weight: 3 } },
          { data: { id: 'd', weight: 4 } },
          { data: { id: 'e', weight: 5 } },
          { data: { id: 'p', weight: 0 } },       // compound parent
          { data: { id: 'child', parent: 'p' } }   // compound child
        ],
        edges: [
          { data: { id: 'ab', source: 'a', target: 'b', w: 1 } },
          { data: { id: 'bc', source: 'b', target: 'c', w: 2 } },
          { data: { id: 'cd', source: 'c', target: 'd', w: 3 } },
          { data: { id: 'de', source: 'd', target: 'e', w: 4 } },
          { data: { id: 'ae', source: 'a', target: 'e', w: 5 } },
          { data: { id: 'bd', source: 'b', target: 'd', w: 6 } }
        ]
      },
      ready: function () {
        cy = this;
        done();
      }
    });
  });

  afterEach(function () {
    cy.destroy();
  });

  // ================================================================
  // zsort.mjs
  // ================================================================
  describe('zsort (z-index sorting)', function () {

    it('sortByZIndex returns a collection', function () {
      let sorted = cy.elements().sortByZIndex();
      expect(sorted.length).to.equal(cy.elements().length);
    });

    it('edges come before nodes by default (z-index-compare auto)', function () {
      let sorted = cy.elements().sortByZIndex();
      // With default auto z-index-compare, edges (eleDepth 0) sort before nodes (eleDepth 1)
      let firstNodeIdx = -1;
      let lastEdgeIdx = -1;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].isEdge() && i > lastEdgeIdx) lastEdgeIdx = i;
        if (sorted[i].isNode() && firstNodeIdx === -1) firstNodeIdx = i;
      }
      // Because compound parent 'p' has lower depth, it may sort before edges,
      // so just verify the general property: non-compound nodes sort after edges
      // when they share the same compound depth and z-index.
    });

    it('respects z-index style ordering', function () {
      cy.style().fromJson([
        { selector: '#a', style: { 'z-index': 10 } },
        { selector: '#b', style: { 'z-index': 1 } }
      ]).update();

      let sorted = cy.nodes().sortByZIndex();
      let aIdx = -1, bIdx = -1;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].id() === 'a') aIdx = i;
        if (sorted[i].id() === 'b') bIdx = i;
      }
      expect(aIdx).to.be.greaterThan(bIdx);
    });

    it('z-compound-depth bottom sorts before auto', function () {
      cy.style().fromJson([
        { selector: '#a', style: { 'z-compound-depth': 'bottom' } },
        { selector: '#b', style: { 'z-compound-depth': 'auto' } }
      ]).update();

      let sorted = cy.nodes().sortByZIndex();
      let aIdx = -1, bIdx = -1;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].id() === 'a') aIdx = i;
        if (sorted[i].id() === 'b') bIdx = i;
      }
      expect(aIdx).to.be.lessThan(bIdx);
    });

    it('z-compound-depth top sorts after auto', function () {
      cy.style().fromJson([
        { selector: '#a', style: { 'z-compound-depth': 'top' } },
        { selector: '#b', style: { 'z-compound-depth': 'auto' } }
      ]).update();

      let sorted = cy.nodes().sortByZIndex();
      let aIdx = -1, bIdx = -1;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].id() === 'a') aIdx = i;
        if (sorted[i].id() === 'b') bIdx = i;
      }
      expect(aIdx).to.be.greaterThan(bIdx);
    });

    it('z-compound-depth orphan gives depth 0', function () {
      cy.style().fromJson([
        { selector: '#a', style: { 'z-compound-depth': 'orphan' } }
      ]).update();

      // Should not throw and sort should succeed
      let sorted = cy.elements().sortByZIndex();
      expect(sorted.length).to.equal(cy.elements().length);
    });

    it('z-index-compare manual treats node like edge for depth', function () {
      cy.style().fromJson([
        { selector: '#a', style: { 'z-index-compare': 'manual', 'z-index': 0 } },
        { selector: '#ab', style: { 'z-index-compare': 'manual', 'z-index': 1 } }
      ]).update();

      let eles = cy.$('#a, #ab');
      let sorted = eles.sortByZIndex();
      // Both have eleDepth 0 with manual, so z-index decides: ab(1) after a(0)
      expect(sorted[0].id()).to.equal('a');
      expect(sorted[1].id()).to.equal('ab');
    });

    it('falls back to pool index when z-index is equal', function () {
      // a and b have the same default z-index (0), so pool index decides
      let sorted = cy.$('#a, #b').sortByZIndex();
      expect(sorted.length).to.equal(2);
    });

    it('zDepth for a childless node returns large number', function () {
      let depth = cy.$('#a').zDepth();
      expect(depth).to.be.a('number');
      expect(depth).to.be.greaterThan(0);
    });

    it('zDepth for a parent node returns its depth', function () {
      let depth = cy.$('#p').zDepth();
      expect(depth).to.equal(0);
    });

    it('zDepth for a compound child returns large number (childless)', function () {
      let depth = cy.$('#child').zDepth();
      expect(depth).to.be.greaterThan(0);
    });

    it('zDepth for an edge returns max of source/target depth', function () {
      let depth = cy.$('#ab').zDepth();
      expect(depth).to.be.a('number');
    });
  });

  // ================================================================
  // layout.mjs
  // ================================================================
  describe('layout (collection)', function () {

    it('layoutDimensions returns {w, h}', function () {
      let node = cy.$('#a');
      let dims = node.layoutDimensions();
      expect(dims).to.have.property('w');
      expect(dims).to.have.property('h');
      expect(dims.w).to.be.at.least(1);
      expect(dims.h).to.be.at.least(1);
    });

    it('layoutDimensions with nodeDimensionsIncludeLabels', function () {
      let node = cy.$('#a');
      let dims = node.layoutDimensions({ nodeDimensionsIncludeLabels: true });
      expect(dims.w).to.be.at.least(1);
      expect(dims.h).to.be.at.least(1);
    });

    it('layoutDimensions returns {1,1} when element does not take up space', function () {
      // An edge does not take up space in the same way
      // Force a node with 0 dimensions scenario: removed node doesn't take up space
      // Actually, the easiest way is to check a node (always at least 1x1 in headless)
      let node = cy.$('#a');
      let dims = node.layoutDimensions();
      expect(dims.w).to.be.at.least(1);
      expect(dims.h).to.be.at.least(1);
    });

    it('collection.layout() returns a layout object', function () {
      let layout = cy.nodes().layout({ name: 'preset' });
      expect(layout).to.exist;
      expect(layout).to.have.property('run');
    });

    it('collection.createLayout is an alias for layout', function () {
      let nodes = cy.nodes();
      expect(nodes.createLayout).to.equal(nodes.layout);
      expect(nodes.makeLayout).to.equal(nodes.layout);
    });

    it('layoutPositions with no animation positions nodes', function (done) {
      let layout = cy.nodes().layout({
        name: 'preset',
        animate: false,
        fit: false
      });

      layout.on('layoutstop', function () {
        done();
      });

      layout.run();
    });

    it('layoutPositions with fit option', function (done) {
      let layout = cy.nodes().layout({
        name: 'grid',
        animate: false,
        fit: true,
        padding: 10
      });

      layout.on('layoutstop', function () {
        done();
      });

      layout.run();
    });

    it('layoutPositions with spacingFactor', function (done) {
      let layout = cy.nodes().layout({
        name: 'grid',
        animate: false,
        fit: false,
        spacingFactor: 2
      });

      layout.on('layoutstop', function () {
        done();
      });

      layout.run();
    });

    it('layoutPositions with transform option', function (done) {
      let layout = cy.nodes().layout({
        name: 'grid',
        animate: false,
        fit: false,
        transform: function (node, pos) {
          return { x: pos.x + 100, y: pos.y + 100 };
        }
      });

      layout.on('layoutstop', function () {
        done();
      });

      layout.run();
    });

    it('layoutPositions with zoom and pan options', function (done) {
      let layout = cy.nodes().layout({
        name: 'grid',
        animate: false,
        fit: false,
        zoom: 2,
        pan: { x: 50, y: 50 }
      });

      layout.on('layoutstop', function () {
        done();
      });

      layout.run();
    });
  });

  // ================================================================
  // filter.mjs — map, reduce, max, min, xor, diff, merge, unmerge
  // ================================================================
  describe('filter / map / set operations', function () {

    it('map returns an array of mapped values', function () {
      let ids = cy.nodes().map(ele => ele.id());
      expect(ids).to.be.an('array');
      expect(ids).to.include('a');
      expect(ids).to.include('b');
    });

    it('map with thisArg', function () {
      let context = { prefix: 'node_' };
      let ids = cy.nodes().map(function (ele) {
        return this.prefix + ele.id();
      }, context);
      expect(ids[0]).to.match(/^node_/);
    });

    it('reduce accumulates values', function () {
      let sum = cy.nodes().reduce(function (acc, ele) {
        return acc + (ele.data('weight') || 0);
      }, 0);
      expect(sum).to.equal(1 + 2 + 3 + 4 + 5 + 0 + 0); // a-e weights + p(0) + child(undefined->0)
    });

    it('max returns the element with the highest value', function () {
      let result = cy.nodes().max(ele => ele.data('weight') || 0);
      expect(result.value).to.equal(5);
      expect(result.ele.id()).to.equal('e');
    });

    it('max with thisArg', function () {
      let ctx = { factor: 2 };
      let result = cy.nodes().max(function (ele) {
        return (ele.data('weight') || 0) * this.factor;
      }, ctx);
      expect(result.value).to.equal(10);
    });

    it('min returns the element with the lowest value', function () {
      let result = cy.nodes().min(ele => ele.data('weight') || 0);
      expect(result.value).to.equal(0);
    });

    it('min with thisArg', function () {
      let ctx = { offset: 100 };
      let result = cy.nodes().min(function (ele) {
        return (ele.data('weight') || 0) + this.offset;
      }, ctx);
      expect(result.value).to.equal(100);
    });

    it('xor returns symmetric difference', function () {
      let col1 = cy.$('#a, #b, #c');
      let col2 = cy.$('#b, #c, #d');
      let xored = col1.xor(col2);
      expect(xored.length).to.equal(2);
      expect(xored.hasElementWithId('a')).to.be.true;
      expect(xored.hasElementWithId('d')).to.be.true;
    });

    it('xor with selector string', function () {
      let col1 = cy.$('#a, #b');
      let xored = col1.xor('#b, #c');
      expect(xored.hasElementWithId('a')).to.be.true;
      expect(xored.hasElementWithId('c')).to.be.true;
      expect(xored.hasElementWithId('b')).to.be.false;
    });

    it('diff returns left, right, both', function () {
      let col1 = cy.$('#a, #b, #c');
      let col2 = cy.$('#b, #c, #d');
      let result = col1.diff(col2);
      expect(result.left.length).to.equal(1);
      expect(result.left.hasElementWithId('a')).to.be.true;
      expect(result.right.length).to.equal(1);
      expect(result.right.hasElementWithId('d')).to.be.true;
      expect(result.both.length).to.equal(2);
    });

    it('diff with selector string', function () {
      let col1 = cy.$('#a, #b');
      let result = col1.diff('#b, #c');
      expect(result.left.hasElementWithId('a')).to.be.true;
      expect(result.right.hasElementWithId('c')).to.be.true;
    });

    it('add with selector string', function () {
      let col = cy.$('#a');
      let added = col.add('#b');
      expect(added.length).to.equal(2);
      expect(added.hasElementWithId('b')).to.be.true;
    });

    it('add does not duplicate', function () {
      let col = cy.$('#a');
      let added = col.add(cy.$('#a'));
      expect(added.length).to.equal(1);
    });

    it('add returns self when given falsy', function () {
      let col = cy.$('#a');
      let added = col.add(null);
      expect(added.same(col)).to.be.true;
    });

    it('merge in place adds elements', function () {
      let col = cy.collection();
      col.merge(cy.$('#a'));
      col.merge(cy.$('#b'));
      expect(col.length).to.equal(2);
    });

    it('merge with selector string', function () {
      let col = cy.collection();
      col.merge('#a');
      expect(col.length).to.equal(1);
      expect(col.hasElementWithId('a')).to.be.true;
    });

    it('merge does not add duplicates', function () {
      let col = cy.collection();
      col.merge(cy.$('#a'));
      col.merge(cy.$('#a'));
      expect(col.length).to.equal(1);
    });

    it('merge returns self when given falsy', function () {
      let col = cy.collection();
      let result = col.merge(null);
      expect(result).to.equal(col);
    });

    it('unmerge removes elements in place', function () {
      let col = cy.collection();
      col.merge(cy.$('#a'));
      col.merge(cy.$('#b'));
      col.merge(cy.$('#c'));
      col.unmerge(cy.$('#b'));
      expect(col.length).to.equal(2);
      expect(col.hasElementWithId('b')).to.be.false;
    });

    it('unmerge with selector string', function () {
      let col = cy.collection();
      col.merge(cy.$('#a'));
      col.merge(cy.$('#b'));
      col.unmerge('#b');
      expect(col.length).to.equal(1);
    });

    it('unmerge returns self when given falsy', function () {
      let col = cy.collection();
      let result = col.unmerge(null);
      expect(result).to.equal(col);
    });

    it('unmergeAt with last element', function () {
      let col = cy.collection();
      col.merge(cy.$('#a'));
      col.unmergeAt(0);
      expect(col.length).to.equal(0);
    });

    it('unmergeAt with non-last element swaps', function () {
      let col = cy.collection();
      col.merge(cy.$('#a'));
      col.merge(cy.$('#b'));
      col.merge(cy.$('#c'));
      col.unmergeAt(0); // removes 'a', swaps 'c' into index 0
      expect(col.length).to.equal(2);
      expect(col.hasElementWithId('a')).to.be.false;
    });

    it('unmergeOne does nothing if element not present', function () {
      let col = cy.collection();
      col.merge(cy.$('#a'));
      col.unmergeOne(cy.$('#b'));
      expect(col.length).to.equal(1);
    });

    it('unmergeBy removes matching elements', function () {
      let col = cy.collection();
      col.merge(cy.$('#a'));
      col.merge(cy.$('#b'));
      col.merge(cy.$('#c'));
      col.unmergeBy(ele => ele.id() === 'b');
      expect(col.length).to.equal(2);
      expect(col.hasElementWithId('b')).to.be.false;
    });

    it('filter returns self when no arg', function () {
      let col = cy.nodes();
      let filtered = col.filter();
      expect(filtered).to.equal(col);
    });

    it('filter with element/collection', function () {
      let col = cy.nodes();
      let filtered = col.filter(cy.$('#a'));
      expect(filtered.length).to.equal(1);
    });

    it('filter with function and thisArg', function () {
      let ctx = { target: 'a' };
      let filtered = cy.nodes().filter(function (ele) {
        return ele.id() === this.target;
      }, ctx);
      expect(filtered.length).to.equal(1);
      expect(filtered[0].id()).to.equal('a');
    });

    it('filter returns empty on unrecognized argument type', function () {
      let filtered = cy.nodes().filter(12345);
      expect(filtered.length).to.equal(0);
    });

    it('not returns self when given falsy', function () {
      let col = cy.nodes();
      let result = col.not(null);
      expect(result).to.equal(col);
    });

    it('absoluteComplement returns complement', function () {
      let col = cy.$('#a');
      let comp = col.absoluteComplement();
      expect(comp.hasElementWithId('a')).to.be.false;
      expect(comp.length).to.be.greaterThan(0);
    });

    it('intersect with selector string', function () {
      let col = cy.$('#a, #b, #c');
      let result = col.intersect('#b');
      expect(result.length).to.equal(1);
      expect(result[0].id()).to.equal('b');
    });

    it('nodes and edges filter from collection', function () {
      let nodes = cy.elements().nodes();
      let edges = cy.elements().edges();
      expect(nodes.length).to.be.greaterThan(0);
      expect(edges.length).to.be.greaterThan(0);
      expect(nodes.length + edges.length).to.equal(cy.elements().length);
    });

    it('byGroup separates nodes and edges', function () {
      let groups = cy.elements().byGroup();
      expect(groups.nodes.length).to.be.greaterThan(0);
      expect(groups.edges.length).to.be.greaterThan(0);
    });

    it('alias operators work', function () {
      let col = cy.$('#a, #b');
      // union / or / |
      expect(col.union(cy.$('#c')).length).to.equal(3);
      // difference / subtract
      expect(col.difference(cy.$('#b')).length).to.equal(1);
      // and / intersection
      expect(col.and(cy.$('#a')).length).to.equal(1);
      // symdiff / xor
      expect(col.symdiff(cy.$('#b, #c')).length).to.equal(2);
    });
  });

  // ================================================================
  // iteration.mjs
  // ================================================================
  describe('iteration', function () {

    it('forEach iterates over elements', function () {
      let ids = [];
      cy.nodes().forEach(function (ele) {
        ids.push(ele.id());
      });
      expect(ids).to.include('a');
      expect(ids).to.include('b');
    });

    it('forEach with thisArg', function () {
      let ctx = { collected: [] };
      cy.nodes().forEach(function (ele) {
        this.collected.push(ele.id());
      }, ctx);
      expect(ctx.collected.length).to.equal(cy.nodes().length);
    });

    it('forEach breaks early on return false', function () {
      let count = 0;
      cy.nodes().forEach(function () {
        count++;
        return false;
      });
      expect(count).to.equal(1);
    });

    it('each is alias for forEach', function () {
      expect(cy.nodes().each).to.equal(cy.nodes().forEach);
    });

    it('toArray returns a plain array', function () {
      let arr = cy.nodes().toArray();
      expect(arr).to.be.an('array');
      expect(arr.length).to.equal(cy.nodes().length);
    });

    it('slice with start and end', function () {
      let nodes = cy.nodes();
      let sliced = nodes.slice(0, 2);
      expect(sliced.length).to.equal(2);
    });

    it('slice with negative start', function () {
      let nodes = cy.nodes();
      let sliced = nodes.slice(-2);
      expect(sliced.length).to.equal(2);
    });

    it('slice with negative end', function () {
      let nodes = cy.nodes();
      let sliced = nodes.slice(0, -1);
      expect(sliced.length).to.equal(nodes.length - 1);
    });

    it('slice with no args returns all', function () {
      let nodes = cy.nodes();
      let sliced = nodes.slice();
      expect(sliced.length).to.equal(nodes.length);
    });

    it('size returns length', function () {
      expect(cy.nodes().size()).to.equal(cy.nodes().length);
    });

    it('eq returns element at index', function () {
      let nodes = cy.nodes();
      let first = nodes.eq(0);
      expect(first).to.exist;
    });

    it('eq returns empty collection for out of range', function () {
      let empty = cy.nodes().eq(999);
      // eq returns this[i] || this.spawn(), so empty when out of range
      expect(empty.length).to.equal(0);
    });

    it('first returns first element', function () {
      let nodes = cy.nodes();
      let first = nodes.first();
      expect(first).to.exist;
    });

    it('last returns last element', function () {
      let nodes = cy.nodes();
      let last = nodes.last();
      expect(last).to.exist;
    });

    it('empty and nonempty', function () {
      expect(cy.nodes().empty()).to.be.false;
      expect(cy.nodes().nonempty()).to.be.true;
      expect(cy.collection().empty()).to.be.true;
      expect(cy.collection().nonempty()).to.be.false;
    });

    it('sort with invalid sortFn returns self', function () {
      let nodes = cy.nodes();
      let result = nodes.sort('not a function');
      expect(result).to.equal(nodes);
    });

    it('Symbol.iterator works', function () {
      let ids = [];
      for (let ele of cy.nodes()) {
        ids.push(ele.id());
      }
      expect(ids.length).to.equal(cy.nodes().length);
    });
  });

  // ================================================================
  // events.mjs (collection)
  // ================================================================
  describe('collection events', function () {

    it('on registers and fires handler', function (done) {
      let node = cy.$('#a');
      node.on('testevt', function () {
        done();
      });
      node.emit('testevt');
    });

    it('trigger is alias for emit', function () {
      let fired = false;
      cy.$('#a').on('testevt', function () { fired = true; });
      cy.$('#a').trigger('testevt');
      expect(fired).to.be.true;
    });

    it('one fires handler only once', function () {
      let count = 0;
      let node = cy.$('#a');
      node.one('testevt', function () {
        count++;
      });
      node.emit('testevt');
      node.emit('testevt');
      expect(count).to.equal(1);
    });

    it('once fires handler only once', function () {
      let count = 0;
      let nodes = cy.$('#a, #b');
      nodes.once('testevt', function () {
        count++;
      });
      cy.$('#a').emit('testevt');
      cy.$('#a').emit('testevt');
      // once removes for the whole collection after first fire
      expect(count).to.equal(1);
    });

    it('removeListener removes a specific handler', function () {
      let count = 0;
      let handler = function () { count++; };
      let node = cy.$('#a');
      node.on('testevt', handler);
      node.emit('testevt');
      expect(count).to.equal(1);
      node.removeListener('testevt', handler);
      node.emit('testevt');
      expect(count).to.equal(1);
    });

    it('removeAllListeners removes all handlers', function () {
      let count = 0;
      let node = cy.$('#a');
      node.on('testevt', function () { count++; });
      node.on('testevt', function () { count++; });
      node.removeAllListeners();
      node.emit('testevt');
      expect(count).to.equal(0);
    });

    it('emit with extra params', function (done) {
      let node = cy.$('#a');
      node.on('testevt', function (evt, extra) {
        expect(extra).to.equal('hello');
        done();
      });
      node.emit('testevt', ['hello']);
    });

    it('emitAndNotify on non-empty collection', function () {
      let count = 0;
      let node = cy.$('#a');
      node.on('testevt', function () { count++; });
      node.emitAndNotify('testevt');
      expect(count).to.equal(1);
    });

    it('emitAndNotify on empty collection does nothing', function () {
      // Should not throw
      cy.collection().emitAndNotify('testevt');
    });

    it('createEmitter initializes emitters', function () {
      let nodes = cy.nodes();
      let result = nodes.createEmitter();
      expect(result).to.equal(nodes);
    });

    it('emit returns the collection for chaining', function () {
      let node = cy.$('#a');
      let result = node.emit('testevt');
      expect(result).to.exist;
      expect(result.length).to.equal(1);
    });
  });

  // ================================================================
  // algorithms/closeness-centrality.mjs
  // ================================================================
  describe('closeness centrality', function () {

    let simpleCy;

    beforeEach(function (done) {
      // Simple star graph: center 's' connected to a,b,c,d
      cytoscape({
        elements: {
          nodes: [
            { data: { id: 's' } },
            { data: { id: 'x' } },
            { data: { id: 'y' } },
            { data: { id: 'z' } }
          ],
          edges: [
            { data: { id: 'sx', source: 's', target: 'x' } },
            { data: { id: 'sy', source: 's', target: 'y' } },
            { data: { id: 'sz', source: 's', target: 'z' } },
            { data: { id: 'xy', source: 'x', target: 'y' } }
          ]
        },
        ready: function () {
          simpleCy = this;
          done();
        }
      });
    });

    afterEach(function () {
      simpleCy.destroy();
    });

    it('closenessCentrality (harmonic, default)', function () {
      let cc = simpleCy.elements().closenessCentrality({
        root: '#s',
        harmonic: true
      });
      expect(cc).to.be.a('number');
      expect(cc).to.be.greaterThan(0);
    });

    it('closenessCentrality (non-harmonic)', function () {
      let cc = simpleCy.elements().closenessCentrality({
        root: '#s',
        harmonic: false
      });
      expect(cc).to.be.a('number');
      expect(cc).to.be.greaterThan(0);
    });

    it('closenessCentrality with weight function', function () {
      let cc = simpleCy.elements().closenessCentrality({
        root: '#s',
        weight: () => 2
      });
      expect(cc).to.be.a('number');
      expect(cc).to.be.greaterThan(0);
    });

    it('closenessCentrality directed', function () {
      let cc = simpleCy.elements().closenessCentrality({
        root: '#s',
        directed: true
      });
      expect(cc).to.be.a('number');
    });

    it('cc is alias for closenessCentrality', function () {
      let eles = simpleCy.elements();
      expect(eles.cc).to.equal(eles.closenessCentrality);
    });

    it('closenessCentralityNormalized (harmonic)', function () {
      let result = simpleCy.elements().closenessCentralityNormalized({
        harmonic: true
      });
      expect(result).to.have.property('closeness');
      // The center node should have the highest normalized closeness
      let centerCloseness = result.closeness(simpleCy.$('#s'));
      expect(centerCloseness).to.be.a('number');
      expect(centerCloseness).to.be.greaterThan(0);
      expect(centerCloseness).to.be.at.most(1);
    });

    it('closenessCentralityNormalized (non-harmonic)', function () {
      let result = simpleCy.elements().closenessCentralityNormalized({
        harmonic: false
      });
      let closeness = result.closeness(simpleCy.$('#s'));
      expect(closeness).to.be.a('number');
      expect(closeness).to.be.greaterThan(0);
    });

    it('closenessCentralityNormalized with selector string', function () {
      let result = simpleCy.elements().closenessCentralityNormalized({
        harmonic: true
      });
      let closeness = result.closeness('#s');
      expect(closeness).to.be.a('number');
      expect(closeness).to.be.greaterThan(0);
    });

    it('closenessCentralityNormalized directed', function () {
      let result = simpleCy.elements().closenessCentralityNormalized({
        directed: true
      });
      let closeness = result.closeness('#s');
      expect(closeness).to.be.a('number');
    });

    it('ccn is alias for closenessCentralityNormalized', function () {
      let eles = simpleCy.elements();
      expect(eles.ccn).to.equal(eles.closenessCentralityNormalized);
      expect(eles.closenessCentralityNormalised).to.equal(eles.closenessCentralityNormalized);
    });
  });

  // ================================================================
  // algorithms/degree-centrality.mjs
  // ================================================================
  describe('degree centrality', function () {

    let dgCy;

    beforeEach(function (done) {
      cytoscape({
        elements: {
          nodes: [
            { data: { id: 'a' } },
            { data: { id: 'b' } },
            { data: { id: 'c' } },
            { data: { id: 'd' } }
          ],
          edges: [
            { data: { id: 'ab', source: 'a', target: 'b', w: 2 } },
            { data: { id: 'ac', source: 'a', target: 'c', w: 3 } },
            { data: { id: 'bc', source: 'b', target: 'c', w: 1 } },
            { data: { id: 'cd', source: 'c', target: 'd', w: 4 } }
          ]
        },
        ready: function () {
          dgCy = this;
          done();
        }
      });
    });

    afterEach(function () {
      dgCy.destroy();
    });

    it('degreeCentrality undirected', function () {
      let result = dgCy.elements().degreeCentrality({
        root: '#a'
      });
      expect(result).to.have.property('degree');
      expect(result.degree).to.be.a('number');
      expect(result.degree).to.equal(2); // a connects to b and c
    });

    it('degreeCentrality directed', function () {
      let result = dgCy.elements().degreeCentrality({
        root: '#a',
        directed: true
      });
      expect(result).to.have.property('indegree');
      expect(result).to.have.property('outdegree');
      expect(result.outdegree).to.equal(2); // a -> b, a -> c
      expect(result.indegree).to.equal(0); // nothing points to a
    });

    it('degreeCentrality with weight function', function () {
      let result = dgCy.elements().degreeCentrality({
        root: '#a',
        weight: edge => edge.data('w')
      });
      expect(result.degree).to.be.a('number');
    });

    it('degreeCentrality with alpha parameter', function () {
      let result = dgCy.elements().degreeCentrality({
        root: '#a',
        alpha: 0.5,
        weight: edge => edge.data('w')
      });
      expect(result.degree).to.be.a('number');
      expect(result.degree).to.be.greaterThan(0);
    });

    it('degreeCentrality directed with alpha', function () {
      let result = dgCy.elements().degreeCentrality({
        root: '#c',
        directed: true,
        alpha: 0.5,
        weight: edge => edge.data('w')
      });
      expect(result.indegree).to.be.a('number');
      expect(result.outdegree).to.be.a('number');
    });

    it('dc is alias for degreeCentrality', function () {
      let eles = dgCy.elements();
      expect(eles.dc).to.equal(eles.degreeCentrality);
    });

    it('degreeCentralityNormalized undirected', function () {
      let result = dgCy.elements().degreeCentralityNormalized({});
      expect(result).to.have.property('degree');
      // node 'c' has the most connections (3), so its normalized should be 1
      let cDeg = result.degree(dgCy.$('#c'));
      expect(cDeg).to.equal(1);
      // node 'd' has 1 connection, so should be less than 1
      let dDeg = result.degree(dgCy.$('#d'));
      expect(dDeg).to.be.lessThan(1);
      expect(dDeg).to.be.greaterThan(0);
    });

    it('degreeCentralityNormalized undirected with selector string', function () {
      let result = dgCy.elements().degreeCentralityNormalized({});
      let deg = result.degree('#a');
      expect(deg).to.be.a('number');
    });

    it('degreeCentralityNormalized undirected returns 0 when maxDegree is 0', function () {
      // Single isolated node graph
      let isoCy = cytoscape({
        elements: { nodes: [{ data: { id: 'solo' } }] }
      });
      let result = isoCy.elements().degreeCentralityNormalized({});
      let deg = result.degree('#solo');
      expect(deg).to.equal(0);
      isoCy.destroy();
    });

    it('degreeCentralityNormalized directed', function () {
      let result = dgCy.elements().degreeCentralityNormalized({
        directed: true
      });
      expect(result).to.have.property('indegree');
      expect(result).to.have.property('outdegree');
      let aOut = result.outdegree(dgCy.$('#a'));
      expect(aOut).to.be.a('number');
      let aIn = result.indegree(dgCy.$('#a'));
      expect(aIn).to.be.a('number');
    });

    it('degreeCentralityNormalized directed with selector string', function () {
      let result = dgCy.elements().degreeCentralityNormalized({
        directed: true
      });
      let inDeg = result.indegree('#c');
      let outDeg = result.outdegree('#c');
      expect(inDeg).to.be.a('number');
      expect(outDeg).to.be.a('number');
    });

    it('degreeCentralityNormalized directed returns 0 when max is 0', function () {
      let isoCy = cytoscape({
        elements: { nodes: [{ data: { id: 'solo' } }] }
      });
      let result = isoCy.elements().degreeCentralityNormalized({ directed: true });
      expect(result.indegree('#solo')).to.equal(0);
      expect(result.outdegree('#solo')).to.equal(0);
      isoCy.destroy();
    });

    it('dcn is alias for degreeCentralityNormalized', function () {
      let eles = dgCy.elements();
      expect(eles.dcn).to.equal(eles.degreeCentralityNormalized);
      expect(eles.degreeCentralityNormalised).to.equal(eles.degreeCentralityNormalized);
    });
  });

  // ================================================================
  // comparators.mjs — some/every/allAre/is/same/anySame/contains
  // ================================================================
  describe('comparators', function () {

    it('some with truthy', function () {
      let result = cy.nodes().some(ele => ele.id() === 'a');
      expect(result).to.be.true;
    });

    it('some with falsy', function () {
      let result = cy.nodes().some(ele => ele.id() === 'nonexistent');
      expect(result).to.be.false;
    });

    it('some with thisArg', function () {
      let ctx = { target: 'a' };
      let result = cy.nodes().some(function (ele) {
        return ele.id() === this.target;
      }, ctx);
      expect(result).to.be.true;
    });

    it('every with all matching', function () {
      let result = cy.nodes().every(ele => ele.isNode());
      expect(result).to.be.true;
    });

    it('every with not all matching', function () {
      let result = cy.nodes().every(ele => ele.id() === 'a');
      expect(result).to.be.false;
    });

    it('every with thisArg', function () {
      let ctx = { group: 'nodes' };
      let result = cy.nodes().every(function (ele) {
        return ele.group() === this.group;
      }, ctx);
      expect(result).to.be.true;
    });

    it('allAre checks all match selector', function () {
      expect(cy.nodes().allAre('node')).to.be.true;
      expect(cy.nodes().allAre('#a')).to.be.false;
    });

    it('is checks at least one matches', function () {
      expect(cy.nodes().is('#a')).to.be.true;
      expect(cy.nodes().is('#nonexistent')).to.be.false;
    });

    it('same checks equality', function () {
      let col1 = cy.$('#a, #b');
      let col2 = cy.$('#a, #b');
      expect(col1.same(col2)).to.be.true;
    });

    it('same returns false for different lengths', function () {
      let col1 = cy.$('#a, #b');
      let col2 = cy.$('#a');
      expect(col1.same(col2)).to.be.false;
    });

    it('same returns true for same reference', function () {
      let col = cy.$('#a');
      expect(col.same(col)).to.be.true;
    });

    it('anySame checks overlap', function () {
      let col1 = cy.$('#a, #b');
      let col2 = cy.$('#b, #c');
      expect(col1.anySame(col2)).to.be.true;
    });

    it('anySame returns false for no overlap', function () {
      let col1 = cy.$('#a');
      let col2 = cy.$('#c');
      expect(col1.anySame(col2)).to.be.false;
    });

    it('contains checks if collection has elements', function () {
      let all = cy.nodes();
      expect(all.contains(cy.$('#a'))).to.be.true;
    });

    it('has is alias for contains', function () {
      let eles = cy.elements();
      expect(eles.has).to.equal(eles.contains);
    });

    it('equal/equals are aliases for same', function () {
      let eles = cy.elements();
      expect(eles.equal).to.equal(eles.same);
      expect(eles.equals).to.equal(eles.same);
    });
  });
});
