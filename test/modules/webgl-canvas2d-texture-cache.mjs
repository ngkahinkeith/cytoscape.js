import { describe, it } from 'mocha';
import { expect } from 'chai';

import ElementTextureCacheLookup from '../../src/extensions/renderer/canvas/ele-texture-cache-lookup.mjs';
import textureCacheDefs from '../../src/extensions/renderer/canvas/texture-cache-defs.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────

function mockEle(id, key = 'k1') {
  return {
    id: () => id,
    _key: key,
  };
}

// ── ele-texture-cache-lookup.mjs ────────────────────────────────────────────

describe('ElementTextureCacheLookup', () => {
  it('constructor initializes all maps', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    expect(lookup).to.have.property('idsByKey');
    expect(lookup).to.have.property('keyForId');
    expect(lookup).to.have.property('cachesByLvl');
    expect(lookup).to.have.property('lvls');
  });

  it('getIdsFor creates a set for a new key', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ids = lookup.getIdsFor('testKey');
    expect(ids.size).to.equal(0);
  });

  it('getIdsFor returns same set for same key', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ids1 = lookup.getIdsFor('testKey');
    const ids2 = lookup.getIdsFor('testKey');
    expect(ids1).to.equal(ids2);
  });

  it('addIdForKey adds id', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    lookup.addIdForKey('k1', 'id1');
    expect(lookup.getNumberOfIdsForKey('k1')).to.equal(1);
  });

  it('addIdForKey ignores null key', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    lookup.addIdForKey(null, 'id1');
    // No error
  });

  it('deleteIdForKey removes id', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    lookup.addIdForKey('k1', 'id1');
    lookup.deleteIdForKey('k1', 'id1');
    expect(lookup.getNumberOfIdsForKey('k1')).to.equal(0);
  });

  it('deleteIdForKey ignores null key', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    lookup.deleteIdForKey(null, 'id1');
    // No error
  });

  it('getNumberOfIdsForKey returns 0 for null key', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    expect(lookup.getNumberOfIdsForKey(null)).to.equal(0);
  });

  it('getNumberOfIdsForKey returns correct count', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    lookup.addIdForKey('k1', 'id1');
    lookup.addIdForKey('k1', 'id2');
    expect(lookup.getNumberOfIdsForKey('k1')).to.equal(2);
  });

  it('updateKeyMappingFor updates the mapping', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    lookup.updateKeyMappingFor(ele);
    expect(lookup.keyForId.get('e1')).to.equal('keyA');
    expect(lookup.getNumberOfIdsForKey('keyA')).to.equal(1);
  });

  it('updateKeyMappingFor handles key changes', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    lookup.updateKeyMappingFor(ele);
    ele._key = 'keyB';
    lookup.updateKeyMappingFor(ele);
    expect(lookup.keyForId.get('e1')).to.equal('keyB');
    expect(lookup.getNumberOfIdsForKey('keyA')).to.equal(0);
    expect(lookup.getNumberOfIdsForKey('keyB')).to.equal(1);
  });

  it('deleteKeyMappingFor removes the mapping', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    lookup.updateKeyMappingFor(ele);
    lookup.deleteKeyMappingFor(ele);
    expect(lookup.keyForId.has('e1')).to.be.false;
  });

  it('keyHasChangedFor detects key change', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    lookup.updateKeyMappingFor(ele);
    expect(lookup.keyHasChangedFor(ele)).to.be.false;
    ele._key = 'keyB';
    expect(lookup.keyHasChangedFor(ele)).to.be.true;
  });

  it('isInvalid checks key change and doesEleInvalidateKey', () => {
    let invalidateFlag = false;
    const lookup = new ElementTextureCacheLookup(ele => ele._key, () => invalidateFlag);
    const ele = mockEle('e1', 'keyA');
    lookup.updateKeyMappingFor(ele);
    expect(lookup.isInvalid(ele)).to.be.false;
    invalidateFlag = true;
    expect(lookup.isInvalid(ele)).to.be.true;
  });

  it('getCachesAt creates map for new level', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const caches = lookup.getCachesAt(0);
    expect(caches).to.not.be.null;
    expect(lookup.lvls).to.include(0);
  });

  it('getCachesAt returns same map for same level', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const c1 = lookup.getCachesAt(0);
    const c2 = lookup.getCachesAt(0);
    expect(c1).to.equal(c2);
  });

  it('setCache and getCache work together', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const cache = { data: 'test' };
    lookup.setCache('k1', 0, cache);
    expect(lookup.getCache('k1', 0)).to.equal(cache);
    expect(cache.key).to.equal('k1');
  });

  it('set and get work together', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    const cache = { data: 'test' };
    lookup.set(ele, 0, cache);
    const result = lookup.get(ele, 0);
    expect(result).to.equal(cache);
  });

  it('get returns undefined for missing cache', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    expect(lookup.get(ele, 0)).to.be.undefined;
  });

  it('getForCachedKey uses stored key', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    const cache = { data: 'test' };
    lookup.set(ele, 0, cache);
    ele._key = 'keyB'; // change key
    // getForCachedKey should use the old stored key
    const result = lookup.getForCachedKey(ele, 0);
    expect(result).to.equal(cache);
  });

  it('hasCache and has work correctly', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    expect(lookup.has(ele, 0)).to.be.false;
    lookup.set(ele, 0, { data: 'test' });
    expect(lookup.has(ele, 0)).to.be.true;
    expect(lookup.hasCache('keyA', 0)).to.be.true;
  });

  it('deleteCache removes the cache', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    lookup.setCache('k1', 0, { data: 'test' });
    lookup.deleteCache('k1', 0);
    expect(lookup.getCache('k1', 0)).to.be.undefined;
  });

  it('delete removes by element', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    lookup.set(ele, 0, { data: 'test' });
    lookup.delete(ele, 0);
    expect(lookup.get(ele, 0)).to.be.undefined;
  });

  it('invalidateKey removes cache at all levels', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    lookup.setCache('k1', 0, { data: 'lvl0' });
    lookup.setCache('k1', 1, { data: 'lvl1' });
    lookup.invalidateKey('k1');
    expect(lookup.getCache('k1', 0)).to.be.undefined;
    expect(lookup.getCache('k1', 1)).to.be.undefined;
  });

  it('invalidate removes element mapping and returns true if no other eles', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele = mockEle('e1', 'keyA');
    lookup.set(ele, 0, { data: 'test' });
    const noOtherEles = lookup.invalidate(ele);
    expect(noOtherEles).to.be.true;
  });

  it('invalidate returns false when other eles share the key', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key);
    const ele1 = mockEle('e1', 'sharedKey');
    const ele2 = mockEle('e2', 'sharedKey');
    lookup.set(ele1, 0, { data: 'test' });
    lookup.updateKeyMappingFor(ele2);
    const noOtherEles = lookup.invalidate(ele1);
    expect(noOtherEles).to.be.false;
  });

  it('invalidate with doesEleInvalidateKey clears entire key', () => {
    const lookup = new ElementTextureCacheLookup(ele => ele._key, () => true);
    const ele = mockEle('e1', 'keyA');
    lookup.set(ele, 0, { data: 'test' });
    lookup.set(ele, 1, { data: 'test2' });
    const entireKeyInvalidated = lookup.invalidate(ele);
    expect(entireKeyInvalidated).to.be.true;
    expect(lookup.getCache('keyA', 0)).to.be.undefined;
    expect(lookup.getCache('keyA', 1)).to.be.undefined;
  });
});

// ── texture-cache-defs.mjs ──────────────────────────────────────────────────

describe('texture-cache-defs', () => {
  it('setupDequeueing returns a function', () => {
    const fn = textureCacheDefs.setupDequeueing({
      deqRedrawThreshold: 50,
      deqCost: 0.15,
      deqAvgCost: 0.1,
      deqNoDrawCost: 0.9,
      deqFastCost: 0.9,
      deq: () => [],
      onDeqd: () => {},
      shouldRedraw: () => false,
      priority: () => 0,
    });
    expect(fn).to.be.a('function');
  });

  it('setupDequeueing sets up beforeRender callback', () => {
    let beforeRenderCb = null;
    const mockSelf = {
      dequeueingSetup: false,
      renderer: {
        beforeRender: (fn, priority) => { beforeRenderCb = fn; },
        redrawHint: () => {},
        redraw: () => {},
        averageRedrawTime: 16,
        lastRedrawTime: 16,
        cy: { extent: () => ({}) },
        getPixelRatio: () => 1,
        flushRenderedStyleQueue: () => {},
      },
    };

    const setupFn = textureCacheDefs.setupDequeueing({
      deqRedrawThreshold: 50,
      deqCost: 0.15,
      deqAvgCost: 0.1,
      deqNoDrawCost: 0.9,
      deqFastCost: 0.9,
      deq: () => [],
      onDeqd: () => {},
      shouldRedraw: () => false,
      priority: () => 0,
    });

    setupFn.call(mockSelf);
    expect(beforeRenderCb).to.be.a('function');
    expect(mockSelf.dequeueingSetup).to.be.true;
  });

  it('setupDequeueing skips if already set up', () => {
    let callCount = 0;
    const mockSelf = {
      dequeueingSetup: true,
      renderer: {
        beforeRender: () => { callCount++; },
      },
    };

    const setupFn = textureCacheDefs.setupDequeueing({
      deqRedrawThreshold: 50,
      deqCost: 0.15,
      deqAvgCost: 0.1,
      deqNoDrawCost: 0.9,
      deqFastCost: 0.9,
      deq: () => [],
      onDeqd: () => {},
      shouldRedraw: () => false,
    });

    setupFn.call(mockSelf);
    expect(callCount).to.equal(0); // beforeRender not called again
  });

  it('dequeue callback processes items when drawing', () => {
    let deqCalled = false;
    let onDeqdCalled = false;
    let beforeRenderCb = null;
    const mockSelf = {
      dequeueingSetup: false,
      renderer: {
        beforeRender: (fn) => { beforeRenderCb = fn; },
        redrawHint: () => {},
        redraw: () => {},
        averageRedrawTime: 100,
        lastRedrawTime: 100,
        cy: { extent: () => ({}) },
        getPixelRatio: () => 1,
        flushRenderedStyleQueue: () => {},
      },
    };

    const setupFn = textureCacheDefs.setupDequeueing({
      deqRedrawThreshold: 50,
      deqCost: 0.15,
      deqAvgCost: 0.1,
      deqNoDrawCost: 0.9,
      deqFastCost: 0.9,
      deq: () => {
        if (!deqCalled) {
          deqCalled = true;
          return [{ ele: {} }];
        }
        return [];
      },
      onDeqd: () => { onDeqdCalled = true; },
      shouldRedraw: () => false,
      priority: () => 0,
    });

    setupFn.call(mockSelf);
    // Call the dequeue callback (simulating a frame)
    beforeRenderCb(true, Date.now());
    expect(deqCalled).to.be.true;
    expect(onDeqdCalled).to.be.true;
  });

  it('dequeue callback flushes rendered style queue when not drawing', () => {
    let flushed = false;
    let beforeRenderCb = null;
    const mockSelf = {
      dequeueingSetup: false,
      renderer: {
        beforeRender: (fn) => { beforeRenderCb = fn; },
        redrawHint: () => {},
        redraw: () => {},
        averageRedrawTime: 100,
        lastRedrawTime: 100,
        cy: { extent: () => ({}) },
        getPixelRatio: () => 1,
        flushRenderedStyleQueue: () => { flushed = true; },
      },
    };

    const setupFn = textureCacheDefs.setupDequeueing({
      deqRedrawThreshold: 50,
      deqCost: 0.15,
      deqAvgCost: 0.1,
      deqNoDrawCost: 0.9,
      deqFastCost: 0.9,
      deq: () => [],
      onDeqd: () => {},
      shouldRedraw: () => false,
      priority: () => 0,
    });

    setupFn.call(mockSelf);
    beforeRenderCb(false, Date.now()); // willDraw = false
    expect(flushed).to.be.true;
  });
});

// ── ele-texture-cache.mjs ─────────────────────────────────────────────────

describe('ElementTextureCache (via ele-texture-cache.mjs)', () => {
  // We test the parts that don't require a full renderer+cy graph
  // The module exports a constructor; we need to construct it with a mock renderer

  // A minimal mock renderer for the ETC constructor
  function makeMockRenderer() {
    return {
      cy: {
        zoom: () => 1,
        extent: () => ({ x1: 0, y1: 0, x2: 800, y2: 600, w: 800, h: 600 }),
      },
      getPixelRatio: () => 1,
      beforeRender: () => {},
      averageRedrawTime: 16,
      lastRedrawTime: 16,
      redrawHint: () => {},
      redraw: () => {},
      flushRenderedStyleQueue: () => {},
      eleTextBiggerThanMin: () => true,
      beforeRenderPriorities: { eleTxrDeq: 0 },
      makeOffscreenCanvas: (w, h) => {
        return {
          width: w,
          height: h,
          getContext: () => ({
            setTransform: () => {},
            clearRect: () => {},
            translate: () => {},
            scale: () => {},
            drawImage: () => {},
          }),
        };
      },
    };
  }

  // A minimal mock ele for ETC
  function makeMockETCEle(id, key = 'k1') {
    return {
      id: () => id,
      _private: { nodeKey: key },
      visible: () => true,
      removed: () => false,
      isEdge: () => false,
      isParent: () => false,
      isNode: () => true,
      boundingBox: () => ({ x1: 0, y1: 0, x2: 50, y2: 50, w: 50, h: 50 }),
      spawn: () => ({
        merge: (e) => {
          const collection = [e];
          collection.length = 1;
          collection.merge = (el) => { collection.push(el); return collection; };
          collection.unmerge = () => collection;
          return collection;
        }
      }),
    };
  }

  // We import dynamically to avoid triggering the constructor side effects
  let ElementTextureCache;
  before(async () => {
    const mod = await import('../../src/extensions/renderer/canvas/ele-texture-cache.mjs');
    ElementTextureCache = mod.default;
  });

  it('getTextureQueue creates queue for height', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const q = etc.getTextureQueue(50);
    expect(q).to.be.an('array');
  });

  it('getRetiredTextureQueue creates queue', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    // Initialize eleImgCaches first (normally done via getTextureQueue)
    etc.getTextureQueue(50);
    const q = etc.getRetiredTextureQueue(50);
    expect(q).to.be.an('array');
  });

  it('getElementQueue returns a heap', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const q = etc.getElementQueue();
    expect(q).to.have.property('push');
    expect(q).to.have.property('pop');
  });

  it('getElementKeyToQueue returns an object', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const k2q = etc.getElementKeyToQueue();
    expect(k2q).to.be.an('object');
  });

  it('addTexture creates a new texture', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const txr = etc.addTexture(50, 100);
    expect(txr).to.have.property('canvas');
    expect(txr).to.have.property('context');
    expect(txr.height).to.equal(50);
    expect(txr.width).to.be.at.least(100);
    expect(txr.usedWidth).to.equal(0);
    expect(txr.eleCaches).to.be.an('array');
  });

  it('getElement returns null for zero-size bb', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele = makeMockETCEle('e1');
    const result = etc.getElement(ele, { w: 0, h: 0 }, 1, 0);
    expect(result).to.be.null;
  });

  it('getElement returns null for NaN bb', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele = makeMockETCEle('e1');
    expect(etc.getElement(ele, { w: NaN, h: 50 }, 1, 0)).to.be.null;
  });

  it('getElement returns null for invisible element', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele = makeMockETCEle('e1');
    ele.visible = () => false;
    expect(etc.getElement(ele, { w: 50, h: 50 }, 1, 0)).to.be.null;
  });

  it('getElement returns null for removed element', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele = makeMockETCEle('e1');
    ele.removed = () => true;
    expect(etc.getElement(ele, { w: 50, h: 50 }, 1, 0)).to.be.null;
  });

  it('getElement returns null for too-high zoom level', () => {
    const r = makeMockRenderer();
    r.cy.zoom = () => 100;
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele = makeMockETCEle('e1');
    expect(etc.getElement(ele, { w: 50, h: 50 }, 1, 10)).to.be.null;
  });

  it('getElement creates and returns an eleCache', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele = makeMockETCEle('e1');
    const bb = { w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 };
    const cache = etc.getElement(ele, bb, 1, 0);
    expect(cache).to.not.be.null;
    expect(cache).to.have.property('texture');
    expect(cache).to.have.property('width');
    expect(cache).to.have.property('level');
  });

  it('getElement returns cached result on second call', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele = makeMockETCEle('e1');
    const bb = { w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 };
    const cache1 = etc.getElement(ele, bb, 1, 0);
    const cache2 = etc.getElement(ele, bb, 1, 0);
    expect(cache1).to.equal(cache2);
  });

  it('invalidateElement invalidates and removes from queue', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele = makeMockETCEle('e1');
    const bb = { w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 };
    etc.getElement(ele, bb, 1, 0);
    // Change the key to make it invalid
    ele._private.nodeKey = 'k2';
    etc.invalidateElement(ele);
    // After invalidation, the cache should be gone
    const result = etc.lookup.get(ele, 0);
    expect(result).to.be.undefined;
  });

  it('invalidateElements processes multiple elements', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const ele1 = makeMockETCEle('e1', 'k1');
    const ele2 = makeMockETCEle('e2', 'k2');
    etc.getElement(ele1, { w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 }, 1, 0);
    etc.getElement(ele2, { w: 50, h: 50, x1: 0, y1: 0, x2: 50, y2: 50 }, 1, 0);
    ele1._private.nodeKey = 'changed1';
    ele2._private.nodeKey = 'changed2';
    etc.invalidateElements([ele1, ele2]);
  });

  it('retireTexture marks texture as retired', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const txr = etc.addTexture(50, 100);
    etc.retireTexture(txr);
    expect(txr.retired).to.be.true;
  });

  it('recycleTexture reuses retired textures', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const txr = etc.addTexture(50, 100);
    etc.retireTexture(txr);
    const recycled = etc.recycleTexture(50, 50);
    expect(recycled).to.equal(txr);
    expect(recycled.retired).to.be.false;
    expect(recycled.usedWidth).to.equal(0);
  });

  it('recycleTexture returns undefined if no matching texture', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const result = etc.recycleTexture(50, 100);
    expect(result).to.be.undefined;
  });

  it('onDequeue and offDequeue manage callbacks', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const fn = () => {};
    etc.onDequeue(fn);
    expect(etc.onDequeues).to.include(fn);
    etc.offDequeue(fn);
    expect(etc.onDequeues).to.not.include(fn);
  });

  it('checkTextureFullness increments fullnessChecks', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const txr = etc.addTexture(50, 100);
    txr.usedWidth = 10; // low usage => just increment checks
    etc.checkTextureFullness(txr);
    expect(txr.fullnessChecks).to.equal(1);
  });

  it('checkTextureUtility retires texture with high invalidation', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    const txr = etc.addTexture(50, 100);
    txr.invalidatedWidth = txr.width; // 100% invalidated
    etc.checkTextureUtility(txr);
    expect(txr.retired).to.be.true;
  });

  it('reasons has expected keys', () => {
    const r = makeMockRenderer();
    const etc = new ElementTextureCache(r, {
      getKey: ele => ele._private.nodeKey,
      drawElement: () => {},
      getBoundingBox: ele => ele.boundingBox(),
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
    });
    expect(etc.reasons).to.have.property('dequeue');
    expect(etc.reasons).to.have.property('downscale');
    expect(etc.reasons).to.have.property('highQuality');
  });
});
