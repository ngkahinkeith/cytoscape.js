import { describe, it } from 'mocha';
import { expect } from 'chai';

import arrowShapesMixin from '../../src/extensions/renderer/canvas/arrow-shapes.mjs';
import nodeShapesMixin from '../../src/extensions/renderer/canvas/node-shapes.mjs';
import drawingShapesMixin from '../../src/extensions/renderer/canvas/drawing-shapes.mjs';

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
    measureText: (text) => ({ width: text.length * 7 }),
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
  };
}

function makeRenderer() {
  const r = {};
  Object.assign(r, arrowShapesMixin);
  Object.assign(r, nodeShapesMixin);
  Object.assign(r, drawingShapesMixin);
  return r;
}

// ── arrow-shapes.mjs ────────────────────────────────────────────────────────

describe('Canvas arrow-shapes', () => {
  it('arrowShapeImpl returns known shape functions', () => {
    const r = makeRenderer();
    const names = ['polygon', 'triangle-backcurve', 'triangle-tee', 'circle-triangle', 'triangle-cross', 'circle'];
    for (const name of names) {
      const fn = r.arrowShapeImpl(name);
      expect(fn).to.be.a('function');
    }
  });

  it('arrowShapeImpl returns undefined for unknown name', () => {
    const r = makeRenderer();
    const fn = r.arrowShapeImpl('nonexistent');
    expect(fn).to.be.undefined;
  });

  it('arrowShapeImpl caches the impl map (same reference on second call)', () => {
    const r = makeRenderer();
    const fn1 = r.arrowShapeImpl('polygon');
    const fn2 = r.arrowShapeImpl('polygon');
    expect(fn1).to.equal(fn2);
  });

  // ── polygon ──────────────────────────────────────────────────────────────
  it('polygon draws lineTo for each point', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    r.arrowShapeImpl('polygon')(ctx, pts);
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    expect(lineTos).to.have.length(3);
  });

  // ── triangle-backcurve ─────────────────────────────────────────────────
  it('triangle-backcurve draws lineTo for points and a quadraticCurveTo', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    const cp = { x: 5, y: -5 };
    r.arrowShapeImpl('triangle-backcurve')(ctx, pts, cp);
    const lineTos = ctx.calls.filter(c => c.name === 'lineTo');
    expect(lineTos).to.have.length(3);
    const qCurves = ctx.calls.filter(c => c.name === 'quadraticCurveTo');
    expect(qCurves).to.have.length(1);
  });

  // ── triangle-tee ──────────────────────────────────────────────────────
  it('triangle-tee draws triangle + tee paths', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    const triPts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    const teePts = [{ x: 0, y: -2 }, { x: 10, y: -2 }, { x: 10, y: -5 }, { x: 0, y: -5 }];
    r.arrowShapeImpl('triangle-tee')(ctx, triPts, teePts);
    expect(ctx.calls.filter(c => c.name === 'beginPath')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'moveTo')).to.have.length(1);
  });

  // ── circle-triangle ──────────────────────────────────────────────────
  it('circle-triangle draws arc + triangle lines', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    const triPts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    r.arrowShapeImpl('circle-triangle')(ctx, triPts, 5, 5, 3);
    expect(ctx.calls.filter(c => c.name === 'arc')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'moveTo')).to.have.length(1);
  });

  // ── circle ──────────────────────────────────────────────────────────────
  it('circle draws an arc', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.arrowShapeImpl('circle')(ctx, 10, 10, 5);
    expect(ctx.calls.filter(c => c.name === 'arc')).to.have.length(1);
  });
});

// ── node-shapes.mjs ─────────────────────────────────────────────────────────

describe('Canvas node-shapes', () => {
  function makeFullRenderer() {
    const r = makeRenderer();
    // Stubs for the shape drawing methods that nodeShapeImpl delegates to
    r.drawEllipsePath = (...args) => r._lastDrawCall = { name: 'drawEllipsePath', args };
    r.drawPolygonPath = (...args) => r._lastDrawCall = { name: 'drawPolygonPath', args };
    r.drawRoundPolygonPath = (...args) => r._lastDrawCall = { name: 'drawRoundPolygonPath', args };
    r.drawRoundRectanglePath = (...args) => r._lastDrawCall = { name: 'drawRoundRectanglePath', args };
    r.drawCutRectanglePath = (...args) => r._lastDrawCall = { name: 'drawCutRectanglePath', args };
    r.drawBottomRoundRectanglePath = (...args) => r._lastDrawCall = { name: 'drawBottomRoundRectanglePath', args };
    r.drawBarrelPath = (...args) => r._lastDrawCall = { name: 'drawBarrelPath', args };
    return r;
  }

  const shapes = [
    ['ellipse', 'drawEllipsePath'],
    ['polygon', 'drawPolygonPath'],
    ['round-polygon', 'drawRoundPolygonPath'],
    ['roundrectangle', 'drawRoundRectanglePath'],
    ['round-rectangle', 'drawRoundRectanglePath'],
    ['cutrectangle', 'drawCutRectanglePath'],
    ['cut-rectangle', 'drawCutRectanglePath'],
    ['bottomroundrectangle', 'drawBottomRoundRectanglePath'],
    ['bottom-round-rectangle', 'drawBottomRoundRectanglePath'],
    ['barrel', 'drawBarrelPath'],
  ];

  for (const [shapeName, expectedMethod] of shapes) {
    it(`nodeShapeImpl dispatches '${shapeName}' to ${expectedMethod}`, () => {
      const r = makeFullRenderer();
      const ctx = mockCanvas2DContext();
      r.nodeShapeImpl(shapeName, ctx, 0, 0, 50, 50, [1, 0, -1, 0, 0, 1], []);
      expect(r._lastDrawCall.name).to.equal(expectedMethod);
    });
  }

  it('nodeShapeImpl returns undefined for unknown shape', () => {
    const r = makeFullRenderer();
    const ctx = mockCanvas2DContext();
    const result = r.nodeShapeImpl('unknown-shape', ctx, 0, 0, 50, 50, []);
    expect(result).to.be.undefined;
  });
});

// ── drawing-shapes.mjs ──────────────────────────────────────────────────────

describe('Canvas drawing-shapes', () => {
  it('drawPolygonPath draws a closed polygon from points', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    const points = [1, 0, 0, 1, -1, 0, 0, -1]; // diamond
    r.drawPolygonPath(ctx, 50, 50, 100, 100, points);
    expect(ctx.calls.filter(c => c.name === 'beginPath')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'moveTo')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'lineTo')).to.have.length(3); // 4 pts - 1 moveTo = 3 lineTo
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
  });

  it('drawRoundPolygonPath draws round corners and closes', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    // Minimal corners mock
    const corners = [
      { cx: 0, cy: 0, radius: 5, startAngle: 0, endAngle: Math.PI/2 },
      { cx: 10, cy: 0, radius: 5, startAngle: Math.PI/2, endAngle: Math.PI },
    ];
    r.drawRoundPolygonPath(ctx, 50, 50, 100, 100, [], corners);
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
  });

  it('drawRoundRectanglePath draws a round rectangle with auto radius', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawRoundRectanglePath(ctx, 50, 50, 100, 80, 'auto');
    expect(ctx.calls.filter(c => c.name === 'beginPath')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'arcTo').length).to.be.at.least(4);
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
  });

  it('drawRoundRectanglePath draws with explicit radius', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawRoundRectanglePath(ctx, 50, 50, 100, 80, 10);
    expect(ctx.calls.filter(c => c.name === 'arcTo').length).to.be.at.least(4);
  });

  it('drawRoundRectanglePath clamps radius to half-dimension', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawRoundRectanglePath(ctx, 0, 0, 20, 10, 999); // radius >> half dimensions
    expect(ctx.calls.filter(c => c.name === 'arcTo').length).to.be.at.least(4);
  });

  it('drawBottomRoundRectanglePath draws correct shape', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawBottomRoundRectanglePath(ctx, 50, 50, 100, 80, 'auto');
    expect(ctx.calls.filter(c => c.name === 'beginPath')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'arcTo').length).to.be.at.least(2);
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
  });

  it('drawBottomRoundRectanglePath uses explicit radius', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawBottomRoundRectanglePath(ctx, 50, 50, 100, 80, 8);
    expect(ctx.calls.filter(c => c.name === 'arcTo').length).to.be.at.least(2);
  });

  it('drawCutRectanglePath with auto corners', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawCutRectanglePath(ctx, 50, 50, 100, 80, null, 'auto');
    expect(ctx.calls.filter(c => c.name === 'beginPath')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'lineTo').length).to.be.at.least(7);
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
  });

  it('drawCutRectanglePath with explicit corner length', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawCutRectanglePath(ctx, 50, 50, 100, 80, null, 10);
    expect(ctx.calls.filter(c => c.name === 'lineTo').length).to.be.at.least(7);
  });

  it('drawBarrelPath draws barrel shape with curves', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawBarrelPath(ctx, 50, 50, 100, 80);
    expect(ctx.calls.filter(c => c.name === 'beginPath')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'quadraticCurveTo').length).to.be.at.least(4);
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
  });

  it('drawEllipsePath uses context.ellipse when available', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    r.drawEllipsePath(ctx, 50, 50, 100, 80);
    expect(ctx.calls.filter(c => c.name === 'ellipse')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
  });

  it('drawEllipsePath falls back to manual arc when no ellipse', () => {
    const r = makeRenderer();
    const ctx = mockCanvas2DContext();
    delete ctx.ellipse; // remove ellipse support
    r.drawEllipsePath(ctx, 50, 50, 100, 80);
    // Should have moveTo + lineTo calls for the manual arc approximation
    expect(ctx.calls.filter(c => c.name === 'moveTo').length).to.be.at.least(1);
    expect(ctx.calls.filter(c => c.name === 'closePath')).to.have.length(1);
  });
});
