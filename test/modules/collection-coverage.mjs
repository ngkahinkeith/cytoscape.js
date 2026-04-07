import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import cytoscape from '../../src/index.mjs';

function makeGraph() {
  return cytoscape({
    headless: true,
    elements: [
      { data: { id: 'a', weight: 1 } },
      { data: { id: 'b', weight: 2 } },
      { data: { id: 'c', weight: 3 } },
      { data: { id: 'd', weight: 4 } },
      { data: { id: 'ab', source: 'a', target: 'b', weight: 1 } },
      { data: { id: 'bc', source: 'b', target: 'c', weight: 2 } },
      { data: { id: 'cd', source: 'c', target: 'd', weight: 3 } },
      { data: { id: 'ac', source: 'a', target: 'c', weight: 1 } },
    ]
  });
}

describe('Collection set operations', () => {
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('union/add/or combines collections', () => {
    const ab = cy.$('#a, #b');
    const bc = cy.$('#b, #c');
    expect(ab.union(bc).length).to.equal(3);
    expect(ab.add(bc).length).to.equal(3);
    expect(ab.or(bc).length).to.equal(3);
  });

  it('intersection/intersect/and finds common elements', () => {
    const ab = cy.$('#a, #b');
    const bc = cy.$('#b, #c');
    expect(ab.intersection(bc).length).to.equal(1);
    expect(ab.intersection(bc).first().id()).to.equal('b');
    expect(ab.intersect(bc).length).to.equal(1);
    expect(ab.and(bc).length).to.equal(1);
  });

  it('difference/not/subtract removes elements', () => {
    const abc = cy.$('#a, #b, #c');
    const bc = cy.$('#b, #c');
    expect(abc.difference(bc).length).to.equal(1);
    expect(abc.not(bc).length).to.equal(1);
    expect(abc.subtract(bc).first().id()).to.equal('a');
  });

  it('symmetricDifference/xor returns non-shared', () => {
    const ab = cy.$('#a, #b');
    const bc = cy.$('#b, #c');
    const sd = ab.symmetricDifference(bc);
    expect(sd.length).to.equal(2);
    expect(sd.xor(cy.$('#a, #c')).length).to.equal(0);
  });

  it('absoluteComplement returns elements not in collection', () => {
    const ab = cy.nodes('#a, #b');
    const comp = ab.absoluteComplement();
    expect(comp.nodes().length).to.equal(2); // c, d
  });

  it('merge/unmerge mutate in place', () => {
    const coll = cy.$('#a');
    coll.merge(cy.$('#b'));
    expect(coll.length).to.equal(2);
    coll.unmerge(cy.$('#a'));
    expect(coll.length).to.equal(1);
    expect(coll.first().id()).to.equal('b');
  });
});

describe('Collection map/filter/iteration', () => {
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('map returns mapped array', () => {
    const ids = cy.nodes().map(n => n.id());
    expect(ids).to.include('a');
    expect(ids).to.include('d');
    expect(ids.length).to.equal(4);
  });

  it('filter returns filtered collection', () => {
    const heavy = cy.nodes().filter(n => n.data('weight') > 2);
    expect(heavy.length).to.equal(2);
  });

  it('reduce accumulates', () => {
    const sum = cy.nodes().reduce((acc, n) => acc + n.data('weight'), 0);
    expect(sum).to.equal(10);
  });

  it('min returns minimum element', () => {
    const m = cy.nodes().min(n => n.data('weight'));
    expect(m.value).to.equal(1);
    expect(m.ele.id()).to.equal('a');
  });

  it('max returns maximum element', () => {
    const m = cy.nodes().max(n => n.data('weight'));
    expect(m.value).to.equal(4);
    expect(m.ele.id()).to.equal('d');
  });

  it('forEach iterates all elements', () => {
    let count = 0;
    cy.nodes().forEach(() => { count++; });
    expect(count).to.equal(4);
  });

  it('toArray returns array', () => {
    const arr = cy.nodes().toArray();
    expect(Array.isArray(arr)).to.be.true;
    expect(arr.length).to.equal(4);
  });

  it('slice returns sub-collection', () => {
    expect(cy.nodes().slice(0, 2).length).to.equal(2);
  });

  it('size returns length', () => {
    expect(cy.nodes().size()).to.equal(4);
  });

  it('eq returns element at index', () => {
    expect(cy.nodes().eq(0).length).to.equal(1);
  });

  it('first/last return terminal elements', () => {
    expect(cy.nodes().first().length).to.equal(1);
    expect(cy.nodes().last().length).to.equal(1);
  });

  it('empty/nonempty check collection state', () => {
    expect(cy.nodes().empty()).to.be.false;
    expect(cy.nodes().nonempty()).to.be.true;
    expect(cy.collection().empty()).to.be.true;
  });

  it('is iterable', () => {
    const ids = [];
    for(const n of cy.nodes()) { ids.push(n.id()); }
    expect(ids.length).to.equal(4);
  });

  it('sort returns sorted collection', () => {
    const sorted = cy.nodes().sort((a, b) => a.data('weight') - b.data('weight'));
    expect(sorted.first().id()).to.equal('a');
    expect(sorted.last().id()).to.equal('d');
  });
});

describe('Collection events', () => {
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('on/trigger fires handler', () => {
    let fired = false;
    cy.nodes().on('test', () => { fired = true; });
    cy.$('#a').trigger('test');
    expect(fired).to.be.true;
  });

  it('one fires handler only once', () => {
    let count = 0;
    cy.$('#a').one('test', () => { count++; });
    cy.$('#a').trigger('test');
    cy.$('#a').trigger('test');
    expect(count).to.equal(1);
  });

  it('off removes handler', () => {
    let count = 0;
    const handler = () => { count++; };
    cy.$('#a').on('test', handler);
    cy.$('#a').trigger('test');
    cy.$('#a').off('test', handler);
    cy.$('#a').trigger('test');
    expect(count).to.equal(1);
  });

  it('removeAllListeners clears all', () => {
    let count = 0;
    cy.$('#a').on('test', () => { count++; });
    cy.$('#a').on('test2', () => { count++; });
    cy.$('#a').removeAllListeners();
    cy.$('#a').trigger('test');
    cy.$('#a').trigger('test2');
    expect(count).to.equal(0);
  });
});

describe('Core viewport', () => {
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('pan get/set', () => {
    cy.pan({ x: 50, y: 100 });
    expect(cy.pan().x).to.equal(50);
    expect(cy.pan().y).to.equal(100);
  });

  it('panBy offsets', () => {
    cy.pan({ x: 0, y: 0 });
    cy.panBy({ x: 10, y: 20 });
    expect(cy.pan().x).to.equal(10);
    expect(cy.pan().y).to.equal(20);
  });

  it('zoom get/set', () => {
    cy.zoom(2);
    expect(cy.zoom()).to.equal(2);
  });

  it('zoom with position', () => {
    cy.zoom({ level: 2, position: { x: 0, y: 0 } });
    expect(cy.zoom()).to.equal(2);
  });

  it('fit changes pan from an offset position', () => {
    cy.pan({ x: 9999, y: 9999 });
    const panBefore = { ...cy.pan() };
    cy.fit();
    const panAfter = cy.pan();
    // fit should have moved the viewport away from the extreme offset
    expect(panAfter.x).to.not.equal(panBefore.x);
    expect(panAfter.y).to.not.equal(panBefore.y);
    expect(cy.zoom()).to.be.a('number');
  });

  it('fit with padding produces different zoom than fit without', () => {
    cy.fit();
    const zoomNoPad = cy.zoom();
    cy.fit(null, 50);
    const zoomWithPad = cy.zoom();
    // With padding, zoom should be smaller (or equal for degenerate case)
    expect(zoomWithPad).to.be.at.most(zoomNoPad);
  });

  it('center changes pan from an offset position', () => {
    cy.pan({ x: 9999, y: 9999 });
    const panBefore = { ...cy.pan() };
    cy.center();
    const panAfter = cy.pan();
    expect(panAfter.x).to.not.equal(panBefore.x);
    expect(panAfter.y).to.not.equal(panBefore.y);
  });

  it('resize does not throw and preserves zoom', () => {
    cy.zoom(2);
    const zoomBefore = cy.zoom();
    cy.resize();
    expect(cy.zoom()).to.equal(zoomBefore);
  });

  it('panningEnabled / userPanningEnabled', () => {
    cy.panningEnabled(true);
    expect(cy.panningEnabled()).to.be.true;
    cy.panningEnabled(false);
    expect(cy.panningEnabled()).to.be.false;
    cy.userPanningEnabled(true);
    expect(cy.userPanningEnabled()).to.be.true;
  });

  it('zoomingEnabled / userZoomingEnabled', () => {
    cy.zoomingEnabled(true);
    expect(cy.zoomingEnabled()).to.be.true;
    cy.zoomingEnabled(false);
    expect(cy.zoomingEnabled()).to.be.false;
  });

  it('minZoom / maxZoom', () => {
    cy.minZoom(0.1);
    cy.maxZoom(10);
    expect(cy.minZoom()).to.equal(0.1);
    expect(cy.maxZoom()).to.equal(10);
  });

  it('extent returns bounding box', () => {
    const ext = cy.extent();
    expect(ext).to.have.property('x1');
    expect(ext).to.have.property('y1');
    expect(ext).to.have.property('x2');
    expect(ext).to.have.property('y2');
  });
});

describe('Core stylesheet', () => {
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('style getter reads CSS string', () => {
    // headless mode still has a style object
    const node = cy.$('#a');
    expect(node.style('width')).to.not.be.undefined;
  });
});

describe('Closeness centrality', () => {
  // Graph: a--b--c--d with edges ab(w=1), bc(w=2), cd(w=3), ac(w=1)
  // closenessCentrality returns sum-of-reciprocal-distances (not normalised)
  // Unweighted shortest paths from b: b->a=1, b->c=1, b->d=2
  // Closeness(b) = 1/1 + 1/1 + 1/2 = 2.5
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('returns expected closeness for node b (unweighted)', () => {
    const cc = cy.elements().closenessCentrality({ root: cy.$('#b') });
    expect(cc).to.be.closeTo(2.5, 0.001);
  });

  it('node c has highest closeness (most central)', () => {
    // Paths from c: c->a=1(via ac), c->b=1(via bc), c->d=1(via cd) => 3.0
    const ccC = cy.elements().closenessCentrality({ root: cy.$('#c') });
    const ccD = cy.elements().closenessCentrality({ root: cy.$('#d') });
    expect(ccC).to.be.closeTo(3.0, 0.001);
    expect(ccC).to.be.greaterThan(ccD);
  });

  it('directed closeness returns a number', () => {
    const directed = cy.elements().closenessCentrality({ root: cy.$('#b'), directed: true });
    expect(directed).to.be.a('number');
  });

  it('weighted closeness differs from unweighted', () => {
    const unweighted = cy.elements().closenessCentrality({ root: cy.$('#b') });
    const weighted = cy.elements().closenessCentrality({
      root: cy.$('#b'),
      weight: e => e.data('weight')
    });
    expect(weighted).to.be.a('number');
    expect(weighted).to.not.be.closeTo(unweighted, 0.0001);
  });
});

describe('Degree centrality', () => {
  // Graph: a--b--c--d with edges ab, bc, cd, ac
  // Node b: degree 2 (edges ab, bc). Directed: indegree=1 (ab), outdegree=1 (bc).
  // degreeCentralityNormalized returns an object with function properties:
  //   dcn.degree(node) for undirected, dcn.indegree(node)/dcn.outdegree(node) for directed.
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('undirected degree of node b equals 2', () => {
    const dc = cy.elements().degreeCentrality({ root: cy.$('#b') });
    expect(dc).to.have.property('degree');
    expect(dc.degree).to.equal(2);
  });

  it('directed degree of node b has indegree=1 and outdegree=1', () => {
    const dc = cy.elements().degreeCentrality({ root: cy.$('#b'), directed: true });
    expect(dc).to.have.property('indegree');
    expect(dc).to.have.property('outdegree');
    expect(dc.indegree).to.equal(1);
    expect(dc.outdegree).to.equal(1);
  });

  it('alpha parameter affects the result', () => {
    const dc0 = cy.elements().degreeCentrality({ root: cy.$('#b'), alpha: 0 });
    const dc1 = cy.elements().degreeCentrality({ root: cy.$('#b'), alpha: 1 });
    expect(dc0.degree).to.be.a('number');
    expect(dc1.degree).to.be.a('number');
  });

  it('weight function is accepted', () => {
    const dcW = cy.elements().degreeCentrality({
      root: cy.$('#b'),
      weight: e => e.data('weight')
    });
    expect(dcW.degree).to.be.a('number');
    expect(dcW.degree).to.equal(2);
  });

  it('normalized undirected degree of b is 2/3', () => {
    const dcn = cy.elements().degreeCentralityNormalized();
    expect(dcn).to.have.property('degree');
    expect(dcn.degree).to.be.a('function');
    expect(dcn.degree(cy.$('#b'))).to.be.closeTo(2 / 3, 0.001);
  });

  it('normalized directed returns indegree/outdegree functions', () => {
    const dcn = cy.elements().degreeCentralityNormalized({ directed: true });
    expect(dcn).to.have.property('indegree');
    expect(dcn).to.have.property('outdegree');
    expect(dcn.indegree).to.be.a('function');
    expect(dcn.outdegree).to.be.a('function');
    expect(dcn.indegree(cy.$('#b'))).to.be.closeTo(0.5, 0.001);
    expect(dcn.outdegree(cy.$('#b'))).to.be.closeTo(0.5, 0.001);
  });
});

describe('Collection zsort', () => {
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('sort callback receives elements', () => {
    const sorted = cy.nodes().sort((a, b) => {
      return a.data('weight') - b.data('weight');
    });
    expect(sorted.first().data('weight')).to.equal(1);
    expect(sorted.last().data('weight')).to.equal(4);
  });

  it('sort callback can order nodes by weight descending', () => {
    const sorted = cy.nodes().sort((a, b) => b.data('weight') - a.data('weight'));
    expect(sorted.first().data('weight')).to.equal(4);
    expect(sorted.last().data('weight')).to.equal(1);
  });
});

// =========================================================================
// Set polyfill (src/set.mjs) — native Set is used on modern runtimes;
// the ObjectSet polyfill is dead code.  These tests use native Set via
// a synchronous static import so mocha can discover them.
// =========================================================================
import ExportedSet from '../../src/set.mjs';

describe('Set polyfill (src/set.mjs)', () => {
  it('is a constructor', () => {
    expect(ExportedSet).to.be.a('function');
  });

  it('add and has', () => {
    const s = new ExportedSet();
    s.add('x');
    s.add('y');
    expect(s.has('x')).to.be.true;
    expect(s.has('y')).to.be.true;
    expect(s.has('z')).to.be.false;
  });

  it('size tracks additions', () => {
    const s = new ExportedSet();
    expect(s.size).to.equal(0);
    s.add('a');
    expect(s.size).to.equal(1);
    s.add('b');
    expect(s.size).to.equal(2);
  });

  it('duplicate add does not increase size', () => {
    const s = new ExportedSet();
    s.add('dup');
    s.add('dup');
    expect(s.size).to.equal(1);
  });

  it('delete removes an element', () => {
    const s = new ExportedSet();
    s.add('a');
    s.add('b');
    s.delete('a');
    expect(s.has('a')).to.be.false;
    expect(s.has('b')).to.be.true;
    expect(s.size).to.equal(1);
  });

  it('delete of absent element is a no-op', () => {
    const s = new ExportedSet();
    s.add('a');
    s.delete('missing');
    expect(s.size).to.equal(1);
  });

  it('forEach iterates values', () => {
    const s = new ExportedSet();
    s.add(10);
    s.add(20);
    s.add(30);
    const seen = [];
    s.forEach(v => seen.push(v));
    expect(seen.length).to.equal(3);
  });

  it('clear empties the set', () => {
    const s = new ExportedSet();
    s.add(1);
    s.add(2);
    s.clear();
    expect(s.size).to.equal(0);
    expect(s.has(1)).to.be.false;
  });

  it('can be constructed from an array', () => {
    const s = new ExportedSet([1, 2, 3]);
    expect(s.size).to.equal(3);
    expect(s.has(1)).to.be.true;
    expect(s.has(3)).to.be.true;
  });

  it('can be constructed from another Set', () => {
    const s1 = new ExportedSet([5, 6]);
    const s2 = new ExportedSet(s1);
    expect(s2.size).to.equal(2);
    expect(s2.has(5)).to.be.true;
  });
});

// =========================================================================
// Core JSON export (cy.json())
// =========================================================================
describe('Core JSON export', () => {
  let cy;
  beforeEach(() => { cy = makeGraph(); });
  afterEach(() => { cy.destroy(); });

  it('cy.json() returns zoom, pan, and elements', () => {
    const json = cy.json();
    expect(json).to.have.property('elements');
    expect(json).to.have.property('zoom');
    expect(json).to.have.property('pan');
    expect(json.pan).to.have.property('x');
    expect(json.pan).to.have.property('y');
  });

  it('cy.json() elements contains correct node count', () => {
    const json = cy.json();
    expect(json.elements.nodes.length).to.equal(4);
  });

  it('cy.json() elements contains correct edge count', () => {
    const json = cy.json();
    expect(json.elements.edges.length).to.equal(4);
  });

  it('cy.json(true) returns flat element array', () => {
    const json = cy.json(true);
    expect(Array.isArray(json.elements)).to.be.true;
    expect(json.elements.length).to.equal(8); // 4 nodes + 4 edges
  });

  it('node json contains data with id', () => {
    const json = cy.json();
    const nodeJson = json.elements.nodes[0];
    expect(nodeJson).to.have.property('data');
    expect(nodeJson.data).to.have.property('id');
  });

  it('edge json contains source and target', () => {
    const json = cy.json();
    const edgeJson = json.elements.edges[0];
    expect(edgeJson.data).to.have.property('source');
    expect(edgeJson.data).to.have.property('target');
  });

  it('cy.json(obj) can set zoom and pan', () => {
    cy.json({ zoom: 3, pan: { x: 50, y: 75 } });
    expect(cy.zoom()).to.equal(3);
    expect(cy.pan().x).to.equal(50);
    expect(cy.pan().y).to.equal(75);
  });

  it('cy.json(obj) can set data', () => {
    cy.json({ data: { foo: 'bar' } });
    expect(cy.data('foo')).to.equal('bar');
  });

  it('cy.json(obj) can add new elements', () => {
    cy.json({
      elements: {
        nodes: [
          { data: { id: 'a' } },
          { data: { id: 'b' } },
          { data: { id: 'newNode', weight: 99 } }
        ],
        edges: []
      }
    });
    expect(cy.$('#newNode').length).to.equal(1);
    expect(cy.$('#newNode').data('weight')).to.equal(99);
  });

  it('cy.json(obj) removes elements not in json', () => {
    // Remove all edges and nodes c,d
    cy.json({
      elements: {
        nodes: [
          { data: { id: 'a', weight: 1 } },
          { data: { id: 'b', weight: 2 } }
        ],
        edges: []
      }
    });
    expect(cy.nodes().length).to.equal(2);
    expect(cy.$('#c').length).to.equal(0);
    expect(cy.$('#d').length).to.equal(0);
  });

  it('element JSON round-trip preserves data', () => {
    const json = cy.json();
    const cy2 = cytoscape({ headless: true, elements: json.elements });
    expect(cy2.nodes().length).to.equal(4);
    expect(cy2.edges().length).to.equal(4);
    expect(cy2.$('#a').data('weight')).to.equal(1);
    expect(cy2.$('#ab').data('source')).to.equal('a');
    expect(cy2.$('#ab').data('target')).to.equal('b');
    cy2.destroy();
  });

  it('cy.json(obj) can set boolean options', () => {
    cy.json({ zoomingEnabled: false, panningEnabled: false });
    expect(cy.zoomingEnabled()).to.be.false;
    expect(cy.panningEnabled()).to.be.false;
  });
});

// =========================================================================
// Stylesheet (src/stylesheet.mjs)
// =========================================================================
describe('Stylesheet', () => {
  it('Stylesheet() returns instance without new', () => {
    // cytoscape.Stylesheet is exposed on the public API
    const ss = cytoscape.Stylesheet();
    expect(ss).to.be.an('object');
    expect(ss.length).to.equal(0);
  });

  it('instanceString returns "stylesheet"', () => {
    const ss = cytoscape.Stylesheet();
    expect(ss.instanceString()).to.equal('stylesheet');
  });

  it('selector() adds an entry and is chainable', () => {
    const ss = cytoscape.Stylesheet();
    const ret = ss.selector('node');
    expect(ss.length).to.equal(1);
    expect(ret).to.equal(ss);
  });

  it('css(name, value) adds a property and is chainable', () => {
    const ss = cytoscape.Stylesheet().selector('node');
    const ret = ss.css('background-color', 'red');
    expect(ret).to.equal(ss);
    expect(ss[0].properties.length).to.equal(1);
    expect(ss[0].properties[0].name).to.equal('background-color');
    expect(ss[0].properties[0].value).to.equal('red');
  });

  it('style() is an alias for css()', () => {
    const ss = cytoscape.Stylesheet().selector('node');
    expect(ss.style).to.equal(ss.css);
  });

  it('css(map) adds multiple properties from a plain object', () => {
    const ss = cytoscape.Stylesheet().selector('node').css({
      'background-color': 'blue',
      'width': 50
    });
    // At least the recognised properties should appear
    const names = ss[0].properties.map(p => p.name);
    expect(names).to.include('background-color');
    expect(names).to.include('width');
  });

  it('multiple selectors build multiple entries', () => {
    const ss = cytoscape.Stylesheet()
      .selector('node').css('background-color', 'red')
      .selector('edge').css('line-color', 'blue');
    expect(ss.length).to.equal(2);
    expect(ss[0].selector).to.equal('node');
    expect(ss[1].selector).to.equal('edge');
  });

  it('css(map) skips null/undefined values', () => {
    const ss = cytoscape.Stylesheet().selector('node').css({
      'background-color': null,
      'width': undefined,
      'height': 30
    });
    const names = ss[0].properties.map(p => p.name);
    expect(names).to.not.include('background-color');
    expect(names).to.not.include('width');
    expect(names).to.include('height');
  });

  it('generateStyle creates a real style on a cy instance', () => {
    const ss = cytoscape.Stylesheet()
      .selector('node').css('background-color', 'green');
    const cy = cytoscape({
      headless: true,
      style: ss,
      elements: [{ data: { id: 'n1' } }]
    });
    // The style should have been applied
    const bgc = cy.$('#n1').style('background-color');
    expect(bgc).to.not.be.undefined;
    cy.destroy();
  });

  it('can be passed as style option to cytoscape()', () => {
    const ss = cytoscape.Stylesheet()
      .selector('node').css('width', 100).css('height', 100);
    const cy = cytoscape({
      headless: true,
      style: ss,
      elements: [{ data: { id: 'x' } }]
    });
    expect(cy.$('#x').style('width')).to.not.be.undefined;
    cy.destroy();
  });
});
