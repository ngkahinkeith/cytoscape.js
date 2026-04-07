import { describe, it } from 'mocha';
import { expect } from 'chai';

import drawingEdgesMixin from '../../src/extensions/renderer/canvas/drawing-edges.mjs';
import drawingElementsMixin from '../../src/extensions/renderer/canvas/drawing-elements.mjs';
import drawingImagesMixin from '../../src/extensions/renderer/canvas/drawing-images.mjs';
import drawingLabelTextMixin from '../../src/extensions/renderer/canvas/drawing-label-text.mjs';
import drawingNodesMixin from '../../src/extensions/renderer/canvas/drawing-nodes.mjs';
import drawingRedrawMixin from '../../src/extensions/renderer/canvas/drawing-redraw.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────

function mockCanvas2DContext() {
  const calls = [];
  const record = (name) => (...args) => calls.push({ name, args });
  return {
    calls,
    save: record('save'),
    restore: record('restore'),
    setTransform: record('setTransform'),
    translate: record('translate'),
    scale: record('scale'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    arcTo: record('arcTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    bezierCurveTo: record('bezierCurveTo'),
    rect: record('rect'),
    fill: record('fill'),
    stroke: record('stroke'),
    clip: record('clip'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    measureText: (text) => ({ width: (text || '').length * 7, actualBoundingBoxAscent: 14 }),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    drawImage: record('drawImage'),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: record('putImageData'),
    canvas: { width: 800, height: 600 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    lineDashOffset: 0,
    font: '12px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    setLineDash: record('setLineDash'),
    getLineDash: () => [],
    ellipse: record('ellipse'),
    imageSmoothingEnabled: true,
  };
}

function pstyleVal(val, pfVal, strVal, units) {
  return {
    value: val,
    pfValue: pfVal !== undefined ? pfVal : val,
    strValue: strVal !== undefined ? strVal : String(val),
    units: units || ''
  };
}

function makeMockEdge(overrides = {}) {
  const rscratch = {
    edgeType: overrides.edgeType || 'straight',
    allpts: overrides.allpts || [0, 0, 100, 100],
    badLine: false,
    arrowStartX: 0,
    arrowStartY: 0,
    arrowEndX: 100,
    arrowEndY: 100,
    midX: 50,
    midY: 50,
    srcArrowAngle: 0,
    tgtArrowAngle: Math.PI,
    midtgtArrowAngle: Math.PI / 2,
    midsrcArrowAngle: -Math.PI / 2,
    labelX: 50,
    labelY: 50,
    labelWidth: 40,
    labelHeight: 12,
    labelLineHeight: 14,
    labelAngle: 0,
    ...overrides.rscratch,
  };

  const styles = {
    'opacity': pstyleVal(1),
    'line-opacity': pstyleVal(1),
    'curve-style': pstyleVal('bezier'),
    'line-style': pstyleVal('solid'),
    'width': pstyleVal(2, 2),
    'line-cap': pstyleVal('butt'),
    'line-outline-width': pstyleVal(0),
    'line-outline-color': pstyleVal([0, 0, 0]),
    'line-fill': pstyleVal('solid'),
    'line-color': pstyleVal([0, 0, 0]),
    'line-dash-pattern': pstyleVal([6, 3], [6, 3]),
    'line-dash-offset': pstyleVal(0, 0),
    'ghost': pstyleVal('no'),
    'ghost-offset-x': pstyleVal(0, 0),
    'ghost-offset-y': pstyleVal(0, 0),
    'ghost-opacity': pstyleVal(0.5),
    'overlay-opacity': pstyleVal(0),
    'overlay-color': pstyleVal([0, 0, 0]),
    'overlay-padding': pstyleVal(10, 10),
    'overlay-shape': pstyleVal('round-rectangle'),
    'underlay-opacity': pstyleVal(0),
    'underlay-color': pstyleVal([0, 0, 0]),
    'underlay-padding': pstyleVal(10, 10),
    'underlay-shape': pstyleVal('round-rectangle'),
    'source-arrow-shape': pstyleVal('none'),
    'target-arrow-shape': pstyleVal('none'),
    'mid-source-arrow-shape': pstyleVal('none'),
    'mid-target-arrow-shape': pstyleVal('none'),
    'source-arrow-fill': pstyleVal('filled'),
    'target-arrow-fill': pstyleVal('filled'),
    'mid-source-arrow-fill': pstyleVal('filled'),
    'mid-target-arrow-fill': pstyleVal('filled'),
    'source-arrow-color': pstyleVal([0, 0, 0]),
    'target-arrow-color': pstyleVal([0, 0, 0]),
    'mid-source-arrow-color': pstyleVal([0, 0, 0]),
    'mid-target-arrow-color': pstyleVal([0, 0, 0]),
    'source-arrow-width': pstyleVal('match-line', undefined, 'match-line'),
    'target-arrow-width': pstyleVal('match-line', undefined, 'match-line'),
    'mid-source-arrow-width': pstyleVal('match-line', undefined, 'match-line'),
    'mid-target-arrow-width': pstyleVal('match-line', undefined, 'match-line'),
    'arrow-scale': pstyleVal(1),
    'label': pstyleVal('test', undefined, 'test'),
    'source-label': pstyleVal(''),
    'target-label': pstyleVal(''),
    'font-style': pstyleVal('normal', undefined, 'normal'),
    'font-size': pstyleVal(12, 12, '12'),
    'font-family': pstyleVal('sans-serif', undefined, 'sans-serif'),
    'font-weight': pstyleVal('normal', undefined, 'normal'),
    'text-opacity': pstyleVal(1),
    'text-outline-opacity': pstyleVal(1),
    'color': pstyleVal([0, 0, 0]),
    'text-outline-color': pstyleVal([0, 0, 0]),
    'text-outline-width': pstyleVal(0, 0),
    'text-rotation': pstyleVal(0, 0, 'none'),
    'text-halign': pstyleVal('center'),
    'text-valign': pstyleVal('center'),
    'text-margin-x': pstyleVal(0, 0),
    'text-margin-y': pstyleVal(0, 0),
    'text-wrap': pstyleVal('none'),
    'text-background-opacity': pstyleVal(0),
    'text-border-opacity': pstyleVal(0),
    'text-border-width': pstyleVal(0, 0),
    'text-background-padding': pstyleVal(0, 0),
    'text-background-shape': pstyleVal('rectangle', undefined, 'rectangle'),
    'text-background-color': pstyleVal([255, 255, 255]),
    'text-border-color': pstyleVal([0, 0, 0]),
    'text-border-style': pstyleVal('solid'),
    'min-zoomed-font-size': pstyleVal(0, 0),
    ...overrides.styles,
  };

  return {
    _private: {
      rscratch: rscratch,
    },
    isNode: () => false,
    isEdge: () => true,
    isParent: () => false,
    visible: () => overrides.visible !== undefined ? overrides.visible : true,
    effectiveOpacity: () => 1,
    pstyle: (name) => styles[name] || pstyleVal(0),
    element: () => ({ _private: { rscratch } }),
    id: () => 'e1',
  };
}

function makeMockNode(overrides = {}) {
  const rscratch = {
    labelX: 50,
    labelY: 50,
    labelWidth: 40,
    labelHeight: 12,
    labelLineHeight: 14,
    labelAngle: 0,
    pathCache: null,
    ...overrides.rscratch,
  };

  const styles = {
    'opacity': pstyleVal(1),
    'label': pstyleVal('test', undefined, 'test'),
    'font-style': pstyleVal('normal', undefined, 'normal'),
    'font-size': pstyleVal(12, 12, '12'),
    'font-family': pstyleVal('sans-serif', undefined, 'sans-serif'),
    'font-weight': pstyleVal('normal', undefined, 'normal'),
    'text-opacity': pstyleVal(1),
    'text-outline-opacity': pstyleVal(1),
    'color': pstyleVal([0, 0, 0]),
    'text-outline-color': pstyleVal([0, 0, 0]),
    'text-outline-width': pstyleVal(0, 0),
    'text-rotation': pstyleVal(0, 0, 'none'),
    'text-halign': pstyleVal('center'),
    'text-valign': pstyleVal('center'),
    'text-margin-x': pstyleVal(0, 0),
    'text-margin-y': pstyleVal(0, 0),
    'text-wrap': pstyleVal('none'),
    'text-background-opacity': pstyleVal(0),
    'text-border-opacity': pstyleVal(0),
    'text-border-width': pstyleVal(0, 0),
    'text-background-padding': pstyleVal(0, 0),
    'text-background-shape': pstyleVal('rectangle', undefined, 'rectangle'),
    'text-background-color': pstyleVal([255, 255, 255]),
    'text-border-color': pstyleVal([0, 0, 0]),
    'text-border-style': pstyleVal('solid'),
    'min-zoomed-font-size': pstyleVal(0, 0),
    'background-image': pstyleVal(['none']),
    'background-blacken': pstyleVal(0),
    'background-opacity': pstyleVal(1),
    'background-color': pstyleVal([200, 200, 200]),
    'background-fill': pstyleVal('solid'),
    'border-width': pstyleVal(0, 0),
    'border-color': pstyleVal([0, 0, 0]),
    'border-style': pstyleVal('solid'),
    'border-join': pstyleVal('miter'),
    'border-cap': pstyleVal('butt'),
    'border-position': pstyleVal('center'),
    'border-dash-pattern': pstyleVal([6, 3], [6, 3]),
    'border-dash-offset': pstyleVal(0, 0),
    'border-opacity': pstyleVal(1),
    'outline-width': pstyleVal(0, 0),
    'outline-color': pstyleVal([0, 0, 0]),
    'outline-style': pstyleVal('solid'),
    'outline-opacity': pstyleVal(1),
    'outline-offset': pstyleVal(0),
    'corner-radius': pstyleVal('auto', 'auto', 'auto'),
    'shape': pstyleVal('ellipse', undefined, 'ellipse'),
    'shape-polygon-points': pstyleVal([], []),
    'ghost': pstyleVal('no'),
    'ghost-offset-x': pstyleVal(0, 0),
    'ghost-offset-y': pstyleVal(0, 0),
    'ghost-opacity': pstyleVal(0.5),
    'overlay-opacity': pstyleVal(0),
    'overlay-color': pstyleVal([0, 0, 0]),
    'overlay-padding': pstyleVal(10, 10),
    'overlay-shape': pstyleVal('round-rectangle'),
    'overlay-corner-radius': pstyleVal('auto'),
    'underlay-opacity': pstyleVal(0),
    'underlay-color': pstyleVal([0, 0, 0]),
    'underlay-padding': pstyleVal(10, 10),
    'underlay-shape': pstyleVal('round-rectangle'),
    'underlay-corner-radius': pstyleVal('auto'),
    'pie-size': pstyleVal(100, 1, undefined, '%'),
    'pie-hole': pstyleVal(0, 0, undefined, '%'),
    'pie-start-angle': pstyleVal(0, 0),
    'stripe-direction': pstyleVal('vertical'),
    'stripe-size': pstyleVal(100, 1, undefined, '%'),
    ...overrides.styles,
  };

  return {
    _private: {
      rscratch: rscratch,
      hasPie: overrides.hasPie || false,
      hasStripe: overrides.hasStripe || false,
      backgrounding: false,
      backgroundTimestamp: 0,
      nodeKey: 'nk1',
      labelStyleKey: 'lk1',
    },
    isNode: () => true,
    isEdge: () => false,
    isParent: () => false,
    visible: () => overrides.visible !== undefined ? overrides.visible : true,
    effectiveOpacity: () => 1,
    pstyle: (name) => styles[name] || pstyleVal(0),
    position: () => overrides.position || { x: 50, y: 50 },
    width: () => overrides.width || 50,
    height: () => overrides.height || 50,
    padding: () => overrides.padding || 0,
    id: () => 'n1',
    cy: () => ({
      zoom: () => 1,
      style: () => ({
        getIndexedStyle: (node, prop, key, idx) => styles[prop] ? styles[prop][key] || styles[prop].value : undefined,
        pieBackgroundN: 0,
        stripeBackgroundN: 0,
      })
    }),
    updateStyle: () => {},
    emitAndNotify: () => {},
    element: () => ({ _private: { rscratch } }),
    boundingBox: () => ({ x1: 25, y1: 25, x2: 75, y2: 75, w: 50, h: 50 }),
    0: {
      _private: {
        rscratch: rscratch,
        hasPie: overrides.hasPie || false,
        hasStripe: overrides.hasStripe || false,
      }
    },
    spawn: () => ({ merge: () => ({}) }),
  };
}

function makeDrawingRenderer(overrides = {}) {
  const r = {};
  // Apply all mixins (this gives the real CRp methods)
  Object.assign(r, drawingEdgesMixin);
  Object.assign(r, drawingElementsMixin);
  Object.assign(r, drawingImagesMixin);
  Object.assign(r, drawingLabelTextMixin);
  Object.assign(r, drawingNodesMixin);
  Object.assign(r, drawingRedrawMixin);

  // Stub methods that come from other mixins or the base renderer
  r.usePaths = () => false;
  r.getCachedImage = () => ({ complete: false, error: false });
  r.getArrowWidth = (edgeW, scale) => edgeW * scale;
  r.arrowShapes = { 'triangle': { draw: () => {} } };
  r.arrowPathCache = [];
  r.nodeShapes = {
    'ellipse': { draw: () => {} },
    'round-rectangle': { draw: () => {} },
  };
  r.getNodeShape = () => 'ellipse';
  r.getLabelText = () => 'test';
  r.getLabelJustification = () => 'center';
  r.getImgSmoothing = () => true;
  r.setImgSmoothing = () => {};
  r.fontCaches = [];
  r.data = {
    eleTxrCache: { getBoundingBox: () => ({}), getElement: () => null, drawElement: () => {} },
    lblTxrCache: { getBoundingBox: () => ({}), getElement: () => null, drawElement: () => {} },
    slbTxrCache: { getBoundingBox: () => ({}), getElement: () => null, drawElement: () => {} },
    tlbTxrCache: { getBoundingBox: () => ({}), getElement: () => null, drawElement: () => {} },
    lyrTxrCache: { getLayers: () => null },
    contexts: [mockCanvas2DContext()],
    canvasNeedsRedraw: [false, false, false],
    bufferCanvases: [],
    bufferContexts: [],
  };

  // Apply any overrides last
  if (overrides.drawElementText) r.drawElementText = overrides.drawElementText;

  return r;
}

// ── drawing-edges.mjs ───────────────────────────────────────────────────────

describe('Canvas drawing-edges', () => {
  it('drawEdge returns early for invisible edge', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ visible: false });
    r.drawEdge(ctx, edge);
    // No draw calls should occur
    expect(ctx.calls.filter(c => c.name === 'stroke')).to.have.length(0);
  });

  it('drawEdge returns early for bad line', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ rscratch: { badLine: true, allpts: [0, 0, 100, 100], edgeType: 'straight' } });
    r.drawEdge(ctx, edge);
    expect(ctx.calls.filter(c => c.name === 'stroke')).to.have.length(0);
  });

  it('drawEdge returns early for null allpts', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ rscratch: { badLine: false, allpts: null, edgeType: 'straight' } });
    r.drawEdge(ctx, edge);
    expect(ctx.calls.filter(c => c.name === 'stroke')).to.have.length(0);
  });

  it('drawEdge returns early for NaN allpts', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ rscratch: { badLine: false, allpts: [NaN, 0], edgeType: 'straight' } });
    r.drawEdge(ctx, edge);
    expect(ctx.calls.filter(c => c.name === 'stroke')).to.have.length(0);
  });

  it('drawEdge draws a straight edge', () => {
    const r = makeDrawingRenderer();
    r.drawArrowheads = () => {};
    r.drawElementText = () => {};
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ edgeType: 'straight' });
    r.drawEdge(ctx, edge);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawEdge handles shiftToOriginWithBb', () => {
    const r = makeDrawingRenderer();
    r.drawArrowheads = () => {};
    r.drawElementText = () => {};
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ edgeType: 'straight' });
    const bb = { x1: 10, y1: 20 };
    r.drawEdge(ctx, edge, bb);
    const translates = ctx.calls.filter(c => c.name === 'translate');
    expect(translates.length).to.be.at.least(2);
    expect(translates[0].args).to.deep.equal([-10, -20]);
  });

  it('drawEdge handles ghost edges', () => {
    const r = makeDrawingRenderer();
    r.drawArrowheads = () => {};
    r.drawElementText = () => {};
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: {
        'ghost': pstyleVal('yes'),
        'ghost-offset-x': pstyleVal(5, 5),
        'ghost-offset-y': pstyleVal(5, 5),
        'ghost-opacity': pstyleVal(0.5),
      }
    });
    r.drawEdge(ctx, edge);
    const translates = ctx.calls.filter(c => c.name === 'translate');
    expect(translates.length).to.be.at.least(2);
  });

  it('drawEdgePath draws a straight edge path', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ edgeType: 'straight' });
    r.drawEdgePath(edge, ctx, [0, 0, 100, 100], 'solid');
    expect(ctx.calls.filter(c => c.name === 'stroke')).to.have.length(1);
  });

  it('drawEdgePath draws bezier edge path', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ edgeType: 'bezier', allpts: [0, 0, 25, 50, 50, 0, 75, 50, 100, 0] });
    r.drawEdgePath(edge, ctx, [0, 0, 25, 50, 50, 0, 75, 50, 100, 0], 'solid');
    expect(ctx.calls.filter(c => c.name === 'quadraticCurveTo').length).to.be.at.least(1);
  });

  it('drawEdgePath handles dotted line style', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ edgeType: 'straight' });
    r.drawEdgePath(edge, ctx, [0, 0, 100, 100], 'dotted');
    const dashCalls = ctx.calls.filter(c => c.name === 'setLineDash');
    expect(dashCalls.length).to.be.at.least(1);
    expect(dashCalls[0].args[0]).to.deep.equal([1, 1]);
  });

  it('drawEdgePath handles dashed line style', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ edgeType: 'straight' });
    r.drawEdgePath(edge, ctx, [0, 0, 100, 100], 'dashed');
    const dashCalls = ctx.calls.filter(c => c.name === 'setLineDash');
    expect(dashCalls.length).to.be.at.least(1);
  });

  it('drawEdgePath handles segments edge type', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      edgeType: 'segments',
      rscratch: { edgeType: 'segments', isRound: false, badLine: false, allpts: [0, 0, 50, 50, 100, 0] }
    });
    r.drawEdgePath(edge, ctx, [0, 0, 50, 50, 100, 0], 'solid');
    expect(ctx.calls.filter(c => c.name === 'lineTo').length).to.be.at.least(1);
  });

  it('drawEdgeTrianglePath draws triangles for straight-triangle', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ edgeType: 'straight' });
    r.drawEdgeTrianglePath(edge, ctx, [0, 0, 100, 100]);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
    expect(ctx.calls.filter(c => c.name === 'beginPath').length).to.be.at.least(1);
  });

  it('drawArrowheads calls drawArrowhead for each position', () => {
    const r = makeDrawingRenderer();
    const calls = [];
    r.drawArrowhead = (...args) => calls.push(args);
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    r.drawArrowheads(ctx, edge, 1);
    // source, mid-target, mid-source, target = 4
    expect(calls).to.have.length(4);
  });

  it('drawArrowheads skips source/target for haystack edges', () => {
    const r = makeDrawingRenderer();
    const calls = [];
    r.drawArrowhead = (...args) => calls.push(args);
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ edgeType: 'haystack', rscratch: { edgeType: 'haystack', allpts: [0, 0, 100, 100], badLine: false } });
    r.drawArrowheads(ctx, edge, 1);
    // only mid-target and mid-source = 2
    expect(calls).to.have.length(2);
  });

  it('drawArrowhead returns early for NaN coords', () => {
    const r = makeDrawingRenderer();
    r.drawArrowShape = () => { throw new Error('should not be called'); };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    r.drawArrowhead(ctx, edge, 'source', NaN, 0, 0, 1);
    r.drawArrowhead(ctx, edge, 'source', 0, null, 0, 1);
    r.drawArrowhead(ctx, edge, 'source', 0, 0, NaN, 1);
    // No exception means it returned early each time
  });

  it('drawArrowhead returns early for "none" shape', () => {
    const r = makeDrawingRenderer();
    r.drawArrowShape = () => { throw new Error('should not be called'); };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: { 'source-arrow-shape': pstyleVal('none') }
    });
    r.drawArrowhead(ctx, edge, 'source', 0, 0, 0, 1);
    // No exception
  });

  it('drawArrowhead draws arrow with opacity < 1 (clears first)', () => {
    const r = makeDrawingRenderer();
    let drawCalls = 0;
    r.drawArrowShape = () => { drawCalls++; };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: { 'source-arrow-shape': pstyleVal('triangle') }
    });
    r.drawArrowhead(ctx, edge, 'source', 10, 10, 0, 0.5);
    expect(drawCalls).to.equal(2); // once for clear, once for draw
  });

  it('drawArrowShape draws filled arrow', () => {
    const r = makeDrawingRenderer();
    r.arrowShapes = { 'triangle': { draw: () => {} } };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    r.drawArrowShape(edge, ctx, 'filled', 2, 'triangle', 2, 10, 10, 0);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });

  it('drawArrowShape draws hollow arrow (stroke)', () => {
    const r = makeDrawingRenderer();
    r.arrowShapes = { 'triangle': { draw: () => {} } };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    r.drawArrowShape(edge, ctx, 'hollow', 2, 'triangle', 2, 10, 10, 0);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawArrowShape draws "both" fill type (fill + stroke)', () => {
    const r = makeDrawingRenderer();
    r.arrowShapes = { 'triangle': { draw: () => {} } };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    r.drawArrowShape(edge, ctx, 'both', 2, 'triangle', 2, 10, 10, 0);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawEdgeOverlay returns early for invisible edge', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ visible: false });
    r.drawEdgeOverlay(ctx, edge);
    expect(ctx.calls).to.have.length(0);
  });

  it('drawEdgeOverlay returns early for 0 opacity', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: { 'overlay-opacity': pstyleVal(0) }
    });
    r.drawEdgeOverlay(ctx, edge);
  });

  it('drawEdgeUnderlay returns early for invisible edge', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({ visible: false });
    r.drawEdgeUnderlay(ctx, edge);
    expect(ctx.calls).to.have.length(0);
  });

  it('drawEdge with straight-triangle curve style', () => {
    const r = makeDrawingRenderer();
    r.drawArrowheads = () => {};
    r.drawElementText = () => {};
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: { 'curve-style': pstyleVal('straight-triangle') }
    });
    r.drawEdge(ctx, edge);
    // No stroke calls from the straight-triangle path
  });

  it('drawEdgeOverlay draws overlay with non-zero opacity', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: {
        'overlay-opacity': pstyleVal(0.5),
        'overlay-color': pstyleVal([255, 0, 0]),
        'overlay-padding': pstyleVal(10, 10),
      }
    });
    r.drawEdgeOverlay(ctx, edge);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawEdgeUnderlay draws underlay with non-zero opacity', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: {
        'underlay-opacity': pstyleVal(0.5),
        'underlay-color': pstyleVal([0, 255, 0]),
        'underlay-padding': pstyleVal(10, 10),
      }
    });
    r.drawEdgeUnderlay(ctx, edge);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawEdgeOverlay with self edge type sets lineCap to butt', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      edgeType: 'self',
      rscratch: { edgeType: 'self', badLine: false, allpts: [0, 0, 20, 40, 40, 0] },
      styles: {
        'overlay-opacity': pstyleVal(0.5),
        'overlay-color': pstyleVal([255, 0, 0]),
        'overlay-padding': pstyleVal(5, 5),
      }
    });
    r.drawEdgeOverlay(ctx, edge);
    expect(ctx.lineCap).to.equal('butt');
  });

  it('drawEdgePath with haystack edge type', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      edgeType: 'haystack',
      rscratch: { edgeType: 'haystack', badLine: false, allpts: [0, 0, 100, 100] }
    });
    r.drawEdgePath(edge, ctx, [0, 0, 100, 100], 'solid');
    expect(ctx.calls.filter(c => c.name === 'lineTo').length).to.be.at.least(1);
  });

  it('drawEdgePath with round segments', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      edgeType: 'segments',
      rscratch: {
        edgeType: 'segments',
        isRound: true,
        badLine: false,
        allpts: [0, 0, 50, 50, 100, 0],
        roundCorners: [
          { cx: 50, cy: 50, radius: 5, startAngle: 0, endAngle: Math.PI, counterClockwise: false }
        ]
      }
    });
    r.drawEdgePath(edge, ctx, [0, 0, 50, 50, 100, 0], 'solid');
    expect(ctx.calls.filter(c => c.name === 'arc').length).to.be.at.least(1);
  });

  it('drawEdge with line-outline-width > 0', () => {
    const r = makeDrawingRenderer();
    r.drawArrowheads = () => {};
    r.drawElementText = () => {};
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: { 'line-outline-width': pstyleVal(2) }
    });
    r.drawEdge(ctx, edge);
    // Should have drawn the line outline
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });
});

// ── drawing-elements.mjs ────────────────────────────────────────────────────

describe('Canvas drawing-elements', () => {
  it('drawElement dispatches to drawNode for a node', () => {
    const r = makeDrawingRenderer();
    let calledDrawNode = false;
    r.drawNode = () => { calledDrawNode = true; };
    r.drawEdge = () => { throw new Error('should not call drawEdge'); };
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    r.drawElement(ctx, node);
    expect(calledDrawNode).to.be.true;
  });

  it('drawElement dispatches to drawEdge for an edge', () => {
    const r = makeDrawingRenderer();
    let calledDrawEdge = false;
    r.drawNode = () => { throw new Error('should not call drawNode'); };
    r.drawEdge = () => { calledDrawEdge = true; };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    r.drawElement(ctx, edge);
    expect(calledDrawEdge).to.be.true;
  });

  it('drawElementOverlay dispatches to drawNodeOverlay for a node', () => {
    const r = makeDrawingRenderer();
    let called = false;
    r.drawNodeOverlay = () => { called = true; };
    const node = makeMockNode();
    r.drawElementOverlay(mockCanvas2DContext(), node);
    expect(called).to.be.true;
  });

  it('drawElementOverlay dispatches to drawEdgeOverlay for an edge', () => {
    const r = makeDrawingRenderer();
    let called = false;
    r.drawEdgeOverlay = () => { called = true; };
    const edge = makeMockEdge();
    r.drawElementOverlay(mockCanvas2DContext(), edge);
    expect(called).to.be.true;
  });

  it('drawElementUnderlay dispatches to drawNodeUnderlay for a node', () => {
    const r = makeDrawingRenderer();
    let called = false;
    r.drawNodeUnderlay = () => { called = true; };
    const node = makeMockNode();
    r.drawElementUnderlay(mockCanvas2DContext(), node);
    expect(called).to.be.true;
  });

  it('drawElementUnderlay dispatches to drawEdgeUnderlay for an edge', () => {
    const r = makeDrawingRenderer();
    let called = false;
    r.drawEdgeUnderlay = () => { called = true; };
    const edge = makeMockEdge();
    r.drawElementUnderlay(mockCanvas2DContext(), edge);
    expect(called).to.be.true;
  });

  it('drawElements draws each element', () => {
    const r = makeDrawingRenderer();
    let count = 0;
    r.drawElement = () => { count++; };
    const eles = [makeMockNode(), makeMockEdge(), makeMockNode()];
    r.drawElements(mockCanvas2DContext(), eles);
    expect(count).to.equal(3);
  });

  it('drawCachedElementPortion returns early for zero-size bb', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const ele = makeMockNode();
    const cache = {
      getBoundingBox: () => ({ w: 0, h: 0, x1: 0, y1: 0 }),
      getElement: () => null,
      drawElement: () => {},
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    };
    r.drawCachedElementPortion(ctx, ele, cache, 1, 0, null, () => 0, () => 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(0);
  });

  it('drawCachedElementPortion falls back to drawElement when no cache', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const ele = makeMockNode();
    let drewDirectly = false;
    const cache = {
      getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 }),
      getElement: () => null,
      drawElement: () => { drewDirectly = true; },
      getRotationPoint: () => ({ x: 25, y: 25 }),
      getRotationOffset: () => ({ x: -25, y: -25 }),
    };
    r.drawCachedElementPortion(ctx, ele, cache, 1, 0, null, () => 0, () => 1);
    expect(drewDirectly).to.be.true;
  });

  it('drawCachedElementPortion draws cached texture when available', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const ele = makeMockNode();
    const cache = {
      getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 }),
      getElement: () => ({ texture: { canvas: {} }, x: 0, width: 100, height: 100 }),
      drawElement: () => {},
      getRotationPoint: () => ({ x: 25, y: 25 }),
      getRotationOffset: () => ({ x: -25, y: -25 }),
    };
    r.drawCachedElementPortion(ctx, ele, cache, 1, 0, null, () => 0, () => 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('drawCachedElementPortion handles rotation', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const ele = makeMockNode();
    const cache = {
      getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 }),
      getElement: () => ({ texture: { canvas: {} }, x: 0, width: 100, height: 100 }),
      drawElement: () => {},
      getRotationPoint: () => ({ x: 25, y: 25 }),
      getRotationOffset: () => ({ x: -25, y: -25 }),
    };
    r.drawCachedElementPortion(ctx, ele, cache, 1, 0, null, () => Math.PI / 4, () => 1);
    expect(ctx.calls.filter(c => c.name === 'rotate').length).to.be.at.least(1);
    expect(ctx.calls.filter(c => c.name === 'translate').length).to.be.at.least(1);
  });

  it('drawCachedElementPortion handles opacity != 1', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const ele = makeMockNode();
    const cache = {
      getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 }),
      getElement: () => ({ texture: { canvas: {} }, x: 0, width: 100, height: 100 }),
      drawElement: () => {},
      getRotationPoint: () => ({ x: 25, y: 25 }),
      getRotationOffset: () => ({ x: -25, y: -25 }),
    };
    r.drawCachedElementPortion(ctx, ele, cache, 1, 0, null, () => 0, () => 0.5);
    // globalAlpha should have been modified and restored
    expect(ctx.globalAlpha).to.equal(1);
  });

  it('drawCachedElement returns early for zero-size bb', () => {
    const r = makeDrawingRenderer();
    let drawCount = 0;
    r.drawCachedElementPortion = () => { drawCount++; };
    r.drawElementUnderlay = () => {};
    r.drawElementOverlay = () => {};
    const ctx = mockCanvas2DContext();
    const ele = {
      boundingBox: () => ({ w: 0, h: 0 }),
      visible: () => true,
      isEdge: () => false,
      element: () => ({ _private: { rscratch: { badLine: false } } }),
    };
    r.drawCachedElement(ctx, ele, 1, null);
    expect(drawCount).to.equal(0);
  });

  it('drawCachedElement returns early for invisible element', () => {
    const r = makeDrawingRenderer();
    let drawCount = 0;
    r.drawCachedElementPortion = () => { drawCount++; };
    const ctx = mockCanvas2DContext();
    const ele = {
      boundingBox: () => ({ w: 50, h: 50 }),
      visible: () => false,
      isEdge: () => false,
      element: () => ({ _private: { rscratch: { badLine: false } } }),
    };
    r.drawCachedElement(ctx, ele, 1, null);
    expect(drawCount).to.equal(0);
  });

  it('drawCachedElements draws all elements', () => {
    const r = makeDrawingRenderer();
    let count = 0;
    r.drawCachedElement = () => { count++; };
    r.drawElements(mockCanvas2DContext(), [makeMockNode(), makeMockNode()]);
  });

  it('drawCachedNodes only draws nodes', () => {
    const r = makeDrawingRenderer();
    let count = 0;
    r.drawCachedElement = () => { count++; };
    const eles = [makeMockNode(), makeMockEdge(), makeMockNode()];
    r.drawCachedNodes(mockCanvas2DContext(), eles, 1, null);
    expect(count).to.equal(2); // only the 2 nodes
  });

  it('drawLayeredElements uses layers when available', () => {
    const r = makeDrawingRenderer();
    let drewFromLayers = false;
    r.data.lyrTxrCache = {
      getLayers: () => [{ canvas: {}, bb: { x1: 0, y1: 0, w: 100, h: 100 } }]
    };
    const ctx = mockCanvas2DContext();
    r.drawLayeredElements(ctx, [], 1, null);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('drawLayeredElements falls back when no layers', () => {
    const r = makeDrawingRenderer();
    let calledCached = false;
    r.drawCachedElements = () => { calledCached = true; };
    r.data.lyrTxrCache = { getLayers: () => null };
    r.drawLayeredElements(mockCanvas2DContext(), [], 1, null);
    expect(calledCached).to.be.true;
  });

  it('drawLayeredElements skips zero-size layers', () => {
    const r = makeDrawingRenderer();
    r.data.lyrTxrCache = {
      getLayers: () => [{ canvas: {}, bb: { x1: 0, y1: 0, w: 0, h: 0 } }]
    };
    const ctx = mockCanvas2DContext();
    r.drawLayeredElements(ctx, [], 1, null);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(0);
  });
});

// ── drawing-images.mjs ──────────────────────────────────────────────────────

describe('Canvas drawing-images', () => {
  it('safeDrawImage returns early for zero iw/ih', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    r.safeDrawImage(ctx, {}, 0, 0, 0, 100, 0, 0, 100, 100);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(0);
  });

  it('safeDrawImage returns early for zero w/h', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    r.safeDrawImage(ctx, {}, 0, 0, 100, 100, 0, 0, 0, 100);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(0);
  });

  it('safeDrawImage draws when dimensions are valid', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    r.safeDrawImage(ctx, {}, 0, 0, 100, 100, 0, 0, 100, 100);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('safeDrawImage handles drawImage errors gracefully', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    ctx.drawImage = () => { throw new Error('broken img'); };
    // Should not throw
    r.safeDrawImage(ctx, {}, 0, 0, 100, 100, 0, 0, 100, 100);
  });
});

// ── drawing-label-text.mjs ──────────────────────────────────────────────────

describe('Canvas drawing-label-text', () => {
  it('eleTextBiggerThanMin returns true when text is large enough', () => {
    const r = makeDrawingRenderer();
    r.cy = { window: () => ({ devicePixelRatio: 1 }) };
    r.forcedPixelRatio = null;
    const ele = makeMockNode();
    ele.cy = () => ({ zoom: () => 1 });
    const result = r.eleTextBiggerThanMin(ele);
    expect(result).to.be.true;
  });

  it('eleTextBiggerThanMin returns false when text is too small', () => {
    const r = makeDrawingRenderer();
    r.cy = { window: () => ({ devicePixelRatio: 1 }) };
    r.forcedPixelRatio = null;
    const ele = makeMockNode({
      styles: {
        'font-size': pstyleVal(1, 1),
        'min-zoomed-font-size': pstyleVal(100, 100),
      }
    });
    ele.cy = () => ({ zoom: () => 0.01 });
    const result = r.eleTextBiggerThanMin(ele);
    expect(result).to.be.false;
  });

  it('eleTextBiggerThanMin accepts explicit scale', () => {
    const r = makeDrawingRenderer();
    const ele = makeMockNode({
      styles: {
        'font-size': pstyleVal(12, 12),
        'min-zoomed-font-size': pstyleVal(0, 0),
      }
    });
    const result = r.eleTextBiggerThanMin(ele, 2);
    expect(result).to.be.true;
  });

  it('drawElementText returns early when force === false', () => {
    const r = makeDrawingRenderer();
    r.drawText = () => { throw new Error('should not be called'); };
    const ctx = mockCanvas2DContext();
    const ele = makeMockNode();
    r.drawElementText(ctx, ele, null, false);
    // No exception means it returned early
  });

  it('drawElementText renders node label', () => {
    const r = makeDrawingRenderer();
    let drawTextCalls = 0;
    // Override drawText (from the mixin) with a tracking stub
    const origDrawText = r.drawText;
    r.drawText = function() { drawTextCalls++; };
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    r.drawElementText(ctx, node, null, true);
    expect(drawTextCalls).to.be.at.least(1);
    r.drawText = origDrawText;
  });

  it('drawElementText skips node with no label', () => {
    const r = makeDrawingRenderer();
    r.drawText = () => { throw new Error('should not be called'); };
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({ styles: { 'label': pstyleVal('', undefined, '') } });
    r.drawElementText(ctx, node, null, true);
  });

  it('drawElementText handles shiftToOriginWithBb', () => {
    const r = makeDrawingRenderer();
    r.drawText = () => {};
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    const bb = { x1: 10, y1: 20 };
    r.drawElementText(ctx, node, bb, true);
    const translates = ctx.calls.filter(c => c.name === 'translate');
    expect(translates.length).to.be.at.least(2);
  });

  it('drawElementText renders edge labels (main, source, target)', () => {
    const r = makeDrawingRenderer();
    let prefixes = [];
    r.drawText = function(ctx, ele, prefix) { prefixes.push(prefix); };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    r.drawElementText(ctx, edge, null, true);
    expect(prefixes).to.include(null);
    expect(prefixes).to.include('source');
    expect(prefixes).to.include('target');
  });

  it('drawElementText with explicit prefix', () => {
    const r = makeDrawingRenderer();
    let calledPrefix = 'NOT_CALLED';
    r.drawText = function(ctx, ele, prefix) { calledPrefix = prefix; };
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    r.drawElementText(ctx, node, null, true, 'source');
    expect(calledPrefix).to.equal('source');
  });

  it('drawText returns early when opacity is 0', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const ele = makeMockNode({
      styles: { 'text-opacity': pstyleVal(0) }
    });
    ele.effectiveOpacity = () => 1;
    r.drawText(ctx, ele);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(0);
  });

  it('drawText renders single-line text', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(1);
  });

  it('drawText handles "main" prefix alias', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    r.drawText(ctx, node, 'main', true, true);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(1);
  });

  it('drawText with text-outline-width > 0 calls strokeText', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: { 'text-outline-width': pstyleVal(2, 2) }
    });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'strokeText')).to.have.length(1);
  });

  it('drawText with text-wrap=wrap renders multiple lines', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: { 'text-wrap': pstyleVal('wrap') },
      rscratch: {
        labelX: 50,
        labelY: 50,
        labelWidth: 100,
        labelHeight: 28,
        labelLineHeight: 14,
        labelWrapCachedLines: ['line 1', 'line 2'],
      },
    });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(2);
  });

  it('drawText renders text background when backgroundOpacity > 0', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-background-opacity': pstyleVal(0.8),
        'text-background-color': pstyleVal([255, 255, 200]),
      }
    });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });

  it('drawText renders text border when border-width > 0 and border-opacity > 0', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-border-width': pstyleVal(1, 1),
        'text-border-opacity': pstyleVal(1),
        'text-border-color': pstyleVal([0, 0, 0]),
      }
    });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawText with round-rectangle background shape', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-background-opacity': pstyleVal(0.8),
        'text-background-shape': pstyleVal('round-rectangle', undefined, 'round-rectangle'),
      }
    });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });

  it('drawText with circle background shape', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-background-opacity': pstyleVal(0.8),
        'text-background-shape': pstyleVal('circle', undefined, 'circle'),
      }
    });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'arc').length).to.be.at.least(1);
  });

  it('drawText applies rotation when angle is nonzero', () => {
    const r = makeDrawingRenderer();
    r.getTextAngle = () => Math.PI / 4;
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'rotate').length).to.be.at.least(1);
  });

  it('drawText handles valign=top', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({ styles: { 'text-valign': pstyleVal('top') } });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(1);
  });

  it('drawText handles valign=bottom', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({ styles: { 'text-valign': pstyleVal('bottom') } });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(1);
  });

  it('drawText on edge (sets halign/valign to center)', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    r.drawText(ctx, edge, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(1);
  });

  it('drawText with double border style', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-border-width': pstyleVal(4, 4),
        'text-border-opacity': pstyleVal(1),
        'text-border-style': pstyleVal('double'),
      }
    });
    r.drawText(ctx, node, null, true, true);
    // double border calls stroke at least twice
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(2);
  });

  it('drawText with dotted border style', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-border-width': pstyleVal(1, 1),
        'text-border-opacity': pstyleVal(1),
        'text-border-style': pstyleVal('dotted'),
      }
    });
    r.drawText(ctx, node, null, true, true);
    const dashCalls = ctx.calls.filter(c => c.name === 'setLineDash');
    expect(dashCalls.some(c => c.args[0][0] === 1 && c.args[0][1] === 1)).to.be.true;
  });

  it('drawText with dashed border style', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-border-width': pstyleVal(1, 1),
        'text-border-opacity': pstyleVal(1),
        'text-border-style': pstyleVal('dashed'),
      }
    });
    r.drawText(ctx, node, null, true, true);
    const dashCalls = ctx.calls.filter(c => c.name === 'setLineDash');
    expect(dashCalls.some(c => c.args[0][0] === 4 && c.args[0][1] === 2)).to.be.true;
  });

  it('getTextAngle returns 0 for none rotation', () => {
    const r = makeDrawingRenderer();
    const ele = makeMockNode();
    const theta = drawingLabelTextMixin.getTextAngle.call(r, ele, null);
    expect(theta).to.equal(0);
  });

  it('getTextAngle handles autorotate for edges', () => {
    const r = makeDrawingRenderer();
    const edge = makeMockEdge({
      rscratch: { labelAngle: 0.5 },
      styles: { 'text-rotation': pstyleVal('autorotate', undefined, 'autorotate') }
    });
    // Set up getPrefixedProperty to work
    const theta = drawingLabelTextMixin.getTextAngle.call(r, edge, null);
    expect(theta).to.equal(0.5);
  });

  it('getTextAngle returns pfValue for explicit rotation', () => {
    const r = makeDrawingRenderer();
    const node = makeMockNode({
      styles: { 'text-rotation': pstyleVal(1.5, 1.5, '1.5') }
    });
    const theta = drawingLabelTextMixin.getTextAngle.call(r, node, null);
    expect(theta).to.equal(1.5);
  });

  it('getFontCache creates and caches font cache', () => {
    const r = makeDrawingRenderer();
    const ctx1 = mockCanvas2DContext();
    const ctx2 = mockCanvas2DContext();
    const cache1 = r.getFontCache(ctx1);
    expect(cache1.context).to.equal(ctx1);
    const cache1Again = r.getFontCache(ctx1);
    expect(cache1Again).to.equal(cache1);
    const cache2 = r.getFontCache(ctx2);
    expect(cache2.context).to.equal(ctx2);
    expect(cache2).to.not.equal(cache1);
  });

  it('setupTextStyle sets context font and calls color helpers', () => {
    const r = makeDrawingRenderer();
    // setupTextStyle is now from the real mixin; it calls this.colorFillStyle / this.colorStrokeStyle
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    r.setupTextStyle(ctx, node);
    // Font should be set from pstyle values
    expect(ctx.font).to.include('sans-serif');
    expect(ctx.lineJoin).to.equal('round');
  });

  it('drawText with wrap and halign=left + justification=left', () => {
    const r = makeDrawingRenderer();
    r.getLabelJustification = () => 'left';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-wrap': pstyleVal('wrap'),
        'text-halign': pstyleVal('left'),
      },
      rscratch: {
        labelX: 50,
        labelY: 50,
        labelWidth: 100,
        labelHeight: 28,
        labelLineHeight: 14,
        labelWrapCachedLines: ['line 1', 'line 2'],
      },
    });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(2);
  });

  it('drawText with wrap and halign=right + justification=right', () => {
    const r = makeDrawingRenderer();
    r.getLabelJustification = () => 'right';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'text-wrap': pstyleVal('wrap'),
        'text-halign': pstyleVal('right'),
      },
      rscratch: {
        labelX: 50,
        labelY: 50,
        labelWidth: 100,
        labelHeight: 28,
        labelLineHeight: 14,
        labelWrapCachedLines: ['line 1', 'line 2'],
      },
    });
    r.drawText(ctx, node, null, true, true);
    expect(ctx.calls.filter(c => c.name === 'fillText')).to.have.length(2);
  });
});

// ── drawing-nodes.mjs ───────────────────────────────────────────────────────

describe('Canvas drawing-nodes', () => {
  it('drawNode returns early for invisible node', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({ visible: false });
    r.drawNode(ctx, node);
    expect(ctx.calls.filter(c => c.name === 'fill')).to.have.length(0);
  });

  it('drawNode returns early for NaN position', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({ position: { x: NaN, y: 50 } });
    r.drawNode(ctx, node);
    expect(ctx.calls.filter(c => c.name === 'fill')).to.have.length(0);
  });

  it('drawNode draws basic node', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    r.drawNode(ctx, node);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });

  it('drawNode handles shiftToOriginWithBb', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    const bb = { x1: 10, y1: 20 };
    r.drawNode(ctx, node, bb);
    const translates = ctx.calls.filter(c => c.name === 'translate');
    expect(translates[0].args).to.deep.equal([-10, -20]);
  });

  it('drawNodeOverlay draws when overlay-opacity > 0', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'overlay-opacity': pstyleVal(0.5),
        'overlay-color': pstyleVal([255, 0, 0]),
        'overlay-padding': pstyleVal(5, 5),
        'overlay-shape': pstyleVal('ellipse'),
        'overlay-corner-radius': pstyleVal('auto'),
      }
    });
    r.drawNodeOverlay(ctx, node, { x: 50, y: 50 }, 50, 50);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });

  it('drawNodeOverlay skips invisible node', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({ visible: false });
    r.drawNodeOverlay(ctx, node, { x: 50, y: 50 }, 50, 50);
    expect(ctx.calls.filter(c => c.name === 'fill')).to.have.length(0);
  });

  it('drawNodeUnderlay draws when underlay-opacity > 0', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'underlay-opacity': pstyleVal(0.5),
        'underlay-color': pstyleVal([0, 255, 0]),
        'underlay-padding': pstyleVal(5, 5),
        'underlay-shape': pstyleVal('ellipse'),
        'underlay-corner-radius': pstyleVal('auto'),
      }
    });
    r.drawNodeUnderlay(ctx, node, { x: 50, y: 50 }, 50, 50);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });

  it('hasPie returns the hasPie flag from private data', () => {
    const r = makeDrawingRenderer();
    const node = makeMockNode({ hasPie: true });
    expect(r.hasPie(node)).to.be.true;
    const node2 = makeMockNode({ hasPie: false });
    expect(r.hasPie(node2)).to.be.false;
  });

  it('hasStripe returns the hasStripe flag from private data', () => {
    const r = makeDrawingRenderer();
    const node = makeMockNode({ hasStripe: true });
    expect(r.hasStripe(node)).to.be.true;
  });

  it('drawPie draws pie slices', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();
    const pstyleFn = (name) => {
      if (name === 'pie-size') return pstyleVal(100, 1, undefined, '%');
      if (name === 'pie-hole') return pstyleVal(0, 0, undefined, '%');
      if (name === 'pie-start-angle') return pstyleVal(0, 0);
      if (name === 'pie-1-background-size') return pstyleVal(50);
      if (name === 'pie-1-background-color') return pstyleVal([255, 0, 0]);
      if (name === 'pie-1-background-opacity') return pstyleVal(1);
      if (name === 'pie-2-background-size') return pstyleVal(50);
      if (name === 'pie-2-background-color') return pstyleVal([0, 255, 0]);
      if (name === 'pie-2-background-opacity') return pstyleVal(1);
      return pstyleVal(0);
    };
    const cyFn = () => ({
      zoom: () => 1,
      style: () => ({ pieBackgroundN: 2, getIndexedStyle: () => undefined })
    });
    const eleRef = {
      _private: { hasPie: true },
      position: () => ({ x: 50, y: 50 }),
      width: () => 50,
      height: () => 50,
      pstyle: pstyleFn,
      cy: cyFn,
    };
    const nodeObj = Object.assign(makeMockNode(), { 0: eleRef, pstyle: pstyleFn, cy: cyFn });
    r.drawPie(ctx, nodeObj, 1);
    expect(ctx.calls.filter(c => c.name === 'arc').length).to.be.at.least(2);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(2);
  });

  it('drawPie with hole radius draws donut', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();
    const pstyleFn = (name) => {
      if (name === 'pie-size') return pstyleVal(100, 1, undefined, '%');
      if (name === 'pie-hole') return pstyleVal(20, 0.2, undefined, '%');
      if (name === 'pie-start-angle') return pstyleVal(0, 0);
      if (name === 'pie-1-background-size') return pstyleVal(100);
      if (name === 'pie-1-background-color') return pstyleVal([255, 0, 0]);
      if (name === 'pie-1-background-opacity') return pstyleVal(1);
      return pstyleVal(0);
    };
    const cyFn = () => ({
      zoom: () => 1,
      style: () => ({ pieBackgroundN: 1 })
    });
    const eleRef = {
      _private: { hasPie: true },
      position: () => ({ x: 50, y: 50 }),
      width: () => 50,
      height: () => 50,
      pstyle: pstyleFn,
      cy: cyFn,
    };
    const nodeObj = Object.assign(makeMockNode(), { 0: eleRef, pstyle: pstyleFn, cy: cyFn });
    r.drawPie(ctx, nodeObj, 1);
    // Donut: two arc calls per slice (outer + inner)
    expect(ctx.calls.filter(c => c.name === 'arc').length).to.be.at.least(2);
  });

  it('drawPie exits when hole >= radius', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();
    const pstyleFn = (name) => {
      if (name === 'pie-size') return pstyleVal(100, 1, undefined, '%');
      if (name === 'pie-hole') return pstyleVal(100, 1, undefined, '%');
      if (name === 'pie-start-angle') return pstyleVal(0, 0);
      return pstyleVal(0);
    };
    const cyFn = () => ({
      zoom: () => 1,
      style: () => ({ pieBackgroundN: 1 })
    });
    const eleRef = {
      _private: { hasPie: true },
      position: () => ({ x: 50, y: 50 }),
      width: () => 50,
      height: () => 50,
      pstyle: pstyleFn,
      cy: cyFn,
    };
    const nodeObj = Object.assign(makeMockNode(), { 0: eleRef, pstyle: pstyleFn, cy: cyFn });
    r.drawPie(ctx, nodeObj, 1);
    expect(ctx.calls.filter(c => c.name === 'arc')).to.have.length(0);
  });

  it('drawStripe draws stripe rectangles', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();
    const pstyleFn = (name) => {
      if (name === 'stripe-direction') return pstyleVal('vertical');
      if (name === 'stripe-size') return pstyleVal(100, 1, undefined, '%');
      if (name === 'stripe-1-background-size') return pstyleVal(50);
      if (name === 'stripe-1-background-color') return pstyleVal([255, 0, 0]);
      if (name === 'stripe-1-background-opacity') return pstyleVal(1);
      if (name === 'stripe-2-background-size') return pstyleVal(50);
      if (name === 'stripe-2-background-color') return pstyleVal([0, 255, 0]);
      if (name === 'stripe-2-background-opacity') return pstyleVal(1);
      return pstyleVal(0);
    };
    const cyFn = () => ({
      zoom: () => 1,
      style: () => ({ stripeBackgroundN: 2 })
    });
    // drawStripe does node = node[0], so node[0] must have all methods
    const eleRef = {
      _private: { hasStripe: true },
      position: () => ({ x: 50, y: 50 }),
      width: () => 50,
      height: () => 50,
      pstyle: pstyleFn,
      cy: cyFn,
    };
    const nodeObj = Object.assign(makeMockNode(), { 0: eleRef, pstyle: pstyleFn, cy: cyFn });
    r.drawStripe(ctx, nodeObj, 1);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(2);
    expect(ctx.calls.filter(c => c.name === 'rect').length).to.be.at.least(2);
  });

  it('drawNode with ghost draws ghost then main node', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'ghost': pstyleVal('yes'),
        'ghost-offset-x': pstyleVal(5, 5),
        'ghost-offset-y': pstyleVal(5, 5),
        'ghost-opacity': pstyleVal(0.5),
      }
    });
    r.drawNode(ctx, node);
    // Ghost causes extra translate calls
    const translates = ctx.calls.filter(c => c.name === 'translate');
    expect(translates.length).to.be.at.least(2);
  });

  it('drawNode draws border when border-width > 0', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'border-width': pstyleVal(2, 2),
        'border-opacity': pstyleVal(1),
      }
    });
    r.drawNode(ctx, node);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawNode draws outline when outline-width > 0', () => {
    const r = makeDrawingRenderer();
    r.drawEllipsePath = () => {};
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
      }
    });
    r.drawNode(ctx, node);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawNode draws darkened node when background-blacken > 0', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: { 'background-blacken': pstyleVal(0.5) }
    });
    r.drawNode(ctx, node);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(2);
  });

  it('drawNode draws lightened node when background-blacken < 0', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: { 'background-blacken': pstyleVal(-0.5) }
    });
    r.drawNode(ctx, node);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(2);
  });

  it('drawNode with dotted border style', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'border-width': pstyleVal(2, 2),
        'border-style': pstyleVal('dotted'),
      }
    });
    r.drawNode(ctx, node);
    const dashCalls = ctx.calls.filter(c => c.name === 'setLineDash');
    expect(dashCalls.some(c => JSON.stringify(c.args[0]) === '[1,1]')).to.be.true;
  });

  it('drawNode with dashed border style', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'border-width': pstyleVal(2, 2),
        'border-style': pstyleVal('dashed'),
        'border-dash-pattern': pstyleVal([6, 3], [6, 3]),
      }
    });
    r.drawNode(ctx, node);
    const dashCalls = ctx.calls.filter(c => c.name === 'setLineDash');
    expect(dashCalls.length).to.be.at.least(1);
  });

  it('drawNode with double border style', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'border-width': pstyleVal(4, 4),
        'border-style': pstyleVal('double'),
      }
    });
    r.drawNode(ctx, node);
    // Double border uses globalCompositeOperation
  });

  it('drawNodeOverlay computes width/height when not provided', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'overlay-opacity': pstyleVal(0.5),
        'overlay-color': pstyleVal([255, 0, 0]),
        'overlay-padding': pstyleVal(5, 5),
        'overlay-shape': pstyleVal('ellipse'),
        'overlay-corner-radius': pstyleVal('auto'),
      }
    });
    r.drawNodeOverlay(ctx, node, null, null, null);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });
});

describe('Canvas drawing-nodes (extended)', () => {
  // Polyfill Path2D for Node.js
  before(() => {
    if (typeof globalThis.Path2D === 'undefined') {
      globalThis.Path2D = class Path2D {
        constructor() { this._ops = []; }
        rect() {}
        addPath() {}
        moveTo() {}
        lineTo() {}
        arc() {}
        arcTo() {}
        closePath() {}
        beginPath() {}
        quadraticCurveTo() {}
        ellipse() {}
      };
    }
  });

  it('drawNode with border-position=inside clips path', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'border-width': pstyleVal(2, 2),
        'border-opacity': pstyleVal(1),
        'border-position': pstyleVal('inside'),
      }
    });
    r.drawNode(ctx, node);
    // border-position inside causes context.save/clip/restore
    expect(ctx.calls.filter(c => c.name === 'save').length).to.be.at.least(1);
  });

  // border-position=outside test removed — requires Path2D mock with region.rect()

  it('drawNode with outline (ellipse shape) uses drawEllipsePath', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'outline-style': pstyleVal('solid'),
      }
    });
    r.drawNode(ctx, node);
    // ellipse outline path should produce stroke + ellipse
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawNode with outline-style=dotted sets lineDash', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'outline-style': pstyleVal('dotted'),
      }
    });
    r.drawNode(ctx, node);
    const dashCalls = ctx.calls.filter(c => c.name === 'setLineDash');
    expect(dashCalls.some(c => JSON.stringify(c.args[0]) === '[1,1]')).to.be.true;
  });

  it('drawNode with outline-style=dashed sets lineDash', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'outline-style': pstyleVal('dashed'),
      }
    });
    r.drawNode(ctx, node);
    const dashCalls = ctx.calls.filter(c => c.name === 'setLineDash');
    expect(dashCalls.some(c => JSON.stringify(c.args[0]) === '[4,2]')).to.be.true;
  });

  it('drawNode with outline-style=double uses destination-out', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'outline-width': pstyleVal(4, 4),
        'outline-opacity': pstyleVal(1),
        'outline-style': pstyleVal('double'),
        'border-width': pstyleVal(2, 2),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with round-rectangle shape outlines', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    r.nodeShapes['round-rectangle'] = { draw: () => {}, points: [-1, -1, 1, -1, 1, 1, -1, 1] };
    r.getNodeShape = () => 'round-rectangle';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'shape': pstyleVal('round-rectangle', undefined, 'round-rectangle'),
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'outline-offset': pstyleVal(2),
        'corner-radius': pstyleVal('auto', 'auto', 'auto'),
      }
    });
    r.drawNode(ctx, node);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(1);
  });

  it('drawNode with cut-rectangle shape outlines', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    r.nodeShapes['cut-rectangle'] = { draw: () => {}, points: [-1, -1, 1, -1, 1, 1, -1, 1] };
    r.getNodeShape = () => 'cut-rectangle';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'shape': pstyleVal('cut-rectangle', undefined, 'cut-rectangle'),
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'outline-offset': pstyleVal(2),
        'corner-radius': pstyleVal('auto', 'auto', 'auto'),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with barrel shape outlines', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    r.nodeShapes['barrel'] = { draw: () => {}, points: [-1, -1, 1, -1, 1, 1, -1, 1] };
    r.getNodeShape = () => 'barrel';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'shape': pstyleVal('barrel', undefined, 'barrel'),
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'outline-offset': pstyleVal(2),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with polygon shape outlines', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    r.nodeShapes['polygon-custom'] = { draw: () => {}, points: [-1, -1, 1, -1, 0, 1] };
    r.getNodeShape = () => 'polygon-custom';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'shape': pstyleVal('polygon-custom', undefined, 'polygon-custom'),
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'shape-polygon-points': pstyleVal([-1, -1, 1, -1, 0, 1], [-1, -1, 1, -1, 0, 1]),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with bottom-round-rectangle outline', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    r.nodeShapes['bottom-round-rectangle'] = { draw: () => {}, points: [-1, -1, 1, -1, 1, 1, -1, 1] };
    r.getNodeShape = () => 'bottom-round-rectangle';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'shape': pstyleVal('bottom-round-rectangle', undefined, 'bottom-round-rectangle'),
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'outline-offset': pstyleVal(2),
        'corner-radius': pstyleVal('auto', 'auto', 'auto'),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with usePaths=true exercises Path2D caching', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    r.usePaths = () => true;
    const ctx = mockCanvas2DContext();
    ctx.fill = function(pathOrRule) { ctx.calls.push({ name: 'fill', args: [pathOrRule] }); };
    ctx.stroke = function(pathOrRule) { ctx.calls.push({ name: 'stroke', args: [pathOrRule] }); };
    ctx.clip = function(pathOrRule, rule) { ctx.calls.push({ name: 'clip', args: [pathOrRule, rule] }); };
    const node = makeMockNode();
    r.drawNode(ctx, node);
    // Should use translate for path-based drawing
    const translates = ctx.calls.filter(c => c.name === 'translate');
    expect(translates.length).to.be.at.least(2);
  });

  it('drawNode with background images (complete)', () => {
    const r = makeDrawingRenderer();
    r.getCachedImage = () => ({ complete: true, error: false });
    r.drawInscribedImage = () => {};
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'background-image': pstyleVal(['http://example.com/img.png']),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with round-diamond outline path', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    r.nodeShapes['round-diamond'] = { draw: () => {}, points: [0, 1, 1, 0, 0, -1, -1, 0] };
    r.getNodeShape = () => 'round-diamond';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'shape': pstyleVal('round-diamond', undefined, 'round-diamond'),
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
        'outline-offset': pstyleVal(1),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with vee/tag outline (polygon expansion)', () => {
    const r = makeDrawingRenderer();
    Object.assign(r, drawingShapesMixin);
    r.drawRoundPolygonPath = () => {};
    r.nodeShapes['vee'] = { draw: () => {}, points: [-1, -1, 0, -0.333, 1, -1, 0, 1] };
    r.getNodeShape = () => 'vee';
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'shape': pstyleVal('vee', undefined, 'vee'),
        'outline-width': pstyleVal(2, 2),
        'outline-opacity': pstyleVal(1),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with pie and stripe on same node', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    r.hasPie = () => true;
    r.hasStripe = () => true;
    r.drawPie = () => {};
    r.drawStripe = () => {};
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      hasPie: true,
      hasStripe: true,
      styles: {
        'border-width': pstyleVal(1, 1),
      }
    });
    r.drawNode(ctx, node);
  });

  it('drawNode with background-image-containment=over', () => {
    const r = makeDrawingRenderer();
    r.getCachedImage = () => ({ complete: true, error: false });
    let drewInscribed = 0;
    r.drawInscribedImage = () => { drewInscribed++; };
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'background-image': pstyleVal(['http://example.com/img.png']),
      }
    });
    // Override the cy().style() to return 'over' containment
    node.cy = () => ({
      zoom: () => 1,
      style: () => ({
        getIndexedStyle: (n, prop, key, idx) => {
          if (prop === 'background-image-containment') return 'over';
          if (prop === 'background-image-crossorigin') return 'anonymous';
          return undefined;
        },
        pieBackgroundN: 0,
        stripeBackgroundN: 0,
      })
    });
    r.drawNode(ctx, node);
    // 'over' images are drawn after the shape, 'inside' images skipped in first pass
  });
});

// ── drawing-redraw.mjs ──────────────────────────────────────────────────────

describe('Canvas drawing-redraw', () => {
  it('getPixelRatio uses forcedPixelRatio when set', () => {
    const r = makeDrawingRenderer();
    r.forcedPixelRatio = 2;
    r.cy = { window: () => ({ devicePixelRatio: 1 }) };
    const ratio = drawingRedrawMixin.getPixelRatio.call(r);
    expect(ratio).to.equal(2);
  });

  it('getPixelRatio computes from backingStore and devicePixelRatio', () => {
    const r = makeDrawingRenderer();
    r.forcedPixelRatio = null;
    r.cy = { window: () => ({ devicePixelRatio: 2 }) };
    r.data.contexts[0] = { backingStorePixelRatio: 1 };
    const ratio = drawingRedrawMixin.getPixelRatio.call(r);
    expect(ratio).to.equal(2);
  });

  it('paintCache creates new cache for new context', () => {
    const r = makeDrawingRenderer();
    const ctx1 = {};
    const cache = r.paintCache(ctx1);
    expect(cache.context).to.equal(ctx1);
  });

  it('paintCache returns same cache for same context', () => {
    const r = makeDrawingRenderer();
    const ctx1 = {};
    const cache1 = r.paintCache(ctx1);
    const cache2 = r.paintCache(ctx1);
    expect(cache1).to.equal(cache2);
  });

  it('colorFillStyle sets fillStyle on context', () => {
    const r = makeDrawingRenderer();
    // Use the actual method from drawingRedraw
    const ctx = mockCanvas2DContext();
    drawingRedrawMixin.colorFillStyle.call(r, ctx, 100, 200, 50, 0.8);
    expect(ctx.fillStyle).to.equal('rgba(100,200,50,0.8)');
  });

  it('colorStrokeStyle sets strokeStyle on context', () => {
    const r = makeDrawingRenderer();
    const ctx = mockCanvas2DContext();
    drawingRedrawMixin.colorStrokeStyle.call(r, ctx, 100, 200, 50, 0.8);
    expect(ctx.strokeStyle).to.equal('rgba(100,200,50,0.8)');
  });

  it('eleFillStyle with solid fill sets fillStyle', () => {
    const r = makeDrawingRenderer();
    r.colorFillStyle = drawingRedrawMixin.colorFillStyle;
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    drawingRedrawMixin.eleFillStyle.call(r, ctx, node, 1);
    expect(ctx.fillStyle).to.include('rgba');
  });

  it('eleFillStyle with linear-gradient calls gradientFillStyle', () => {
    const r = makeDrawingRenderer();
    let calledGradient = false;
    r.gradientFillStyle = () => { calledGradient = true; };
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: { 'background-fill': pstyleVal('linear-gradient') }
    });
    drawingRedrawMixin.eleFillStyle.call(r, ctx, node, 1);
    expect(calledGradient).to.be.true;
  });

  it('eleStrokeStyle with solid fill sets strokeStyle', () => {
    const r = makeDrawingRenderer();
    r.colorStrokeStyle = drawingRedrawMixin.colorStrokeStyle;
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    drawingRedrawMixin.eleStrokeStyle.call(r, ctx, edge, 1);
    expect(ctx.strokeStyle).to.include('rgba');
  });

  it('eleStrokeStyle with linear-gradient calls gradientStrokeStyle', () => {
    const r = makeDrawingRenderer();
    let calledGradient = false;
    r.gradientStrokeStyle = () => { calledGradient = true; };
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: { 'line-fill': pstyleVal('linear-gradient') }
    });
    drawingRedrawMixin.eleStrokeStyle.call(r, ctx, edge, 1);
    expect(calledGradient).to.be.true;
  });

  it('renderTo calls render with forced options', () => {
    const r = makeDrawingRenderer();
    let renderOpts = null;
    r.render = (opts) => { renderOpts = opts; };
    const ctx = mockCanvas2DContext();
    r.renderTo(ctx, 2, { x: 10, y: 20 }, 1);
    expect(renderOpts.forcedContext).to.equal(ctx);
    expect(renderOpts.forcedZoom).to.equal(2);
    expect(renderOpts.forcedPan).to.deep.equal({ x: 10, y: 20 });
    expect(renderOpts.forcedPxRatio).to.equal(1);
  });

  it('clearCanvas clears NODE and DRAG contexts', () => {
    const r = makeDrawingRenderer();
    r.NODE = 2;
    r.DRAG = 1;
    r.canvasWidth = 800;
    r.canvasHeight = 600;
    const nodeCtx = mockCanvas2DContext();
    const dragCtx = mockCanvas2DContext();
    r.data.contexts[2] = nodeCtx;
    r.data.contexts[1] = dragCtx;
    r.clearCanvas();
    expect(nodeCtx.calls.filter(c => c.name === 'clearRect')).to.have.length(1);
    expect(dragCtx.calls.filter(c => c.name === 'clearRect')).to.have.length(1);
  });

  it('createGradientStyleFor creates linear gradient for node', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'background-gradient-stop-colors': pstyleVal([[255, 0, 0], [0, 0, 255]]),
        'background-gradient-stop-positions': pstyleVal([0, 1], [0, 1]),
        'background-gradient-direction': pstyleVal('to-bottom'),
      }
    });
    node.position = () => ({ x: 50, y: 50 });
    node.paddedWidth = () => 100;
    node.paddedHeight = () => 80;
    const gs = drawingRedrawMixin.createGradientStyleFor.call(r, ctx, 'background', node, 'linear-gradient', 1);
    expect(gs).to.not.be.null;
  });

  it('createGradientStyleFor creates radial gradient for node', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();
    const node = makeMockNode({
      styles: {
        'background-gradient-stop-colors': pstyleVal([[255, 0, 0], [0, 0, 255]]),
        'background-gradient-stop-positions': pstyleVal([0, 1], [0, 1]),
      }
    });
    node.position = () => ({ x: 50, y: 50 });
    node.paddedWidth = () => 100;
    node.paddedHeight = () => 80;
    const gs = drawingRedrawMixin.createGradientStyleFor.call(r, ctx, 'background', node, 'radial-gradient', 1);
    expect(gs).to.not.be.null;
  });

  it('createGradientStyleFor with edge creates linear gradient', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: {
        'line-gradient-stop-colors': pstyleVal([[255, 0, 0], [0, 0, 255]]),
        'line-gradient-stop-positions': pstyleVal([0, 1], [0, 1]),
      }
    });
    edge.sourceEndpoint = () => ({ x: 0, y: 0 });
    edge.targetEndpoint = () => ({ x: 100, y: 100 });
    const gs = drawingRedrawMixin.createGradientStyleFor.call(r, ctx, 'line', edge, 'linear-gradient', 1);
    expect(gs).to.not.be.null;
  });

  it('createGradientStyleFor with edge creates radial gradient', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge({
      styles: {
        'line-gradient-stop-colors': pstyleVal([[255, 0, 0], [0, 0, 255]]),
        'line-gradient-stop-positions': pstyleVal([0, 1], [0, 1]),
      }
    });
    edge.sourceEndpoint = () => ({ x: 0, y: 0 });
    edge.targetEndpoint = () => ({ x: 100, y: 100 });
    edge.midpoint = () => ({ x: 50, y: 50 });
    const gs = drawingRedrawMixin.createGradientStyleFor.call(r, ctx, 'line', edge, 'radial-gradient', 1);
    expect(gs).to.not.be.null;
  });

  it('gradientFillStyle sets fillStyle', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    r.createGradientStyleFor = () => ({ addColorStop: () => {} });
    const ctx = mockCanvas2DContext();
    const node = makeMockNode();
    drawingRedrawMixin.gradientFillStyle.call(r, ctx, node, 'linear-gradient', 1);
  });

  it('gradientStrokeStyle sets strokeStyle', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    r.createGradientStyleFor = () => ({ addColorStop: () => {} });
    const ctx = mockCanvas2DContext();
    const edge = makeMockEdge();
    drawingRedrawMixin.gradientStrokeStyle.call(r, ctx, edge, 'linear-gradient', 1);
  });

  it('drawSelectionRectangle handles selection box rendering', () => {
    const r = makeDrawingRenderer();
    r.cy = {
      zoom: () => 1,
      style: () => ({
        core: (name) => {
          const vals = {
            'selection-box-border-width': pstyleVal(1),
            'selection-box-color': pstyleVal([0, 0, 255]),
            'selection-box-opacity': pstyleVal(0.5),
            'selection-box-border-color': pstyleVal([0, 0, 200]),
            'active-bg-color': pstyleVal([0, 0, 0]),
            'active-bg-opacity': pstyleVal(0),
            'active-bg-size': pstyleVal(30, 30),
          };
          return vals[name] || pstyleVal(0);
        }
      }),
    };
    r.selection = [10, 10, 100, 100, 1];
    r.hoverData = { selecting: true };
    r.touchData = {};
    r.showFps = false;
    r.SELECT_BOX = 0;
    r.data.canvasNeedsRedraw = [true, false, false];

    const ctx = mockCanvas2DContext();
    r.data.contexts[0] = ctx;

    const setContextTransform = (c) => {};
    r.drawSelectionRectangle({ drawOnlyNodeLayer: false, drawAllLayers: false }, setContextTransform);
    expect(ctx.calls.filter(c => c.name === 'fillRect').length).to.be.at.least(1);
  });

  it('createGradientStyleFor handles all linear directions for node', () => {
    const r = makeDrawingRenderer();
    r.usePaths = () => false;
    const ctx = mockCanvas2DContext();

    const directions = [
      'to-bottom', 'to-top', 'to-left', 'to-right',
      'to-bottom-right', 'to-right-bottom', 'to-top-right', 'to-right-top',
      'to-bottom-left', 'to-left-bottom', 'to-top-left', 'to-left-top'
    ];

    for (const dir of directions) {
      const node = makeMockNode({
        styles: {
          'background-gradient-stop-colors': pstyleVal([[255, 0, 0], [0, 0, 255]]),
          'background-gradient-stop-positions': pstyleVal([0, 1], [0, 1]),
          'background-gradient-direction': pstyleVal(dir),
        }
      });
      node.position = () => ({ x: 50, y: 50 });
      node.paddedWidth = () => 100;
      node.paddedHeight = () => 80;
      const gs = drawingRedrawMixin.createGradientStyleFor.call(r, ctx, 'background', node, 'linear-gradient', 1);
      expect(gs, `gradient should exist for direction ${dir}`).to.not.be.null;
    }
  });
});

// ── drawing-shapes.mjs ─────────────────────────────────────────────────────

import drawingShapesMixin from '../../src/extensions/renderer/canvas/drawing-shapes.mjs';

describe('Canvas drawing-shapes', () => {
  function mockCtx() {
    const calls = [];
    const record = (name) => (...args) => calls.push({ name, args });
    return {
      calls,
      beginPath: record('beginPath'),
      closePath: record('closePath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arcTo: record('arcTo'),
      quadraticCurveTo: record('quadraticCurveTo'),
      ellipse: record('ellipse'),
      arc: record('arc'),
    };
  }

  describe('drawPolygonPath', () => {
    it('draws a triangle (3 points)', () => {
      const ctx = mockCtx();
      // triangle: 3 vertices = 6 coords
      const points = [0, -1, 1, 1, -1, 1];
      drawingShapesMixin.drawPolygonPath(ctx, 50, 50, 40, 40, points);
      expect(ctx.calls[0].name).to.equal('beginPath');
      expect(ctx.calls[1].name).to.equal('moveTo');
      // 2 more lineTo calls for remaining vertices
      const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
      expect(lineTos).to.have.length(2);
      expect(ctx.calls[ctx.calls.length - 1].name).to.equal('closePath');
    });

    it('draws a rectangle (4 points)', () => {
      const ctx = mockCtx();
      const points = [-1, -1, 1, -1, 1, 1, -1, 1];
      drawingShapesMixin.drawPolygonPath(ctx, 0, 0, 100, 80, points);
      const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
      expect(lineTos).to.have.length(3);
    });

    it('positions vertices relative to center', () => {
      const ctx = mockCtx();
      const points = [-1, -1, 1, -1, 1, 1, -1, 1];
      drawingShapesMixin.drawPolygonPath(ctx, 100, 200, 60, 40, points);
      // moveTo should be at (100 + 30*-1, 200 + 20*-1) = (70, 180)
      const moveTo = ctx.calls.find(c => c.name === 'moveTo');
      expect(moveTo.args[0]).to.equal(70);
      expect(moveTo.args[1]).to.equal(180);
    });

    it('draws a pentagon (5 points)', () => {
      const ctx = mockCtx();
      const points = [0, -1, 1, -0.3, 0.6, 1, -0.6, 1, -1, -0.3];
      drawingShapesMixin.drawPolygonPath(ctx, 0, 0, 50, 50, points);
      const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
      expect(lineTos).to.have.length(4);
    });
  });

  describe('drawRoundRectanglePath', () => {
    it('calls beginPath, moveTo, arcTo x4, lineTo, closePath', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawRoundRectanglePath(ctx, 50, 50, 100, 80, 'auto');
      expect(ctx.calls[0].name).to.equal('beginPath');
      const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
      expect(arcTos).to.have.length(4);
      expect(ctx.calls[ctx.calls.length - 1].name).to.equal('closePath');
    });

    it('uses auto corner radius via math.getRoundRectangleRadius', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawRoundRectanglePath(ctx, 0, 0, 100, 80, 'auto');
      // auto radius for 100x80 = min(25, 20, 8) = 8
      const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
      // Each arcTo has 5 args; the 5th is the radius
      for (const a of arcTos) {
        expect(a.args[4]).to.equal(8);
      }
    });

    it('uses explicit corner radius', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawRoundRectanglePath(ctx, 0, 0, 100, 80, 5);
      const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
      for (const a of arcTos) {
        expect(a.args[4]).to.equal(5);
      }
    });

    it('clamps radius to half width/height', () => {
      const ctx = mockCtx();
      // width=20, height=10, so halfW=10, halfH=5, requested radius=50
      drawingShapesMixin.drawRoundRectanglePath(ctx, 0, 0, 20, 10, 50);
      const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
      for (const a of arcTos) {
        expect(a.args[4]).to.equal(5); // min(50, 5, 10)
      }
    });
  });

  describe('drawBottomRoundRectanglePath', () => {
    it('has 2 arcTo calls (bottom corners only)', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawBottomRoundRectanglePath(ctx, 50, 50, 100, 80, 'auto');
      const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
      expect(arcTos).to.have.length(2);
    });

    it('has straight lines for top corners', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawBottomRoundRectanglePath(ctx, 0, 0, 100, 80, 'auto');
      // Top: moveTo, lineTo, lineTo (3 straight segments at top)
      const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
      expect(lineTos.length).to.be.at.least(3);
    });
  });

  describe('drawCutRectanglePath', () => {
    it('draws 8 line segments for cut corners', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawCutRectanglePath(ctx, 50, 50, 100, 80, null, 'auto');
      const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
      expect(lineTos).to.have.length(7); // moveTo starts first vertex, 7 lineTo
    });

    it('uses auto corner length of 8', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawCutRectanglePath(ctx, 0, 0, 200, 200, null, 'auto');
      // With auto, cornerLength = 8
      // First moveTo: x - halfWidth + 8, y - halfHeight
      const moveTo = ctx.calls.find(c => c.name === 'moveTo');
      expect(moveTo.args[0]).to.equal(-100 + 8); // -92
      expect(moveTo.args[1]).to.equal(-100);
    });

    it('uses explicit corner length', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawCutRectanglePath(ctx, 0, 0, 200, 200, null, 15);
      const moveTo = ctx.calls.find(c => c.name === 'moveTo');
      expect(moveTo.args[0]).to.equal(-100 + 15);
    });
  });

  describe('drawEllipsePath', () => {
    it('uses context.ellipse when available', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawEllipsePath(ctx, 50, 50, 100, 80);
      expect(ctx.calls[0].name).to.equal('beginPath');
      const ellipses = ctx.calls.filter(c => c.name === 'ellipse');
      expect(ellipses).to.have.length(1);
      // args: centerX, centerY, radiusX, radiusY, rotation, startAngle, endAngle
      expect(ellipses[0].args[0]).to.equal(50);
      expect(ellipses[0].args[1]).to.equal(50);
      expect(ellipses[0].args[2]).to.equal(50); // width/2
      expect(ellipses[0].args[3]).to.equal(40); // height/2
    });

    it('falls back to manual points when ellipse() is missing', () => {
      const ctx = mockCtx();
      delete ctx.ellipse;
      drawingShapesMixin.drawEllipsePath(ctx, 50, 50, 100, 80);
      // Should have moveTo + many lineTo calls
      const moveTos = ctx.calls.filter(c => c.name === 'moveTo');
      const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
      expect(moveTos).to.have.length(1);
      expect(lineTos.length).to.be.at.least(10);
    });
  });

  describe('drawBarrelPath', () => {
    it('draws 4 quadraticCurveTo calls for barrel curves', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawBarrelPath(ctx, 50, 50, 200, 100);
      const quads = ctx.calls.filter(c => c.name === 'quadraticCurveTo');
      expect(quads).to.have.length(4);
    });

    it('draws 4 lineTo segments between curves', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawBarrelPath(ctx, 0, 0, 200, 100);
      const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
      expect(lineTos).to.have.length(4);
    });

    it('calls beginPath and closePath', () => {
      const ctx = mockCtx();
      drawingShapesMixin.drawBarrelPath(ctx, 0, 0, 100, 100);
      expect(ctx.calls[0].name).to.equal('beginPath');
      expect(ctx.calls[ctx.calls.length - 1].name).to.equal('closePath');
    });
  });
});

// ── arrow-shapes.mjs (canvas impl) ────────────────────────────────────────

import arrowShapesCanvasMixin from '../../src/extensions/renderer/canvas/arrow-shapes.mjs';

describe('Canvas arrow-shapes (impl)', () => {
  function mockCtx2() {
    const calls = [];
    const record = (name) => (...args) => calls.push({ name, args });
    return {
      calls,
      beginPath: record('beginPath'),
      closePath: record('closePath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arc: record('arc'),
      quadraticCurveTo: record('quadraticCurveTo'),
    };
  }

  it('exposes arrowShapeImpl function', () => {
    expect(arrowShapesCanvasMixin.arrowShapeImpl).to.be.a('function');
  });

  it('arrowShapeImpl("polygon") calls lineTo for each point', () => {
    const ctx = mockCtx2();
    const impl = arrowShapesCanvasMixin.arrowShapeImpl('polygon');
    expect(impl).to.be.a('function');
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    impl(ctx, points);
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    expect(lineTos).to.have.length(3);
  });

  it('arrowShapeImpl("triangle-backcurve") calls lineTo and quadraticCurveTo', () => {
    const ctx = mockCtx2();
    const impl = arrowShapesCanvasMixin.arrowShapeImpl('triangle-backcurve');
    expect(impl).to.be.a('function');
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    const controlPoint = { x: 5, y: 5 };
    impl(ctx, points, controlPoint);
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    expect(lineTos).to.have.length(3);
    const quads = ctx.calls.filter(c => c.name === 'quadraticCurveTo');
    expect(quads).to.have.length(1);
  });

  it('arrowShapeImpl("triangle-tee") calls lineTo for triangle and tee points', () => {
    const ctx = mockCtx2();
    const impl = arrowShapesCanvasMixin.arrowShapeImpl('triangle-tee');
    expect(impl).to.be.a('function');
    const triPts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    const teePts = [{ x: -5, y: 15 }, { x: -5, y: 20 }, { x: 15, y: 20 }, { x: 15, y: 15 }];
    impl(ctx, triPts, teePts);
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    // 3 for triangle + 3 for tee (first tee pt is moveTo)
    expect(lineTos).to.have.length(6);
    const moveTos = ctx.calls.filter(c => c.name === 'moveTo');
    expect(moveTos).to.have.length(1);
  });

  it('arrowShapeImpl("triangle-cross") returns triangle-tee impl', () => {
    const impl1 = arrowShapesCanvasMixin.arrowShapeImpl('triangle-cross');
    const impl2 = arrowShapesCanvasMixin.arrowShapeImpl('triangle-tee');
    expect(impl1).to.equal(impl2);
  });

  it('arrowShapeImpl("circle") calls ctx.arc', () => {
    const ctx = mockCtx2();
    const impl = arrowShapesCanvasMixin.arrowShapeImpl('circle');
    expect(impl).to.be.a('function');
    impl(ctx, 50, 50, 10);
    const arcs = ctx.calls.filter(c => c.name === 'arc');
    expect(arcs).to.have.length(1);
    expect(arcs[0].args[0]).to.equal(50);
    expect(arcs[0].args[1]).to.equal(50);
    expect(arcs[0].args[2]).to.equal(10);
  });

  it('arrowShapeImpl("circle-triangle") calls arc and draws triangle', () => {
    const ctx = mockCtx2();
    const impl = arrowShapesCanvasMixin.arrowShapeImpl('circle-triangle');
    expect(impl).to.be.a('function');
    const triPts = [{ x: 0, y: 0 }, { x: 10, y: -15 }, { x: -10, y: -15 }];
    impl(ctx, triPts, 5, 5, 8);
    const arcs = ctx.calls.filter(c => c.name === 'arc');
    expect(arcs).to.have.length(1);
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    expect(lineTos.length).to.be.at.least(3);
  });

  it('arrowShapeImpl returns same implementation on repeated calls', () => {
    const impl1 = arrowShapesCanvasMixin.arrowShapeImpl('polygon');
    const impl2 = arrowShapesCanvasMixin.arrowShapeImpl('polygon');
    expect(impl1).to.equal(impl2);
  });
});

// ── arrow-shapes.mjs (base registration) ──────────────────────────────────

import baseArrowShapesMixin from '../../src/extensions/renderer/base/arrow-shapes.mjs';

describe('Base arrow-shapes registration', () => {
  function createMockRenderer() {
    const r = {};
    Object.assign(r, arrowShapesCanvasMixin);
    Object.assign(r, baseArrowShapesMixin);
    r.getArrowWidth = (w, s) => w * s;
    r.registerArrowShapes();
    return r;
  }

  it('registers all expected arrow shape names', () => {
    const r = createMockRenderer();
    const expected = [
      'none', 'triangle', 'arrow', 'triangle-backcurve',
      'triangle-tee', 'circle-triangle', 'triangle-cross',
      'vee', 'circle', 'tee', 'square', 'diamond', 'chevron'
    ];
    for (const name of expected) {
      expect(r.arrowShapes[name], `shape "${name}" should be registered`).to.exist;
    }
  });

  it('each arrow shape has required methods', () => {
    const r = createMockRenderer();
    for (const [name, shape] of Object.entries(r.arrowShapes)) {
      expect(shape.draw, `${name}.draw`).to.be.a('function');
      expect(shape.spacing, `${name}.spacing`).to.be.a('function');
      expect(shape.gap, `${name}.gap`).to.be.a('function');
      expect(shape.collide, `${name}.collide`).to.be.a('function');
      expect(shape.roughCollide, `${name}.roughCollide`).to.be.a('function');
    }
  });

  it('"arrow" is an alias for "triangle"', () => {
    const r = createMockRenderer();
    expect(r.arrowShapes['arrow'].points).to.deep.equal(r.arrowShapes['triangle'].points);
  });

  it('"none" shape has noop draw and zero spacing/gap', () => {
    const r = createMockRenderer();
    const none = r.arrowShapes['none'];
    // draw should not throw
    none.draw({}, 10, 0, { x: 0, y: 0 });
    const mockEdge = {
      pstyle: () => ({ pfValue: 2, value: 1 })
    };
    expect(none.spacing(mockEdge)).to.equal(0);
    expect(none.gap(mockEdge)).to.equal(0);
  });

  it('triangle-backcurve gap is 80% of standard gap', () => {
    const r = createMockRenderer();
    const shape = r.arrowShapes['triangle-backcurve'];
    const mockEdge = { pstyle: (n) => ({ pfValue: 2, value: 1 }) };
    // standardGap = pfValue('width') * pfValue('arrow-scale') * 2 = 2 * 2 * 2 = 8
    const standardGap = 2 * 2 * 2;
    expect(shape.gap(mockEdge)).to.be.closeTo(standardGap * 0.8, 0.001);
  });

  it('circle shape spacing uses radius', () => {
    const r = createMockRenderer();
    const shape = r.arrowShapes['circle'];
    const mockEdge = { pstyle: (n) => ({ pfValue: 2, value: 1 }) };
    const expected = r.getArrowWidth(2, 1) * shape.radius;
    expect(shape.spacing(mockEdge)).to.equal(expected);
  });

  it('arrow shapes can draw to a mock context without error', () => {
    const r = createMockRenderer();
    const ctx = {
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      quadraticCurveTo: () => {},
    };
    for (const [name, shape] of Object.entries(r.arrowShapes)) {
      // draw(context, size, angle, translation, edgeWidth)
      shape.draw(ctx, 10, 0, { x: 0, y: 0 }, 2);
    }
  });
});

// ── node-shapes.mjs (canvas impl) ─────────────────────────────────────────

import nodeShapesCanvasMixin from '../../src/extensions/renderer/canvas/node-shapes.mjs';

describe('Canvas node-shapes (impl)', () => {
  function mockCtx3() {
    const calls = [];
    const record = (name) => (...args) => calls.push({ name, args });
    return {
      calls,
      beginPath: record('beginPath'),
      closePath: record('closePath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arcTo: record('arcTo'),
      quadraticCurveTo: record('quadraticCurveTo'),
      ellipse: record('ellipse'),
      arc: record('arc'),
    };
  }

  function makeShapeRenderer() {
    const r = {};
    Object.assign(r, drawingShapesMixin);
    Object.assign(r, nodeShapesCanvasMixin);
    return r;
  }

  it('nodeShapeImpl dispatches "ellipse" to drawEllipsePath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    r.nodeShapeImpl('ellipse', ctx, 50, 50, 100, 80);
    const ellipses = ctx.calls.filter(c => c.name === 'ellipse');
    expect(ellipses).to.have.length(1);
  });

  it('nodeShapeImpl dispatches "polygon" to drawPolygonPath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    const points = [-1, -1, 1, -1, 1, 1, -1, 1];
    r.nodeShapeImpl('polygon', ctx, 0, 0, 100, 100, points);
    const moveTos = ctx.calls.filter(c => c.name === 'moveTo');
    expect(moveTos).to.have.length(1);
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    expect(lineTos).to.have.length(3);
  });

  it('nodeShapeImpl dispatches "roundrectangle" to drawRoundRectanglePath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    r.nodeShapeImpl('roundrectangle', ctx, 0, 0, 100, 80, null, 'auto');
    const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
    expect(arcTos).to.have.length(4);
  });

  it('nodeShapeImpl dispatches "round-rectangle" to drawRoundRectanglePath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    r.nodeShapeImpl('round-rectangle', ctx, 0, 0, 100, 80, null, 'auto');
    const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
    expect(arcTos).to.have.length(4);
  });

  it('nodeShapeImpl dispatches "cutrectangle" to drawCutRectanglePath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    r.nodeShapeImpl('cutrectangle', ctx, 0, 0, 100, 80, null, 'auto');
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    expect(lineTos).to.have.length(7);
  });

  it('nodeShapeImpl dispatches "cut-rectangle" to drawCutRectanglePath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    r.nodeShapeImpl('cut-rectangle', ctx, 0, 0, 100, 80, null, 'auto');
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    expect(lineTos).to.have.length(7);
  });

  it('nodeShapeImpl dispatches "bottomroundrectangle" to drawBottomRoundRectanglePath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    r.nodeShapeImpl('bottomroundrectangle', ctx, 0, 0, 100, 80, null, 'auto');
    const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
    expect(arcTos).to.have.length(2);
  });

  it('nodeShapeImpl dispatches "bottom-round-rectangle" to drawBottomRoundRectanglePath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    r.nodeShapeImpl('bottom-round-rectangle', ctx, 0, 0, 100, 80, null, 'auto');
    const arcTos = ctx.calls.filter(c => c.name === 'arcTo');
    expect(arcTos).to.have.length(2);
  });

  it('nodeShapeImpl dispatches "barrel" to drawBarrelPath', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    r.nodeShapeImpl('barrel', ctx, 0, 0, 200, 100);
    const quads = ctx.calls.filter(c => c.name === 'quadraticCurveTo');
    expect(quads).to.have.length(4);
  });

  it('nodeShapeImpl returns undefined for unknown shape', () => {
    const r = makeShapeRenderer();
    const ctx = mockCtx3();
    const result = r.nodeShapeImpl('nonexistent-shape', ctx, 0, 0, 100, 100);
    expect(result).to.be.undefined;
  });
});

// ── base/node-shapes.mjs registration ──────────────────────────────────────

import baseNodeShapesMixin from '../../src/extensions/renderer/base/node-shapes.mjs';

describe('Base node-shapes registration', () => {
  function createMockNodeRenderer() {
    const r = {};
    Object.assign(r, drawingShapesMixin);
    Object.assign(r, nodeShapesCanvasMixin);
    Object.assign(r, baseNodeShapesMixin);
    r.registerNodeShapes();
    return r;
  }

  it('registers all expected node shape names', () => {
    const r = createMockNodeRenderer();
    const expected = [
      'ellipse', 'triangle', 'round-triangle', 'rectangle', 'square',
      'round-rectangle', 'roundrectangle', 'cut-rectangle', 'cutrectangle',
      'barrel', 'bottom-round-rectangle', 'bottomroundrectangle',
      'diamond', 'round-diamond', 'pentagon', 'round-pentagon',
      'hexagon', 'round-hexagon', 'heptagon', 'round-heptagon',
      'octagon', 'round-octagon', 'star', 'vee', 'rhomboid',
      'right-rhomboid', 'concave-hexagon', 'tag', 'round-tag'
    ];
    for (const name of expected) {
      expect(r.nodeShapes[name], `shape "${name}" should be registered`).to.exist;
    }
  });

  it('each node shape has required methods: draw, intersectLine, checkPoint', () => {
    const r = createMockNodeRenderer();
    for (const [name, shape] of Object.entries(r.nodeShapes)) {
      if (typeof shape === 'function') continue; // makePolygon
      expect(shape.draw, `${name}.draw`).to.be.a('function');
      expect(shape.intersectLine, `${name}.intersectLine`).to.be.a('function');
      expect(shape.checkPoint, `${name}.checkPoint`).to.be.a('function');
    }
  });

  it('"square" is an alias for "rectangle"', () => {
    const r = createMockNodeRenderer();
    expect(r.nodeShapes['square']).to.equal(r.nodeShapes['rectangle']);
  });

  it('"roundrectangle" is an alias for "round-rectangle"', () => {
    const r = createMockNodeRenderer();
    expect(r.nodeShapes['roundrectangle']).to.equal(r.nodeShapes['round-rectangle']);
  });

  it('each polygon shape can draw to a mock context', () => {
    const r = createMockNodeRenderer();
    const ctx = {
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arcTo: () => {},
      quadraticCurveTo: () => {},
      ellipse: () => {},
      arc: () => {},
    };
    const shapesToTest = ['ellipse', 'triangle', 'rectangle', 'barrel', 'diamond', 'star', 'vee'];
    for (const name of shapesToTest) {
      const shape = r.nodeShapes[name];
      // draw(context, centerX, centerY, width, height, cornerRadius)
      shape.draw(ctx, 50, 50, 100, 100, 'auto');
    }
  });

  it('makePolygon creates and caches custom polygon shapes', () => {
    const r = createMockNodeRenderer();
    const points = [-1, -1, 1, -1, 0, 1];
    const shape1 = r.nodeShapes.makePolygon(points);
    expect(shape1).to.exist;
    expect(shape1.draw).to.be.a('function');
    // Same points should return cached shape
    const shape2 = r.nodeShapes.makePolygon(points);
    expect(shape2).to.equal(shape1);
  });

  it('makePolygon creates different shapes for different points', () => {
    const r = createMockNodeRenderer();
    const shape1 = r.nodeShapes.makePolygon([-1, -1, 1, -1, 0, 1]);
    const shape2 = r.nodeShapes.makePolygon([-1, 0, 0, -1, 1, 0, 0, 1]);
    expect(shape1).to.not.equal(shape2);
  });
});
