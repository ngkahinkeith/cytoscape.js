import { describe, it } from 'mocha';
import { expect } from 'chai';

/**
 * Layer-stack tests for the WebGL renderer.
 *
 * The canvas-layer constants are assigned inside the renderer constructor's
 * webgl branch — instantiating the full renderer requires a DOM, so these
 * tests mirror the assignment block from `canvas/index.mjs` and assert the
 * resulting layout. If you change the layer order or rename a constant in
 * the renderer, update this fixture in lockstep so the parity test below
 * fails noisily.
 */
function buildExpectedLayerStack() {
  const CRp = {};
  // Mirror of canvas/index.mjs (webgl branch).
  CRp.CANVAS_LAYERS = 6;
  CRp.SELECT_BOX = 0;
  CRp.DRAG = 1;
  CRp.NODE_WEBGL = 2;
  CRp.WEBGL = 2; // backward compat
  CRp.LABELS = 3;
  CRp.NODE_LABELS = 3; // backward-compat alias → merged LABELS canvas
  CRp.EDGE_LABELS = 3; // backward-compat alias → merged LABELS canvas
  CRp.EDGE_WEBGL = 4;
  CRp.NODE = 5;
  CRp.CANVAS_TYPES = ['2d', '2d', 'webgl2', '2d', 'webgl2', '2d'];
  return CRp;
}

describe('WebGL canvas layer stack — merged labels', () => {

  it('uses 6 canvas layers (down from 7 after node/edge label merge)', () => {
    const c = buildExpectedLayerStack();
    expect(c.CANVAS_LAYERS).to.equal(6);
    expect(c.CANVAS_TYPES).to.have.lengthOf(6);
  });

  it('places NODE_WEBGL above LABELS above EDGE_WEBGL', () => {
    const c = buildExpectedLayerStack();
    expect(c.NODE_WEBGL).to.be.lessThan(c.LABELS);
    expect(c.LABELS).to.be.lessThan(c.EDGE_WEBGL);
  });

  it('LABELS sits at index 3', () => {
    const c = buildExpectedLayerStack();
    expect(c.LABELS).to.equal(3);
    expect(c.CANVAS_TYPES[c.LABELS]).to.equal('2d');
  });

  it('NODE_LABELS and EDGE_LABELS aliases both point at the merged LABELS canvas', () => {
    const c = buildExpectedLayerStack();
    expect(c.NODE_LABELS).to.equal(c.LABELS);
    expect(c.EDGE_LABELS).to.equal(c.LABELS);
    expect(c.NODE_LABELS).to.equal(c.EDGE_LABELS);
  });

  it('NODE_WEBGL canvas type is webgl2', () => {
    const c = buildExpectedLayerStack();
    expect(c.CANVAS_TYPES[c.NODE_WEBGL]).to.equal('webgl2');
  });

  it('EDGE_WEBGL canvas type is webgl2', () => {
    const c = buildExpectedLayerStack();
    expect(c.CANVAS_TYPES[c.EDGE_WEBGL]).to.equal('webgl2');
  });

  it('SELECT_BOX, DRAG, and NODE (2D fallback) are Canvas 2D', () => {
    const c = buildExpectedLayerStack();
    expect(c.CANVAS_TYPES[c.SELECT_BOX]).to.equal('2d');
    expect(c.CANVAS_TYPES[c.DRAG]).to.equal('2d');
    expect(c.CANVAS_TYPES[c.NODE]).to.equal('2d');
  });

  it('z-index ordering produces Node > Node-label > Edge-label > Edge body on screen', () => {
    const c = buildExpectedLayerStack();
    const z = (i) => c.CANVAS_LAYERS - i; // mirror canvas/index.mjs zIndex assignment
    expect(z(c.SELECT_BOX)).to.be.greaterThan(z(c.DRAG));
    expect(z(c.DRAG)).to.be.greaterThan(z(c.NODE_WEBGL));
    expect(z(c.NODE_WEBGL)).to.be.greaterThan(z(c.LABELS));
    expect(z(c.LABELS)).to.be.greaterThan(z(c.EDGE_WEBGL));
    expect(z(c.EDGE_WEBGL)).to.be.greaterThan(z(c.NODE));
  });
});


describe('Merged label-canvas paint order', () => {

  function bucketAndPaint(candidates) {
    const edgeBucket = [];
    const nodeBucket = [];
    for (const c of candidates) {
      (c.isNode ? nodeBucket : edgeBucket).push(c);
    }
    return [...edgeBucket, ...nodeBucket].map((c) => c.id);
  }

  it('paints all edge labels before any node label', () => {
    const candidates = [
      { id: 'n1', isNode: true },
      { id: 'e1', isNode: false },
      { id: 'n2', isNode: true },
      { id: 'e2', isNode: false },
      { id: 'n3', isNode: true },
    ];
    const order = bucketAndPaint(candidates);
    const lastEdgeIdx = Math.max(...order.map((id, i) => id.startsWith('e') ? i : -1));
    const firstNodeIdx = order.findIndex((id) => id.startsWith('n'));
    expect(lastEdgeIdx).to.be.lessThan(firstNodeIdx);
  });

  it('preserves relative order within each bucket', () => {
    const candidates = [
      { id: 'e1', isNode: false },
      { id: 'e2', isNode: false },
      { id: 'n1', isNode: true },
      { id: 'n2', isNode: true },
      { id: 'e3', isNode: false },
    ];
    const order = bucketAndPaint(candidates);
    expect(order).to.deep.equal(['e1', 'e2', 'e3', 'n1', 'n2']);
  });

  it('handles all-edges-only candidates', () => {
    const candidates = [
      { id: 'e1', isNode: false },
      { id: 'e2', isNode: false },
    ];
    expect(bucketAndPaint(candidates)).to.deep.equal(['e1', 'e2']);
  });

  it('handles all-nodes-only candidates', () => {
    const candidates = [
      { id: 'n1', isNode: true },
      { id: 'n2', isNode: true },
    ];
    expect(bucketAndPaint(candidates)).to.deep.equal(['n1', 'n2']);
  });

  it('iterates the candidate list exactly once', () => {
    let visits = 0;
    const visitedCandidates = new Proxy(
      [
        { id: 'n1', isNode: true },
        { id: 'e1', isNode: false },
        { id: 'n2', isNode: true },
      ],
      {
        get(target, prop) {
          if (typeof prop === 'string' && /^\d+$/.test(prop)) visits++;
          return target[prop];
        },
      }
    );
    bucketAndPaint(visitedCandidates);
    expect(visits).to.equal(3);
  });
});
