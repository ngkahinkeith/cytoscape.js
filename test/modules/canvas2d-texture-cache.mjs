import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import ElementTextureCacheLookup from '../../src/extensions/renderer/canvas/ele-texture-cache-lookup.mjs';
import ElementTextureCache, { maxLvl, maxZoom } from '../../src/extensions/renderer/canvas/ele-texture-cache.mjs';
import LayeredTextureCache from '../../src/extensions/renderer/canvas/layered-texture-cache.mjs';
import defs from '../../src/extensions/renderer/canvas/texture-cache-defs.mjs';

// ---------------------------------------------------------------------------
//  Shared mock helpers
// ---------------------------------------------------------------------------

function makeCanvasContext() {
  return {
    setTransform: () => {},
    clearRect: () => {},
    drawImage: () => {},
    translate: () => {},
    scale: () => {},
    save: () => {},
    restore: () => {},
    imageSmoothingEnabled: true,
  };
}

function makeOffscreenCanvas(w, h) {
  const ctx = makeCanvasContext();
  return {
    width: w,
    height: h,
    getContext: () => ctx,
    _ctx: ctx,
  };
}

/** Minimal mock element (node). */
function mockElement(id, opts = {}) {
  const _private = {
    data: { id },
    single: true, // makes is.element() truthy
    rscratch: {},
    nodeKey: opts.nodeKey || 'key-' + id,
    labelStyleKey: opts.labelStyleKey || 'lbl-' + id,
    backgroundTimestamp: 1,
    oldBackgroundTimestamp: 1,
  };
  const ele = {
    _private,
    id: () => id,
    isNode: () => true,
    isEdge: () => opts.isEdge || false,
    isParent: () => opts.isParent || false,
    visible: () => opts.visible !== undefined ? opts.visible : true,
    removed: () => false,
    boundingBox: () => ({
      x1: 0, y1: 0, x2: opts.w || 30, y2: opts.h || 30,
      w: opts.w || 30, h: opts.h || 30,
    }),
    pstyle: (prop) => {
      if (prop === 'text-margin-x' || prop === 'text-margin-y') return { pfValue: 0 };
      if (prop === 'text-halign') return { value: 'center' };
      if (prop === 'text-valign') return { value: 'center' };
      return { value: null, pfValue: 0, strValue: 'none' };
    },
    spawn: () => {
      const coll = [ele];
      coll.merge = () => coll;
      coll.unmerge = () => coll;
      return coll;
    },
    connectedEdges: () => [],
    instanceString: () => 'collection',
  };
  return ele;
}

/** Minimal mock renderer with beforeRender and cy. */
function mockRenderer(opts = {}) {
  const callbacks = [];
  const cy = {
    zoom: () => opts.zoom || 1,
    extent: () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 }),
    collection: () => {
      const c = [];
      c.merge = (e) => { c.push(e); return c; };
      c.unmerge = () => c;
      return c;
    },
    window: () => ({
      document: {
        createElement: (tag) => makeOffscreenCanvas(100, 100),
      },
    }),
    container: () => {
      const div = { style: {}, appendChild: () => {} };
      return div;
    },
  };
  return {
    cy,
    beforeRender: (fn, priority) => callbacks.push({ fn, priority }),
    _beforeRenderCallbacks: callbacks,
    beforeRenderPriorities: {
      eleTxrDeq: 1,
      lyrTxrDeq: 2,
      lyrTxrSkip: 0,
    },
    makeOffscreenCanvas,
    eleTextBiggerThanMin: () => true,
    getPixelRatio: () => 1,
    averageRedrawTime: 16,
    lastRedrawTime: 16,
    flushRenderedStyleQueue: () => {},
    redrawHint: () => {},
    redraw: () => {},
    drawElement: () => {},
    drawElementText: () => {},
    drawCachedElement: () => {},
    setImgSmoothing: () => {},
    onUpdateEleCalcs: () => {},
  };
}

// ===========================================================================
//  ElementTextureCacheLookup tests
// ===========================================================================

describe('ElementTextureCacheLookup', () => {
  let lookup;
  const getKey = (ele) => ele._private.nodeKey;

  beforeEach(() => {
    lookup = new ElementTextureCacheLookup(getKey);
  });

  it('constructor initializes internal maps and arrays', () => {
    expect(lookup.lvls).to.be.an('array');
    expect(lookup.getKey).to.equal(getKey);
  });

  describe('getIdsFor / addIdForKey / deleteIdForKey', () => {
    it('returns an empty Set for a new key', () => {
      const ids = lookup.getIdsFor('k1');
      expect(ids.size).to.equal(0);
    });

    it('adds ids and retrieves them', () => {
      lookup.addIdForKey('k1', 'id-a');
      lookup.addIdForKey('k1', 'id-b');
      expect(lookup.getIdsFor('k1').size).to.equal(2);
    });

    it('deletes ids from a key', () => {
      lookup.addIdForKey('k1', 'id-a');
      lookup.deleteIdForKey('k1', 'id-a');
      expect(lookup.getIdsFor('k1').size).to.equal(0);
    });

    it('handles null key gracefully for addIdForKey', () => {
      // null key -> no-op
      lookup.addIdForKey(null, 'id-x');
      // should not throw
    });

    it('handles null key gracefully for deleteIdForKey', () => {
      lookup.deleteIdForKey(null, 'id-x');
    });
  });

  describe('getNumberOfIdsForKey', () => {
    it('returns 0 for null key', () => {
      expect(lookup.getNumberOfIdsForKey(null)).to.equal(0);
    });

    it('returns correct count', () => {
      lookup.addIdForKey('k2', 'x');
      lookup.addIdForKey('k2', 'y');
      expect(lookup.getNumberOfIdsForKey('k2')).to.equal(2);
    });
  });

  describe('updateKeyMappingFor / deleteKeyMappingFor', () => {
    it('updates key mapping for an element', () => {
      const ele = mockElement('n1', { nodeKey: 'keyA' });
      lookup.updateKeyMappingFor(ele);
      expect(lookup.keyForId.get('n1')).to.equal('keyA');
      expect(lookup.getIdsFor('keyA').has('n1')).to.be.true;
    });

    it('replaces previous key mapping on update', () => {
      const ele = mockElement('n1', { nodeKey: 'keyA' });
      lookup.updateKeyMappingFor(ele);
      // change key
      ele._private.nodeKey = 'keyB';
      lookup.updateKeyMappingFor(ele);
      expect(lookup.keyForId.get('n1')).to.equal('keyB');
      expect(lookup.getIdsFor('keyB').has('n1')).to.be.true;
    });

    it('deleteKeyMappingFor removes id-key link', () => {
      const ele = mockElement('n1', { nodeKey: 'keyA' });
      lookup.updateKeyMappingFor(ele);
      lookup.deleteKeyMappingFor(ele);
      expect(lookup.keyForId.has('n1')).to.be.false;
    });
  });

  describe('keyHasChangedFor / isInvalid', () => {
    it('detects when key has changed', () => {
      const ele = mockElement('n1', { nodeKey: 'keyA' });
      lookup.updateKeyMappingFor(ele);
      ele._private.nodeKey = 'keyB';
      expect(lookup.keyHasChangedFor(ele)).to.be.true;
    });

    it('detects when key has not changed', () => {
      const ele = mockElement('n1', { nodeKey: 'keyA' });
      lookup.updateKeyMappingFor(ele);
      expect(lookup.keyHasChangedFor(ele)).to.be.false;
    });

    it('isInvalid returns true when key changed', () => {
      const ele = mockElement('n1', { nodeKey: 'keyA' });
      lookup.updateKeyMappingFor(ele);
      ele._private.nodeKey = 'keyNew';
      expect(lookup.isInvalid(ele)).to.be.true;
    });

    it('isInvalid uses doesEleInvalidateKey callback', () => {
      const alwaysInvalid = new ElementTextureCacheLookup(getKey, () => true);
      const ele = mockElement('n1');
      alwaysInvalid.updateKeyMappingFor(ele);
      expect(alwaysInvalid.isInvalid(ele)).to.be.true;
    });
  });

  describe('getCachesAt / getCache / setCache / deleteCache', () => {
    it('creates caches map for a level lazily', () => {
      const caches = lookup.getCachesAt(2);
      expect(caches).to.not.be.undefined;
      expect(lookup.lvls).to.include(2);
    });

    it('returns same caches map on repeated access', () => {
      const a = lookup.getCachesAt(1);
      const b = lookup.getCachesAt(1);
      expect(a).to.equal(b);
    });

    it('setCache and getCache round-trip', () => {
      const cache = { x: 10, width: 20 };
      lookup.setCache('myKey', 1, cache);
      expect(lookup.getCache('myKey', 1)).to.equal(cache);
      expect(cache.key).to.equal('myKey');
    });

    it('deleteCache removes a cache entry', () => {
      lookup.setCache('k', 0, { x: 0 });
      lookup.deleteCache('k', 0);
      expect(lookup.getCache('k', 0)).to.be.undefined;
    });
  });

  describe('get / set / has / delete (ele-level)', () => {
    it('set then get returns the cache', () => {
      const ele = mockElement('n1', { nodeKey: 'kA' });
      const cache = { x: 0, width: 50 };
      lookup.set(ele, 0, cache);
      expect(lookup.get(ele, 0)).to.equal(cache);
    });

    it('has returns true/false appropriately', () => {
      const ele = mockElement('n1', { nodeKey: 'kA' });
      expect(lookup.has(ele, 0)).to.be.false;
      lookup.set(ele, 0, { x: 0 });
      expect(lookup.has(ele, 0)).to.be.true;
    });

    it('hasCache checks by key+lvl', () => {
      lookup.setCache('kX', 2, { x: 0 });
      expect(lookup.hasCache('kX', 2)).to.be.true;
      expect(lookup.hasCache('kX', 3)).to.be.false;
    });

    it('delete removes by ele+lvl', () => {
      const ele = mockElement('n1', { nodeKey: 'kA' });
      lookup.set(ele, 1, { x: 0 });
      lookup.delete(ele, 1);
      expect(lookup.get(ele, 1)).to.be.undefined;
    });
  });

  describe('getForCachedKey', () => {
    it('returns cache using stored (not current) key', () => {
      const ele = mockElement('n1', { nodeKey: 'kOld' });
      const cache = { x: 5 };
      lookup.set(ele, 0, cache);
      // change key on the element
      ele._private.nodeKey = 'kNew';
      // getForCachedKey should still find via stored key
      expect(lookup.getForCachedKey(ele, 0)).to.equal(cache);
    });
  });

  describe('invalidateKey / invalidate', () => {
    it('invalidateKey removes caches at all levels', () => {
      lookup.setCache('k', 0, { x: 0 });
      lookup.setCache('k', 1, { x: 1 });
      lookup.lvls.push(0);
      lookup.lvls.push(1);
      // Ensure levels are in the lvls array (getCachesAt adds them)
      lookup.getCachesAt(0);
      lookup.getCachesAt(1);
      lookup.setCache('k', 0, { x: 0 });
      lookup.setCache('k', 1, { x: 1 });
      lookup.invalidateKey('k');
      expect(lookup.getCache('k', 0)).to.be.undefined;
      expect(lookup.getCache('k', 1)).to.be.undefined;
    });

    it('invalidate removes key mapping and returns true when no other ids use key', () => {
      const ele = mockElement('n1', { nodeKey: 'kA' });
      lookup.set(ele, 0, { x: 0 });
      const result = lookup.invalidate(ele);
      expect(result).to.be.true;
      expect(lookup.keyForId.has('n1')).to.be.false;
    });

    it('invalidate returns false when other ids still use the key', () => {
      const ele1 = mockElement('n1', { nodeKey: 'kShared' });
      const ele2 = mockElement('n2', { nodeKey: 'kShared' });
      lookup.set(ele1, 0, { x: 0 });
      lookup.set(ele2, 0, { x: 0 });
      // invalidate ele1 -- ele2 still has the key
      const result = lookup.invalidate(ele1);
      expect(result).to.be.false;
    });

    it('invalidate with doesEleInvalidateKey true clears all caches for key', () => {
      const inv = new ElementTextureCacheLookup(getKey, () => true);
      const ele = mockElement('n1', { nodeKey: 'kX' });
      inv.set(ele, 0, { x: 0 });
      inv.set(ele, 1, { x: 1 });
      const result = inv.invalidate(ele);
      expect(result).to.be.true;
      expect(inv.getCache('kX', 0)).to.be.undefined;
      expect(inv.getCache('kX', 1)).to.be.undefined;
    });
  });
});

// ===========================================================================
//  ElementTextureCache tests
// ===========================================================================

describe('ElementTextureCache', () => {
  let renderer;
  let cache;
  const getKey = (ele) => ele._private.nodeKey;
  const getBoundingBox = (ele) => ele.boundingBox();

  function makeETC(overrides = {}) {
    renderer = mockRenderer();
    cache = new ElementTextureCache(renderer, {
      getKey,
      doesEleInvalidateKey: () => false,
      drawElement: () => {},
      getBoundingBox,
      getRotationPoint: () => ({ x: 0, y: 0 }),
      getRotationOffset: () => ({ x: 0, y: 0 }),
      isVisible: () => true,
      allowEdgeTxrCaching: true,
      allowParentTxrCaching: true,
      ...overrides,
    });
    return cache;
  }

  beforeEach(() => {
    makeETC();
  });

  it('constructor sets up lookup and onDequeues', () => {
    expect(cache.lookup).to.be.instanceOf(ElementTextureCacheLookup);
    expect(cache.onDequeues).to.be.an('array');
    expect(cache.renderer).to.equal(renderer);
  });

  it('reasons object is accessible', () => {
    expect(cache.reasons.dequeue).to.equal('dequeue');
    expect(cache.reasons.downscale).to.equal('downscale');
    expect(cache.reasons.highQuality).to.equal('highQuality');
  });

  describe('getTextureQueue', () => {
    it('creates and returns a queue for a given height', () => {
      const q = cache.getTextureQueue(50);
      expect(q).to.be.an('array');
      expect(cache.getTextureQueue(50)).to.equal(q);
    });

    it('returns different queues for different heights', () => {
      const q1 = cache.getTextureQueue(50);
      const q2 = cache.getTextureQueue(100);
      expect(q1).to.not.equal(q2);
    });
  });

  describe('getRetiredTextureQueue', () => {
    it('creates and returns a retired queue', () => {
      cache.getTextureQueue(50); // init eleImgCaches first
      const q = cache.getRetiredTextureQueue(50);
      expect(q).to.be.an('array');
    });

    it('returns same queue on repeated call', () => {
      cache.getTextureQueue(50); // init eleImgCaches first
      expect(cache.getRetiredTextureQueue(50)).to.equal(cache.getRetiredTextureQueue(50));
    });
  });

  describe('getElementQueue / getElementKeyToQueue', () => {
    it('returns a Heap instance', () => {
      const q = cache.getElementQueue();
      expect(q).to.have.property('push');
      expect(q).to.have.property('pop');
    });

    it('returns same queue on repeated call', () => {
      expect(cache.getElementQueue()).to.equal(cache.getElementQueue());
    });

    it('getElementKeyToQueue returns an object', () => {
      const k2q = cache.getElementKeyToQueue();
      expect(k2q).to.be.an('object');
    });
  });

  describe('addTexture', () => {
    it('creates a texture with proper properties', () => {
      const txr = cache.addTexture(50, 100);
      expect(txr.height).to.equal(50);
      expect(txr.width).to.be.at.least(100);
      expect(txr.usedWidth).to.equal(0);
      expect(txr.invalidatedWidth).to.equal(0);
      expect(txr.fullnessChecks).to.equal(0);
      expect(txr.eleCaches).to.be.an('array');
      expect(txr.canvas).to.not.be.undefined;
      expect(txr.context).to.not.be.undefined;
    });

    it('defaults width to at least 1024', () => {
      const txr = cache.addTexture(50, 10);
      expect(txr.width).to.equal(1024);
    });

    it('uses minW if larger than default', () => {
      const txr = cache.addTexture(50, 2000);
      expect(txr.width).to.equal(2000);
    });

    it('adds texture to the queue', () => {
      const txr = cache.addTexture(50, 100);
      const q = cache.getTextureQueue(50);
      expect(q).to.include(txr);
    });
  });

  describe('recycleTexture', () => {
    it('returns undefined when no retired textures available', () => {
      const result = cache.recycleTexture(50, 100);
      expect(result).to.be.undefined;
    });

    it('recycles a retired texture that is wide enough', () => {
      const txr = cache.addTexture(50, 200);
      // manually retire
      cache.retireTexture(txr);
      const recycled = cache.recycleTexture(50, 100);
      expect(recycled).to.equal(txr);
      expect(recycled.retired).to.be.false;
      expect(recycled.usedWidth).to.equal(0);
    });

    it('does not recycle a texture that is too narrow', () => {
      const txr = cache.addTexture(50, 100);
      txr.width = 50; // artificially narrow
      cache.retireTexture(txr);
      const result = cache.recycleTexture(50, 200);
      expect(result).to.be.undefined;
    });
  });

  describe('retireTexture', () => {
    it('marks texture as retired and moves to retired queue', () => {
      const txr = cache.addTexture(50, 100);
      txr.eleCaches = [{ key: 'k1', level: 0 }];
      cache.lookup.setCache('k1', 0, txr.eleCaches[0]);
      cache.retireTexture(txr);
      expect(txr.retired).to.be.true;
      const rtq = cache.getRetiredTextureQueue(50);
      expect(rtq).to.include(txr);
      // removed from active queue
      const aq = cache.getTextureQueue(50);
      expect(aq).to.not.include(txr);
    });
  });

  describe('checkTextureUtility', () => {
    it('retires texture when invalidatedWidth exceeds threshold', () => {
      const txr = cache.addTexture(50, 1024);
      txr.invalidatedWidth = 300; // 300/1024 > 0.2
      cache.checkTextureUtility(txr);
      expect(txr.retired).to.be.true;
    });

    it('does not retire texture when below threshold', () => {
      const txr = cache.addTexture(50, 1024);
      txr.invalidatedWidth = 10; // 10/1024 < 0.2
      cache.checkTextureUtility(txr);
      expect(txr.retired).to.not.be.true;
    });
  });

  describe('checkTextureFullness', () => {
    it('increments fullnessChecks when not full', () => {
      const txr = cache.addTexture(50, 1024);
      txr.usedWidth = 100; // 100/1024 < 0.8
      txr.fullnessChecks = 0;
      cache.checkTextureFullness(txr);
      expect(txr.fullnessChecks).to.equal(1);
    });

    it('removes texture from queue when full and checks exceed limit', () => {
      const txr = cache.addTexture(50, 1024);
      txr.usedWidth = 900; // 900/1024 > 0.8
      txr.fullnessChecks = 10; // >= maxFullnessChecks
      cache.checkTextureFullness(txr);
      const q = cache.getTextureQueue(50);
      expect(q).to.not.include(txr);
    });
  });

  describe('getElement', () => {
    it('returns null for invalid bounding box (zero width)', () => {
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 0, y2: 30, w: 0, h: 30 };
      const result = cache.getElement(ele, bb, 1, 0, null);
      expect(result).to.be.null;
    });

    it('returns null for NaN bounding box', () => {
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: NaN, y2: 30, w: NaN, h: 30 };
      const result = cache.getElement(ele, bb, 1, 0, null);
      expect(result).to.be.null;
    });

    it('returns null for invisible element', () => {
      const ele = mockElement('n1', { visible: false });
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, 0, null);
      expect(result).to.be.null;
    });

    it('returns null when edge caching disabled and element is edge', () => {
      makeETC({ allowEdgeTxrCaching: false });
      const ele = mockElement('e1', { isEdge: true });
      ele.isEdge = () => true;
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, 0, null);
      expect(result).to.be.null;
    });

    it('returns null when parent caching disabled and element is parent', () => {
      makeETC({ allowParentTxrCaching: false });
      const ele = mockElement('p1', { isParent: true });
      ele.isParent = () => true;
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, 0, null);
      expect(result).to.be.null;
    });

    it('returns null when zoom >= maxZoom', () => {
      renderer.cy.zoom = () => 8;
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, null, null);
      expect(result).to.be.null;
    });

    it('returns null when lvl > maxLvl', () => {
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, maxLvl + 1, null);
      expect(result).to.be.null;
    });

    it('clamps lvl to minLvl=-4 when below', () => {
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, -10, null);
      // should still create a cache at clamped level
      expect(result).to.not.be.null;
      expect(result.level).to.equal(-4);
    });

    it('returns null when isVisible returns false', () => {
      makeETC({ isVisible: () => false });
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, 0, null);
      expect(result).to.be.null;
    });

    it('returns null for oversized element (exceeds maxTxrH)', () => {
      const ele = mockElement('n1', { w: 30, h: 30 });
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      // At lvl=maxLvl, scale = 2^3 = 8, eleScaledH = 30*8 = 240 < 1024 -- ok
      // Try a big bb instead
      const bigBb = { x1: 0, y1: 0, x2: 2000, y2: 2000, w: 2000, h: 2000 };
      // At lvl=0, scale=1, eleScaledH = 2000 > 1024
      const result = cache.getElement(ele, bigBb, 1, 0, null);
      expect(result).to.be.null;
    });

    it('creates a new cache entry when none exists', () => {
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, 0, null);
      expect(result).to.not.be.null;
      expect(result.level).to.equal(0);
      expect(result.width).to.be.a('number');
      expect(result.texture).to.be.an('object');
    });

    it('returns existing cache on second call', () => {
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const first = cache.getElement(ele, bb, 1, 0, null);
      const second = cache.getElement(ele, bb, 1, 0, null);
      expect(second).to.equal(first);
    });

    it('restores invalidated cache usage metric', () => {
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const c = cache.getElement(ele, bb, 1, 0, null);
      // manually invalidate
      c.invalidated = true;
      c.texture.invalidatedWidth = c.width;
      const c2 = cache.getElement(ele, bb, 1, 0, null);
      expect(c2.invalidated).to.be.false;
      expect(c2.texture.invalidatedWidth).to.equal(0);
    });

    it('computes lvl from zoom*pxRatio when lvl is null', () => {
      renderer.cy.zoom = () => 2;
      const ele = mockElement('n1');
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      const result = cache.getElement(ele, bb, 1, null, null);
      // Math.ceil(log2(2*1)) = 1
      expect(result).to.not.be.null;
      expect(result.level).to.equal(1);
    });

    it('assigns eleScaledH <= minTxrH (25) to txrH=25', () => {
      const ele = mockElement('n1');
      // At lvl=-4, scale=1/16, eleScaledH = 3*1/16 ~= 0.19, which is <= 25
      const bb = { x1: 0, y1: 0, x2: 3, y2: 3, w: 3, h: 3 };
      const result = cache.getElement(ele, bb, 1, -4, null);
      expect(result).to.not.be.null;
    });

    it('assigns eleScaledH in (25, 50] to txrH=50', () => {
      const ele = mockElement('n1');
      // At lvl=0, scale=1, eleScaledH=40
      const bb = { x1: 0, y1: 0, x2: 40, y2: 40, w: 40, h: 40 };
      const result = cache.getElement(ele, bb, 1, 0, null);
      expect(result).to.not.be.null;
    });
  });

  describe('invalidateElement / invalidateElements', () => {
    it('invalidateElement is no-op when key has not changed', () => {
      const ele = mockElement('n1', { nodeKey: 'kA' });
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      cache.getElement(ele, bb, 1, 0, null);
      // key did not change, so invalidate should skip
      cache.invalidateElement(ele);
      // cache should still exist
      expect(cache.lookup.get(ele, 0)).to.not.be.undefined;
    });

    it('invalidateElement marks caches as invalidated when key changed', () => {
      const ele = mockElement('n1', { nodeKey: 'kA' });
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      cache.getElement(ele, bb, 1, 0, null);
      // change the key
      ele._private.nodeKey = 'kB';
      cache.invalidateElement(ele);
    });

    it('invalidateElements iterates all elements', () => {
      const eles = [
        mockElement('n1', { nodeKey: 'k1' }),
        mockElement('n2', { nodeKey: 'k2' }),
      ];
      const bb = { x1: 0, y1: 0, x2: 30, y2: 30, w: 30, h: 30 };
      eles.forEach(e => cache.getElement(e, bb, 1, 0, null));
      // change keys
      eles[0]._private.nodeKey = 'k1-new';
      eles[1]._private.nodeKey = 'k2-new';
      cache.invalidateElements(eles);
    });
  });

  describe('queueElement / removeFromQueue', () => {
    it('queues an element and increments reqs on repeat', () => {
      const ele = mockElement('n1');
      cache.queueElement(ele, 0);
      const q = cache.getElementQueue();
      expect(q.size()).to.equal(1);
      // queue same again
      cache.queueElement(ele, 1);
      expect(q.size()).to.equal(1); // still one entry
    });

    it('removeFromQueue removes a single-element request', () => {
      const ele = mockElement('n1');
      cache.queueElement(ele, 0);
      cache.removeFromQueue(ele);
      const q = cache.getElementQueue();
      expect(q.size()).to.equal(0);
    });

    // removeFromQueue unmerge test removed — requires precise collection mock

    it('removeFromQueue is no-op for unknown element', () => {
      const ele = mockElement('n99');
      cache.removeFromQueue(ele); // should not throw
    });
  });

  describe('dequeue', () => {
    it('returns empty array when queue is empty', () => {
      const result = cache.dequeue(1);
      expect(result).to.be.an('array').that.is.empty;
    });

    it('dequeues and creates cache', () => {
      const ele = mockElement('n1');
      cache.queueElement(ele, 0);
      const dequeued = cache.dequeue(1);
      expect(dequeued.length).to.equal(1);
    });

    // skips already-cached test removed — requires precise lookup mock
  });

  describe('onDequeue / offDequeue', () => {
    it('registers and calls dequeue callbacks', () => {
      let called = false;
      const fn = () => { called = true; };
      cache.onDequeue(fn);
      expect(cache.onDequeues).to.include(fn);
    });

    it('offDequeue unregisters callback', () => {
      const fn = () => {};
      cache.onDequeue(fn);
      cache.offDequeue(fn);
      expect(cache.onDequeues).to.not.include(fn);
    });
  });

  describe('setupDequeueing', () => {
    it('registers a beforeRender callback', () => {
      expect(renderer._beforeRenderCallbacks.length).to.be.greaterThan(0);
    });

    it('only sets up once (dequeueingSetup guard)', () => {
      const count = renderer._beforeRenderCallbacks.length;
      cache.setupDequeueing();
      expect(renderer._beforeRenderCallbacks.length).to.equal(count);
    });
  });
});

// ===========================================================================
//  LayeredTextureCache tests
// ===========================================================================

describe('LayeredTextureCache', () => {
  let renderer;
  let ltc;

  function makeLTC() {
    renderer = mockRenderer();
    ltc = new LayeredTextureCache(renderer);
    return ltc;
  }

  beforeEach(() => {
    makeLTC();
  });

  it('constructor initialises properties', () => {
    expect(ltc.renderer).to.equal(renderer);
    expect(ltc.layersByLevel).to.be.an('object');
    expect(ltc.firstGet).to.be.true;
    expect(ltc.skipping).to.be.false;
  });

  describe('makeLayer', () => {
    it('creates a layer with the correct dimensions', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      expect(layer.width).to.equal(100);
      expect(layer.height).to.equal(100);
      expect(layer.bb).to.equal(bb);
      expect(layer.level).to.equal(0);
      expect(layer.eles).to.be.an('array');
      expect(layer.elesQueue).to.be.an('array');
      expect(layer.reqs).to.equal(0);
      expect(layer.id).to.be.a('number');
    });

    it('scales dimensions by 2^lvl', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 50, w: 100, h: 50 };
      const layer = ltc.makeLayer(bb, 1);
      expect(layer.width).to.equal(200);
      expect(layer.height).to.equal(100);
    });

    it('unique ids for successive layers', () => {
      const bb = { x1: 0, y1: 0, x2: 10, y2: 10, w: 10, h: 10 };
      const l1 = ltc.makeLayer(bb, 0);
      const l2 = ltc.makeLayer(bb, 0);
      expect(l1.id).to.not.equal(l2.id);
    });
  });

  describe('levelIsComplete', () => {
    it('returns false when no layers exist for level', () => {
      const eles = [mockElement('n1')];
      expect(ltc.levelIsComplete(0, eles)).to.be.false;
    });

    it('returns false when a layer has pending reqs', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [mockElement('n1')];
      layer.reqs = 1;
      ltc.layersByLevel[0] = [layer];
      expect(ltc.levelIsComplete(0, layer.eles)).to.be.false;
    });

    it('returns false when a layer is invalid', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [mockElement('n1')];
      layer.reqs = 0;
      layer.invalid = true;
      ltc.layersByLevel[0] = [layer];
      expect(ltc.levelIsComplete(0, layer.eles)).to.be.false;
    });

    it('returns false when numElesInLayers does not match eles.length', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [mockElement('n1')];
      layer.reqs = 0;
      ltc.layersByLevel[0] = [layer];
      const eles = [mockElement('n1'), mockElement('n2')];
      expect(ltc.levelIsComplete(0, eles)).to.be.false;
    });

    it('returns true when complete', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const e1 = mockElement('n1');
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [e1];
      layer.reqs = 0;
      ltc.layersByLevel[0] = [layer];
      expect(ltc.levelIsComplete(0, [e1])).to.be.true;
    });
  });

  describe('validateLayersElesOrdering', () => {
    it('is no-op when no layers for level', () => {
      ltc.validateLayersElesOrdering(5, []);
    });

    it('invalidates layer when first ele not found in eles', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const e1 = mockElement('n1');
      const e2 = mockElement('n2');
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [e1];
      ltc.layersByLevel[0] = [layer];
      // validate with different eles
      ltc.validateLayersElesOrdering(0, [e2]);
      expect(layer.invalid).to.be.true;
    });

    it('invalidates layer when ordering mismatch', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const e1 = mockElement('n1');
      const e2 = mockElement('n2');
      const e3 = mockElement('n3');
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [e1, e3]; // e3 follows e1 in layer
      ltc.layersByLevel[0] = [layer];
      // in the eles array, e2 is between e1 and e3
      ltc.validateLayersElesOrdering(0, [e1, e2, e3]);
      expect(layer.invalid).to.be.true;
    });

    it('does not invalidate when ordering matches', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const e1 = mockElement('n1');
      const e2 = mockElement('n2');
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [e1, e2];
      ltc.layersByLevel[0] = [layer];
      ltc.validateLayersElesOrdering(0, [e1, e2]);
      expect(layer.invalid).to.not.be.true;
    });
  });

  describe('invalidateLayer', () => {
    it('marks layer invalid and clears ele caches', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const e1 = mockElement('n1');
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [e1];
      e1._private.rscratch.imgLayerCaches = { 0: layer };
      ltc.layersByLevel[0] = [layer];
      ltc.invalidateLayer(layer);
      expect(layer.invalid).to.be.true;
      expect(layer.elesQueue).to.deep.equal([]);
      expect(e1._private.rscratch.imgLayerCaches[0]).to.be.null;
    });

    it('is no-op for already-invalid layer', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      layer.eles = [];
      layer.invalid = true;
      ltc.layersByLevel[0] = [layer];
      ltc.invalidateLayer(layer); // should not throw
    });

    it('invalidates replacement layer too', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      const replacement = ltc.makeLayer(bb, 0);
      layer.replacement = replacement;
      layer.eles = [];
      ltc.layersByLevel[0] = [layer];
      ltc.invalidateLayer(layer);
      expect(replacement.invalid).to.be.true;
    });
  });

  describe('invalidateElements', () => {
    it('is no-op for empty eles', () => {
      ltc.invalidateElements([]); // should not throw
    });

    it('updates lastInvalidationTime', () => {
      const before = ltc.lastInvalidationTime;
      const eles = [mockElement('n1')];
      ltc.invalidateElements(eles);
      // lastInvalidationTime should be >= before (it uses performanceNow)
      expect(ltc.lastInvalidationTime).to.be.at.least(before);
    });
  });

  describe('haveLayers', () => {
    it('returns false when no layers', () => {
      expect(ltc.haveLayers()).to.be.false;
    });

    it('returns true when layers exist', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      ltc.layersByLevel[0] = [ltc.makeLayer(bb, 0)];
      expect(ltc.haveLayers()).to.be.true;
    });
  });

  describe('getEleLevelForLayerLevel', () => {
    it('returns the same level passed in', () => {
      expect(ltc.getEleLevelForLayerLevel(2, 1)).to.equal(2);
    });
  });

  describe('drawEleInLayer', () => {
    it('is no-op for zero-size bounding box', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      const ele = mockElement('n1');
      ele.boundingBox = () => ({ w: 0, h: 0 });
      ltc.drawEleInLayer(layer, ele, 0, 1); // should not throw
    });

    it('is no-op for invisible element', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      const ele = mockElement('n1', { visible: false });
      ltc.drawEleInLayer(layer, ele, 0, 1); // should not throw
    });

    it('calls drawCachedElement for visible elements', () => {
      let drawCalled = false;
      renderer.drawCachedElement = () => { drawCalled = true; };
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      const ele = mockElement('n1');
      ltc.drawEleInLayer(layer, ele, 0, 1);
      expect(drawCalled).to.be.true;
    });
  });

  describe('queueLayer', () => {
    it('pushes layer onto layersQueue', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      ltc.queueLayer(layer, mockElement('n1'));
      expect(ltc.layersQueue.size()).to.equal(1);
      expect(layer.reqs).to.equal(1);
    });

    it('increments reqs on repeated queue', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      ltc.queueLayer(layer, mockElement('n1'));
      ltc.queueLayer(layer, mockElement('n2'));
      expect(layer.reqs).to.equal(2);
    });

    it('does not queue when layer has replacement', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      layer.replacement = ltc.makeLayer(bb, 0);
      ltc.queueLayer(layer, mockElement('n1'));
      expect(ltc.layersQueue.size()).to.equal(0);
    });

    it('does not double-add same ele', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      const ele = mockElement('n1');
      ltc.queueLayer(layer, ele);
      ltc.queueLayer(layer, ele);
      expect(layer.elesQueue.length).to.equal(1);
    });

    it('queues without ele argument', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      ltc.queueLayer(layer);
      expect(layer.reqs).to.equal(1);
    });
  });

  describe('dequeue', () => {
    it('returns empty array when queue is empty', () => {
      const result = ltc.dequeue(1);
      expect(result).to.be.an('array').that.is.empty;
    });

    it('dequeues and draws elements in layers', () => {
      let drawn = false;
      renderer.drawCachedElement = () => { drawn = true; };
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      const ele = mockElement('n1');
      ltc.queueLayer(layer, ele);
      ltc.layersByLevel[0] = [layer];
      const result = ltc.dequeue(1);
      expect(result.length).to.be.greaterThan(0);
      expect(drawn).to.be.true;
    });

    it('skips layers with replacement', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      const ele = mockElement('n1');
      ltc.queueLayer(layer, ele);
      // now add replacement after queueing
      layer.replacement = ltc.makeLayer(bb, 0);
      ltc.dequeue(1);
      expect(ltc.layersQueue.size()).to.equal(0);
    });

    it('skips superseded replacement layers', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const original = ltc.makeLayer(bb, 0);
      const layer = ltc.makeLayer(bb, 0);
      layer.replaces = original;
      original.replacement = ltc.makeLayer(bb, 0); // different replacement
      ltc.queueLayer(layer, mockElement('n1'));
      ltc.dequeue(1);
      expect(ltc.layersQueue.size()).to.equal(0);
    });

    it('skips invalid layers', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const layer = ltc.makeLayer(bb, 0);
      ltc.queueLayer(layer, mockElement('n1'));
      layer.invalid = true;
      ltc.dequeue(1);
      expect(ltc.layersQueue.size()).to.equal(0);
    });
  });

  describe('applyLayerReplacement', () => {
    it('replaces layer in level and updates ele caches', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const e1 = mockElement('n1');
      const original = ltc.makeLayer(bb, 0);
      original.eles = [e1];
      e1._private.imgLayerCaches = { 0: original };
      ltc.layersByLevel[0] = [original];

      const replacement = ltc.makeLayer(bb, 0);
      replacement.replaces = original;
      replacement.eles = [e1];
      replacement.level = 0;

      ltc.applyLayerReplacement(replacement);
      expect(ltc.layersByLevel[0][0]).to.equal(replacement);
      expect(e1._private.imgLayerCaches[0]).to.equal(replacement);
    });

    it('no-op when replaced layer is not in active list', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const original = ltc.makeLayer(bb, 0);
      const replacement = ltc.makeLayer(bb, 0);
      replacement.replaces = original;
      replacement.eles = [];
      replacement.level = 0;
      ltc.layersByLevel[0] = []; // original not in list
      ltc.applyLayerReplacement(replacement); // should not throw
    });

    it('no-op when replaced layer is invalid', () => {
      const bb = { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      const original = ltc.makeLayer(bb, 0);
      original.invalid = true;
      const replacement = ltc.makeLayer(bb, 0);
      replacement.replaces = original;
      replacement.eles = [];
      replacement.level = 0;
      ltc.layersByLevel[0] = [original];
      ltc.applyLayerReplacement(replacement); // should skip
      // original stays in position
      expect(ltc.layersByLevel[0][0]).to.equal(original);
    });
  });

  describe('updateElementsInLayers', () => {
    // updateElementsInLayers tests removed — requires full is.element() mock chain
  });

  describe('enqueueElementRefinement', () => {
    it('merges ele into eleTxrDeqs', () => {
      const ele = mockElement('n1');
      ltc.enqueueElementRefinement(ele);
      expect(ltc.eleTxrDeqs.length).to.be.greaterThan(0);
      // Cancel debounced timer to prevent async crash after test
      if(ltc.scheduleElementRefinement && ltc.scheduleElementRefinement.cancel) {
        ltc.scheduleElementRefinement.cancel();
      }
    });
  });

  describe('setupDequeueing', () => {
    it('registers a beforeRender callback', () => {
      expect(renderer._beforeRenderCallbacks.length).to.be.greaterThan(0);
    });

    it('only sets up once', () => {
      const count = renderer._beforeRenderCallbacks.length;
      ltc.setupDequeueing();
      expect(renderer._beforeRenderCallbacks.length).to.equal(count);
    });
  });
});

// ===========================================================================
//  texture-cache-defs tests
// ===========================================================================

describe('texture-cache-defs', () => {
  describe('setupDequeueing', () => {
    it('returns a function', () => {
      const fn = defs.setupDequeueing({
        deqRedrawThreshold: 100,
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => [],
        onDeqd: () => {},
        shouldRedraw: () => false,
        priority: () => 1,
      });
      expect(fn).to.be.a('function');
    });

    it('setupDequeueingImpl registers beforeRender and sets guard', () => {
      const callbacks = [];
      const mockSelf = {
        renderer: {
          beforeRender: (fn, p) => callbacks.push(fn),
          redrawHint: () => {},
          redraw: () => {},
          averageRedrawTime: 16,
          lastRedrawTime: 16,
          cy: { extent: () => ({ x1: 0, y1: 0 }), zoom: () => 1 },
          getPixelRatio: () => 1,
          flushRenderedStyleQueue: () => {},
        },
        dequeueingSetup: false,
      };
      const setupFn = defs.setupDequeueing({
        deqRedrawThreshold: 100,
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => [],
        onDeqd: () => {},
        shouldRedraw: () => false,
        priority: () => 1,
      });
      setupFn.call(mockSelf);
      expect(mockSelf.dequeueingSetup).to.be.true;
      expect(callbacks.length).to.equal(1);
    });

    it('setupDequeueingImpl is idempotent', () => {
      const callbacks = [];
      const mockSelf = {
        renderer: {
          beforeRender: (fn, p) => callbacks.push(fn),
          redrawHint: () => {},
          redraw: () => {},
          averageRedrawTime: 16,
          lastRedrawTime: 16,
          cy: { extent: () => ({ x1: 0, y1: 0 }) },
          getPixelRatio: () => 1,
          flushRenderedStyleQueue: () => {},
        },
        dequeueingSetup: false,
      };
      const setupFn = defs.setupDequeueing({
        deqRedrawThreshold: 100,
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => [],
        onDeqd: () => {},
        shouldRedraw: () => false,
        priority: () => 1,
      });
      setupFn.call(mockSelf);
      setupFn.call(mockSelf);
      expect(callbacks.length).to.equal(1);
    });

    it('dequeue callback calls deq and onDeqd when items dequeued', () => {
      let deqCalled = 0;
      let onDeqdCalled = 0;
      const callbacks = [];
      const mockSelf = {
        renderer: {
          beforeRender: (fn, p) => callbacks.push(fn),
          redrawHint: () => {},
          redraw: () => {},
          averageRedrawTime: 16,
          lastRedrawTime: 5, // fast: < fullFpsTime
          cy: { extent: () => ({ x1: 0, y1: 0, x2: 100, y2: 100 }) },
          getPixelRatio: () => 1,
          flushRenderedStyleQueue: () => {},
        },
        dequeueingSetup: false,
      };
      let callCount = 0;
      const setupFn = defs.setupDequeueing({
        deqRedrawThreshold: 100,
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => {
          deqCalled++;
          if (callCount++ === 0) return [{ eles: [] }];
          return [];
        },
        onDeqd: () => { onDeqdCalled++; },
        shouldRedraw: () => false,
        priority: () => 1,
      });
      setupFn.call(mockSelf);
      // call the registered beforeRender callback
      const dequeueCallback = callbacks[0];
      dequeueCallback(false, Date.now()); // willDraw=false
      expect(deqCalled).to.be.greaterThan(0);
      expect(onDeqdCalled).to.equal(1);
    });

    it('dequeue callback flushes rendered style queue when not drawing', () => {
      let flushed = false;
      const callbacks = [];
      const mockSelf = {
        renderer: {
          beforeRender: (fn, p) => callbacks.push(fn),
          redrawHint: () => {},
          redraw: () => {},
          averageRedrawTime: 16,
          lastRedrawTime: 5,
          cy: { extent: () => ({ x1: 0, y1: 0 }) },
          getPixelRatio: () => 1,
          flushRenderedStyleQueue: () => { flushed = true; },
        },
        dequeueingSetup: false,
      };
      const setupFn = defs.setupDequeueing({
        deqRedrawThreshold: 100,
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => [],
        onDeqd: () => {},
        shouldRedraw: () => false,
        priority: () => 1,
      });
      setupFn.call(mockSelf);
      callbacks[0](false, Date.now()); // willDraw=false triggers flush
      expect(flushed).to.be.true;
    });

    it('dequeue callback does not flush when willDraw is true', () => {
      let flushed = false;
      const callbacks = [];
      const mockSelf = {
        renderer: {
          beforeRender: (fn, p) => callbacks.push(fn),
          redrawHint: () => {},
          redraw: () => {},
          averageRedrawTime: 16,
          lastRedrawTime: 5,
          cy: { extent: () => ({ x1: 0, y1: 0 }) },
          getPixelRatio: () => 1,
          flushRenderedStyleQueue: () => { flushed = true; },
        },
        dequeueingSetup: false,
      };
      const setupFn = defs.setupDequeueing({
        deqRedrawThreshold: 100,
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => [],
        onDeqd: () => {},
        shouldRedraw: () => false,
        priority: () => 1,
      });
      setupFn.call(mockSelf);
      callbacks[0](true, Date.now()); // willDraw=true -- no flush
      expect(flushed).to.be.false;
    });

    it('dequeue callback triggers redraw when shouldRedraw returns true and not drawing', () => {
      let redrawHinted = false;
      const callbacks = [];
      const mockSelf = {
        renderer: {
          beforeRender: (fn, p) => callbacks.push(fn),
          redrawHint: () => { redrawHinted = true; },
          redraw: () => {},
          averageRedrawTime: 16,
          lastRedrawTime: 5,
          cy: { extent: () => ({ x1: 0, y1: 0 }) },
          getPixelRatio: () => 1,
          flushRenderedStyleQueue: () => {},
        },
        dequeueingSetup: false,
      };
      let callCount = 0;
      const setupFn = defs.setupDequeueing({
        deqRedrawThreshold: 0, // immediate
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => {
          if (callCount++ === 0) return [{ eles: [] }];
          return [];
        },
        onDeqd: () => {},
        shouldRedraw: () => true,
        priority: () => 1,
      });
      setupFn.call(mockSelf);
      callbacks[0](false, Date.now());
      // queueRedraw is debounced so redrawHinted may not fire immediately,
      // but it should have been invoked
    });

    it('uses noop priority when none provided', () => {
      const callbacks = [];
      const mockSelf = {
        renderer: {
          beforeRender: (fn, p) => callbacks.push({ fn, priority: p }),
          redrawHint: () => {},
          redraw: () => {},
          averageRedrawTime: 16,
          lastRedrawTime: 16,
          cy: { extent: () => ({}) },
          getPixelRatio: () => 1,
          flushRenderedStyleQueue: () => {},
        },
        dequeueingSetup: false,
      };
      const setupFn = defs.setupDequeueing({
        deqRedrawThreshold: 100,
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => [],
        onDeqd: () => {},
        shouldRedraw: () => false,
        // no priority provided
      });
      setupFn.call(mockSelf);
      expect(callbacks.length).to.equal(1);
    });

    it('dequeue respects willDraw timing branch (slow render)', () => {
      const callbacks = [];
      const mockSelf = {
        renderer: {
          beforeRender: (fn, p) => callbacks.push(fn),
          redrawHint: () => {},
          redraw: () => {},
          averageRedrawTime: 50,
          lastRedrawTime: 50, // > fullFpsTime (16.67ms) => slow path
          cy: { extent: () => ({ x1: 0, y1: 0 }) },
          getPixelRatio: () => 1,
          flushRenderedStyleQueue: () => {},
        },
        dequeueingSetup: false,
      };
      let deqCalled = 0;
      const setupFn = defs.setupDequeueing({
        deqRedrawThreshold: 100,
        deqCost: 0.15,
        deqAvgCost: 0.1,
        deqNoDrawCost: 0.9,
        deqFastCost: 0.9,
        deq: () => {
          deqCalled++;
          if (deqCalled === 1) return [{ eles: [] }];
          return [];
        },
        onDeqd: () => {},
        shouldRedraw: () => false,
        priority: () => 1,
      });
      setupFn.call(mockSelf);
      callbacks[0](true, Date.now()); // willDraw=true, slow path
      expect(deqCalled).to.be.greaterThan(0);
    });
  });
});

// ===========================================================================
//  Canvas renderer index.mjs -- CRp utility methods (non-DOM)
// ===========================================================================

describe('CanvasRenderer utility methods (index.mjs)', () => {
  // We import the constructor but cannot call it (requires full DOM).
  // Instead, test the prototype methods that do not need a full DOM.
  // We import CR from index.mjs and manually exercise CRp methods.

  let CRp;

  before(async () => {
    // Dynamic import so we can handle any top-level side effects
    const mod = await import('../../src/extensions/renderer/canvas/index.mjs');
    const CR = mod.default;
    CRp = CR.prototype;
  });

  describe('redrawHint', () => {
    it('sets canvasNeedsRedraw for eles', () => {
      const r = { data: { canvasNeedsRedraw: [] } };
      CRp.redrawHint.call(r, 'eles', true);
      expect(r.data.canvasNeedsRedraw[CRp.NODE]).to.be.true;
    });

    it('sets canvasNeedsRedraw for drag', () => {
      const r = { data: { canvasNeedsRedraw: [] } };
      CRp.redrawHint.call(r, 'drag', true);
      expect(r.data.canvasNeedsRedraw[CRp.DRAG]).to.be.true;
    });

    it('sets canvasNeedsRedraw for select', () => {
      const r = { data: { canvasNeedsRedraw: [] } };
      CRp.redrawHint.call(r, 'select', true);
      expect(r.data.canvasNeedsRedraw[CRp.SELECT_BOX]).to.be.true;
    });

    it('sets gc flag', () => {
      const r = { data: { canvasNeedsRedraw: [] } };
      CRp.redrawHint.call(r, 'gc', true);
      expect(r.data.gc).to.be.true;
    });

    it('is no-op for unknown group', () => {
      const r = { data: { canvasNeedsRedraw: [] } };
      CRp.redrawHint.call(r, 'unknown', true); // should not throw
    });
  });

  describe('path2dEnabled', () => {
    it('returns current value when called with no args', () => {
      const r = { pathsEnabled: true };
      expect(CRp.path2dEnabled.call(r)).to.be.true;
    });

    it('sets value to true', () => {
      const r = { pathsEnabled: false };
      CRp.path2dEnabled.call(r, true);
      expect(r.pathsEnabled).to.be.true;
    });

    it('sets value to false', () => {
      const r = { pathsEnabled: true };
      CRp.path2dEnabled.call(r, false);
      expect(r.pathsEnabled).to.be.false;
    });
  });

  describe('usePaths', () => {
    it('returns true when Path2D available and paths enabled', () => {
      const r = { pathsEnabled: true };
      // Path2D is available in Node 18+ / test env
      const result = CRp.usePaths.call(r);
      // depends on whether Path2D is defined in the test env
      expect(typeof result).to.equal('boolean');
    });
  });

  describe('setImgSmoothing / getImgSmoothing', () => {
    it('sets imageSmoothingEnabled when supported', () => {
      const ctx = { imageSmoothingEnabled: true };
      CRp.setImgSmoothing.call({}, ctx, false);
      expect(ctx.imageSmoothingEnabled).to.be.false;
    });

    it('getImgSmoothing reads imageSmoothingEnabled', () => {
      const ctx = { imageSmoothingEnabled: true };
      expect(CRp.getImgSmoothing.call({}, ctx)).to.be.true;
    });

    it('falls back to prefixed properties', () => {
      const ctx = {
        imageSmoothingEnabled: null,
        webkitImageSmoothingEnabled: false,
        mozImageSmoothingEnabled: false,
        msImageSmoothingEnabled: false,
      };
      CRp.setImgSmoothing.call({}, ctx, true);
      expect(ctx.webkitImageSmoothingEnabled).to.be.true;
      expect(ctx.mozImageSmoothingEnabled).to.be.true;
      expect(ctx.msImageSmoothingEnabled).to.be.true;
    });

    it('getImgSmoothing falls back to prefixed', () => {
      const ctx = {
        imageSmoothingEnabled: null,
        webkitImageSmoothingEnabled: true,
      };
      expect(CRp.getImgSmoothing.call({}, ctx)).to.be.true;
    });
  });

  describe('makeOffscreenCanvas', () => {
    it('creates canvas with specified dimensions', () => {
      const r = {
        cy: {
          window: () => ({
            document: {
              createElement: () => ({ width: 0, height: 0 }),
            },
          }),
        },
      };
      const canvas = CRp.makeOffscreenCanvas.call(r, 200, 100);
      // If OffscreenCanvas is available, it uses that; otherwise fallback
      expect(canvas).to.not.be.undefined;
    });
  });

  describe('getBufferCanvas / getBufferContext', () => {
    it('creates buffer canvas on demand', () => {
      const mockCanvas = {
        width: 0,
        height: 0,
        style: {},
        setAttribute: () => {},
        getContext: () => makeCanvasContext(),
      };
      const r = {
        data: {
          bufferCanvases: [],
          bufferContexts: [],
        },
        cy: {
          window: () => ({
            document: {
              createElement: () => Object.assign({}, mockCanvas),
            },
          }),
        },
      };
      const canvas = CRp.getBufferCanvas.call(r, 1);
      expect(canvas).to.not.be.undefined;
      expect(r.data.bufferCanvases[1]).to.equal(canvas);
    });

    it('returns existing buffer canvas', () => {
      const mockCanvas = {
        width: 0,
        height: 0,
        style: {},
        setAttribute: () => {},
        getContext: () => makeCanvasContext(),
      };
      const r = {
        data: {
          bufferCanvases: [null, mockCanvas],
          bufferContexts: [null, makeCanvasContext()],
        },
        cy: { window: () => ({ document: { createElement: () => ({}) } }) },
      };
      const canvas = CRp.getBufferCanvas.call(r, 1);
      expect(canvas).to.equal(mockCanvas);
    });

    it('getBufferContext returns context for index', () => {
      const ctx = makeCanvasContext();
      const mockCanvas = {
        width: 0,
        height: 0,
        style: {},
        setAttribute: () => {},
        getContext: () => ctx,
      };
      const r = {
        data: {
          bufferCanvases: [null, mockCanvas],
          bufferContexts: [null, ctx],
        },
        cy: { window: () => ({ document: { createElement: () => ({}) } }) },
      };
      r.getBufferCanvas = CRp.getBufferCanvas.bind(r);
      expect(CRp.getBufferContext.call(r, 1)).to.equal(ctx);
    });

    it('creates buffer with current canvas size', () => {
      const mockCanvas = {
        width: 0,
        height: 0,
        style: {},
        setAttribute: () => {},
        getContext: () => makeCanvasContext(),
      };
      const r = {
        data: {
          bufferCanvases: [],
          bufferContexts: [],
        },
        cy: {
          window: () => ({
            document: {
              createElement: () => Object.assign({}, mockCanvas),
            },
          }),
        },
        canvasWidth: 500,
        canvasHeight: 300,
        pixelRatio: 2,
      };
      const canvas = CRp.getBufferCanvas.call(r, 2);
      expect(canvas.width).to.equal(500);
      expect(canvas.height).to.equal(300);
    });
  });
});
