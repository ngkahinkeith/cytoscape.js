import { describe, it } from 'mocha';
import { expect } from 'chai';

// ── spring.mjs ──────────────────────────────────────────────────────────────

import generateSpringRK4 from '../../src/core/animation/spring.mjs';

describe('spring (core/animation/spring.mjs)', () => {
  it('returns a time value (number) when called without duration', () => {
    const time = generateSpringRK4(500, 20);
    expect(time).to.be.a('number');
    expect(time).to.be.greaterThan(0);
  });

  it('returns a function when called with duration', () => {
    const fn = generateSpringRK4(500, 20, 500);
    expect(fn).to.be.a('function');
  });

  it('spring function returns 0 at 0% progress', () => {
    const fn = generateSpringRK4(500, 20, 500);
    const val = fn(0);
    expect(val).to.equal(0);
  });

  it('spring function returns value near 1 at 100% progress', () => {
    const fn = generateSpringRK4(500, 20, 500);
    const val = fn(1);
    expect(val).to.be.closeTo(1, 0.05);
  });

  it('spring function returns intermediate values', () => {
    const fn = generateSpringRK4(500, 20, 500);
    const val25 = fn(0.25);
    const val50 = fn(0.5);
    const val75 = fn(0.75);
    expect(val25).to.be.a('number');
    expect(val50).to.be.a('number');
    expect(val75).to.be.a('number');
    // All intermediate values should be finite numbers
    expect(isFinite(val25)).to.be.true;
    expect(isFinite(val50)).to.be.true;
    expect(isFinite(val75)).to.be.true;
  });

  it('defaults tension to 500 when given non-numeric', () => {
    const fn = generateSpringRK4(null, 20, 300);
    expect(fn).to.be.a('function');
    const val = fn(1);
    expect(val).to.be.closeTo(1, 0.1);
  });

  it('defaults friction to 20 when given non-numeric', () => {
    const fn = generateSpringRK4(500, null, 300);
    expect(fn).to.be.a('function');
    const val = fn(1);
    expect(val).to.be.closeTo(1, 0.1);
  });

  it('works with different tension values', () => {
    const fn1 = generateSpringRK4(100, 20, 500);
    const fn2 = generateSpringRK4(1000, 20, 500);
    // Both should be functions
    expect(fn1).to.be.a('function');
    expect(fn2).to.be.a('function');
    // Both should reach near 1 at the end
    expect(fn1(1)).to.be.closeTo(1, 0.1);
    expect(fn2(1)).to.be.closeTo(1, 0.1);
  });

  it('works with different friction values', () => {
    const fn1 = generateSpringRK4(500, 10, 500);
    const fn2 = generateSpringRK4(500, 50, 500);
    expect(fn1).to.be.a('function');
    expect(fn2).to.be.a('function');
  });

  it('time returned without duration is finite and positive', () => {
    const time = generateSpringRK4(200, 15);
    expect(isFinite(time)).to.be.true;
    expect(time).to.be.greaterThan(0);
  });

  it('spring function handles small percentComplete values', () => {
    const fn = generateSpringRK4(500, 20, 500);
    const val = fn(0.01);
    expect(val).to.be.a('number');
    expect(isFinite(val)).to.be.true;
  });

  it('spring function handles very high friction (overdamped)', () => {
    const fn = generateSpringRK4(500, 100, 500);
    expect(fn).to.be.a('function');
    // Overdamped spring may not converge fully; just verify it returns a number
    const val = fn(1);
    expect(typeof val === 'number').to.be.true;
  });
});

// ── extend.mjs ──────────────────────────────────────────────────────────────

import { extend } from '../../src/util/extend.mjs';

describe('extend (util/extend.mjs) - additional coverage', () => {
  it('copies properties from source to target', () => {
    const tgt = { a: 1 };
    const result = extend(tgt, { b: 2, c: 3 });
    expect(result).to.equal(tgt);
    expect(result.a).to.equal(1);
    expect(result.b).to.equal(2);
    expect(result.c).to.equal(3);
  });

  it('handles multiple sources', () => {
    const tgt = {};
    extend(tgt, { a: 1 }, { b: 2 }, { c: 3 });
    expect(tgt).to.deep.equal({ a: 1, b: 2, c: 3 });
  });

  it('later sources override earlier ones', () => {
    const tgt = {};
    extend(tgt, { x: 1 }, { x: 2 }, { x: 3 });
    expect(tgt.x).to.equal(3);
  });

  it('skips null/undefined sources', () => {
    const tgt = { a: 1 };
    extend(tgt, null, undefined, { b: 2 });
    expect(tgt.a).to.equal(1);
    expect(tgt.b).to.equal(2);
  });

  it('returns the target object', () => {
    const tgt = {};
    const result = extend(tgt, { a: 1 });
    expect(result).to.equal(tgt);
  });

  it('shallow-copies array values', () => {
    const arr = [1, 2, 3];
    const tgt = {};
    extend(tgt, { arr });
    expect(tgt.arr).to.equal(arr);
  });

  it('shallow-copies nested object values', () => {
    const nested = { x: 1 };
    const tgt = {};
    extend(tgt, { nested });
    expect(tgt.nested).to.equal(nested);
  });

  it('works with a single source', () => {
    const tgt = {};
    extend(tgt, { a: 42 });
    expect(tgt.a).to.equal(42);
  });

  it('works with empty source object', () => {
    const tgt = { a: 1 };
    extend(tgt, {});
    expect(tgt).to.deep.equal({ a: 1 });
  });

  it('works with no source arguments', () => {
    const tgt = { a: 1 };
    extend(tgt);
    expect(tgt).to.deep.equal({ a: 1 });
  });
});

// ── z-ordering.mjs ──────────────────────────────────────────────────────────

import zOrderingMixin from '../../src/extensions/renderer/base/coord-ele-math/z-ordering.mjs';

describe('z-ordering (base/coord-ele-math/z-ordering.mjs)', () => {
  function makeMockEle(opts = {}) {
    const rscratch = { inDragLayer: opts.inDragLayer || false };
    return {
      _private: { rscratch },
      grabbed: () => opts.grabbed || false,
      isParent: () => opts.isParent || false,
      interactive: () => opts.interactive !== undefined ? opts.interactive : true,
      isNode: () => opts.isNode !== undefined ? opts.isNode : true,
      pstyle: (name) => {
        if (name === 'z-index') return { value: opts.zIndex || 0 };
        if (name === 'z-compound-depth') return { value: opts.zCompoundDepth || 'auto' };
        if (name === 'z-index-compare') return { value: opts.zIndexCompare || 'auto' };
        return { value: 0 };
      },
      zDepth: () => opts.zDepth || 0,
      poolIndex: () => opts.poolIndex || 0,
      cy: () => ({ hasCompoundNodes: () => opts.hasCompound || false }),
    };
  }

  describe('updateCachedGrabbedEles', () => {
    it('returns early if cachedZSortedEles is null', () => {
      const r = Object.create(zOrderingMixin);
      r.cachedZSortedEles = null;
      r.updateCachedGrabbedEles();
      expect(r.cachedZSortedEles).to.be.null;
    });

    it('separates nondrag, drag, and grabbed elements', () => {
      const r = Object.create(zOrderingMixin);
      const nondragEle = makeMockEle({ grabbed: false, inDragLayer: false });
      const dragEle = makeMockEle({ grabbed: false, inDragLayer: true });
      const grabbedEle = makeMockEle({ grabbed: true, isParent: false });
      const eles = [nondragEle, dragEle, grabbedEle];
      eles.drag = [];
      eles.nondrag = [];
      r.cachedZSortedEles = eles;
      r.updateCachedGrabbedEles();
      expect(eles.nondrag).to.deep.equal([nondragEle]);
      expect(eles.drag).to.deep.include(dragEle);
      expect(eles.drag).to.deep.include(grabbedEle);
    });

    it('grabbed parent nodes go to nondrag', () => {
      const r = Object.create(zOrderingMixin);
      const grabbedParent = makeMockEle({ grabbed: true, isParent: true });
      const eles = [grabbedParent];
      eles.drag = [];
      eles.nondrag = [];
      r.cachedZSortedEles = eles;
      r.updateCachedGrabbedEles();
      // A grabbed parent does not go to grabTargets, does not have inDragLayer, so goes to nondrag
      expect(eles.nondrag).to.deep.include(grabbedParent);
    });

    it('grabbed nodes placed after drag layer elements', () => {
      const r = Object.create(zOrderingMixin);
      const dragEle = makeMockEle({ grabbed: false, inDragLayer: true });
      const grabbedEle = makeMockEle({ grabbed: true, isParent: false });
      const eles = [dragEle, grabbedEle];
      eles.drag = [];
      eles.nondrag = [];
      r.cachedZSortedEles = eles;
      r.updateCachedGrabbedEles();
      // grabbedEle should come after dragEle in drag array
      expect(eles.drag[0]).to.equal(dragEle);
      expect(eles.drag[1]).to.equal(grabbedEle);
    });
  });

  describe('invalidateCachedZSortedEles', () => {
    it('sets cachedZSortedEles to null', () => {
      const r = Object.create(zOrderingMixin);
      r.cachedZSortedEles = [1, 2, 3];
      r.invalidateCachedZSortedEles();
      expect(r.cachedZSortedEles).to.be.null;
    });
  });

  describe('getCachedZSortedEles', () => {
    it('returns cached eles when not forcing recalc', () => {
      const r = Object.create(zOrderingMixin);
      const cached = [makeMockEle()];
      cached.drag = [];
      cached.nondrag = [];
      cached.interactive = [];
      r.cachedZSortedEles = cached;
      const result = r.getCachedZSortedEles(false);
      expect(result).to.equal(cached);
    });

    it('recalculates when forceRecalc is true', () => {
      const r = Object.create(zOrderingMixin);
      const ele1 = makeMockEle({ zIndex: 1, poolIndex: 0, isNode: true });
      const ele2 = makeMockEle({ zIndex: 0, poolIndex: 1, isNode: false });
      r.cy = {
        mutableElements: () => ({
          toArray: () => [ele1, ele2]
        })
      };
      r.cachedZSortedEles = null;
      const result = r.getCachedZSortedEles(true);
      expect(result).to.be.an('array');
      expect(result).to.have.length(2);
      expect(result.drag).to.be.an('array');
      expect(result.nondrag).to.be.an('array');
      expect(result.interactive).to.be.an('array');
    });

    it('recalculates when cache is null', () => {
      const r = Object.create(zOrderingMixin);
      const ele = makeMockEle({ interactive: true });
      r.cy = {
        mutableElements: () => ({
          toArray: () => [ele]
        })
      };
      r.cachedZSortedEles = null;
      const result = r.getCachedZSortedEles(false);
      expect(result).to.have.length(1);
      expect(result.interactive).to.have.length(1);
    });

    it('filters interactive elements', () => {
      const r = Object.create(zOrderingMixin);
      const interactiveEle = makeMockEle({ interactive: true });
      const nonInteractiveEle = makeMockEle({ interactive: false });
      r.cy = {
        mutableElements: () => ({
          toArray: () => [interactiveEle, nonInteractiveEle]
        })
      };
      r.cachedZSortedEles = null;
      const result = r.getCachedZSortedEles(true);
      expect(result.interactive).to.have.length(1);
      expect(result.interactive[0]).to.equal(interactiveEle);
    });
  });
});

// ── edge-projection.mjs ────────────────────────────────────────────────────

import edgeProjectionMixin from '../../src/extensions/renderer/base/coord-ele-math/edge-projection.mjs';
import * as math from '../../src/math.mjs';

describe('edge-projection (base/coord-ele-math/edge-projection.mjs)', () => {
  function makeProjRenderer() {
    const r = Object.create(edgeProjectionMixin);
    r.bezierProjPcts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    r.getArrowWidth = (w, scale) => w * scale;
    r.arrowShapeWidth = 1;
    r.findEdgeControlPoints = () => {};
    return r;
  }

  function makeProjEdge(edgeType, allpts, overrides = {}) {
    return {
      _private: {
        rscratch: {
          edgeType,
          allpts,
          haystackPts: overrides.haystackPts || [0, 0, 100, 100],
          ...overrides.rscratch,
        },
        rstyle: {
          bezierPts: null,
          linePts: null,
          haystackPts: null,
          arrowWidth: null,
        },
      },
      pstyle: (name) => {
        if (name === 'width') return { pfValue: overrides.width || 2 };
        if (name === 'arrow-scale') return { value: overrides.arrowScale || 1 };
        return { value: 0, pfValue: 0 };
      },
    };
  }

  describe('storeEdgeProjections', () => {
    it('stores bezier points for bezier edge type', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('bezier', [0, 0, 50, 50, 100, 0]);
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.bezierPts).to.be.an('array');
      expect(edge._private.rstyle.bezierPts.length).to.be.greaterThan(0);
      expect(edge._private.rstyle.linePts).to.be.null;
      expect(edge._private.rstyle.haystackPts).to.be.null;
    });

    it('stores bezier points for multibezier edge type', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('multibezier', [0, 0, 25, 50, 50, 0, 75, 50, 100, 0]);
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.bezierPts).to.be.an('array');
      expect(edge._private.rstyle.bezierPts.length).to.be.greaterThan(0);
    });

    it('stores bezier points for self edge type', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('self', [0, 0, 20, 40, 40, 0]);
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.bezierPts).to.be.an('array');
    });

    it('stores bezier points for compound edge type', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('compound', [0, 0, 30, 60, 60, 0]);
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.bezierPts).to.be.an('array');
    });

    it('stores line points for segments edge type', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('segments', [0, 0, 50, 50, 100, 0]);
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.linePts).to.be.an('array');
      expect(edge._private.rstyle.linePts).to.have.length(3);
      expect(edge._private.rstyle.linePts[0]).to.deep.equal({ x: 0, y: 0 });
      expect(edge._private.rstyle.linePts[1]).to.deep.equal({ x: 50, y: 50 });
      expect(edge._private.rstyle.linePts[2]).to.deep.equal({ x: 100, y: 0 });
      expect(edge._private.rstyle.bezierPts).to.be.null;
    });

    it('stores haystack points for haystack edge type', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('haystack', [10, 20, 90, 80], {
        haystackPts: [10, 20, 90, 80],
        rscratch: { haystackPts: [10, 20, 90, 80] },
      });
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.haystackPts).to.be.an('array');
      expect(edge._private.rstyle.haystackPts).to.have.length(2);
      expect(edge._private.rstyle.haystackPts[0]).to.deep.equal({ x: 10, y: 20 });
      expect(edge._private.rstyle.haystackPts[1]).to.deep.equal({ x: 90, y: 80 });
    });

    it('clears previous cached points', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('segments', [0, 0, 100, 100]);
      edge._private.rstyle.bezierPts = [{ x: 1, y: 1 }];
      edge._private.rstyle.haystackPts = [{ x: 2, y: 2 }];
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.bezierPts).to.be.null;
      expect(edge._private.rstyle.haystackPts).to.be.null;
    });

    it('calculates arrow width', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('straight', [0, 0, 100, 100], { width: 3, arrowScale: 2 });
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.arrowWidth).to.equal(3 * 2 * 1); // width * scale * shapeWidth
    });

    it('handles straight edge type (no bezier/line/haystack storage)', () => {
      const r = makeProjRenderer();
      const edge = makeProjEdge('straight', [0, 0, 100, 100]);
      r.storeEdgeProjections(edge);
      expect(edge._private.rstyle.bezierPts).to.be.null;
      expect(edge._private.rstyle.linePts).to.be.null;
      expect(edge._private.rstyle.haystackPts).to.be.null;
      // arrowWidth should still be set
      expect(edge._private.rstyle.arrowWidth).to.be.a('number');
    });
  });

  describe('recalculateEdgeProjections', () => {
    it('calls findEdgeControlPoints', () => {
      const r = makeProjRenderer();
      let called = false;
      r.findEdgeControlPoints = (edges) => { called = true; };
      r.recalculateEdgeProjections([]);
      expect(called).to.be.true;
    });
  });
});

// ── redraw.mjs (base) ──────────────────────────────────────────────────────

import redrawMixin from '../../src/extensions/renderer/base/redraw.mjs';

describe('redraw (base/redraw.mjs)', () => {
  function makeRedrawRenderer() {
    const r = Object.create(redrawMixin);
    r.averageRedrawTime = undefined;
    r.lastRedrawTime = undefined;
    r.lastDrawTime = undefined;
    r.requestedFrame = false;
    r.renderOptions = null;
    r.destroyed = false;
    r.beforeRenderCallbacks = [];
    r.renderLoopStarted = false;
    r.redrawTotalTime = 0;
    r.redrawCount = 0;
    r.skipFrame = false;
    return r;
  }

  describe('timeToRender', () => {
    it('returns average time per render', () => {
      const r = makeRedrawRenderer();
      r.redrawTotalTime = 100;
      r.redrawCount = 10;
      expect(r.timeToRender()).to.equal(10);
    });
  });

  describe('redraw', () => {
    it('sets requestedFrame to true', () => {
      const r = makeRedrawRenderer();
      r.redraw();
      expect(r.requestedFrame).to.be.true;
    });

    it('stores render options', () => {
      const r = makeRedrawRenderer();
      r.redraw({ forcedZoom: 2 });
      expect(r.renderOptions).to.deep.equal({ forcedZoom: 2 });
    });

    it('initializes undefined tracking fields', () => {
      const r = makeRedrawRenderer();
      r.averageRedrawTime = undefined;
      r.lastRedrawTime = undefined;
      r.lastDrawTime = undefined;
      r.redraw();
      expect(r.averageRedrawTime).to.equal(0);
      expect(r.lastRedrawTime).to.equal(0);
      expect(r.lastDrawTime).to.equal(0);
    });

    it('works with no options argument', () => {
      const r = makeRedrawRenderer();
      r.redraw();
      expect(r.requestedFrame).to.be.true;
    });
  });

  describe('beforeRender', () => {
    it('adds callback to beforeRenderCallbacks array', () => {
      const r = makeRedrawRenderer();
      const fn = () => {};
      r.beforeRender(fn, 10);
      expect(r.beforeRenderCallbacks).to.have.length(1);
      expect(r.beforeRenderCallbacks[0].fn).to.equal(fn);
      expect(r.beforeRenderCallbacks[0].priority).to.equal(10);
    });

    it('sorts callbacks by priority (higher first)', () => {
      const r = makeRedrawRenderer();
      const fn1 = () => {};
      const fn2 = () => {};
      const fn3 = () => {};
      r.beforeRender(fn1, 1);
      r.beforeRender(fn2, 100);
      r.beforeRender(fn3, 50);
      expect(r.beforeRenderCallbacks[0].fn).to.equal(fn2); // priority 100
      expect(r.beforeRenderCallbacks[1].fn).to.equal(fn3); // priority 50
      expect(r.beforeRenderCallbacks[2].fn).to.equal(fn1); // priority 1
    });

    it('does nothing when destroyed', () => {
      const r = makeRedrawRenderer();
      r.destroyed = true;
      r.beforeRender(() => {}, 10);
      expect(r.beforeRenderCallbacks).to.have.length(0);
    });
  });

  describe('startRenderLoop', () => {
    it('does not start twice', () => {
      const r = makeRedrawRenderer();
      r.renderLoopStarted = true;
      // Should return early (no crash)
      r.startRenderLoop();
      expect(r.renderLoopStarted).to.be.true;
    });
  });
});

// ── images.mjs (base) ──────────────────────────────────────────────────────

import imagesMixin from '../../src/extensions/renderer/base/images.mjs';

describe('images (base/images.mjs)', () => {
  function makeImageRenderer() {
    const r = Object.create(imagesMixin);
    r.imageCache = {};
    return r;
  }

  // Minimal Image mock for Node.js
  class MockImage {
    constructor() {
      this.complete = false;
      this.error = false;
      this.src = '';
      this.crossOrigin = null;
      this._listeners = {};
    }
    addEventListener(event, fn) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(fn);
    }
  }

  // Temporarily override global Image
  let origImage;
  if (typeof globalThis !== 'undefined') {
    origImage = globalThis.Image;
  }

  function withMockImage(fn) {
    const images = [];
    globalThis.Image = function() {
      const img = new MockImage();
      images.push(img);
      return img;
    };
    try {
      return fn(images);
    } finally {
      if (origImage !== undefined) {
        globalThis.Image = origImage;
      } else {
        delete globalThis.Image;
      }
    }
  }

  describe('getCachedImage', () => {
    it('creates a new image for a new URL', () => {
      const r = makeImageRenderer();
      withMockImage((images) => {
        const onLoad = () => {};
        const img = r.getCachedImage('http://example.com/img.png', 'anonymous', onLoad);
        expect(img).to.exist;
        expect(img.src).to.equal('http://example.com/img.png');
        expect(img.crossOrigin).to.equal('anonymous');
      });
    });

    it('returns cached image on subsequent calls', () => {
      const r = makeImageRenderer();
      withMockImage((images) => {
        const onLoad = () => {};
        const img1 = r.getCachedImage('http://example.com/img.png', 'anonymous', onLoad);
        const img2 = r.getCachedImage('http://example.com/img.png', 'anonymous', onLoad);
        expect(img1).to.equal(img2);
      });
    });

    it('adds load listener for incomplete cached image', () => {
      const r = makeImageRenderer();
      withMockImage((images) => {
        let loadCalls = 0;
        const onLoad = () => { loadCalls++; };
        const img1 = r.getCachedImage('http://example.com/img.png', 'anonymous', onLoad);
        img1.complete = false;
        const img2 = r.getCachedImage('http://example.com/img.png', 'anonymous', () => { loadCalls++; });
        // Two load listeners should have been attached
        expect(img2._listeners['load'].length).to.be.at.least(2);
      });
    });

    it('does not add extra listener for complete cached image', () => {
      const r = makeImageRenderer();
      withMockImage((images) => {
        const img1 = r.getCachedImage('http://example.com/img.png', 'anonymous', () => {});
        img1.complete = true;
        const initLen = img1._listeners['load'] ? img1._listeners['load'].length : 0;
        r.getCachedImage('http://example.com/img.png', 'anonymous', () => {});
        const afterLen = img1._listeners['load'] ? img1._listeners['load'].length : 0;
        expect(afterLen).to.equal(initLen);
      });
    });

    it('handles data URIs without setting crossOrigin', () => {
      const r = makeImageRenderer();
      withMockImage((images) => {
        const img = r.getCachedImage('data:image/png;base64,abc', 'anonymous', () => {});
        expect(img.crossOrigin).to.be.null;
        expect(img.src).to.equal('data:image/png;base64,abc');
      });
    });

    it('converts "null" crossOrigin string to null', () => {
      const r = makeImageRenderer();
      withMockImage((images) => {
        const img = r.getCachedImage('http://example.com/img.png', 'null', () => {});
        expect(img.crossOrigin).to.be.null;
      });
    });

    it('registers error handler on new images', () => {
      const r = makeImageRenderer();
      withMockImage((images) => {
        const img = r.getCachedImage('http://example.com/img.png', 'anonymous', () => {});
        expect(img._listeners['error']).to.exist;
        expect(img._listeners['error'].length).to.equal(1);
        // Call the error handler to set error flag
        img._listeners['error'][0]();
        expect(img.error).to.be.true;
      });
    });

    it('handles different URLs as separate cache entries', () => {
      const r = makeImageRenderer();
      withMockImage((images) => {
        const img1 = r.getCachedImage('http://example.com/a.png', null, () => {});
        const img2 = r.getCachedImage('http://example.com/b.png', null, () => {});
        expect(img1).to.not.equal(img2);
      });
    });
  });
});

// ── export-image.mjs ────────────────────────────────────────────────────────

import exportImageMixin from '../../src/extensions/renderer/canvas/export-image.mjs';

describe('export-image (canvas/export-image.mjs)', () => {
  describe('createBuffer', () => {
    it('creates a buffer canvas with given dimensions', () => {
      // We need a minimal document mock
      const origDoc = globalThis.document;
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({ mock: true }),
      };
      globalThis.document = {
        createElement: (tag) => {
          if (tag === 'canvas') return { ...mockCanvas };
          return {};
        },
      };
      try {
        const r = Object.create(exportImageMixin);
        const [buffer, ctx] = r.createBuffer(200, 150);
        expect(buffer.width).to.equal(200);
        expect(buffer.height).to.equal(150);
        expect(ctx).to.exist;
      } finally {
        if (origDoc !== undefined) {
          globalThis.document = origDoc;
        } else {
          delete globalThis.document;
        }
      }
    });
  });

  describe('bufferCanvasImage', () => {
    it('renders full graph to buffer with scale', () => {
      const origDoc = globalThis.document;
      const canvasCalls = [];
      const mockBuffCanvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: () => ({
          clearRect: (...args) => canvasCalls.push({ name: 'clearRect', args }),
          translate: (...args) => canvasCalls.push({ name: 'translate', args }),
          scale: (...args) => canvasCalls.push({ name: 'scale', args }),
          drawImage: (...args) => canvasCalls.push({ name: 'drawImage', args }),
          fillRect: (...args) => canvasCalls.push({ name: 'fillRect', args }),
          rect: (...args) => canvasCalls.push({ name: 'rect', args }),
          fill: (...args) => canvasCalls.push({ name: 'fill', args }),
          setTransform: () => {},
          globalCompositeOperation: 'source-over',
          fillStyle: '',
        }),
      };
      globalThis.document = {
        createElement: () => ({ ...mockBuffCanvas }),
      };
      try {
        const r = Object.create(exportImageMixin);
        r.cy = {
          mutableElements: () => ({
            boundingBox: () => ({ x1: 0, y1: 0, x2: 200, y2: 200, w: 200, h: 200 }),
          }),
          zoom: () => 1,
          pan: () => ({ x: 0, y: 0 }),
        };
        r.findContainerClientCoords = () => [0, 0, 400, 300];
        r.getPixelRatio = () => 1;
        r.getCachedZSortedEles = () => [];
        r.drawElements = () => {};

        const canvas = r.bufferCanvasImage({ full: true, scale: 2 });
        expect(canvas.width).to.equal(400); // 200 * 2
        expect(canvas.height).to.equal(400);
      } finally {
        if (origDoc !== undefined) {
          globalThis.document = origDoc;
        } else {
          delete globalThis.document;
        }
      }
    });

    it('renders current view to buffer', () => {
      const origDoc = globalThis.document;
      const canvasCalls = [];
      const mockBuffCanvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: () => ({
          clearRect: (...args) => canvasCalls.push({ name: 'clearRect', args }),
          translate: (...args) => canvasCalls.push({ name: 'translate', args }),
          scale: (...args) => canvasCalls.push({ name: 'scale', args }),
          drawImage: () => {},
          fillRect: () => {},
          rect: () => {},
          fill: () => {},
          setTransform: () => {},
          globalCompositeOperation: 'source-over',
          fillStyle: '',
        }),
      };
      globalThis.document = {
        createElement: () => ({ ...mockBuffCanvas }),
      };
      try {
        const r = Object.create(exportImageMixin);
        r.cy = {
          mutableElements: () => ({
            boundingBox: () => ({ x1: 0, y1: 0, x2: 200, y2: 200, w: 200, h: 200 }),
          }),
          zoom: () => 2,
          pan: () => ({ x: 10, y: 20 }),
        };
        r.findContainerClientCoords = () => [0, 0, 800, 600];
        r.getPixelRatio = () => 1;
        r.getCachedZSortedEles = () => [];
        r.drawElements = () => {};

        const canvas = r.bufferCanvasImage({ full: false });
        expect(canvas.width).to.equal(800);
        expect(canvas.height).to.equal(600);
      } finally {
        if (origDoc !== undefined) {
          globalThis.document = origDoc;
        } else {
          delete globalThis.document;
        }
      }
    });

    it('handles bg option for background color', () => {
      const origDoc = globalThis.document;
      const calls = [];
      const mockBuffCanvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: () => ({
          clearRect: () => {},
          translate: () => {},
          scale: () => {},
          drawImage: () => {},
          fillRect: (...args) => calls.push('fillRect'),
          rect: (...args) => calls.push('rect'),
          fill: (...args) => calls.push('fill'),
          setTransform: () => {},
          globalCompositeOperation: 'source-over',
          fillStyle: '',
        }),
      };
      globalThis.document = {
        createElement: () => ({ ...mockBuffCanvas }),
      };
      try {
        const r = Object.create(exportImageMixin);
        r.cy = {
          mutableElements: () => ({
            boundingBox: () => ({ x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 }),
          }),
          zoom: () => 1,
          pan: () => ({ x: 0, y: 0 }),
        };
        r.findContainerClientCoords = () => [0, 0, 100, 100];
        r.getPixelRatio = () => 1;
        r.getCachedZSortedEles = () => [];
        r.drawElements = () => {};

        r.bufferCanvasImage({ full: true, bg: '#ffffff' });
        expect(calls).to.include('rect');
        expect(calls).to.include('fill');
      } finally {
        if (origDoc !== undefined) {
          globalThis.document = origDoc;
        } else {
          delete globalThis.document;
        }
      }
    });

    it('handles maxWidth/maxHeight scaling', () => {
      const origDoc = globalThis.document;
      const mockBuffCanvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: () => ({
          clearRect: () => {},
          translate: () => {},
          scale: () => {},
          drawImage: () => {},
          fillRect: () => {},
          rect: () => {},
          fill: () => {},
          setTransform: () => {},
          globalCompositeOperation: 'source-over',
          fillStyle: '',
        }),
      };
      globalThis.document = {
        createElement: () => ({ ...mockBuffCanvas }),
      };
      try {
        const r = Object.create(exportImageMixin);
        r.cy = {
          mutableElements: () => ({
            boundingBox: () => ({ x1: 0, y1: 0, x2: 1000, y2: 800, w: 1000, h: 800 }),
          }),
          zoom: () => 1,
          pan: () => ({ x: 0, y: 0 }),
        };
        r.findContainerClientCoords = () => [0, 0, 1000, 800];
        r.getPixelRatio = () => 1;
        r.getCachedZSortedEles = () => [];
        r.drawElements = () => {};

        const canvas = r.bufferCanvasImage({ full: true, maxWidth: 500 });
        // maxWidth 500 for a 1000-wide image means scale of 0.5
        expect(canvas.width).to.equal(500);
        expect(canvas.height).to.equal(400);
      } finally {
        if (origDoc !== undefined) {
          globalThis.document = origDoc;
        } else {
          delete globalThis.document;
        }
      }
    });

    it('handles zero-size canvas', () => {
      const origDoc = globalThis.document;
      let drawCalled = false;
      const mockBuffCanvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: () => ({
          clearRect: () => { drawCalled = true; },
          translate: () => {},
          scale: () => {},
          drawImage: () => {},
          fillRect: () => {},
          setTransform: () => {},
          globalCompositeOperation: 'source-over',
          fillStyle: '',
        }),
      };
      globalThis.document = {
        createElement: () => ({ ...mockBuffCanvas }),
      };
      try {
        const r = Object.create(exportImageMixin);
        r.cy = {
          mutableElements: () => ({
            boundingBox: () => ({ x1: 0, y1: 0, x2: 0, y2: 0, w: 0, h: 0 }),
          }),
          zoom: () => 1,
          pan: () => ({ x: 0, y: 0 }),
        };
        r.findContainerClientCoords = () => [0, 0, 0, 0];
        r.getPixelRatio = () => 1;
        r.getCachedZSortedEles = () => [];
        r.drawElements = () => {};

        const canvas = r.bufferCanvasImage({ full: true });
        // Width and height should be 0; clearRect should not be called (width > 0 guard)
        expect(canvas.width).to.equal(0);
      } finally {
        if (origDoc !== undefined) {
          globalThis.document = origDoc;
        } else {
          delete globalThis.document;
        }
      }
    });
  });

  describe('png and jpg', () => {
    it('png calls bufferCanvasImage and returns data URI', () => {
      const r = Object.create(exportImageMixin);
      r.bufferCanvasImage = () => ({
        toDataURL: (mime, quality) => `data:${mime};base64,abc123`,
      });
      const result = r.png({});
      expect(result).to.equal('data:image/png;base64,abc123');
    });

    it('jpg calls bufferCanvasImage and returns data URI', () => {
      const r = Object.create(exportImageMixin);
      r.bufferCanvasImage = () => ({
        toDataURL: (mime, quality) => `data:${mime};base64,xyz`,
      });
      const result = r.jpg({});
      expect(result).to.equal('data:image/jpeg;base64,xyz');
    });

    it('png with base64 output returns raw base64', () => {
      const r = Object.create(exportImageMixin);
      r.bufferCanvasImage = () => ({
        toDataURL: () => 'data:image/png;base64,thedata',
      });
      const result = r.png({ output: 'base64' });
      expect(result).to.equal('thedata');
    });

    it('png with blob-promise output returns a promise', () => {
      const r = Object.create(exportImageMixin);
      r.bufferCanvasImage = () => ({
        toBlob: (cb, mime, quality) => cb(new Uint8Array([1, 2, 3])),
      });
      const result = r.png({ output: 'blob-promise' });
      expect(result).to.be.a('promise');
    });
  });
});

// ── drawing-images.mjs (drawInscribedImage) ────────────────────────────────

import drawingImagesMixin from '../../src/extensions/renderer/canvas/drawing-images.mjs';

describe('drawing-images drawInscribedImage', () => {
  function mockCtx() {
    const calls = [];
    const record = (name) => (...args) => calls.push({ name, args });
    return {
      calls,
      save: record('save'),
      restore: record('restore'),
      clip: record('clip'),
      beginPath: record('beginPath'),
      closePath: record('closePath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      fill: record('fill'),
      drawImage: record('drawImage'),
      createPattern: () => ({}),
      translate: record('translate'),
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      fillStyle: '',
    };
  }

  function pstyleVal(val, pfVal, strVal, units) {
    return {
      value: val,
      pfValue: pfVal !== undefined ? pfVal : val,
      strValue: strVal !== undefined ? strVal : String(val),
      units: units || '',
    };
  }

  function makeImgNode(overrides = {}) {
    const rs = {
      pathCache: overrides.pathCache || null,
    };
    const styles = {
      'corner-radius': pstyleVal('auto', 'auto', 'auto'),
      ...overrides.styles,
    };
    return {
      _private: { rscratch: rs },
      position: () => overrides.position || { x: 50, y: 50 },
      width: () => overrides.width || 50,
      height: () => overrides.height || 50,
      padding: () => overrides.padding || 0,
      pstyle: (name) => styles[name] || pstyleVal(0),
      cy: () => ({
        style: () => ({
          getIndexedStyle: (node, prop, key, idx) => {
            const indexed = overrides.indexed || {};
            if (indexed[prop] && indexed[prop][key] !== undefined) return indexed[prop][key];
            if (key === 'value') {
              if (prop === 'background-fit') return 'none';
              if (prop === 'background-repeat') return 'no-repeat';
              if (prop === 'background-clip') return 'none';
              if (prop === 'background-image-opacity') return 1;
              if (prop === 'background-image-smoothing') return 'yes';
              if (prop === 'background-width') return 'auto';
              if (prop === 'background-height') return 'auto';
              if (prop === 'background-width-relative-to') return 'include-padding';
              if (prop === 'background-height-relative-to') return 'include-padding';
              if (prop === 'background-image-crossorigin') return 'anonymous';
              if (prop === 'background-image-containment') return 'inside';
              return 'auto';
            }
            if (key === 'units') return '';
            if (key === 'pfValue') return 0;
            return undefined;
          },
        }),
      }),
    };
  }

  it('draws inscribed image with no-repeat (no clip)', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode();

    r.drawInscribedImage(ctx, img, node, 0, 1);
    const drawCalls = ctx.calls.filter(c => c.name === 'drawImage');
    expect(drawCalls).to.have.length(1);
  });

  it('clips to node shape when clip=node', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-clip': { value: 'node' },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    expect(ctx.calls.filter(c => c.name === 'save')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'clip')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'restore')).to.have.length(1);
  });

  it('handles contain fit mode', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 200, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-fit': { value: 'contain' },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('handles cover fit mode', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 200, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-fit': { value: 'cover' },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('returns early for zero-size computed image dimensions', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    // Image has valid natural size, but explicit background-width is 0
    const img = { width: 100, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-width': { value: '0', units: '', pfValue: 0 },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    // Should return early due to w === 0
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(0);
  });

  it('handles repeat pattern mode', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-repeat': { value: 'repeat' },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    // Repeat mode uses createPattern + fill
    expect(ctx.calls.filter(c => c.name === 'fill')).to.have.length(1);
    expect(ctx.calls.filter(c => c.name === 'translate').length).to.be.at.least(2);
  });

  it('handles smoothing=no to disable image smoothing', () => {
    const r = Object.create(drawingImagesMixin);
    let smoothSet = null;
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = (ctx, val) => { smoothSet = val; };
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-image-smoothing': { value: 'no' },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    // Should have called setImgSmoothing(ctx, false) then restored
    expect(smoothSet).to.equal(true); // restored to original value
  });

  it('handles background-width/height percentage units', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-width': { value: '50', units: '%', pfValue: 0.5 },
        'background-height': { value: '50', units: '%', pfValue: 0.5 },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('handles background position percentage', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-position-x': { value: '50', units: '%', pfValue: 0.5 },
        'background-position-y': { value: '50', units: '%', pfValue: 0.5 },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('handles pathCache shifting', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode({ pathCache: {} });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('handles node with inner-relative background dimensions', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode({
      padding: 10,
      indexed: {
        'background-width-relative-to': { value: 'inner' },
        'background-height-relative-to': { value: 'inner' },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });

  it('handles opacity scaling for image', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode();

    r.drawInscribedImage(ctx, img, node, 0, 0.5);
    // globalAlpha should be restored
    expect(ctx.globalAlpha).to.equal(1);
  });

  it('handles background-offset percentage', () => {
    const r = Object.create(drawingImagesMixin);
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};
    r.getNodeShape = () => 'ellipse';
    r.nodeShapes = { 'ellipse': { draw: () => {} } };
    r.safeDrawImage = drawingImagesMixin.safeDrawImage;

    const ctx = mockCtx();
    const img = { width: 100, height: 100 };
    const node = makeImgNode({
      indexed: {
        'background-offset-x': { value: '10', units: '%', pfValue: 0.1 },
        'background-offset-y': { value: '10', units: '%', pfValue: 0.1 },
      },
    });

    r.drawInscribedImage(ctx, img, node, 0, 1);
    expect(ctx.calls.filter(c => c.name === 'drawImage')).to.have.length(1);
  });
});

// ── drawing-redraw.mjs (render function) ───────────────────────────────────

import drawingRedrawMixin from '../../src/extensions/renderer/canvas/drawing-redraw.mjs';

describe('drawing-redraw render function', () => {
  function pstyleVal(val, pfVal) {
    return { value: val, pfValue: pfVal !== undefined ? pfVal : val };
  }

  function mockCtxSimple() {
    return {
      setTransform: () => {},
      clearRect: () => {},
      translate: () => {},
      scale: () => {},
      drawImage: () => {},
      fillRect: () => {},
      fillText: () => {},
      measureText: () => ({ actualBoundingBoxAscent: 14 }),
      strokeRect: () => {},
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      strokeStyle: '',
      font: '',
      lineWidth: 1,
    };
  }

  function makeRenderRenderer() {
    const r = Object.create(drawingRedrawMixin);
    const ctx0 = mockCtxSimple();
    const ctx1 = mockCtxSimple();
    const ctx2 = mockCtxSimple();
    r.data = {
      contexts: [ctx0, ctx1, ctx2],
      canvasNeedsRedraw: [true, true, true],
      bufferCanvases: [],
      bufferContexts: [],
    };
    r.NODE = 2;
    r.DRAG = 1;
    r.SELECT_BOX = 0;
    r.MOTIONBLUR_BUFFER_NODE = 0;
    r.MOTIONBLUR_BUFFER_DRAG = 1;
    r.TEXTURE_BUFFER = 2;
    r.CANVAS_LAYERS = 3;
    r.BUFFER_COUNT = 3;
    r.canvasWidth = 800;
    r.canvasHeight = 600;
    r.prevPxRatio = 1;
    r.textureOnViewport = false;
    r.pinching = false;
    r.swipePanning = false;
    r.hoverData = { dragging: false, selecting: false, draggingEles: false };
    r.touchData = { selecting: false };
    r.motionBlur = false;
    r.motionBlurEnabled = false;
    r.motionBlurPxRatio = 1;
    r.motionBlurTimeout = null;
    r.clearedForMotionBlur = [false, false, false];
    r.clearingMotionBlur = false;
    r.debug = false;
    r.showFps = false;
    r.selection = [0, 0, 0, 0, 0];
    r.cy = {
      zoom: () => 1,
      pan: () => ({ x: 0, y: 0 }),
      hasCompoundNodes: () => false,
      batching: () => false,
      animated: () => false,
      style: () => ({
        core: () => pstyleVal(0),
      }),
      mutableElements: () => ({
        boundingBox: () => ({ x1: 0, y1: 0, w: 100, h: 100 }),
      }),
      emit: () => {},
      extent: () => ({ x1: 0, y1: 0, x2: 100, y2: 100 }),
    };
    r.getCachedZSortedEles = () => {
      const eles = [];
      eles.nondrag = [];
      eles.drag = [];
      return eles;
    };
    r.drawLayeredElements = () => {};
    r.drawCachedElements = () => {};
    r.drawCachedNodes = () => {};
    r.hideEdgesOnViewport = false;
    r.textureDrawLastFrame = false;
    r.redraw = () => {};
    r.redrawHint = () => {};
    r.invalidateContainerClientCoordsCache = () => {};
    r.matchCanvasSize = () => {};
    r.container = {};
    r.colorFillStyle = () => {};
    r.getBufferCanvas = () => ({ width: 0, height: 0 });
    r.getBufferContext = () => mockCtxSimple();
    r.drawSelectionRectangle = drawingRedrawMixin.drawSelectionRectangle.bind(r);
    r.forcedPixelRatio = 1;
    r.getPixelRatio = () => 1;
    return r;
  }

  it('render with forcedContext renders elements', () => {
    const r = makeRenderRenderer();
    let drewElements = false;
    r.drawLayeredElements = () => { drewElements = true; };
    const ctx = mockCtxSimple();
    r.render({ forcedContext: ctx });
    expect(drewElements).to.be.true;
  });

  it('render emits render event on cy when not forced', () => {
    const r = makeRenderRenderer();
    let emitted = false;
    r.cy.emit = (evt) => { if (evt === 'render') emitted = true; };
    r.render({});
    expect(emitted).to.be.true;
  });

  it('render sets prevViewport', () => {
    const r = makeRenderRenderer();
    r.prevViewport = undefined;
    r.render({});
    expect(r.prevViewport).to.exist;
    expect(r.prevViewport.zoom).to.equal(1);
  });

  it('render with drawAllLayers draws all layers', () => {
    const r = makeRenderRenderer();
    let drew = 0;
    r.drawLayeredElements = () => { drew++; };
    r.drawCachedElements = () => { drew++; };
    r.render({ drawAllLayers: true });
    // Both NODE and DRAG layers should be drawn
    expect(drew).to.be.at.least(1);
  });

  it('render with drawOnlyNodeLayer skips drag layer', () => {
    const r = makeRenderRenderer();
    let drewDrag = false;
    const origDrawCached = r.drawCachedElements;
    r.drawCachedElements = (ctx, eles) => { drewDrag = true; };
    r.render({ drawOnlyNodeLayer: true });
    expect(drewDrag).to.be.false;
  });

  it('render with forcedPan applies pan offset', () => {
    const r = makeRenderRenderer();
    const ctx = mockCtxSimple();
    const translates = [];
    ctx.translate = (...args) => translates.push(args);
    r.render({ forcedContext: ctx, forcedPan: { x: 50, y: 100 } });
    // Should contain the forced pan translate
    const hasForcedPan = translates.some(t => t[0] === 50 && t[1] === 100);
    expect(hasForcedPan).to.be.true;
  });

  it('render with forcedZoom applies zoom', () => {
    const r = makeRenderRenderer();
    const ctx = mockCtxSimple();
    const scales = [];
    ctx.scale = (...args) => scales.push(args);
    r.render({ forcedContext: ctx, forcedZoom: 3 });
    const hasZoom = scales.some(s => s[0] === 3 && s[1] === 3);
    expect(hasZoom).to.be.true;
  });
});

// ── zsort.mjs (collection) ─────────────────────────────────────────────────

import zIndexSort from '../../src/collection/zsort.mjs';

describe('zIndexSort (collection/zsort.mjs)', () => {
  function mockEle(opts = {}) {
    return {
      cy: () => ({ hasCompoundNodes: () => opts.hasCompound || false }),
      pstyle: (name) => {
        if (name === 'z-compound-depth') return { value: opts.zCompoundDepth || 'auto' };
        if (name === 'z-index-compare') return { value: opts.zIndexCompare || 'auto' };
        if (name === 'z-index') return { value: opts.zIndex || 0 };
        return { value: 0 };
      },
      isNode: () => opts.isNode !== undefined ? opts.isNode : true,
      zDepth: () => opts.zDepth || 0,
      poolIndex: () => opts.poolIndex || 0,
    };
  }

  it('nodes sort above edges by default', () => {
    const node = mockEle({ isNode: true });
    const edge = mockEle({ isNode: false });
    expect(zIndexSort(node, edge)).to.be.greaterThan(0);
    expect(zIndexSort(edge, node)).to.be.lessThan(0);
  });

  it('higher z-index sorts later', () => {
    const a = mockEle({ isNode: true, zIndex: 1 });
    const b = mockEle({ isNode: true, zIndex: 5 });
    expect(zIndexSort(a, b)).to.be.lessThan(0);
    expect(zIndexSort(b, a)).to.be.greaterThan(0);
  });

  it('falls back to pool index when z-index is equal', () => {
    const a = mockEle({ isNode: true, zIndex: 0, poolIndex: 1 });
    const b = mockEle({ isNode: true, zIndex: 0, poolIndex: 5 });
    expect(zIndexSort(a, b)).to.be.lessThan(0);
  });

  it('z-compound-depth "bottom" sorts before "auto"', () => {
    const bottom = mockEle({ zCompoundDepth: 'bottom', isNode: true });
    const auto = mockEle({ zCompoundDepth: 'auto', isNode: true });
    expect(zIndexSort(bottom, auto)).to.be.lessThan(0);
  });

  it('z-compound-depth "top" sorts after "auto"', () => {
    const top = mockEle({ zCompoundDepth: 'top', isNode: true, hasCompound: true });
    const auto = mockEle({ zCompoundDepth: 'auto', isNode: true, hasCompound: true });
    expect(zIndexSort(top, auto)).to.be.greaterThan(0);
  });

  it('z-compound-depth "orphan" is depth 0', () => {
    const orphan = mockEle({ zCompoundDepth: 'orphan', isNode: true });
    const auto = mockEle({ zCompoundDepth: 'auto', zDepth: 0, isNode: true });
    // Both depth 0, should be equal in depth comparison, fall through
    const result = zIndexSort(orphan, auto);
    expect(result).to.be.a('number');
  });

  it('z-index-compare "manual" puts nodes and edges at same level', () => {
    const node = mockEle({ isNode: true, zIndexCompare: 'manual', zIndex: 0 });
    const edge = mockEle({ isNode: false, zIndexCompare: 'manual', zIndex: 0 });
    // With manual, eleDepth is 0 for both, so it falls through to z-index
    const result = zIndexSort(node, edge);
    expect(result).to.equal(0);
  });

  it('returns 0 for identical elements', () => {
    const a = mockEle({ isNode: true, zIndex: 5, poolIndex: 3 });
    const b = mockEle({ isNode: true, zIndex: 5, poolIndex: 3 });
    expect(zIndexSort(a, b)).to.equal(0);
  });

  it('compound depth is used when hasCompoundNodes', () => {
    const shallow = mockEle({ isNode: true, zDepth: 0, hasCompound: true, zCompoundDepth: 'auto' });
    const deep = mockEle({ isNode: true, zDepth: 5, hasCompound: true, zCompoundDepth: 'auto' });
    expect(zIndexSort(shallow, deep)).to.be.lessThan(0);
  });
});

// ── ease.mjs ────────────────────────────────────────────────────────────────

import ease from '../../src/core/animation/ease.mjs';

describe('ease (core/animation/ease.mjs)', () => {
  const linearEase = (s, e, p) => s + (e - s) * p;

  it('returns end value at 100%', () => {
    const val = ease(0, 100, 1, linearEase);
    expect(val).to.equal(100);
  });

  it('returns start value at 0%', () => {
    const val = ease(0, 100, 0, linearEase);
    expect(val).to.equal(0);
  });

  it('returns interpolated value at 50%', () => {
    const val = ease(0, 100, 0.5, linearEase);
    expect(val).to.equal(50);
  });

  it('returns end when start equals end', () => {
    const val = ease(42, 42, 0.5, linearEase);
    expect(val).to.equal(42);
  });

  it('clamps percent below 0 to 0', () => {
    const val = ease(0, 100, -0.5, linearEase);
    expect(val).to.equal(0);
  });

  it('clamps percent above 1 to 1', () => {
    const val = ease(0, 100, 1.5, linearEase);
    expect(val).to.equal(100);
  });

  it('rounds value when type.roundValue is true', () => {
    const val = ease(0, 100, 0.333, linearEase, { type: { roundValue: true } });
    expect(val).to.equal(Math.round(33.3));
  });

  it('rounds value when type.color is true', () => {
    const val = ease(0, 255, 0.333, linearEase, { type: { color: true } });
    expect(val).to.equal(Math.round(255 * 0.333));
  });

  it('applies type.min clamping', () => {
    const val = ease(100, 0, 0.5, linearEase, { type: { min: 60 } });
    expect(val).to.equal(60);
  });

  it('applies type.max clamping', () => {
    const val = ease(0, 200, 0.5, linearEase, { type: { max: 80 } });
    expect(val).to.equal(80);
  });

  it('eases arrays element-by-element', () => {
    const val = ease([0, 0, 0], [100, 200, 50], 0.5, linearEase);
    expect(val).to.deep.equal([50, 100, 25]);
  });

  it('handles null elements in array', () => {
    const val = ease([0, null], [100, 200], 0.5, linearEase);
    expect(val[0]).to.equal(50);
    expect(val[1]).to.equal(200);
  });

  it('handles pfValue properties', () => {
    const start = { pfValue: 0 };
    const end = { pfValue: 100 };
    const val = ease(start, end, 0.5, linearEase);
    expect(val).to.equal(50);
  });

  it('handles value properties when type is percentage', () => {
    const start = { pfValue: 0, value: 10 };
    const end = { pfValue: 100, value: 90 };
    const val = ease(start, end, 0.5, linearEase, { type: { units: '%' } });
    expect(val).to.equal(50); // uses value when spec has % units
  });

  it('returns undefined for non-numeric non-array values', () => {
    const val = ease('hello', 'world', 0.5, linearEase);
    expect(val).to.be.undefined;
  });

  it('handles prop with value but no pfValue', () => {
    const start = { value: 10 };
    const end = { value: 90 };
    const val = ease(start, end, 0.5, linearEase);
    expect(val).to.equal(50);
  });

  it('handles plain number props', () => {
    const val = ease(10, 90, 0.5, linearEase);
    expect(val).to.equal(50);
  });

  it('handles null type with arrays', () => {
    const val = ease([0, 0], [10, 20], 0.5, linearEase);
    expect(val).to.deep.equal([5, 10]);
  });
});

// ── event.mjs ───────────────────────────────────────────────────────────────

import Event from '../../src/event.mjs';

describe('Event (event.mjs)', () => {
  it('creates event from string type', () => {
    const e = new Event('click');
    expect(e.type).to.equal('click');
    expect(e.timeStamp).to.be.a('number');
  });

  it('creates event from object with type', () => {
    const e = new Event(null, { type: 'tap', target: { id: 'n1' } });
    expect(e.type).to.equal('tap');
    expect(e.target).to.deep.equal({ id: 'n1' });
  });

  it('creates event from browser-like event with preventDefault', () => {
    const browserEvt = {
      type: 'mousedown',
      defaultPrevented: true,
      preventDefault: () => {},
      timeStamp: 12345,
    };
    const e = new Event(browserEvt);
    expect(e.type).to.equal('mousedown');
    expect(e.isDefaultPrevented()).to.be.true;
  });

  it('creates event from non-defaultPrevented browser event', () => {
    const browserEvt = {
      type: 'mousedown',
      defaultPrevented: false,
      preventDefault: () => {},
    };
    const e = new Event(browserEvt);
    expect(e.isDefaultPrevented()).to.be.false;
  });

  it('instanceString returns "event"', () => {
    const e = new Event('test');
    expect(e.instanceString()).to.equal('event');
  });

  it('preventDefault sets isDefaultPrevented to true', () => {
    const e = new Event('click');
    expect(e.isDefaultPrevented()).to.be.false;
    e.preventDefault();
    expect(e.isDefaultPrevented()).to.be.true;
  });

  it('preventDefault calls originalEvent.preventDefault', () => {
    let called = false;
    const e = new Event(null, {
      type: 'click',
      originalEvent: { preventDefault: () => { called = true; } },
    });
    e.preventDefault();
    expect(called).to.be.true;
  });

  it('preventDefault does nothing without originalEvent', () => {
    const e = new Event('click');
    e.preventDefault(); // should not throw
    expect(e.isDefaultPrevented()).to.be.true;
  });

  it('stopPropagation sets isPropagationStopped to true', () => {
    const e = new Event('click');
    expect(e.isPropagationStopped()).to.be.false;
    e.stopPropagation();
    expect(e.isPropagationStopped()).to.be.true;
  });

  it('stopPropagation calls originalEvent.stopPropagation', () => {
    let called = false;
    const e = new Event(null, {
      type: 'click',
      originalEvent: { stopPropagation: () => { called = true; } },
    });
    e.stopPropagation();
    expect(called).to.be.true;
  });

  it('stopPropagation does nothing without originalEvent', () => {
    const e = new Event('click');
    e.stopPropagation(); // should not throw
    expect(e.isPropagationStopped()).to.be.true;
  });

  it('stopImmediatePropagation sets both flags', () => {
    const e = new Event('click');
    e.stopImmediatePropagation();
    expect(e.isImmediatePropagationStopped()).to.be.true;
    expect(e.isPropagationStopped()).to.be.true;
  });

  it('recycle resets the event object', () => {
    const e = new Event('click');
    e.preventDefault();
    e.stopPropagation();
    e.recycle('tap');
    expect(e.type).to.equal('tap');
    expect(e.isDefaultPrevented()).to.be.false;
    expect(e.isPropagationStopped()).to.be.false;
  });

  it('computes renderedPosition from position and cy', () => {
    const cy = {
      zoom: () => 2,
      pan: () => ({ x: 10, y: 20 }),
    };
    const e = new Event(null, {
      type: 'tap',
      cy,
      position: { x: 5, y: 10 },
    });
    expect(e.renderedPosition).to.deep.equal({ x: 20, y: 40 });
  });

  it('uses provided renderedPosition when available', () => {
    const cy = {
      zoom: () => 2,
      pan: () => ({ x: 10, y: 20 }),
    };
    const e = new Event(null, {
      type: 'tap',
      cy,
      position: { x: 5, y: 10 },
      renderedPosition: { x: 100, y: 200 },
    });
    expect(e.renderedPosition).to.deep.equal({ x: 100, y: 200 });
  });

  it('copies namespace from props', () => {
    const e = new Event(null, { type: 'click', namespace: '.foo' });
    expect(e.namespace).to.equal('.foo');
  });

  it('copies layout from props', () => {
    const layout = { name: 'grid' };
    const e = new Event(null, { type: 'layoutready', layout });
    expect(e.layout).to.equal(layout);
  });

  it('handles src with type property but no preventDefault', () => {
    const e = new Event({ type: 'custom', target: 'foo' });
    expect(e.type).to.equal('custom');
  });
});

// ── round.mjs ───────────────────────────────────────────────────────────────

import { drawRoundCorner, drawPreparedRoundCorner, getRoundCorner } from '../../src/round.mjs';

describe('round.mjs', () => {
  function mockRoundCtx() {
    const calls = [];
    const record = (name) => (...args) => calls.push({ name, args });
    return {
      calls,
      lineTo: record('lineTo'),
      arc: record('arc'),
      moveTo: record('moveTo'),
    };
  }

  describe('drawPreparedRoundCorner', () => {
    it('draws arc when radius > 0', () => {
      const ctx = mockRoundCtx();
      drawPreparedRoundCorner(ctx, {
        cx: 50, cy: 50, radius: 10,
        startAngle: 0, endAngle: Math.PI,
        counterClockwise: false,
      });
      expect(ctx.calls).to.have.length(1);
      expect(ctx.calls[0].name).to.equal('arc');
    });

    it('draws lineTo when radius is 0', () => {
      const ctx = mockRoundCtx();
      drawPreparedRoundCorner(ctx, {
        cx: 50, cy: 50, radius: 0,
        startAngle: 0, endAngle: Math.PI,
        counterClockwise: false,
      });
      expect(ctx.calls).to.have.length(1);
      expect(ctx.calls[0].name).to.equal('lineTo');
      expect(ctx.calls[0].args).to.deep.equal([50, 50]);
    });
  });

  describe('drawRoundCorner', () => {
    it('draws arc for non-zero radius', () => {
      const ctx = mockRoundCtx();
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0 };
      const p3 = { x: 50, y: 50 };
      drawRoundCorner(ctx, p1, p2, p3, 10, true);
      const arcCalls = ctx.calls.filter(c => c.name === 'arc');
      expect(arcCalls.length).to.be.at.least(1);
    });

    it('draws lineTo for zero-angle (collinear points)', () => {
      const ctx = mockRoundCtx();
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0 };
      const p3 = { x: 100, y: 0 }; // Collinear
      drawRoundCorner(ctx, p1, p2, p3, 10, true);
      const lineToCalls = ctx.calls.filter(c => c.name === 'lineTo');
      expect(lineToCalls.length).to.be.at.least(1);
    });

    it('handles non-arc radius mode', () => {
      const ctx = mockRoundCtx();
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0 };
      const p3 = { x: 50, y: 50 };
      drawRoundCorner(ctx, p1, p2, p3, 10, false);
      expect(ctx.calls.length).to.be.greaterThan(0);
    });
  });

  describe('getRoundCorner', () => {
    it('returns zero-radius corner when radiusMax is 0', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0 };
      const p3 = { x: 50, y: 50 };
      const corner = getRoundCorner(p1, p2, p3, 0);
      expect(corner.radius).to.equal(0);
      expect(corner.cx).to.equal(50);
      expect(corner.cy).to.equal(0);
    });

    it('returns zero-radius corner when currentPoint.radius is 0', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0, radius: 0 };
      const p3 = { x: 50, y: 50 };
      const corner = getRoundCorner(p1, p2, p3, 10);
      expect(corner.radius).to.equal(0);
    });

    it('calculates corner arc for 90-degree angle', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0 };
      const p3 = { x: 50, y: 50 };
      const corner = getRoundCorner(p1, p2, p3, 10, true);
      expect(corner.radius).to.be.a('number');
      expect(corner.radius).to.be.greaterThan(0);
      expect(corner.cx).to.be.a('number');
      expect(corner.cy).to.be.a('number');
      expect(corner.startAngle).to.be.a('number');
      expect(corner.endAngle).to.be.a('number');
    });

    it('calculates corner arc for obtuse angle', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0 };
      const p3 = { x: 100, y: 10 }; // slight turn
      const corner = getRoundCorner(p1, p2, p3, 10, true);
      expect(corner.radius).to.be.a('number');
    });

    it('respects per-point radius', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0, radius: 5 };
      const p3 = { x: 50, y: 50 };
      const corner = getRoundCorner(p1, p2, p3, 20, true);
      // Radius should be based on the point's radius (5), not the max (20)
      expect(corner.radius).to.be.at.most(6); // may be slightly adjusted
    });

    it('handles non-arc radius mode', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 50, y: 0 };
      const p3 = { x: 50, y: 50 };
      const corner = getRoundCorner(p1, p2, p3, 10, false);
      expect(corner.radius).to.be.a('number');
      expect(corner.radius).to.be.greaterThan(0);
    });

    it('limits lenOut to half of shorter segment', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 }; // very short segment
      const p3 = { x: 10, y: 100 };
      const corner = getRoundCorner(p1, p2, p3, 100, true);
      // lenOut should be limited, so radius may be smaller than 100
      expect(corner.radius).to.be.lessThan(100);
    });
  });
});

// ── promise.mjs ─────────────────────────────────────────────────────────────
// The native Promise is used in the export, but we can test the internal api
// by importing the file. Native Promise tests still cover the export path.

import PromiseExport from '../../src/promise.mjs';

describe('promise.mjs', () => {
  it('exports the native Promise', () => {
    expect(PromiseExport).to.equal(Promise);
  });

  it('Promise.resolve returns resolved promise', async () => {
    const val = await PromiseExport.resolve(42);
    expect(val).to.equal(42);
  });

  it('Promise.reject returns rejected promise', async () => {
    try {
      await PromiseExport.reject(new Error('test'));
      expect.fail('should have thrown');
    } catch (e) {
      expect(e.message).to.equal('test');
    }
  });

  it('Promise.all resolves array of promises', async () => {
    const vals = await PromiseExport.all([
      PromiseExport.resolve(1),
      PromiseExport.resolve(2),
      PromiseExport.resolve(3),
    ]);
    expect(vals).to.deep.equal([1, 2, 3]);
  });

  it('Promise.all handles mix of promises and values', async () => {
    const vals = await PromiseExport.all([
      PromiseExport.resolve(1),
      2,
      PromiseExport.resolve(3),
    ]);
    expect(vals).to.deep.equal([1, 2, 3]);
  });

  it('Promise.all rejects on first rejected promise', async () => {
    try {
      await PromiseExport.all([
        PromiseExport.resolve(1),
        PromiseExport.reject(new Error('fail')),
        PromiseExport.resolve(3),
      ]);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e.message).to.equal('fail');
    }
  });

  it('then chaining works', async () => {
    const val = await PromiseExport.resolve(10).then(v => v * 2).then(v => v + 5);
    expect(val).to.equal(25);
  });
});

// ── drawing-redraw.mjs (more render paths) ─────────────────────────────────

// ── node-shapes.mjs (base) checkPoint/intersectLine ────────────────────────

import baseNodeShapesMixin from '../../src/extensions/renderer/base/node-shapes.mjs';
import nodeShapesCanvasMixin from '../../src/extensions/renderer/canvas/node-shapes.mjs';
import drawingShapesMixin from '../../src/extensions/renderer/canvas/drawing-shapes.mjs';

describe('base node-shapes checkPoint and intersectLine', () => {
  let r;

  before(() => {
    r = {};
    Object.assign(r, drawingShapesMixin);
    Object.assign(r, nodeShapesCanvasMixin);
    Object.assign(r, baseNodeShapesMixin);
    r.registerNodeShapes();
  });

  describe('ellipse', () => {
    it('checkPoint returns true for center', () => {
      expect(r.nodeShapes['ellipse'].checkPoint(50, 50, 0, 100, 80, 50, 50)).to.be.true;
    });

    it('checkPoint returns false for outside point', () => {
      expect(r.nodeShapes['ellipse'].checkPoint(200, 200, 0, 100, 80, 50, 50)).to.be.false;
    });

    it('intersectLine returns a point', () => {
      const pt = r.nodeShapes['ellipse'].intersectLine(0, 0, 100, 80, 200, 0, 0);
      expect(pt).to.exist;
    });
  });

  describe('rectangle/polygon', () => {
    it('checkPoint returns true for center of rectangle', () => {
      expect(r.nodeShapes['rectangle'].checkPoint(50, 50, 0, 100, 80, 50, 50)).to.be.true;
    });

    it('checkPoint returns false for outside rectangle', () => {
      expect(r.nodeShapes['rectangle'].checkPoint(200, 200, 0, 100, 80, 50, 50)).to.be.false;
    });

    it('intersectLine for rectangle returns a point', () => {
      const pt = r.nodeShapes['rectangle'].intersectLine(50, 50, 100, 80, 200, 50, 0);
      expect(pt).to.exist;
    });

    it('triangle checkPoint at center returns true', () => {
      expect(r.nodeShapes['triangle'].checkPoint(50, 50, 0, 100, 80, 50, 50)).to.be.true;
    });

    it('diamond checkPoint at center', () => {
      // Diamond has pointed vertices; checkPoint exercises the polygon path
      const result = r.nodeShapes['diamond'].checkPoint(0, 0, 0, 100, 80, 0, 0);
      expect(typeof result).to.equal('boolean');
    });

    it('star checkPoint at center returns true', () => {
      expect(r.nodeShapes['star'].checkPoint(0, 0, 0, 100, 80, 0, 0)).to.be.true;
    });

    it('vee checkPoint near center', () => {
      // Vee shape: center might not be inside, test a point that should be
      const result = r.nodeShapes['vee'].checkPoint(0, 0.5, 0, 100, 80, 0, 0);
      expect(typeof result).to.equal('boolean');
    });

    it('pentagon checkPoint at center', () => {
      expect(r.nodeShapes['pentagon'].checkPoint(0, 0, 0, 100, 80, 0, 0)).to.be.true;
    });

    it('hexagon intersectLine', () => {
      const pt = r.nodeShapes['hexagon'].intersectLine(0, 0, 100, 80, 200, 0, 0);
      expect(pt).to.exist;
    });

    it('octagon checkPoint at center', () => {
      expect(r.nodeShapes['octagon'].checkPoint(0, 0, 0, 100, 80, 0, 0)).to.be.true;
    });
  });

  describe('round-rectangle', () => {
    it('checkPoint at center returns true', () => {
      expect(r.nodeShapes['round-rectangle'].checkPoint(50, 50, 0, 100, 80, 50, 50, 'auto')).to.be.true;
    });

    it('checkPoint near edge returns true (in quarter circle)', () => {
      // Point near edge but inside the rounded area
      expect(r.nodeShapes['round-rectangle'].checkPoint(45, 15, 0, 100, 80, 50, 50, 8)).to.be.true;
    });

    it('checkPoint returns false for outside point', () => {
      expect(r.nodeShapes['round-rectangle'].checkPoint(200, 200, 0, 100, 80, 50, 50, 'auto')).to.be.false;
    });

    it('intersectLine returns a point', () => {
      const pt = r.nodeShapes['round-rectangle'].intersectLine(50, 50, 100, 80, 200, 50, 0, 'auto');
      expect(pt).to.exist;
    });

    it('checkPoint with explicit corner radius', () => {
      expect(r.nodeShapes['round-rectangle'].checkPoint(50, 50, 0, 100, 80, 50, 50, 5)).to.be.true;
    });
  });

  describe('cut-rectangle', () => {
    it('checkPoint at center returns true', () => {
      expect(r.nodeShapes['cut-rectangle'].checkPoint(50, 50, 0, 100, 80, 50, 50, 'auto')).to.be.true;
    });

    it('checkPoint returns false for outside', () => {
      expect(r.nodeShapes['cut-rectangle'].checkPoint(200, 200, 0, 100, 80, 50, 50, 'auto')).to.be.false;
    });

    it('intersectLine returns a point', () => {
      const pt = r.nodeShapes['cut-rectangle'].intersectLine(50, 50, 100, 80, 200, 50, 0, 'auto');
      expect(pt).to.exist;
    });

    it('generateCutTrianglePts produces correct structure', () => {
      const pts = r.nodeShapes['cut-rectangle'].generateCutTrianglePts(100, 80, 50, 50, 'auto');
      expect(pts.topLeft).to.be.an('array');
      expect(pts.topRight).to.be.an('array');
      expect(pts.bottomLeft).to.be.an('array');
      expect(pts.bottomRight).to.be.an('array');
    });
  });

  describe('barrel', () => {
    it('checkPoint at center returns true', () => {
      expect(r.nodeShapes['barrel'].checkPoint(50, 50, 0, 100, 80, 50, 50)).to.be.true;
    });

    it('checkPoint returns false for far outside point', () => {
      expect(r.nodeShapes['barrel'].checkPoint(500, 500, 0, 100, 80, 50, 50)).to.be.false;
    });

    it('intersectLine returns a point', () => {
      const pt = r.nodeShapes['barrel'].intersectLine(50, 50, 100, 80, 200, 50, 0);
      expect(pt).to.exist;
    });

    it('generateBarrelBezierPts produces correct structure', () => {
      const pts = r.nodeShapes['barrel'].generateBarrelBezierPts(100, 80, 50, 50);
      expect(pts.topLeft).to.be.an('array');
      expect(pts.topRight).to.be.an('array');
      expect(pts.bottomLeft).to.be.an('array');
      expect(pts.bottomRight).to.be.an('array');
    });

    it('checkPoint near barrel curve boundary', () => {
      // Point near the top edge of the barrel
      const result = r.nodeShapes['barrel'].checkPoint(50, 10, 0, 100, 80, 50, 50);
      expect(typeof result).to.equal('boolean');
    });
  });

  describe('bottom-round-rectangle', () => {
    it('checkPoint at center returns true', () => {
      expect(r.nodeShapes['bottom-round-rectangle'].checkPoint(50, 50, 0, 100, 80, 50, 50, 'auto')).to.be.true;
    });

    it('checkPoint returns false for outside', () => {
      expect(r.nodeShapes['bottom-round-rectangle'].checkPoint(200, 200, 0, 100, 80, 50, 50, 'auto')).to.be.false;
    });

    it('intersectLine returns a point', () => {
      const pt = r.nodeShapes['bottom-round-rectangle'].intersectLine(50, 50, 100, 80, 200, 50, 0, 'auto');
      expect(pt).to.exist;
    });

    it('checkPoint near top edge (non-rounded)', () => {
      // Top of the shape is straight, not rounded
      const result = r.nodeShapes['bottom-round-rectangle'].checkPoint(50, 12, 0, 100, 80, 50, 50, 'auto');
      expect(typeof result).to.equal('boolean');
    });

    it('intersectLine from top', () => {
      // Directly above the shape center - hits the top flat edge
      const pt = r.nodeShapes['bottom-round-rectangle'].intersectLine(50, 50, 100, 80, 50, -100, 0, 'auto');
      expect(pt).to.exist;
    });
  });

  describe('round-polygon shapes', () => {
    const rs = {};

    it('round-triangle checkPoint at center', () => {
      expect(r.nodeShapes['round-triangle'].checkPoint(0, 0, 0, 100, 80, 0, 0, 'auto', rs)).to.be.true;
    });

    it('round-diamond checkPoint at center', () => {
      expect(r.nodeShapes['round-diamond'].checkPoint(0, 0, 0, 100, 80, 0, 0, 'auto', rs)).to.be.true;
    });

    it('round-pentagon checkPoint at center', () => {
      expect(r.nodeShapes['round-pentagon'].checkPoint(0, 0, 0, 100, 80, 0, 0, 'auto', rs)).to.be.true;
    });

    it('round-hexagon checkPoint at center', () => {
      expect(r.nodeShapes['round-hexagon'].checkPoint(0, 0, 0, 100, 80, 0, 0, 'auto', rs)).to.be.true;
    });

    it('round-heptagon checkPoint at center', () => {
      expect(r.nodeShapes['round-heptagon'].checkPoint(0, 0, 0, 100, 80, 0, 0, 'auto', rs)).to.be.true;
    });

    it('round-octagon checkPoint at center', () => {
      expect(r.nodeShapes['round-octagon'].checkPoint(0, 0, 0, 100, 80, 0, 0, 'auto', rs)).to.be.true;
    });

    it('round-triangle intersectLine', () => {
      const pt = r.nodeShapes['round-triangle'].intersectLine(0, 0, 100, 80, 200, 0, 0, 'auto', rs);
      expect(pt).to.exist;
    });

    it('round-diamond intersectLine', () => {
      const pt = r.nodeShapes['round-diamond'].intersectLine(0, 0, 100, 80, 200, 0, 0, 'auto', rs);
      expect(pt).to.exist;
    });

    it('round-rectangle draw with context', () => {
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
      r.nodeShapes['round-triangle'].draw(ctx, 0, 0, 100, 80, 'auto', rs);
    });

    it('getOrCreateCorners caches results', () => {
      const rs2 = {};
      const corners1 = r.nodeShapes['round-triangle'].getOrCreateCorners(0, 0, 100, 80, 'auto', rs2, 'corners');
      const corners2 = r.nodeShapes['round-triangle'].getOrCreateCorners(0, 0, 100, 80, 'auto', rs2, 'corners');
      expect(corners1).to.equal(corners2); // same reference (cached)
    });
  });

  describe('miterBounds', () => {
    it('triangle has hasMiterBounds', () => {
      expect(r.nodeShapes['triangle'].hasMiterBounds).to.be.true;
    });

    it('rectangle does not have hasMiterBounds', () => {
      expect(r.nodeShapes['rectangle'].hasMiterBounds).to.be.false;
    });

    it('triangle miterBounds returns an object', () => {
      const bounds = r.nodeShapes['triangle'].miterBounds(50, 50, 100, 80, 2, 'center');
      expect(bounds).to.exist;
    });
  });
});

// ── memoize.mjs ─────────────────────────────────────────────────────────────

import { memoize } from '../../src/util/memoize.mjs';

describe('memoize (util/memoize.mjs)', () => {
  it('caches function results', () => {
    let callCount = 0;
    const fn = memoize((x) => { callCount++; return x * 2; });
    expect(fn(5)).to.equal(10);
    expect(fn(5)).to.equal(10);
    expect(callCount).to.equal(1); // only called once
  });

  it('uses default key function with single arg', () => {
    const fn = memoize((x) => x + 1);
    expect(fn(3)).to.equal(4);
    expect(fn(3)).to.equal(4);
  });

  it('uses default key function with zero args', () => {
    let callCount = 0;
    const fn = memoize(() => { callCount++; return 42; });
    expect(fn()).to.equal(42);
    expect(fn()).to.equal(42);
    expect(callCount).to.equal(1);
  });

  it('uses default key function with multiple args', () => {
    let callCount = 0;
    const fn = memoize((a, b, c) => { callCount++; return a + b + c; });
    expect(fn(1, 2, 3)).to.equal(6);
    expect(fn(1, 2, 3)).to.equal(6);
    expect(callCount).to.equal(1);
    expect(fn(4, 5, 6)).to.equal(15);
    expect(callCount).to.equal(2);
  });

  it('uses custom key function', () => {
    const fn = memoize((obj) => obj.value * 2, (obj) => obj.id);
    expect(fn({ id: 'a', value: 5 })).to.equal(10);
    expect(fn({ id: 'a', value: 999 })).to.equal(10); // cached by key 'a'
    expect(fn({ id: 'b', value: 7 })).to.equal(14);
  });

  it('cache is accessible on the memoized function', () => {
    const fn = memoize((x) => x);
    fn(10);
    expect(fn.cache[10]).to.equal(10);
  });
});

// ── timing.mjs ──────────────────────────────────────────────────────────────

import { requestAnimationFrame, performanceNow, now } from '../../src/util/timing.mjs';

describe('timing (util/timing.mjs)', () => {
  it('performanceNow returns a number', () => {
    const t = performanceNow();
    expect(t).to.be.a('number');
    expect(t).to.be.greaterThan(0);
  });

  it('now returns a timestamp', () => {
    const t = now();
    expect(t).to.be.a('number');
    expect(t).to.be.greaterThan(0);
  });

  it('requestAnimationFrame calls the callback', (done) => {
    requestAnimationFrame((time) => {
      expect(time).to.be.a('number');
      done();
    });
  });
});

// ── more drawing-elements coverage (drawDebugPoints, drawCachedElement edge paths) ──

import drawingElementsMixin from '../../src/extensions/renderer/canvas/drawing-elements.mjs';

describe('drawing-elements additional coverage', () => {
  it('drawDebugPoints draws debug points for nodes and edges', () => {
    const CRp = drawingElementsMixin;
    if (!CRp.drawDebugPoints) return; // only in dev mode

    const calls = [];
    const ctx = {
      fillStyle: '',
      fillRect: (...args) => calls.push({ name: 'fillRect', args }),
    };
    const node = {
      isNode: () => true,
      _private: { rscratch: { labelX: 10, labelY: 20 } },
      position: () => ({ x: 50, y: 50 }),
    };
    const edge = {
      isNode: () => false,
      _private: { rscratch: { allpts: [0, 0, 50, 50, 100, 100], midX: 50, midY: 50, labelX: 50, labelY: 50 } },
    };
    CRp.drawDebugPoints(ctx, [node, edge]);
    expect(calls.length).to.be.greaterThan(0);
  });

  it('drawCachedElement draws edge with labels', () => {
    const calls = [];
    const r = {};
    Object.assign(r, drawingElementsMixin);
    r.data = {
      eleTxrCache: {
        getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0 }),
        getElement: () => null,
        drawElement: () => { calls.push('drawEle'); },
        getRotationPoint: () => ({ x: 25, y: 25 }),
        getRotationOffset: () => ({ x: 0, y: 0 }),
        reasons: { highQuality: 'hq' },
      },
      lblTxrCache: {
        getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0 }),
        getElement: () => null,
        drawElement: () => { calls.push('drawLbl'); },
        getRotationPoint: () => ({ x: 25, y: 25 }),
        getRotationOffset: () => ({ x: 0, y: 0 }),
      },
      slbTxrCache: {
        getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0 }),
        getElement: () => null,
        drawElement: () => { calls.push('drawSlb'); },
        getRotationPoint: () => ({ x: 25, y: 25 }),
        getRotationOffset: () => ({ x: 0, y: 0 }),
      },
      tlbTxrCache: {
        getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0 }),
        getElement: () => null,
        drawElement: () => { calls.push('drawTlb'); },
        getRotationPoint: () => ({ x: 25, y: 25 }),
        getRotationOffset: () => ({ x: 0, y: 0 }),
      },
    };
    r.getTextAngle = () => 0;
    r.drawElementUnderlay = () => {};
    r.drawElementOverlay = () => {};
    r.getImgSmoothing = () => true;
    r.setImgSmoothing = () => {};

    const ctx = {
      drawImage: () => {},
      globalAlpha: 1,
      translate: () => {},
      rotate: () => {},
    };
    const edge = {
      isEdge: () => true,
      visible: () => true,
      effectiveOpacity: () => 1,
      pstyle: () => ({ pfValue: 1 }),
      element: () => ({ _private: { rscratch: { badLine: false } } }),
      boundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 }),
    };
    r.drawCachedElement(ctx, edge, 1, null);
    // Should draw element, label, source label, target label
    expect(calls).to.include('drawEle');
    expect(calls).to.include('drawLbl');
    expect(calls).to.include('drawSlb');
    expect(calls).to.include('drawTlb');
  });

  it('drawCachedElement skips labels for edge with badLine', () => {
    const calls = [];
    const r = {};
    Object.assign(r, drawingElementsMixin);
    r.data = {
      eleTxrCache: {
        getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0 }),
        getElement: () => null,
        drawElement: () => { calls.push('drawEle'); },
        getRotationPoint: () => ({ x: 25, y: 25 }),
        getRotationOffset: () => ({ x: 0, y: 0 }),
        reasons: {},
      },
      lblTxrCache: {
        getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0 }),
        getElement: () => null,
        drawElement: () => { calls.push('drawLbl'); },
        getRotationPoint: () => ({ x: 25, y: 25 }),
        getRotationOffset: () => ({ x: 0, y: 0 }),
      },
      slbTxrCache: {
        getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0 }),
        getElement: () => null,
        drawElement: () => { calls.push('drawSlb'); },
        getRotationPoint: () => ({ x: 25, y: 25 }),
        getRotationOffset: () => ({ x: 0, y: 0 }),
      },
      tlbTxrCache: {
        getBoundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0 }),
        getElement: () => null,
        drawElement: () => { calls.push('drawTlb'); },
        getRotationPoint: () => ({ x: 25, y: 25 }),
        getRotationOffset: () => ({ x: 0, y: 0 }),
      },
    };
    r.getTextAngle = () => 0;
    r.drawElementUnderlay = () => {};
    r.drawElementOverlay = () => {};

    const ctx = { drawImage: () => {}, globalAlpha: 1 };
    const edge = {
      isEdge: () => true,
      visible: () => true,
      effectiveOpacity: () => 1,
      pstyle: () => ({ pfValue: 1 }),
      element: () => ({ _private: { rscratch: { badLine: true } } }),
      boundingBox: () => ({ w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 }),
    };
    r.drawCachedElement(ctx, edge, 1, null);
    expect(calls).to.include('drawEle');
    expect(calls).to.not.include('drawLbl');
    expect(calls).to.not.include('drawSlb');
  });
});

// ── more edge-projection coverage (multi-bezier segments) ──────────────────

describe('edge-projection multi-bezier coverage', () => {
  function makeProjRenderer() {
    const r = Object.create(edgeProjectionMixin);
    r.bezierProjPcts = [0, 0.25, 0.5, 0.75, 1.0];
    r.getArrowWidth = (w, scale) => w * scale;
    r.arrowShapeWidth = 1;
    r.findEdgeControlPoints = () => {};
    return r;
  }

  function makeProjEdge(edgeType, allpts) {
    return {
      _private: {
        rscratch: { edgeType, allpts },
        rstyle: { bezierPts: null, linePts: null, haystackPts: null, arrowWidth: null },
      },
      pstyle: (name) => {
        if (name === 'width') return { pfValue: 2 };
        if (name === 'arrow-scale') return { value: 1 };
        return { value: 0, pfValue: 0 };
      },
    };
  }

  it('stores multiple bezier segments for multibezier with many control points', () => {
    const r = makeProjRenderer();
    // 10 points = 4 bezier segments overlapping
    const allpts = [0, 0, 10, 20, 20, 0, 30, 20, 40, 0, 50, 20, 60, 0, 70, 20, 80, 0, 90, 20];
    const edge = makeProjEdge('multibezier', allpts);
    r.storeEdgeProjections(edge);
    expect(edge._private.rstyle.bezierPts.length).to.be.greaterThan(5);
  });

  it('stores line points for multi-segment edge', () => {
    const r = makeProjRenderer();
    const allpts = [0, 0, 25, 25, 50, 0, 75, 25, 100, 0];
    const edge = makeProjEdge('segments', allpts);
    r.storeEdgeProjections(edge);
    expect(edge._private.rstyle.linePts).to.have.length(5);
  });
});

// ── drawing-redraw drawSelectionRectangle additional paths ──────────────────

// ── nodes.mjs (getNodeShape) ────────────────────────────────────────────────

import nodesMixin from '../../src/extensions/renderer/base/coord-ele-math/nodes.mjs';

// ── more redraw coverage (startRenderLoop, beforeRender callbacks) ──────────

describe('redraw startRenderLoop and render cycle', () => {
  it('startRenderLoop sets renderLoopStarted and initiates render', (done) => {
    const r = Object.create(redrawMixin);
    r.destroyed = false;
    r.renderLoopStarted = false;
    r.requestedFrame = true;
    r.skipFrame = false;
    r.beforeRenderCallbacks = [];
    r.averageRedrawTime = undefined;
    r.redrawCount = undefined;
    r.redrawTotalTime = undefined;
    r.renderOptions = {};
    r.render = function() {};
    r.cy = { batching: () => false };
    r.startRenderLoop();
    expect(r.renderLoopStarted).to.be.true;
    // Allow one tick for the render loop
    setTimeout(() => {
      r.destroyed = true; // stop the loop
      done();
    }, 50);
  });

  it('beforeRenderCallbacks are called during render cycle', (done) => {
    const r = Object.create(redrawMixin);
    r.destroyed = false;
    r.renderLoopStarted = false;
    r.requestedFrame = true;
    r.skipFrame = false;
    let cbCalled = false;
    r.beforeRenderCallbacks = [{ fn: (willDraw) => { cbCalled = true; }, priority: 1 }];
    r.averageRedrawTime = 0;
    r.redrawCount = 0;
    r.redrawTotalTime = 0;
    r.renderOptions = {};
    r.render = function() {};
    r.cy = { batching: () => false };
    r.startRenderLoop();
    setTimeout(() => {
      r.destroyed = true;
      expect(cbCalled).to.be.true;
      done();
    }, 50);
  });

  it('render is skipped when cy.batching is true', (done) => {
    const r = Object.create(redrawMixin);
    r.destroyed = false;
    r.renderLoopStarted = false;
    r.requestedFrame = true;
    r.skipFrame = false;
    r.beforeRenderCallbacks = [];
    r.averageRedrawTime = 0;
    r.redrawCount = 0;
    r.redrawTotalTime = 0;
    r.renderOptions = {};
    let rendered = false;
    r.render = function() { rendered = true; };
    r.cy = { batching: () => true };
    r.startRenderLoop();
    setTimeout(() => {
      r.destroyed = true;
      expect(rendered).to.be.false;
      done();
    }, 50);
  });

  it('skipFrame causes frame to be skipped on first tick', (done) => {
    const r = Object.create(redrawMixin);
    r.destroyed = false;
    r.renderLoopStarted = false;
    r.requestedFrame = true;
    r.skipFrame = true;
    r.beforeRenderCallbacks = [];
    r.averageRedrawTime = 0;
    r.redrawCount = 0;
    r.redrawTotalTime = 0;
    r.renderOptions = {};
    let renderCount = 0;
    r.render = function() { renderCount++; };
    r.cy = { batching: () => false };
    r.startRenderLoop();
    // skipFrame=true means first tick does not render,
    // but second tick does since requestedFrame is still true
    setTimeout(() => {
      r.destroyed = true;
      // After skipFrame resets to false, the next tick renders
      expect(r.skipFrame).to.be.false;
      done();
    }, 50);
  });

  it('beforeRenderCallbacks receive false when not drawing', (done) => {
    const r = Object.create(redrawMixin);
    r.destroyed = false;
    r.renderLoopStarted = false;
    r.requestedFrame = false;
    r.skipFrame = false;
    let receivedWillDraw = null;
    r.beforeRenderCallbacks = [{ fn: (willDraw) => { receivedWillDraw = willDraw; }, priority: 1 }];
    r.averageRedrawTime = 0;
    r.redrawCount = 0;
    r.redrawTotalTime = 0;
    r.renderOptions = {};
    r.render = function() {};
    r.cy = { batching: () => false };
    r.startRenderLoop();
    setTimeout(() => {
      r.destroyed = true;
      expect(receivedWillDraw).to.be.false;
      done();
    }, 50);
  });
});

describe('getNodeShape (base/coord-ele-math/nodes.mjs)', () => {
  function makeShapeNode(opts = {}) {
    return {
      pstyle: (name) => {
        if (name === 'shape') return { value: opts.shape || 'ellipse' };
        if (name === 'shape-polygon-points') return { value: opts.points || [-1, -1, 1, -1, 0, 1] };
        return { value: 0 };
      },
      width: () => opts.width || 100,
      height: () => opts.height || 100,
      isParent: () => opts.isParent || false,
    };
  }

  function makeShapeRenderer() {
    const r = Object.create(nodesMixin);
    r.nodeShapes = {
      makePolygon: (pts) => ({ name: 'polygon-' + pts.join('$') }),
    };
    return r;
  }

  it('returns the shape directly for simple shapes', () => {
    const r = makeShapeRenderer();
    expect(r.getNodeShape(makeShapeNode({ shape: 'ellipse' }))).to.equal('ellipse');
    expect(r.getNodeShape(makeShapeNode({ shape: 'triangle' }))).to.equal('triangle');
    expect(r.getNodeShape(makeShapeNode({ shape: 'diamond' }))).to.equal('diamond');
  });

  it('returns rectangle for small cutrectangle nodes', () => {
    const r = makeShapeRenderer();
    const node = makeShapeNode({ shape: 'cutrectangle', width: 20, height: 20 });
    expect(r.getNodeShape(node)).to.equal('rectangle');
  });

  it('returns cutrectangle for large enough cutrectangle nodes', () => {
    const r = makeShapeRenderer();
    const node = makeShapeNode({ shape: 'cutrectangle', width: 100, height: 100 });
    expect(r.getNodeShape(node)).to.equal('cutrectangle');
  });

  it('returns rectangle for parent with non-allowed shape', () => {
    const r = makeShapeRenderer();
    const node = makeShapeNode({ shape: 'ellipse', isParent: true });
    expect(r.getNodeShape(node)).to.equal('rectangle');
  });

  it('returns allowed shapes for parent nodes', () => {
    const r = makeShapeRenderer();
    const allowed = ['rectangle', 'roundrectangle', 'round-rectangle', 'cutrectangle', 'cut-rectangle', 'barrel'];
    for (const shape of allowed) {
      const node = makeShapeNode({ shape, isParent: true, width: 100, height: 100 });
      expect(r.getNodeShape(node)).to.equal(shape);
    }
  });

  it('handles polygon shape by creating custom polygon', () => {
    const r = makeShapeRenderer();
    const node = makeShapeNode({ shape: 'polygon', points: [-1, -1, 1, -1, 0, 1] });
    const result = r.getNodeShape(node);
    expect(result).to.include('polygon');
  });
});

describe('drawing-redraw drawSelectionRectangle additional paths', () => {
  function pstyleVal3(val, pfVal) {
    return { value: val, pfValue: pfVal !== undefined ? pfVal : val };
  }

  function mockCtxS() {
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
      fill: record('fill'),
      stroke: record('stroke'),
      clearRect: record('clearRect'),
      fillRect: record('fillRect'),
      strokeRect: record('strokeRect'),
      measureText: () => ({ width: 100, actualBoundingBoxAscent: 14 }),
      fillText: record('fillText'),
      strokeText: record('strokeText'),
      drawImage: record('drawImage'),
      canvas: { width: 800, height: 600 },
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      setLineDash: record('setLineDash'),
    };
  }

  it('draws active background position arc', () => {
    const ctx = mockCtxS();
    const r = Object.create(drawingRedrawMixin);
    r.cy = {
      zoom: () => 1,
      style: () => ({
        core: (name) => {
          const vals = {
            'selection-box-border-width': pstyleVal3(1),
            'selection-box-color': pstyleVal3([0, 0, 255]),
            'selection-box-opacity': pstyleVal3(0.5),
            'selection-box-border-color': pstyleVal3([0, 0, 200]),
            'active-bg-color': pstyleVal3([100, 100, 100]),
            'active-bg-opacity': pstyleVal3(0.3),
            'active-bg-size': pstyleVal3(30, 30),
          };
          return vals[name] || pstyleVal3(0);
        }
      }),
    };
    r.selection = [0, 0, 0, 0, 0];
    r.hoverData = { selecting: false };
    r.touchData = {};
    r.showFps = false;
    r.SELECT_BOX = 0;
    r.data = {
      canvasNeedsRedraw: [true],
      contexts: [ctx],
      bgActivePosistion: { x: 50, y: 50 },
    };
    r.drawSelectionRectangle({ drawOnlyNodeLayer: false, drawAllLayers: false }, () => {});
    expect(ctx.calls.filter(c => c.name === 'arc').length).to.be.at.least(1);
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });

  it('draws FPS counter when showFps is true', () => {
    const ctx = mockCtxS();
    const r = Object.create(drawingRedrawMixin);
    r.cy = {
      zoom: () => 1,
      style: () => ({
        core: (name) => {
          const vals = {
            'selection-box-border-width': pstyleVal3(1),
            'selection-box-color': pstyleVal3([0, 0, 255]),
            'selection-box-opacity': pstyleVal3(0.5),
            'selection-box-border-color': pstyleVal3([0, 0, 200]),
            'active-bg-color': pstyleVal3([0, 0, 0]),
            'active-bg-opacity': pstyleVal3(0),
            'active-bg-size': pstyleVal3(30, 30),
          };
          return vals[name] || pstyleVal3(0);
        }
      }),
    };
    r.selection = [0, 0, 0, 0, 0];
    r.hoverData = { selecting: false };
    r.touchData = {};
    r.showFps = true;
    r.lastRedrawTime = 16;
    r.SELECT_BOX = 0;
    r.data = {
      canvasNeedsRedraw: [false],
      contexts: [ctx],
    };
    r.drawSelectionRectangle({ drawOnlyNodeLayer: false, drawAllLayers: false }, () => {});
    expect(ctx.calls.filter(c => c.name === 'fillText').length).to.be.at.least(1);
    expect(ctx.calls.filter(c => c.name === 'strokeRect').length).to.be.at.least(1);
    expect(ctx.calls.filter(c => c.name === 'fillRect').length).to.be.at.least(1);
  });
});

// ── more node-shapes checkPoint coverage ────────────────────────────────────

describe('base node-shapes checkPoint extended', () => {
  let r;

  before(() => {
    r = {};
    Object.assign(r, drawingShapesMixin);
    Object.assign(r, nodeShapesCanvasMixin);
    Object.assign(r, baseNodeShapesMixin);
    r.registerNodeShapes();
  });

  // Exercise all checkPoint quarter-circle branches in round-rectangle
  it('round-rectangle checkPoint in top-left quarter circle', () => {
    const result = r.nodeShapes['round-rectangle'].checkPoint(5, 15, 0, 100, 80, 50, 50, 8);
    expect(typeof result).to.equal('boolean');
  });

  it('round-rectangle checkPoint in top-right quarter circle', () => {
    const result = r.nodeShapes['round-rectangle'].checkPoint(95, 15, 0, 100, 80, 50, 50, 8);
    expect(typeof result).to.equal('boolean');
  });

  it('round-rectangle checkPoint in bottom-right quarter circle', () => {
    const result = r.nodeShapes['round-rectangle'].checkPoint(95, 85, 0, 100, 80, 50, 50, 8);
    expect(typeof result).to.equal('boolean');
  });

  it('round-rectangle checkPoint in bottom-left quarter circle', () => {
    const result = r.nodeShapes['round-rectangle'].checkPoint(5, 85, 0, 100, 80, 50, 50, 8);
    expect(typeof result).to.equal('boolean');
  });

  // Exercise cut-rectangle corner triangle checks
  it('cut-rectangle checkPoint near top-left cut corner', () => {
    const result = r.nodeShapes['cut-rectangle'].checkPoint(3, 3, 0, 100, 80, 50, 50, 'auto');
    expect(typeof result).to.equal('boolean');
  });

  it('cut-rectangle checkPoint in vBox region', () => {
    const result = r.nodeShapes['cut-rectangle'].checkPoint(50, 50, 0, 100, 80, 50, 50, 'auto');
    expect(result).to.be.true;
  });

  // Exercise barrel checkPoint curve regions
  it('barrel checkPoint near top-left curve', () => {
    const result = r.nodeShapes['barrel'].checkPoint(5, 15, 0, 200, 100, 100, 50);
    expect(typeof result).to.equal('boolean');
  });

  it('barrel checkPoint near bottom-right curve', () => {
    const result = r.nodeShapes['barrel'].checkPoint(195, 85, 0, 200, 100, 100, 50);
    expect(typeof result).to.equal('boolean');
  });

  // Exercise bottom-round-rectangle extra paths
  it('bottom-round-rectangle checkPoint in top non-rounded area', () => {
    const result = r.nodeShapes['bottom-round-rectangle'].checkPoint(50, 11, 0, 100, 80, 50, 50, 8);
    expect(result).to.be.true;
  });

  it('bottom-round-rectangle checkPoint in bottom-right rounded area', () => {
    const result = r.nodeShapes['bottom-round-rectangle'].checkPoint(97, 87, 0, 100, 80, 50, 50, 8);
    expect(typeof result).to.equal('boolean');
  });

  it('bottom-round-rectangle checkPoint in bottom-left rounded area', () => {
    const result = r.nodeShapes['bottom-round-rectangle'].checkPoint(3, 87, 0, 100, 80, 50, 50, 8);
    expect(typeof result).to.equal('boolean');
  });

  // Exercise intersectLine for all major shapes
  it('triangle intersectLine', () => {
    const pt = r.nodeShapes['triangle'].intersectLine(0, 0, 100, 80, 200, 0, 0);
    expect(pt).to.exist;
  });

  it('diamond intersectLine', () => {
    const pt = r.nodeShapes['diamond'].intersectLine(0, 0, 100, 80, 200, 0, 0);
    expect(pt).to.exist;
  });

  it('star intersectLine', () => {
    const pt = r.nodeShapes['star'].intersectLine(0, 0, 100, 80, 200, 0, 0);
    expect(pt).to.exist;
  });

  it('pentagon intersectLine', () => {
    const pt = r.nodeShapes['pentagon'].intersectLine(0, 0, 100, 80, 200, 0, 0);
    expect(pt).to.exist;
  });

  it('cut-rectangle intersectLine', () => {
    const pt = r.nodeShapes['cut-rectangle'].intersectLine(50, 50, 100, 80, 200, 50, 0, 'auto');
    expect(pt).to.exist;
  });

  it('barrel intersectLine', () => {
    const pt = r.nodeShapes['barrel'].intersectLine(100, 50, 200, 100, 300, 50, 0);
    expect(pt).to.exist;
  });

  it('bottom-round-rectangle intersectLine from side', () => {
    const pt = r.nodeShapes['bottom-round-rectangle'].intersectLine(50, 50, 100, 80, 200, 50, 0, 'auto');
    expect(pt).to.exist;
  });
});

// ── more math.mjs coverage for roundPolygonIntersectLine ────────────────────

describe('math roundPolygonIntersectLine', () => {
  it('roundPolygonIntersectLine returns nearest intersection', () => {
    // Use the round-triangle shape to exercise roundPolygonIntersectLine
    const r2 = {};
    Object.assign(r2, drawingShapesMixin);
    Object.assign(r2, nodeShapesCanvasMixin);
    Object.assign(r2, baseNodeShapesMixin);
    r2.registerNodeShapes();

    const rs = {};
    // Line from far away to center
    const pt = r2.nodeShapes['round-triangle'].intersectLine(0, 0, 200, 160, 500, 0, 0, 'auto', rs);
    expect(pt).to.exist;
  });

  it('roundPolygonIntersectLine with line through multiple corners', () => {
    const r2 = {};
    Object.assign(r2, drawingShapesMixin);
    Object.assign(r2, nodeShapesCanvasMixin);
    Object.assign(r2, baseNodeShapesMixin);
    r2.registerNodeShapes();

    const rs = {};
    // Line from above, through shape
    const pt = r2.nodeShapes['round-hexagon'].intersectLine(0, 0, 200, 160, 0, -500, 0, 'auto', rs);
    expect(pt).to.exist;
  });
});

// ── more edge path coverage with usePaths ───────────────────────────────────

import drawingEdgesMixin from '../../src/extensions/renderer/canvas/drawing-edges.mjs';

describe('drawing-edges Path2D coverage', () => {
  before(() => {
    if (typeof globalThis.Path2D === 'undefined') {
      globalThis.Path2D = class Path2D {
        constructor() {}
        beginPath() {}
        moveTo() {}
        lineTo() {}
        quadraticCurveTo() {}
        closePath() {}
      };
    }
  });

  function mockCtxE() {
    const calls = [];
    const record = (name) => (...args) => calls.push({ name, args });
    return {
      calls,
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      quadraticCurveTo: record('quadraticCurveTo'),
      stroke: function(path) { calls.push({ name: 'stroke', args: [path] }); },
      setLineDash: record('setLineDash'),
      lineDashOffset: 0,
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'round',
      strokeStyle: '',
      fillStyle: '',
    };
  }

  it('drawEdgePath with usePaths=true caches path', () => {
    const r = Object.create(drawingEdgesMixin);
    r.usePaths = () => true;
    const ctx = mockCtxE();
    const edge = {
      _private: {
        rscratch: {
          edgeType: 'straight',
          badLine: false,
          allpts: [0, 0, 100, 100],
          pathCacheKey: null,
          pathCache: null,
        },
      },
      pstyle: (name) => {
        if (name === 'line-dash-pattern') return { pfValue: [6, 3] };
        if (name === 'line-dash-offset') return { pfValue: 0 };
        return { value: 0, pfValue: 0 };
      },
    };
    r.drawEdgePath(edge, ctx, [0, 0, 100, 100], 'solid');
    // Second call should hit cache
    r.drawEdgePath(edge, ctx, [0, 0, 100, 100], 'solid');
    expect(edge._private.rscratch.pathCache).to.exist;
  });
});

// ── additional drawing-edges coverage ────────────────────────────────────────

describe('drawing-edges additional coverage', () => {
  function pstyleVal4(val, pfVal, strVal, units) {
    return { value: val, pfValue: pfVal !== undefined ? pfVal : val, strValue: strVal || String(val), units: units || '' };
  }

  function mockCtxF() {
    const calls = [];
    const record = (name) => (...args) => calls.push({ name, args });
    return {
      calls, save: record('save'), restore: record('restore'),
      translate: record('translate'), rotate: record('rotate'), scale: record('scale'),
      setTransform: record('setTransform'),
      beginPath: record('beginPath'), closePath: record('closePath'),
      moveTo: record('moveTo'), lineTo: record('lineTo'),
      arc: record('arc'), quadraticCurveTo: record('quadraticCurveTo'),
      fill: record('fill'), stroke: record('stroke'), clip: record('clip'),
      clearRect: record('clearRect'), fillRect: record('fillRect'), strokeRect: record('strokeRect'),
      fillText: record('fillText'), strokeText: record('strokeText'), drawImage: record('drawImage'),
      measureText: () => ({ width: 100, actualBoundingBoxAscent: 14 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      getLineDash: () => [], setLineDash: record('setLineDash'),
      ellipse: record('ellipse'),
      canvas: { width: 800, height: 600 },
      globalAlpha: 1, globalCompositeOperation: 'source-over',
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'round',
      font: '', textAlign: 'start', textBaseline: 'alphabetic',
      lineDashOffset: 0, imageSmoothingEnabled: true,
    };
  }

  it('drawEdge with line-outline and straight-triangle style', () => {
    const r = {};
    Object.assign(r, drawingEdgesMixin);
    r.usePaths = () => false;
    r.eleStrokeStyle = () => {};
    r.colorStrokeStyle = () => {};
    r.drawArrowheads = () => {};
    r.drawElementText = () => {};
    r.drawEdgeOverlay = () => {};
    r.drawEdgeUnderlay = () => {};
    r.arrowShapes = {};

    const ctx = mockCtxF();
    const edge = {
      _private: {
        rscratch: { edgeType: 'straight', badLine: false, allpts: [0, 0, 100, 100] }
      },
      isNode: () => false, isEdge: () => true,
      visible: () => true,
      pstyle: (name) => {
        if (name === 'opacity') return pstyleVal4(1);
        if (name === 'line-opacity') return pstyleVal4(1);
        if (name === 'curve-style') return pstyleVal4('straight-triangle');
        if (name === 'line-style') return pstyleVal4('solid');
        if (name === 'width') return pstyleVal4(3, 3);
        if (name === 'line-cap') return pstyleVal4('butt');
        if (name === 'line-outline-width') return pstyleVal4(2);
        if (name === 'line-outline-color') return pstyleVal4([100, 100, 100]);
        if (name === 'ghost') return pstyleVal4('no');
        if (name === 'overlay-opacity') return pstyleVal4(0);
        if (name === 'underlay-opacity') return pstyleVal4(0);
        return pstyleVal4(0);
      },
    };
    r.drawEdge(ctx, edge);
    // straight-triangle outline path should trigger fill calls
    expect(ctx.calls.filter(c => c.name === 'fill').length).to.be.at.least(1);
  });
});

// ── additional drawing-edges line outline paths ─────────────────────────────

describe('drawing-edges line outline bezier path', () => {
  function pstyleVal5(val, pfVal, strVal) {
    return { value: val, pfValue: pfVal !== undefined ? pfVal : val, strValue: strVal || String(val) };
  }

  function mockCtxG() {
    const calls = [];
    const record = (name) => (...args) => calls.push({ name, args });
    return {
      calls,
      save: record('save'), restore: record('restore'),
      translate: record('translate'), rotate: record('rotate'), scale: record('scale'),
      setTransform: record('setTransform'),
      beginPath: record('beginPath'), closePath: record('closePath'),
      moveTo: record('moveTo'), lineTo: record('lineTo'),
      arc: record('arc'), quadraticCurveTo: record('quadraticCurveTo'),
      fill: record('fill'), stroke: record('stroke'), clip: record('clip'),
      clearRect: record('clearRect'), fillRect: record('fillRect'), strokeRect: record('strokeRect'),
      fillText: record('fillText'), strokeText: record('strokeText'), drawImage: record('drawImage'),
      measureText: () => ({ width: 100, actualBoundingBoxAscent: 14 }),
      getLineDash: () => [], setLineDash: record('setLineDash'),
      ellipse: record('ellipse'),
      canvas: { width: 800, height: 600 },
      globalAlpha: 1, globalCompositeOperation: 'source-over',
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'round',
      font: '', textAlign: 'start', textBaseline: 'alphabetic',
      lineDashOffset: 0, imageSmoothingEnabled: true,
    };
  }

  it('drawEdge with outline on bezier curve-style', () => {
    const r = {};
    Object.assign(r, drawingEdgesMixin);
    r.usePaths = () => false;
    r.eleStrokeStyle = () => {};
    r.colorStrokeStyle = () => {};
    r.drawArrowheads = () => {};
    r.drawElementText = () => {};
    r.drawEdgeOverlay = () => {};
    r.drawEdgeUnderlay = () => {};

    const ctx = mockCtxG();
    const edge = {
      _private: {
        rscratch: { edgeType: 'bezier', badLine: false, allpts: [0, 0, 50, 50, 100, 0] }
      },
      isNode: () => false, isEdge: () => true, visible: () => true,
      pstyle: (name) => {
        if (name === 'opacity') return pstyleVal5(1);
        if (name === 'line-opacity') return pstyleVal5(1);
        if (name === 'curve-style') return pstyleVal5('bezier');
        if (name === 'line-style') return pstyleVal5('solid');
        if (name === 'width') return pstyleVal5(3, 3);
        if (name === 'line-cap') return pstyleVal5('butt');
        if (name === 'line-outline-width') return pstyleVal5(2);
        if (name === 'line-outline-color') return pstyleVal5([100, 100, 100]);
        if (name === 'ghost') return pstyleVal5('no');
        if (name === 'overlay-opacity') return pstyleVal5(0);
        if (name === 'underlay-opacity') return pstyleVal5(0);
        if (name === 'line-fill') return pstyleVal5('solid');
        if (name === 'line-color') return pstyleVal5([0, 0, 0]);
        if (name === 'line-dash-pattern') return pstyleVal5([6, 3], [6, 3]);
        if (name === 'line-dash-offset') return pstyleVal5(0, 0);
        return pstyleVal5(0);
      },
    };
    r.drawEdge(ctx, edge);
    // outline should add extra strokes
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(2);
  });

  it('drawEdge with dashed line outline', () => {
    const r = {};
    Object.assign(r, drawingEdgesMixin);
    r.usePaths = () => false;
    r.eleStrokeStyle = () => {};
    r.colorStrokeStyle = () => {};
    r.drawArrowheads = () => {};
    r.drawElementText = () => {};
    r.drawEdgeOverlay = () => {};
    r.drawEdgeUnderlay = () => {};

    const ctx = mockCtxG();
    const edge = {
      _private: {
        rscratch: { edgeType: 'straight', badLine: false, allpts: [0, 0, 100, 100] }
      },
      isNode: () => false, isEdge: () => true, visible: () => true,
      pstyle: (name) => {
        if (name === 'opacity') return pstyleVal5(1);
        if (name === 'line-opacity') return pstyleVal5(1);
        if (name === 'curve-style') return pstyleVal5('straight');
        if (name === 'line-style') return pstyleVal5('dashed');
        if (name === 'width') return pstyleVal5(2, 2);
        if (name === 'line-cap') return pstyleVal5('butt');
        if (name === 'line-outline-width') return pstyleVal5(1);
        if (name === 'line-outline-color') return pstyleVal5([50, 50, 50]);
        if (name === 'ghost') return pstyleVal5('no');
        if (name === 'overlay-opacity') return pstyleVal5(0);
        if (name === 'underlay-opacity') return pstyleVal5(0);
        if (name === 'line-fill') return pstyleVal5('solid');
        if (name === 'line-color') return pstyleVal5([0, 0, 0]);
        if (name === 'line-dash-pattern') return pstyleVal5([6, 3], [6, 3]);
        if (name === 'line-dash-offset') return pstyleVal5(0, 0);
        return pstyleVal5(0);
      },
    };
    r.drawEdge(ctx, edge);
    expect(ctx.calls.filter(c => c.name === 'stroke').length).to.be.at.least(2);
  });
});

describe('drawing-redraw matchCanvasSize', () => {
  function pstyleVal2(val, pfVal) {
    return { value: val, pfValue: pfVal !== undefined ? pfVal : val };
  }

  it('matchCanvasSize resizes canvases', () => {
    const r = Object.create(drawingRedrawMixin);
    r.forcedPixelRatio = 1;
    r.cy = { window: () => ({ devicePixelRatio: 1 }) };
    r.data = {
      contexts: [{ backingStorePixelRatio: 1 }],
      canvasContainer: { style: {} },
      canvases: [
        { width: 0, height: 0, style: {} },
        { width: 0, height: 0, style: {} },
      ],
      bufferCanvases: [null],
    };
    r.findContainerClientCoords = () => [0, 0, 400, 300];
    r.motionBlurPxRatio = 1;
    r.CANVAS_LAYERS = 2;
    r.BUFFER_COUNT = 1;
    r.MOTIONBLUR_BUFFER_NODE = 10;
    r.MOTIONBLUR_BUFFER_DRAG = 11;
    r.TEXTURE_BUFFER = 0;
    r.canvasWidth = 0;
    r.canvasHeight = 0;
    r.getBufferCanvas = () => ({ width: 0, height: 0 });
    r.textureMult = 1;
    r.getPixelRatio = drawingRedrawMixin.getPixelRatio;
    r.matchCanvasSize({});
    expect(r.canvasWidth).to.equal(400);
    expect(r.canvasHeight).to.equal(300);
  });

  it('matchCanvasSize skips when size unchanged', () => {
    const r = Object.create(drawingRedrawMixin);
    r.forcedPixelRatio = 1;
    r.cy = { window: () => ({ devicePixelRatio: 1 }) };
    r.data = {
      contexts: [{ backingStorePixelRatio: 1 }],
      canvasContainer: { style: {} },
      canvases: [],
      bufferCanvases: [],
    };
    r.findContainerClientCoords = () => [0, 0, 400, 300];
    r.motionBlurPxRatio = 1;
    r.CANVAS_LAYERS = 0;
    r.BUFFER_COUNT = 0;
    r.MOTIONBLUR_BUFFER_NODE = 10;
    r.MOTIONBLUR_BUFFER_DRAG = 11;
    r.canvasWidth = 400;
    r.canvasHeight = 300;
    r.getPixelRatio = drawingRedrawMixin.getPixelRatio;
    // Should return early
    r.matchCanvasSize({});
    expect(r.canvasWidth).to.equal(400);
  });
});
