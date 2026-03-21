import { describe, it } from 'mocha';
import { expect } from 'chai';
import { TexturePageManager } from '../../src/extensions/renderer/canvas/webgl/texture-page-manager.mjs';

// Helper: manually mark an image as ready with given dimensions
function addReadyImage(mgr, url, width, height) {
  mgr.imageStates[url] = 'ready';
  mgr.images[url] = { width, height };
}

describe('TexturePageManager', () => {

  it('constructor sets default options', () => {
    const mgr = new TexturePageManager();
    expect(mgr.maxPageSize).to.equal(4096);
    expect(mgr.maxImageSize).to.equal(512);
    expect(mgr.pages).to.be.an('array').that.is.empty;
    expect(mgr.atlas).to.be.an('object');
  });

  it('constructor accepts custom options', () => {
    const mgr = new TexturePageManager({ maxPageSize: 2048, maxImageSize: 256 });
    expect(mgr.maxPageSize).to.equal(2048);
    expect(mgr.maxImageSize).to.equal(256);
  });

  it('getEntry returns null for unknown URL', () => {
    const mgr = new TexturePageManager();
    expect(mgr.getEntry('http://example.com/missing.png')).to.be.null;
  });

  it('getPageCount returns 0 when empty', () => {
    const mgr = new TexturePageManager();
    expect(mgr.getPageCount()).to.equal(0);
  });

  it('getPages returns empty array when no images', () => {
    const mgr = new TexturePageManager();
    expect(mgr.getPages()).to.deep.equal([]);
  });

  it('rebuild creates atlas entries for ready images', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    addReadyImage(mgr, 'img1.png', 100, 100);
    addReadyImage(mgr, 'img2.png', 200, 150);
    mgr.rebuild();

    expect(mgr.getPageCount()).to.equal(1);
    const e1 = mgr.getEntry('img1.png');
    const e2 = mgr.getEntry('img2.png');
    expect(e1).to.not.be.null;
    expect(e2).to.not.be.null;
    expect(e1.pageIndex).to.equal(0);
    expect(e2.pageIndex).to.equal(0);
  });

  it('atlas entry has correct x, y, size, pageIndex fields', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    addReadyImage(mgr, 'img1.png', 100, 100);
    mgr.rebuild();

    const entry = mgr.getEntry('img1.png');
    expect(entry).to.have.all.keys('x', 'y', 'size', 'pageIndex');
    expect(entry.x).to.equal(0);
    expect(entry.y).to.equal(0);
    expect(entry.size).to.equal(100); // max(100, 100) clamped by maxImageSize
    expect(entry.pageIndex).to.equal(0);
  });

  it('image size is clamped by maxImageSize', () => {
    const mgr = new TexturePageManager({ maxPageSize: 4096, maxImageSize: 128 });
    addReadyImage(mgr, 'big.png', 1000, 800);
    mgr.rebuild();

    const entry = mgr.getEntry('big.png');
    expect(entry.size).to.equal(128);
  });

  it('image size uses max of width and height', () => {
    const mgr = new TexturePageManager({ maxPageSize: 4096, maxImageSize: 512 });
    addReadyImage(mgr, 'wide.png', 300, 100);
    mgr.rebuild();

    const entry = mgr.getEntry('wide.png');
    expect(entry.size).to.equal(300);
  });

  it('multiple images are packed in a row', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    addReadyImage(mgr, 'a.png', 100, 100);
    addReadyImage(mgr, 'b.png', 100, 100);
    addReadyImage(mgr, 'c.png', 100, 100);
    mgr.rebuild();

    const ea = mgr.getEntry('a.png');
    const eb = mgr.getEntry('b.png');
    const ec = mgr.getEntry('c.png');

    // All on page 0
    expect(ea.pageIndex).to.equal(0);
    expect(eb.pageIndex).to.equal(0);
    expect(ec.pageIndex).to.equal(0);

    // Packed in a row with 1px margin between entries
    expect(ea.x).to.equal(0);
    expect(eb.x).to.equal(101); // 100 + 1px margin
    expect(ec.x).to.equal(202); // 101 + 100 + 1px margin
    expect(ea.y).to.equal(0);
    expect(eb.y).to.equal(0);
    expect(ec.y).to.equal(0);
  });

  it('wraps to next row when image does not fit horizontally', () => {
    // Page is 500px wide, images are 200px. Third must wrap to next row.
    const mgr = new TexturePageManager({ maxPageSize: 500, maxImageSize: 200 });
    addReadyImage(mgr, 'a.png', 200, 200);
    addReadyImage(mgr, 'b.png', 200, 200);
    addReadyImage(mgr, 'c.png', 200, 200);
    mgr.rebuild();

    const ea = mgr.getEntry('a.png');
    const eb = mgr.getEntry('b.png');
    const ec = mgr.getEntry('c.png');
    expect(ea.x).to.equal(0);
    expect(ea.y).to.equal(0);
    expect(eb.x).to.equal(201);
    expect(eb.y).to.equal(0);
    // c.png: cursorX=402, 402+200 > 500, so wrap to next row
    expect(ec.x).to.equal(0);
    expect(ec.y).to.equal(201); // rowHeight = 200 + 1
  });

  it('creates new page when image does not fit vertically', () => {
    // Page is 500px. Four 200px images: first row holds 2, second row holds 2.
    // Fifth must go on page 2 because 201 + 201 + 200 > 500.
    const mgr = new TexturePageManager({ maxPageSize: 500, maxImageSize: 200 });
    addReadyImage(mgr, 'a.png', 200, 200);
    addReadyImage(mgr, 'b.png', 200, 200);
    addReadyImage(mgr, 'c.png', 200, 200);
    addReadyImage(mgr, 'd.png', 200, 200);
    addReadyImage(mgr, 'e.png', 200, 200);
    mgr.rebuild();

    const ea = mgr.getEntry('a.png');
    const eb = mgr.getEntry('b.png');
    const ec = mgr.getEntry('c.png');
    const ed = mgr.getEntry('d.png');
    const ee = mgr.getEntry('e.png');

    // Row 1: a at (0,0), b at (201,0)
    expect(ea.pageIndex).to.equal(0);
    expect(ea.x).to.equal(0);
    expect(ea.y).to.equal(0);
    expect(eb.pageIndex).to.equal(0);
    expect(eb.x).to.equal(201);
    expect(eb.y).to.equal(0);
    // Row 2: c at (0,201), d at (201,201)
    expect(ec.pageIndex).to.equal(0);
    expect(ec.x).to.equal(0);
    expect(ec.y).to.equal(201);
    expect(ed.pageIndex).to.equal(0);
    expect(ed.x).to.equal(201);
    expect(ed.y).to.equal(201);
    // Row 3: e wraps (402+200>500), cursorY=402, 402+200=602>500 => new page
    expect(ee.pageIndex).to.equal(1);
    expect(ee.x).to.equal(0);
    expect(ee.y).to.equal(0);
    expect(mgr.getPageCount()).to.equal(2);
  });

  it('URL deduplication: same URL registered twice does not duplicate entry', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    addReadyImage(mgr, 'same.png', 100, 100);
    mgr.rebuild();

    const count1 = Object.keys(mgr.atlas).length;
    // Re-adding with same URL should be no-op
    mgr.imageStates['same.png'] = 'ready';
    mgr.rebuild();
    const count2 = Object.keys(mgr.atlas).length;
    expect(count2).to.equal(count1);
  });

  it('rebuild skips images with error state', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    mgr.imageStates['good.png'] = 'ready';
    mgr.images['good.png'] = { width: 100, height: 100 };
    mgr.imageStates['bad.png'] = 'error';
    mgr.rebuild();

    expect(mgr.getEntry('good.png')).to.not.be.null;
    expect(mgr.getEntry('bad.png')).to.be.null;
  });

  it('rebuild skips images with loading state', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    mgr.imageStates['loading.png'] = 'loading';
    mgr.imageStates['ready.png'] = 'ready';
    mgr.images['ready.png'] = { width: 50, height: 50 };
    mgr.rebuild();

    expect(mgr.getEntry('loading.png')).to.be.null;
    expect(mgr.getEntry('ready.png')).to.not.be.null;
  });

  it('rebuild with no ready images creates no pages', () => {
    const mgr = new TexturePageManager();
    mgr.imageStates['loading.png'] = 'loading';
    mgr.rebuild();
    expect(mgr.getPageCount()).to.equal(0);
  });

  it('rebuild clears previous atlas entries', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    addReadyImage(mgr, 'a.png', 100, 100);
    mgr.rebuild();
    expect(mgr.getEntry('a.png')).to.not.be.null;

    // Remove a.png and rebuild
    delete mgr.imageStates['a.png'];
    delete mgr.images['a.png'];
    mgr.rebuild();
    expect(mgr.getEntry('a.png')).to.be.null;
  });

  it('getMemoryBytes returns correct value', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    addReadyImage(mgr, 'a.png', 100, 100);
    mgr.rebuild();

    // 1 page, 1024 * 1024 * 4 bytes
    expect(mgr.getMemoryBytes()).to.equal(1024 * 1024 * 4);
  });

  it('getMemoryBytes returns 0 when no pages', () => {
    const mgr = new TexturePageManager();
    expect(mgr.getMemoryBytes()).to.equal(0);
  });

  it('getMemoryBytes scales with page count', () => {
    const mgr = new TexturePageManager({ maxPageSize: 300, maxImageSize: 200 });
    addReadyImage(mgr, 'a.png', 200, 200);
    addReadyImage(mgr, 'b.png', 200, 200);
    addReadyImage(mgr, 'c.png', 200, 200);
    mgr.rebuild();

    const pages = mgr.getPageCount();
    expect(mgr.getMemoryBytes()).to.equal(pages * 300 * 300 * 4);
  });

  it('onUpdate callback is called on rebuild', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    let called = false;
    mgr.onUpdate(() => { called = true; });
    addReadyImage(mgr, 'a.png', 100, 100);
    mgr.rebuild();
    expect(called).to.be.true;
  });

  it('onUpdate callback is not called on rebuild with no ready images', () => {
    const mgr = new TexturePageManager();
    let called = false;
    mgr.onUpdate(() => { called = true; });
    mgr.rebuild();
    expect(called).to.be.false;
  });

  it('page canvas has correct dimensions (stub)', () => {
    const mgr = new TexturePageManager({ maxPageSize: 2048, maxImageSize: 256 });
    addReadyImage(mgr, 'a.png', 100, 100);
    mgr.rebuild();
    const page = mgr.getPages()[0];
    expect(page.canvas.width).to.equal(2048);
    expect(page.canvas.height).to.equal(2048);
  });

  it('page glTexture is initially null', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    addReadyImage(mgr, 'a.png', 100, 100);
    mgr.rebuild();
    expect(mgr.getPages()[0].glTexture).to.be.null;
  });

  it('destroy clears all state', () => {
    const mgr = new TexturePageManager({ maxPageSize: 1024, maxImageSize: 256 });
    addReadyImage(mgr, 'a.png', 100, 100);
    mgr.rebuild();
    mgr.destroy();
    expect(mgr.pages).to.be.an('array').that.is.empty;
    expect(Object.keys(mgr.atlas)).to.have.length(0);
    expect(Object.keys(mgr.imageStates)).to.have.length(0);
    expect(Object.keys(mgr.images)).to.have.length(0);
  });

  it('handles many images across multiple pages', () => {
    // Small page, small images -> many pages needed
    const mgr = new TexturePageManager({ maxPageSize: 100, maxImageSize: 50 });
    for(let i = 0; i < 20; i++) {
      addReadyImage(mgr, `img${i}.png`, 50, 50);
    }
    mgr.rebuild();

    // Verify all entries exist
    for(let i = 0; i < 20; i++) {
      const entry = mgr.getEntry(`img${i}.png`);
      expect(entry, `img${i}.png should have atlas entry`).to.not.be.null;
    }
    // Should require multiple pages
    expect(mgr.getPageCount()).to.be.greaterThan(1);
  });

  it('registerImage sets state to loading', () => {
    // In Node.js, Image constructor exists but onload never fires.
    // We can still test the state transition.
    const mgr = new TexturePageManager();
    // Note: registerImage will attempt to create a new Image and set src,
    // which will fail silently in Node.js. But state should be set.
    mgr.registerImage('http://example.com/test.png');
    expect(mgr.imageStates['http://example.com/test.png']).to.equal('loading');
  });

  it('registerImage is idempotent for the same URL', () => {
    const mgr = new TexturePageManager();
    mgr.imageStates['dup.png'] = 'ready';
    mgr.registerImage('dup.png');
    // Should not overwrite existing state
    expect(mgr.imageStates['dup.png']).to.equal('ready');
  });
});
