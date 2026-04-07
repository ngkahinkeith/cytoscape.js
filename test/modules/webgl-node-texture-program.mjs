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

  it('processNode uses actual page canvas size for UV normalization', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(1);
    prog.count = 1;
    // Manager with page canvas that has a smaller size than maxPageSize
    const mgr = {
      maxPageSize: 4096,
      getEntry: (url) => {
        if(url === 'img.png') return { x: 100, y: 200, size: 128, pageIndex: 0 };
        return null;
      },
      getPageCount: () => 1,
      getPages: () => [{ canvas: { width: 2048 } }],
    };
    prog.processNode(0, mockNode({ bgImage: 'img.png' }), 0, mgr);
    // Should normalize by 2048 (actual canvas width), not 4096 (maxPageSize)
    expect(prog.buffer[5]).to.be.closeTo(100 / 2048, 0.0001);
    expect(prog.buffer[6]).to.be.closeTo(200 / 2048, 0.0001);
    expect(prog.buffer[7]).to.be.closeTo(128 / 2048, 0.0001);
  });

  it('ensureCapacity grows when needed', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(10);
    const oldCap = prog.capacity;
    prog.ensureCapacity(oldCap + 100);
    expect(prog.capacity).to.be.at.least(oldCap + 100);
  });

  it('ensureCapacity does nothing when sufficient', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(100);
    const cap = prog.capacity;
    prog.ensureCapacity(50);
    expect(prog.capacity).to.equal(cap);
  });

  it('_markDirty tracks min/max slot range', () => {
    const prog = new NodeTextureProgram();
    prog.reallocate(10);
    expect(prog._dirtyMin).to.equal(Infinity);
    expect(prog._dirtyMax).to.equal(-1);
    prog._markDirty(2);
    prog._markDirty(8);
    expect(prog._dirtyMin).to.equal(2);
    expect(prog._dirtyMax).to.equal(8);
  });

  it('setTextureManager stores reference', () => {
    const prog = new NodeTextureProgram();
    const mgr = mockTextureManager();
    prog.setTextureManager(mgr);
    expect(prog._textureManager).to.equal(mgr);
  });

  describe('init / upload / draw / destroy (with mock GL)', () => {
    function mockGL() {
      return {
        canvas: { width: 800, height: 600 },
        ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88E4,
        DYNAMIC_DRAW: 0x88E8,
        FLOAT: 0x1406,
        TRIANGLES: 0x0004,
        VERTEX_SHADER: 0x8B31,
        FRAGMENT_SHADER: 0x8B30,
        COMPILE_STATUS: 0x8B81,
        LINK_STATUS: 0x8B82,
        TEXTURE_2D: 0x0DE1,
        TEXTURE0: 0x84C0,
        createShader: () => ({}),
        shaderSource: () => {},
        compileShader: () => {},
        getShaderParameter: () => true,
        getShaderInfoLog: () => '',
        createProgram: () => ({}),
        attachShader: () => {},
        linkProgram: () => {},
        getProgramParameter: () => true,
        getUniformLocation: (prog, name) => name,
        createBuffer: () => ({}),
        createVertexArray: () => ({}),
        bindVertexArray: () => {},
        bindBuffer: () => {},
        bufferData: () => {},
        bufferSubData: () => {},
        enableVertexAttribArray: () => {},
        vertexAttribPointer: () => {},
        vertexAttribDivisor: () => {},
        useProgram: () => {},
        uniformMatrix3fv: () => {},
        uniform1f: () => {},
        uniform1i: () => {},
        drawArraysInstanced: () => {},
        deleteVertexArray: () => {},
        deleteBuffer: () => {},
        deleteProgram: () => {},
        activeTexture: () => {},
        bindTexture: () => {},
      };
    }

    it('init compiles shaders and creates VAO + buffers', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      expect(prog.screenProgram).to.not.be.null;
      expect(prog.pickingProgram).to.not.be.null;
      expect(prog.vao).to.not.be.null;
      expect(prog.glBuffer).to.not.be.null;
      expect(prog.quadBuffer).to.not.be.null;
      expect(prog._compiledPageCount).to.equal(1);
    });

    it('init caches uniform locations including uAtlas', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      expect(prog.screenProgram.uPanZoomMatrix).to.equal('uPanZoomMatrix');
      expect(prog.screenProgram.uZoom).to.equal('uZoom');
      expect(prog.screenProgram.uAtlas).to.be.an('array');
      expect(prog.screenProgram.uAtlas.length).to.equal(1);
    });

    it('_compileShaders recompiles for new page count', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl); // compiled with 1 page
      expect(prog._compiledPageCount).to.equal(1);
      prog._compileShaders(gl, 3);
      expect(prog._compiledPageCount).to.equal(3);
      expect(prog.screenProgram.uAtlas.length).to.equal(3);
    });

    it('_compileShaders deletes old programs before recompiling', () => {
      let deleteCount = 0;
      const gl = mockGL();
      gl.deleteProgram = () => { deleteCount++; };
      const prog = new NodeTextureProgram();
      prog.init(gl);
      deleteCount = 0;
      prog._compileShaders(gl, 2);
      expect(deleteCount).to.equal(2); // deletes old screen + picking
    });

    it('upload sends full buffer via bufferData when GPU buffer is too small', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      const mgr = mockTextureManager();
      prog.processNode(0, mockNode({ x: 1, y: 2 }), 0, mgr);
      prog.count = 1;
      prog.needsUpload = true;
      let bufferDataCalled = false;
      gl.bufferData = () => { bufferDataCalled = true; };
      prog.upload(gl);
      expect(bufferDataCalled).to.be.true;
      expect(prog.needsUpload).to.be.false;
    });

    it('upload uses bufferSubData for dirty range', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      const mgr = mockTextureManager();
      prog.processNode(0, mockNode({ x: 1, y: 2 }), 0, mgr);
      prog.count = 1;
      prog.needsUpload = true;
      prog.upload(gl); // first upload sets _gpuBufferSize
      prog._markDirty(0);
      let subDataCalled = false;
      gl.bufferSubData = () => { subDataCalled = true; };
      prog.upload(gl);
      expect(subDataCalled).to.be.true;
    });

    it('upload does full bufferSubData when no dirty range', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      const mgr = mockTextureManager();
      prog.processNode(0, mockNode({ x: 1, y: 2 }), 0, mgr);
      prog.count = 1;
      prog.needsUpload = true;
      prog.upload(gl); // sets _gpuBufferSize
      prog.needsUpload = true;
      prog._dirtyMin = Infinity;
      prog._dirtyMax = -1;
      let subDataCalled = false;
      gl.bufferSubData = () => { subDataCalled = true; };
      prog.upload(gl);
      expect(subDataCalled).to.be.true;
    });

    it('upload skips when needsUpload is false', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      prog.needsUpload = false;
      let called = false;
      gl.bufferData = () => { called = true; };
      prog.upload(gl);
      expect(called).to.be.false;
    });

    it('upload skips when count is 0', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 0;
      prog.needsUpload = true;
      let called = false;
      gl.bufferData = () => { called = true; };
      prog.upload(gl);
      expect(called).to.be.false;
    });

    it('upload creates new glBuffer when GPU buffer needs to grow', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      let deleteBufferCalled = false;
      let createBufferCount = 0;
      gl.deleteBuffer = () => { deleteBufferCalled = true; };
      gl.createBuffer = () => { createBufferCount++; return {}; };
      prog.init(gl);
      prog.reallocate(10);
      const mgr = mockTextureManager();
      prog.processNode(0, mockNode(), 0, mgr);
      prog.count = 1;
      prog.needsUpload = true;
      prog.upload(gl);
      expect(deleteBufferCalled).to.be.true;
      expect(createBufferCount).to.be.greaterThan(2); // init creates 2, upload creates another
    });

    it('draw issues drawArraysInstanced with screen program', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 3;
      let drawCount = 0;
      let usedProg = null;
      gl.useProgram = (p) => { usedProg = p; };
      gl.drawArraysInstanced = (mode, first, count, instances) => { drawCount = instances; };
      prog.draw(gl, new Float32Array(9), false, 1.0);
      expect(drawCount).to.equal(3);
      expect(usedProg).to.equal(prog.screenProgram);
    });

    it('draw uses picking program when isPicking', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      let usedProg = null;
      gl.useProgram = (p) => { usedProg = p; };
      prog.draw(gl, new Float32Array(9), true, 1.0);
      expect(usedProg).to.equal(prog.pickingProgram);
    });

    it('draw recompiles shaders when page count changes', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      // Set a texture manager with 3 pages
      prog.setTextureManager({
        getPageCount: () => 3,
        getPages: () => [
          { glTexture: {} },
          { glTexture: {} },
          { glTexture: {} },
        ],
      });
      prog.draw(gl, new Float32Array(9), false, 1.0);
      expect(prog._compiledPageCount).to.equal(3);
    });

    it('draw binds texture pages from manager', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      let texturesBound = 0;
      gl.bindTexture = () => { texturesBound++; };
      prog.setTextureManager({
        getPageCount: () => 1,
        getPages: () => [{ glTexture: {} }],
      });
      prog.draw(gl, new Float32Array(9), false, 1.0);
      expect(texturesBound).to.be.greaterThan(0);
    });

    it('draw skips when count is 0', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.count = 0;
      let called = false;
      gl.drawArraysInstanced = () => { called = true; };
      prog.draw(gl, new Float32Array(9), false, 1.0);
      expect(called).to.be.false;
    });

    it('draw skips when buffer is null', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.count = 5;
      prog.buffer = null;
      let called = false;
      gl.drawArraysInstanced = () => { called = true; };
      prog.draw(gl, new Float32Array(9), false, 1.0);
      expect(called).to.be.false;
    });

    it('draw defaults zoom to 1.0 when not provided', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.count = 1;
      let zoomValue = -1;
      gl.uniform1f = (loc, val) => {
        if(loc === 'uZoom') zoomValue = val;
      };
      prog.draw(gl, new Float32Array(9), false, undefined);
      expect(zoomValue).to.equal(1.0);
    });

    it('destroy cleans up all GL resources', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      prog.init(gl);
      prog.reallocate(10);
      prog.setTextureManager(mockTextureManager());
      prog.count = 5;
      prog.destroy(gl);
      expect(prog.vao).to.be.null;
      expect(prog.glBuffer).to.be.null;
      expect(prog.quadBuffer).to.be.null;
      expect(prog.screenProgram).to.be.null;
      expect(prog.pickingProgram).to.be.null;
      expect(prog.buffer).to.be.null;
      expect(prog.capacity).to.equal(0);
      expect(prog.count).to.equal(0);
      expect(prog._textureManager).to.be.null;
    });

    it('destroy is safe without prior init', () => {
      const prog = new NodeTextureProgram();
      const gl = mockGL();
      expect(() => prog.destroy(gl)).to.not.throw();
    });

    it('destroy calls GL deletion functions', () => {
      let vaoDel = 0, bufDel = 0, progDel = 0;
      const gl = mockGL();
      gl.deleteVertexArray = () => { vaoDel++; };
      gl.deleteBuffer = () => { bufDel++; };
      gl.deleteProgram = () => { progDel++; };
      const prog = new NodeTextureProgram();
      prog.init(gl);
      prog.destroy(gl);
      expect(vaoDel).to.equal(1);
      expect(bufDel).to.equal(2); // glBuffer + quadBuffer
      expect(progDel).to.equal(2); // screenProgram + pickingProgram
    });
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
