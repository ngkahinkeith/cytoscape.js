import { describe, it } from 'mocha';
import { expect } from 'chai';
import { NodeTextureProgram, NODE_TEX_STRIDE, getFragmentShaderSource, getPickingFragmentShaderSource } from '../../src/extensions/renderer/canvas/webgl/programs/node-texture.mjs';
import { unpackColor } from '../../src/extensions/renderer/canvas/webgl/color-pack.mjs';

// Mock node for textured node tests
function mockNode(opts = {}) {
  return {
    position: () => ({ x: opts.x || 0, y: opts.y || 0 }),
    outerWidth: () => opts.w || 30,
    outerHeight: () => opts.h || 30,
    pstyle: (prop) => {
      const styles = {
        'background-color': { value: opts.bgColor || [255, 0, 0] },
        'background-opacity': { value: opts.bgOpacity !== undefined ? opts.bgOpacity : 1 },
        'background-image': { strValue: opts.bgImage || 'none' },
      };
      return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
    },
  };
}

// Mock texture manager
function mockTextureManager(entries = {}, pageSize = 4096) {
  return {
    maxPageSize: pageSize,
    getEntry: (url) => entries[url] || null,
    getPageCount: () => {
      const indices = Object.values(entries).map(e => e.pageIndex);
      return indices.length > 0 ? Math.max(...indices) + 1 : 0;
    },
    getPages: () => [],
  };
}

describe('NodeTextureProgram', () => {

  it('NODE_TEX_STRIDE is 11', () => {
    expect(NODE_TEX_STRIDE).to.equal(11);
  });

  it('processNode packs position correctly', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager();
    prog.processNode(0, mockNode({ x: 100, y: 200 }), 0, mgr);
    expect(prog.buffer[0]).to.equal(100);
    expect(prog.buffer[1]).to.equal(200);
  });

  it('processNode packs size correctly', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager();
    prog.processNode(0, mockNode({ w: 40, h: 50 }), 0, mgr);
    expect(prog.buffer[2]).to.equal(40);
    expect(prog.buffer[3]).to.equal(50);
  });

  it('processNode packs color as packed float', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager();
    prog.processNode(0, mockNode({ bgColor: [255, 0, 0], bgOpacity: 1.0 }), 0, mgr);
    const packed = prog.buffer[4];
    expect(typeof packed).to.equal('number');
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(255);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.be.at.least(254);
  });

  it('processNode packs premultiplied colors with half opacity', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager();
    prog.processNode(0, mockNode({ bgColor: [200, 100, 50], bgOpacity: 0.5 }), 0, mgr);
    const [r, g, b, a] = unpackColor(prog.buffer[4]);
    expect(r).to.equal(100); // 200 * 0.5
    expect(g).to.equal(50);  // 100 * 0.5
    expect(b).to.equal(25);  // 50 * 0.5
    expect(a).to.be.closeTo(128, 1);
  });

  it('processNode packs atlas texture coordinates when entry exists', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager({
      'http://example.com/icon.png': { x: 100, y: 200, size: 128, pageIndex: 0 }
    }, 4096);
    prog.processNode(0, mockNode({ bgImage: 'http://example.com/icon.png' }), 0, mgr);

    // Normalized coordinates
    expect(prog.buffer[5]).to.be.closeTo(100 / 4096, 0.0001);  // texX
    expect(prog.buffer[6]).to.be.closeTo(200 / 4096, 0.0001);  // texY
    expect(prog.buffer[7]).to.be.closeTo(128 / 4096, 0.0001);  // texW
    expect(prog.buffer[8]).to.be.closeTo(128 / 4096, 0.0001);  // texH
    expect(prog.buffer[9]).to.equal(0);                         // pageIndex
  });

  it('processNode packs zero atlas coords when no entry exists', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager(); // empty
    prog.processNode(0, mockNode({ bgImage: 'missing.png' }), 0, mgr);

    expect(prog.buffer[5]).to.equal(0);
    expect(prog.buffer[6]).to.equal(0);
    expect(prog.buffer[7]).to.equal(0);
    expect(prog.buffer[8]).to.equal(0);
    expect(prog.buffer[9]).to.equal(0);
  });

  it('processNode packs page index from atlas entry', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager({
      'multi-page.png': { x: 0, y: 0, size: 64, pageIndex: 3 }
    }, 4096);
    prog.processNode(0, mockNode({ bgImage: 'multi-page.png' }), 0, mgr);
    expect(prog.buffer[9]).to.equal(3);
  });

  it('processNode packs pick index', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager();
    prog.processNode(0, mockNode(), 42, mgr);
    const [r, g, b, a] = unpackColor(prog.buffer[10]);
    expect(r).to.equal(42);
    expect(g).to.equal(0);
  });

  it('processNode packs large pick index across bytes', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager();
    const idx = 256 + 42;
    prog.processNode(0, mockNode(), idx, mgr);
    const [r, g, b, a] = unpackColor(prog.buffer[10]);
    expect(r).to.equal(idx & 0xFF);       // 42
    expect(g).to.equal((idx >> 8) & 0xFF); // 1
  });

  it('processNode works without textureManager (null)', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 5, y: 10 }), 7, null);
    expect(prog.buffer[0]).to.equal(5);
    expect(prog.buffer[1]).to.equal(10);
    // Atlas coords should be zero
    expect(prog.buffer[5]).to.equal(0);
    expect(prog.buffer[6]).to.equal(0);
    expect(prog.buffer[7]).to.equal(0);
    expect(prog.buffer[8]).to.equal(0);
    expect(prog.buffer[9]).to.equal(0);
  });

  it('reallocate grows buffer and preserves data', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(10);
    prog.count = 1;
    const mgr = mockTextureManager();
    prog.processNode(0, mockNode({ x: 99, y: 88 }), 0, mgr);
    prog.reallocate(100);
    expect(prog.buffer[0]).to.equal(99);
    expect(prog.buffer[1]).to.equal(88);
    expect(prog.capacity).to.be.at.least(100);
  });

  it('reallocate does not shrink', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(100);
    const cap = prog.capacity;
    prog.reallocate(50);
    expect(prog.capacity).to.equal(cap);
  });

  it('reallocate sets needsUpload', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(10);
    expect(prog.needsUpload).to.be.true;
  });

  it('reallocate minimum capacity is 256', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    expect(prog.capacity).to.be.at.least(256);
  });

  it('updatePosition changes only x,y', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager({
      'icon.png': { x: 50, y: 60, size: 64, pageIndex: 0 }
    }, 4096);
    prog.processNode(0, mockNode({ x: 10, y: 20, w: 30, h: 40, bgImage: 'icon.png' }), 0, mgr);
    prog.updatePosition(0, 50, 60);
    expect(prog.buffer[0]).to.equal(50);
    expect(prog.buffer[1]).to.equal(60);
    expect(prog.buffer[2]).to.equal(30); // size unchanged
    expect(prog.buffer[3]).to.equal(40);
    // Atlas coords unchanged
    expect(prog.buffer[5]).to.be.closeTo(50 / 4096, 0.0001);
  });

  it('updatePosition sets needsUpload', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    const mgr = mockTextureManager();
    prog.processNode(0, mockNode({ x: 10, y: 20 }), 0, mgr);
    prog.needsUpload = false;
    prog.updatePosition(0, 50, 60);
    expect(prog.needsUpload).to.be.true;
  });

  it('buffer layout matches NODE_TEX_STRIDE offsets', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(2);
    prog.count = 2;
    const mgr = mockTextureManager();
    prog.processNode(0, mockNode({ x: 1, y: 2, w: 3, h: 4 }), 0, mgr);
    prog.processNode(1, mockNode({ x: 10, y: 20, w: 30, h: 40 }), 1, mgr);
    // Second node starts at offset NODE_TEX_STRIDE
    expect(prog.buffer[NODE_TEX_STRIDE + 0]).to.equal(10);
    expect(prog.buffer[NODE_TEX_STRIDE + 1]).to.equal(20);
    expect(prog.buffer[NODE_TEX_STRIDE + 2]).to.equal(30);
    expect(prog.buffer[NODE_TEX_STRIDE + 3]).to.equal(40);
  });

  it('processNode handles 1000 nodes', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1000);
    prog.count = 1000;
    const mgr = mockTextureManager();
    for(let i = 0; i < 1000; i++) {
      prog.processNode(i, mockNode({ x: i, y: i * 2 }), i, mgr);
    }
    expect(prog.buffer[0]).to.equal(0);
    expect(prog.buffer[999 * NODE_TEX_STRIDE]).to.equal(999);
    expect(prog.buffer[999 * NODE_TEX_STRIDE + 1]).to.equal(1998);
  });
});

describe('NodeTextureProgram shader generation', () => {

  it('getFragmentShaderSource returns valid GLSL string', () => {
    const src = getFragmentShaderSource(1);
    expect(src).to.be.a('string');
    expect(src).to.include('#version 300 es');
    expect(src).to.include('sampler2D u_atlas[1]');
    expect(src).to.include('void main()');
  });

  it('getFragmentShaderSource creates array sized to page count', () => {
    const src3 = getFragmentShaderSource(3);
    expect(src3).to.include('sampler2D u_atlas[3]');
    expect(src3).to.include('pageIndex == 0');
    expect(src3).to.include('pageIndex == 1');
    expect(src3).to.include('pageIndex == 2');
  });

  it('getFragmentShaderSource with 0 pages defaults to 1', () => {
    const src = getFragmentShaderSource(0);
    expect(src).to.include('sampler2D u_atlas[1]');
  });

  it('getPickingFragmentShaderSource includes PICKING_MODE define', () => {
    const src = getPickingFragmentShaderSource(1);
    expect(src).to.include('#define PICKING_MODE');
    expect(src).to.include('PICKING_MODE');
  });

  it('getFragmentShaderSource includes direct texel output', () => {
    const src = getFragmentShaderSource(1);
    // Shader outputs texel directly; SDF shape behind provides the background
    expect(src).to.include('outColor = texel');
  });

  it('getFragmentShaderSource includes unpackColor function', () => {
    const src = getFragmentShaderSource(1);
    expect(src).to.include('unpackColor');
    expect(src).to.include('floatBitsToInt');
  });
});
