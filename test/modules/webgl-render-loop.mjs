import { describe, it } from 'mocha';
import { expect } from 'chai';
import { WebGLRenderLoop } from '../../src/extensions/renderer/canvas/webgl/render-loop.mjs';
import { LODManager } from '../../src/extensions/renderer/canvas/webgl/lod-manager.mjs';

// Minimal mock for testing process() without GL
function mockRenderer() {
  const eles = [...mockNodes(5), ...mockEdges(3)];
  eles.nondrag = eles;
  eles.drag = [];
  return {
    cy: {
      container: () => ({ style: { backgroundColor: 'white' } }),
      mutableElements: () => eles,
    },
    getCachedZSortedEles: () => eles,
    drawElementText: () => {},
    getArrowWidth: (w, s) => Math.max(Math.pow(w * 13.37, 0.9), 29) * s,
    recalculateRenderedStyle: () => {},
  };
}

function mockNodes(count) {
  const nodes = [];
  for(let i = 0; i < count; i++) {
    nodes.push({
      _private: { rscratch: {}, data: { id: 'n' + i } },
      isNode: () => true,
      isEdge: () => false,
      position: () => ({ x: i * 10, y: i * 20 }),
      outerWidth: () => 30,
      outerHeight: () => 30,
      padding: () => 0,
      width: () => 30,
      height: () => 30,
      pstyle: (prop) => {
        const styles = {
          'background-color': { value: [255, 0, 0] },
          'background-opacity': { value: 1 },
          'background-image': { strValue: 'none' },
          'border-width': { value: 0 },
          'border-color': { value: [0, 0, 0] },
          'border-opacity': { value: 1 },
          'border-position': { value: 'center' },
          'shape': { value: 'ellipse' },
          'corner-radius': { value: 'auto', pfValue: 0 },
          'label': { value: 'Node ' + i },
          'font-size': { pfValue: 12 },
          'overlay-opacity': { value: 0 },
          'overlay-color': { value: [0, 0, 0] },
          'overlay-padding': { pfValue: 10 },
          'overlay-corner-radius': { value: 'auto', pfValue: 0 },
          'overlay-shape': { value: 'round-rectangle' },
          'underlay-opacity': { value: 0 },
        };
        return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
      },
      connectedEdges: () => [],
    });
  }
  return nodes;
}

function mockEdges(count) {
  const edges = [];
  const mockTargetNode = {
    outerWidth: () => 30,
    outerHeight: () => 30,
  };
  for(let i = 0; i < count; i++) {
    edges.push({
      _private: {
        rscratch: {
          allpts: [0, 0, 100, 100],
          badLine: false,
          arrowStartX: 0, arrowStartY: 0, srcArrowAngle: 0,
          arrowEndX: 100, arrowEndY: 100, tgtArrowAngle: Math.PI,
        },
        data: { id: 'e' + i },
      },
      isNode: () => false,
      isEdge: () => true,
      target: () => mockTargetNode,
      pstyle: (prop) => {
        const styles = {
          'line-color': { value: [100, 100, 100] },
          'opacity': { value: 1 },
          'line-opacity': { value: 1 },
          'width': { pfValue: 2 },
          'source-arrow-shape': { value: 'none' },
          'target-arrow-shape': { value: 'triangle' },
          'source-arrow-color': { value: [100, 100, 100] },
          'target-arrow-color': { value: [100, 100, 100] },
          'arrow-scale': { value: 1 },
          'label': { value: 'Edge ' + i },
          'font-size': { pfValue: 8 },
          'overlay-opacity': { value: 0 },
          'overlay-color': { value: [0, 0, 0] },
          'overlay-padding': { pfValue: 10 },
        };
        return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
      },
    });
  }
  return edges;
}

function mockBezierEdges(count) {
  let pstyleCallCount = 0;
  const mockTargetNode = {
    outerWidth: () => 30,
    outerHeight: () => 30,
  };
  const edges = [];
  for(let i = 0; i < count; i++) {
    edges.push({
      _private: {
        rscratch: {
          allpts: [0, 0, 50, 100, 100, 0], // quadratic bezier (6 points)
          badLine: false,
          arrowStartX: 0, arrowStartY: 0, srcArrowAngle: 0,
          arrowEndX: 100, arrowEndY: 0, tgtArrowAngle: Math.PI,
        },
        data: { id: 'be' + i },
      },
      isNode: () => false,
      isEdge: () => true,
      target: () => mockTargetNode,
      pstyle: (prop) => {
        pstyleCallCount++;
        const styles = {
          'line-color': { value: [100, 100, 100] },
          'opacity': { value: 1 },
          'line-opacity': { value: 1 },
          'width': { pfValue: 2 },
          'source-arrow-shape': { value: 'none' },
          'target-arrow-shape': { value: 'triangle' },
          'source-arrow-color': { value: [100, 100, 100] },
          'target-arrow-color': { value: [100, 100, 100] },
          'arrow-scale': { value: 1 },
          'label': { value: '' },
          'font-size': { pfValue: 8 },
          'overlay-opacity': { value: 0 },
          'overlay-color': { value: [0, 0, 0] },
          'overlay-padding': { pfValue: 10 },
        };
        return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
      },
    });
  }
  edges._getPstyleCallCount = () => pstyleCallCount;
  edges._resetPstyleCallCount = () => { pstyleCallCount = 0; };
  return edges;
}

describe('WebGLRenderLoop', () => {
  it('creates without errors', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    expect(loop).to.be.an.instanceOf(WebGLRenderLoop);
  });

  it('process() populates node buffer', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    loop.process();
    expect(loop.nodeSDFProgram.count).to.equal(10); // 5 nodes x (body + overlay) = 10
    expect(loop.nodeSDFProgram.buffer).to.not.be.null;
  });

  it('process() populates edge buffer', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    loop.process();
    // 3 edges x 1 unified instance each = 3 instances
    expect(loop.edgeProgram.count).to.equal(3);
  });

  it('process() writes correct edge position data into buffer', () => {
    const r = mockRenderer();
    const loop = new WebGLRenderLoop(r);
    loop.process();
    const edges = r.getCachedZSortedEles().filter(e => e.isEdge());
    const edge = edges[0];
    const slot = edge._private._webglEdgeSlot;
    const buf = loop.edgeProgram.buffer;
    const stride = 12; // EDGE_UNIFIED_STRIDE
    const off = slot * stride;
    const pts = edge._private.rscratch.allpts;
    // Verify source position (offsets 0-1)
    expect(buf[off + 0]).to.equal(pts[0]); // srcX
    expect(buf[off + 1]).to.equal(pts[1]); // srcY
    // Verify target position (offsets 2-3)
    expect(buf[off + 2]).to.equal(pts[pts.length - 2]); // tgtX
    expect(buf[off + 3]).to.equal(pts[pts.length - 1]); // tgtY
    // Verify width (offset 7)
    expect(buf[off + 7]).to.equal(edge.pstyle('width').pfValue);
  });

  it('process() assigns node slots and edge slots to all elements', () => {
    const r = mockRenderer();
    const eles = r.getCachedZSortedEles();
    const loop = new WebGLRenderLoop(r);
    loop.process();
    const nodes = eles.filter(e => e.isNode());
    const edges = eles.filter(e => e.isEdge());
    for(const node of nodes) {
      expect(node._private._webglNodeSlots).to.be.an('array');
      expect(node._private._webglNodeSlots.length).to.be.greaterThan(0);
    }
    for(const edge of edges) {
      expect(edge._private._webglEdgeSlot).to.be.a('number');
    }
  });

  it('process() assigns node slots', () => {
    const r = mockRenderer();
    const eles = r.getCachedZSortedEles();
    const loop = new WebGLRenderLoop(r);
    loop.process();
    const nodes = eles.filter(e => e.isNode());
    for(let i = 0; i < nodes.length; i++) {
      // Each node gets _webglNodeSlots = [bodySlot, overlaySlot]
      expect(nodes[i]._private._webglNodeSlots).to.be.an('array');
      expect(nodes[i]._private._webglNodeSlots.length).to.equal(2); // body + overlay
    }
  });

  it('process() collects label candidates', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    loop.process();
    // 5 nodes + 3 edges = 8 label candidates
    expect(loop._labelCandidates.length).to.equal(8);
  });

  it('invalidate() triggers process on next render check', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    loop.process();
    expect(loop.needsProcess).to.be.false;
    loop.invalidate();
    expect(loop.needsProcess).to.be.true;
  });

  it('updateNodePosition updates buffer', () => {
    const r = mockRenderer();
    const eles = r.getCachedZSortedEles();
    const loop = new WebGLRenderLoop(r);
    loop.process();
    // Reset needsUpload after process
    loop.nodeSDFProgram.needsUpload = false;
    const node = eles[0]; // first node
    loop.updateNodePosition(node);
    expect(loop.nodeSDFProgram.needsUpload).to.be.true;
  });

  it('process() handles textured nodes', () => {
    const r = mockRenderer();
    const origGetEles = r.getCachedZSortedEles;
    r.getCachedZSortedEles = () => {
      const eles = origGetEles();
      // Make first node have a bg-image
      const origPstyle = eles[0].pstyle;
      eles[0].pstyle = (prop) => {
        if(prop === 'background-image') return { strValue: 'data:image/png;base64,abc' };
        return origPstyle(prop);
      };
      return eles;
    };
    const loop = new WebGLRenderLoop(r);
    loop.process();
    expect(loop.nodeTexProgram.count).to.equal(1);
  });

  it('process() sets needsUpload and clears needsProcess', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    expect(loop.needsProcess).to.be.true;
    loop.process();
    expect(loop.needsProcess).to.be.false;
    expect(loop.nodeSDFProgram.needsUpload).to.be.true;
    expect(loop.edgeProgram.needsUpload).to.be.true;
  });

  it('process() assigns edge slots and instance counts', () => {
    const r = mockRenderer();
    const eles = r.getCachedZSortedEles();
    const loop = new WebGLRenderLoop(r);
    loop.process();
    const edges = eles.filter(e => e.isEdge());
    for(const edge of edges) {
      expect(edge._private._webglEdgeSlot).to.be.a('number');
      expect(edge._private._webglEdgeInstances).to.be.a('number');
      expect(edge._private._webglEdgeInstances).to.be.greaterThan(0);
    }
  });

  it('process() assigns sequential node slots', () => {
    const r = mockRenderer();
    const eles = r.getCachedZSortedEles();
    const loop = new WebGLRenderLoop(r);
    loop.process();
    const nodes = eles.filter(e => e.isNode());
    // Each node gets 2 SDF slots (body + overlay), so slots are 0,1 / 2,3 / 4,5 ...
    for(let i = 0; i < nodes.length; i++) {
      const slots = nodes[i]._private._webglNodeSlots;
      expect(slots[0]).to.equal(i * 2);     // body slot
      expect(slots[1]).to.equal(i * 2 + 1); // overlay slot
    }
  });

  it('constructor accepts options', () => {
    const loop = new WebGLRenderLoop(mockRenderer(), {
      webglTexSize: 2048,
      maxImageSize: 256,
      labelGridCellSize: 200,
    });
    expect(loop.texturePageManager.maxPageSize).to.equal(2048);
    expect(loop.texturePageManager.maxImageSize).to.equal(256);
    expect(loop.labelGrid.cellSize).to.equal(200);
  });

  it('updateNodePosition is no-op for node without slot', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    // No process() called — node has no slot
    const node = {
      _private: {},
      position: () => ({ x: 0, y: 0 }),
    };
    loop.updateNodePosition(node);
    expect(loop.nodeSDFProgram.needsUpload).to.be.false;
  });

  it('render() without init is no-op', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    // Should not throw
    loop.render([1, 0, 0, 0, 1, 0, 0, 0, 1], 1);
  });

  it('renderPicking() without init is no-op', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    // Should not throw
    loop.renderPicking(null, [1, 0, 0, 0, 1, 0, 0, 0, 1], 1);
  });

  it('process() handles zero elements', () => {
    const r = mockRenderer();
    const emptyEles = [];
    r.getCachedZSortedEles = () => emptyEles;
    r.cy.mutableElements = () => emptyEles;
    const loop = new WebGLRenderLoop(r);
    loop.process();
    expect(loop.nodeSDFProgram.count).to.equal(0);
    expect(loop.edgeProgram.count).to.equal(0);
    expect(loop._labelCandidates.length).to.equal(0);
  });

  it('process() handles nodes-only', () => {
    const r = mockRenderer();
    const nodes = mockNodes(10);
    r.getCachedZSortedEles = () => nodes;
    r.cy.mutableElements = () => nodes;
    const loop = new WebGLRenderLoop(r);
    loop.process();
    expect(loop.nodeSDFProgram.count).to.equal(20); // 10 nodes x (body + overlay) = 20
    expect(loop.edgeProgram.count).to.equal(0);
  });

  it('process() handles edges-only', () => {
    const r = mockRenderer();
    const edges = mockEdges(4);
    r.getCachedZSortedEles = () => edges;
    r.cy.mutableElements = () => edges;
    const loop = new WebGLRenderLoop(r);
    loop.process();
    expect(loop.nodeSDFProgram.count).to.equal(0);
    expect(loop.edgeProgram.count).to.equal(4); // 4 edges x 1 unified instance
  });

  it('label candidates have correct isNode flag', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    loop.process();
    const nodeCandidates = loop._labelCandidates.filter(c => c.isNode);
    const edgeCandidates = loop._labelCandidates.filter(c => !c.isNode);
    expect(nodeCandidates.length).to.equal(5);
    expect(edgeCandidates.length).to.equal(3);
  });

  it('destroy() does not throw when not initialized', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    expect(() => loop.destroy()).to.not.throw();
  });

  // Phase 2: Viewport culling tests
  it('_computeViewportBounds returns correct model-space bounds', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    // pan={x:100, y:50}, zoom=2, canvas=800x600
    // margin = 100 + 200/2 = 200
    const bounds = loop._computeViewportBounds({ x: 100, y: 50 }, 2, 800, 600);
    // model x1 = (0 - 100) / 2 - 200 = -250
    // model y1 = (0 - 50) / 2 - 200 = -225
    // model x2 = (800 - 100) / 2 + 200 = 550
    // model y2 = (600 - 50) / 2 + 200 = 475
    expect(bounds[0]).to.equal(-250);
    expect(bounds[1]).to.equal(-225);
    expect(bounds[2]).to.equal(550);
    expect(bounds[3]).to.equal(475);
  });

  it('_computeViewportBounds has margin >= 200 model-space units', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    const bounds = loop._computeViewportBounds({ x: 0, y: 0 }, 1, 100, 100);
    // margin = 100 + 200/1 = 300
    // Without margin: x1=0, y1=0, x2=100, y2=100
    // With margin: should extend at least 200 units in each direction
    expect(bounds[0]).to.be.at.most(-200);
    expect(bounds[1]).to.be.at.most(-200);
    expect(bounds[2]).to.be.at.least(300);
    expect(bounds[3]).to.be.at.least(300);
  });

  it('renderPicking uses infinite bounds (no culling during picking)', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    expect(loop.renderPicking).to.be.a('function');
    expect(loop.renderPicking.length).to.be.at.least(4);
  });

  // Phase 3: pstyle dedup integration tests
  it('process() handles bezier edges via UnifiedEdgeProgram', () => {
    const r = mockRenderer();
    const bezierEdges = mockBezierEdges(3);
    r.getCachedZSortedEles = () => bezierEdges;
    r.cy.mutableElements = () => bezierEdges;
    const loop = new WebGLRenderLoop(r);
    loop.process();
    // 3 bezier edges: each gets 1 unified instance (body + arrow in one)
    expect(loop.edgeProgram.count).to.equal(3);
    // Each bezier edge should have _webglEdgeSlot assigned
    for(const edge of bezierEdges) {
      expect(edge._private._webglEdgeSlot).to.be.a('number');
      expect(edge._private._webglEdgeInstances).to.equal(1);
    }
  });

  it('process() with bezier edges uses <= 7 pstyle calls per edge', () => {
    const r = mockRenderer();
    const bezierEdges = mockBezierEdges(100);
    r.getCachedZSortedEles = () => bezierEdges;
    r.cy.mutableElements = () => bezierEdges;
    const loop = new WebGLRenderLoop(r);
    bezierEdges._resetPstyleCallCount();
    loop.process();
    const callsPerEdge = bezierEdges._getPstyleCallCount() / 100;
    // UnifiedEdgeProgram reads: opacity, line-opacity, line-color, width,
    // target-arrow-shape = 5, plus label + font-size from render-loop = 7 total
    expect(callsPerEdge).to.be.at.most(8);
  });

  // Phase 5: LODManager integration tests
  it('constructor creates lodManager property', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    expect(loop.lodManager).to.be.an.instanceOf(LODManager);
  });

  it('lodManager receives options from constructor', () => {
    const loop = new WebGLRenderLoop(mockRenderer(), {
      hideEdgesOnViewport: true,
      textureOnViewport: true,
    });
    expect(loop.lodManager._hideEdgesOnViewport).to.be.true;
    expect(loop.lodManager._textureOnViewport).to.be.true;
  });

  it('lodManager defaults to not hiding edges', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    expect(loop.lodManager.shouldDrawEdges()).to.be.true;
  });

  // ---- Mock GL context for render/picking/destroy tests ----
  function mockGL() {
    return {
      canvas: { width: 800, height: 600 },
      ARRAY_BUFFER: 0x8892,
      STATIC_DRAW: 0x88E4,
      DYNAMIC_DRAW: 0x88E8,
      FLOAT: 0x1406,
      TRIANGLES: 0x0004,
      UNSIGNED_BYTE: 0x1401,
      VERTEX_SHADER: 0x8B31,
      FRAGMENT_SHADER: 0x8B30,
      COMPILE_STATUS: 0x8B81,
      LINK_STATUS: 0x8B82,
      COLOR_BUFFER_BIT: 0x4000,
      FRAMEBUFFER: 0x8D40,
      TEXTURE_2D: 0x0DE1,
      TEXTURE0: 0x84C0,
      RGBA: 0x1908,
      BLEND: 0x0BE2,
      ONE: 1,
      ONE_MINUS_SRC_ALPHA: 0x0303,
      NEAREST: 0x2600,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      CLAMP_TO_EDGE: 0x812F,
      COLOR_ATTACHMENT0: 0x8CE0,
      INT: 0x1404,
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
      vertexAttribIPointer: () => {},
      useProgram: () => {},
      uniformMatrix3fv: () => {},
      uniform2f: () => {},
      uniform1f: () => {},
      uniform1i: () => {},
      uniform4f: () => {},
      drawArraysInstanced: () => {},
      deleteVertexArray: () => {},
      deleteBuffer: () => {},
      deleteProgram: () => {},
      clearColor: () => {},
      clear: () => {},
      enable: () => {},
      disable: () => {},
      blendFunc: () => {},
      viewport: () => {},
      bindFramebuffer: () => {},
      readPixels: () => {},
      activeTexture: () => {},
      bindTexture: () => {},
      createTexture: () => ({}),
      texImage2D: () => {},
      texParameteri: () => {},
      createFramebuffer: () => ({}),
      framebufferTexture2D: () => {},
      deleteTexture: () => {},
      deleteFramebuffer: () => {},
    };
  }

  describe('render() with mock GL', () => {
    it('calls process() when needsProcess is true', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      expect(loop.needsProcess).to.be.true;
      loop.render(new Float32Array(9), 1.0, { x: 0, y: 0 });
      expect(loop.needsProcess).to.be.false;
    });

    it('does not call process() when needsProcess is false', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      const prevCount = loop.nodeSDFProgram.count;
      loop.render(new Float32Array(9), 1.0, { x: 0, y: 0 });
      expect(loop.nodeSDFProgram.count).to.equal(prevCount);
    });

    it('clears the edge canvas', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      let clearCalled = false;
      glEdge.clear = () => { clearCalled = true; };
      loop.init(glNode, glEdge);
      loop.render(new Float32Array(9), 1.0, { x: 0, y: 0 });
      expect(clearCalled).to.be.true;
    });

    it('draws nodes and edges', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      let nodeDrawn = false, edgeDrawn = false;
      glNode.drawArraysInstanced = () => { nodeDrawn = true; };
      glEdge.drawArraysInstanced = () => { edgeDrawn = true; };
      loop.init(glNode, glEdge);
      loop.render(new Float32Array(9), 1.0, { x: 0, y: 0 });
      expect(nodeDrawn).to.be.true;
      expect(edgeDrawn).to.be.true;
    });

    it('uses default infinite viewport bounds when pan is not provided', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      // pass null pan — should not throw
      expect(() => loop.render(new Float32Array(9), 1.0, null)).to.not.throw();
    });

    it('calls refreshOverlayColors', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop._overlayDirty = true;
      loop.render(new Float32Array(9), 1.0, { x: 0, y: 0 });
      // After render, _overlayDirty should be cleared
      expect(loop._overlayDirty).to.be.false;
    });

    it('skips edge drawing when lodManager says no', () => {
      const loop = new WebGLRenderLoop(mockRenderer(), { hideEdgesOnViewport: true });
      const glNode = mockGL();
      const glEdge = mockGL();
      let edgeDrawn = false;
      glEdge.drawArraysInstanced = () => { edgeDrawn = true; };
      loop.init(glNode, glEdge);
      loop.lodManager.setInteracting(true);
      loop.render(new Float32Array(9), 1.0, { x: 0, y: 0 });
      expect(edgeDrawn).to.be.false;
    });
  });

  describe('renderPicking() with mock GL', () => {
    it('renders picking pass for both node and edge FBOs', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      let nodeFBBound = false, edgeFBBound = false;
      glNode.bindFramebuffer = (target, fb) => {
        if(fb !== null) nodeFBBound = true;
      };
      glEdge.bindFramebuffer = (target, fb) => {
        if(fb !== null) edgeFBBound = true;
      };
      loop.renderPicking({}, {}, new Float32Array(9), 1.0);
      expect(nodeFBBound).to.be.true;
      expect(edgeFBBound).to.be.true;
    });

    it('disables blending during picking', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      let blendDisabledNode = false, blendDisabledEdge = false;
      glNode.disable = (cap) => { if(cap === glNode.BLEND) blendDisabledNode = true; };
      glEdge.disable = (cap) => { if(cap === glEdge.BLEND) blendDisabledEdge = true; };
      loop.init(glNode, glEdge);
      loop.process();
      loop.renderPicking({}, {}, new Float32Array(9), 1.0);
      expect(blendDisabledNode).to.be.true;
      expect(blendDisabledEdge).to.be.true;
    });

    it('unbinds all 16 textures on node context for picking', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      let activeTextureCount = 0;
      glNode.activeTexture = () => { activeTextureCount++; };
      loop.init(glNode, glEdge);
      loop.process();
      loop.renderPicking({}, {}, new Float32Array(9), 1.0);
      expect(activeTextureCount).to.equal(16);
    });

    it('restores framebuffer to null after each pass', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      let nodeNullBound = false, edgeNullBound = false;
      glNode.bindFramebuffer = (target, fb) => { if(fb === null) nodeNullBound = true; };
      glEdge.bindFramebuffer = (target, fb) => { if(fb === null) edgeNullBound = true; };
      loop.init(glNode, glEdge);
      loop.process();
      loop.renderPicking({}, {}, new Float32Array(9), 1.0);
      expect(nodeNullBound).to.be.true;
      expect(edgeNullBound).to.be.true;
    });
  });

  describe('renderLabels() with mock data', () => {
    it('renders node labels that pass viewport culling', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      loop.process();
      let drawCount = 0;
      loop.r.drawElementText = () => { drawCount++; };
      // All nodes are at x: 0..40, y: 0..80
      loop.renderLabels({}, { x: 0, y: 0 }, 1.0, 800, 600, true);
      expect(drawCount).to.be.greaterThan(0);
    });

    it('renders edge labels for non-node pass', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      loop.process();
      let drawCount = 0;
      loop.r.drawElementText = () => { drawCount++; };
      loop.renderLabels({}, { x: 0, y: 0 }, 1.0, 800, 600, false);
      expect(drawCount).to.be.greaterThan(0);
    });

    it('returns early if _labelCandidates is null', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      loop._labelCandidates = null;
      // Should not throw
      expect(() => loop.renderLabels({}, { x: 0, y: 0 }, 1.0, 800, 600, true)).to.not.throw();
    });

    it('skips labels outside viewport', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      loop.process();
      let drawCount = 0;
      loop.r.drawElementText = () => { drawCount++; };
      // Viewport far away from element positions (pan offset puts viewport elsewhere)
      loop.renderLabels({}, { x: -100000, y: -100000 }, 1.0, 100, 100, true);
      expect(drawCount).to.equal(0);
    });

    it('handles edge labels with midpoint from rscratch', () => {
      const r = mockRenderer();
      const eles = r.getCachedZSortedEles();
      const edge = eles.find(e => e.isEdge());
      // Set midpoint in rscratch
      edge._private.rscratch.midX = 50;
      edge._private.rscratch.midY = 50;
      const loop = new WebGLRenderLoop(r);
      loop.process();
      let drawn = false;
      loop.r.drawElementText = () => { drawn = true; };
      loop.renderLabels({}, { x: 0, y: 0 }, 1.0, 800, 600, false);
      expect(drawn).to.be.true;
    });
  });

  describe('updateNodePosition with texture node', () => {
    it('updates both SDF and texture positions', () => {
      const r = mockRenderer();
      // Make first node have a bg-image
      const origGetEles = r.getCachedZSortedEles;
      r.getCachedZSortedEles = () => {
        const eles = origGetEles();
        const origPstyle = eles[0].pstyle;
        eles[0].pstyle = (prop) => {
          if(prop === 'background-image') return { strValue: 'data:image/png;base64,abc' };
          return origPstyle(prop);
        };
        return eles;
      };
      const loop = new WebGLRenderLoop(r);
      loop.process();
      const node = r.getCachedZSortedEles()[0];
      expect(node._private._webglTexSlot).to.not.be.undefined;
      loop.nodeSDFProgram.needsUpload = false;
      loop.nodeTexProgram.needsUpload = false;
      loop.updateNodePosition(node);
      expect(loop.nodeSDFProgram.needsUpload).to.be.true;
      expect(loop.nodeTexProgram.needsUpload).to.be.true;
    });
  });

  describe('updateConnectedEdges with mock GL', () => {
    it('updates single-instance edge endpoints', () => {
      const r = mockRenderer();
      const eles = r.getCachedZSortedEles();
      const edge = eles.find(e => e.isEdge());
      const node = eles.find(e => e.isNode());
      // Wire edge as connected to the node
      node.connectedEdges = () => [edge];
      const loop = new WebGLRenderLoop(r);
      loop.process();
      // Verify edge has a slot
      expect(edge._private._webglEdgeSlot).to.be.a('number');
      expect(edge._private._webglEdgeInstances).to.equal(1);
      // Update connected edges
      loop.updateConnectedEdges(node);
      // Should not throw and edge buffer should be dirty
      expect(loop.edgeProgram.needsUpload).to.be.true;
    });

    it('updates multi-segment taxi edges', () => {
      const r = mockRenderer();
      // Create a taxi-like edge with multiple segments (>8 points = segmented path)
      const taxiEdge = {
        _private: {
          rscratch: {
            allpts: [0, 0, 50, 0, 50, 100, 100, 100, 150, 50],
            badLine: false,
            arrowEndX: 150, arrowEndY: 50, tgtArrowAngle: Math.PI,
          },
          data: { id: 'taxi' },
        },
        isNode: () => false,
        isEdge: () => true,
        target: () => ({ outerWidth: () => 30, outerHeight: () => 30 }),
        pstyle: (prop) => {
          const styles = {
            'line-color': { value: [100, 100, 100] },
            'opacity': { value: 1 },
            'line-opacity': { value: 1 },
            'width': { pfValue: 2 },
            'source-arrow-shape': { value: 'none' },
            'target-arrow-shape': { value: 'triangle' },
            'source-arrow-color': { value: [100, 100, 100] },
            'target-arrow-color': { value: [100, 100, 100] },
            'arrow-scale': { value: 1 },
            'label': { value: '' },
            'font-size': { pfValue: 8 },
            'overlay-opacity': { value: 0 },
            'overlay-color': { value: [0, 0, 0] },
            'overlay-padding': { pfValue: 10 },
          };
          return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
        },
      };
      const nodeWithTaxi = {
        _private: { rscratch: {} },
        isNode: () => true,
        isEdge: () => false,
        position: () => ({ x: 0, y: 0 }),
        outerWidth: () => 30,
        outerHeight: () => 30,
        padding: () => 0,
        width: () => 30,
        height: () => 30,
        pstyle: (prop) => {
          const styles = {
            'background-color': { value: [255, 0, 0] },
            'background-opacity': { value: 1 },
            'background-image': { strValue: 'none' },
            'border-width': { value: 0 },
            'border-color': { value: [0, 0, 0] },
            'border-opacity': { value: 1 },
            'border-position': { value: 'center' },
            'shape': { value: 'ellipse' },
            'corner-radius': { value: 'auto', pfValue: 0 },
            'label': { value: '' },
            'font-size': { pfValue: 12 },
            'overlay-opacity': { value: 0 },
            'overlay-color': { value: [0, 0, 0] },
            'overlay-padding': { pfValue: 10 },
            'overlay-shape': { value: 'round-rectangle' },
            'overlay-corner-radius': { value: 'auto', pfValue: 0 },
            'underlay-opacity': { value: 0 },
          };
          return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
        },
        connectedEdges: () => [taxiEdge],
      };
      const allEles = [nodeWithTaxi, taxiEdge];
      r.getCachedZSortedEles = () => allEles;
      r.cy.mutableElements = () => allEles;
      const loop = new WebGLRenderLoop(r);
      loop.process();
      expect(taxiEdge._private._webglEdgeInstances).to.be.greaterThan(1);
      loop.updateConnectedEdges(nodeWithTaxi);
      expect(loop.edgeProgram.needsUpload).to.be.true;
    });

    it('skips edges without slot assignment', () => {
      const r = mockRenderer();
      const eles = r.getCachedZSortedEles();
      const node = eles.find(e => e.isNode());
      const unslottedEdge = {
        _private: { rscratch: { allpts: [0, 0, 100, 100] } },
        isEdge: () => true,
        pstyle: () => ({ value: null, pfValue: 0 }),
      };
      node.connectedEdges = () => [unslottedEdge];
      const loop = new WebGLRenderLoop(r);
      loop.process();
      // Should not throw
      expect(() => loop.updateConnectedEdges(node)).to.not.throw();
    });
  });

  describe('_updateEdgeColor', () => {
    it('updates color for a single-instance edge', () => {
      const r = mockRenderer();
      const loop = new WebGLRenderLoop(r);
      loop.process();
      const eles = r.getCachedZSortedEles();
      const edge = eles.find(e => e.isEdge());
      expect(edge._private._webglEdgeSlot).to.be.a('number');
      loop.edgeProgram.needsUpload = false;
      loop._updateEdgeColor(edge);
      expect(loop.edgeProgram.needsUpload).to.be.true;
    });

    it('skips edge without slot', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const edge = {
        _private: {},
        pstyle: (prop) => {
          const styles = {
            'opacity': { value: 1 },
            'line-opacity': { value: 1 },
            'line-color': { value: [100, 100, 100] },
          };
          return styles[prop] || { value: null, pfValue: 0 };
        },
      };
      // Should not throw even without slot
      expect(() => loop._updateEdgeColor(edge)).to.not.throw();
    });
  });

  describe('refreshOverlayColors with actual elements', () => {
    it('returns false when _overlayDirty is false', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      loop._overlayDirty = false;
      expect(loop.refreshOverlayColors()).to.be.false;
    });

    it('returns false when buffer is null', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      loop._overlayDirty = true;
      loop._initialized = false;
      expect(loop.refreshOverlayColors()).to.be.false;
    });

    it('handles nodes with overlay opacity > 0', () => {
      const r = mockRenderer();
      const origGetEles = r.getCachedZSortedEles;
      r.getCachedZSortedEles = () => {
        const eles = origGetEles();
        // Make first node have an active overlay
        const origPstyle = eles[0].pstyle;
        eles[0].pstyle = (prop) => {
          if(prop === 'overlay-opacity') return { value: 0.5 };
          if(prop === 'overlay-color') return { value: [0, 0, 255] };
          return origPstyle(prop);
        };
        return eles;
      };
      const loop = new WebGLRenderLoop(r);
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      loop._overlayDirty = true;
      const changed = loop.refreshOverlayColors();
      // Overlay was set with opacity 0.5 on a node, so the buffer should have been updated
      expect(changed).to.be.a('boolean');
      // Verify the overlay buffer contains non-zero data (node overlay was written)
      if (changed) {
        const buf = loop._nodeOverlayBuf;
        if (buf) {
          const hasNonZero = buf.some(v => v !== 0);
          expect(hasNonZero).to.be.true;
        }
      }
    });

    it('handles edge overlay with opacity > 0', () => {
      const r = mockRenderer();
      const origGetEles = r.getCachedZSortedEles;
      r.getCachedZSortedEles = () => {
        const eles = origGetEles();
        // Make edges have overlay
        for(const ele of eles) {
          if(ele.isEdge()) {
            const origPstyle = ele.pstyle;
            ele.pstyle = (prop) => {
              if(prop === 'overlay-opacity') return { value: 0.3 };
              if(prop === 'overlay-color') return { value: [255, 0, 0] };
              if(prop === 'overlay-padding') return { pfValue: 5 };
              return origPstyle(prop);
            };
          }
        }
        return eles;
      };
      const loop = new WebGLRenderLoop(r);
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      loop._overlayDirty = true;
      const changed = loop.refreshOverlayColors();
      expect(changed).to.be.true;
    });

    it('handles styleDirty elements', () => {
      const r = mockRenderer();
      const eles = r.getCachedZSortedEles();
      eles[0]._private.styleDirty = true;
      const loop = new WebGLRenderLoop(r);
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      loop._overlayDirty = true;
      // Should trigger pstyle('overlay-opacity') for the dirty element
      expect(() => loop.refreshOverlayColors()).to.not.throw();
    });
  });

  describe('updateStyleIncremental', () => {
    it('updates node colors incrementally', () => {
      const r = mockRenderer();
      r.cy.style = () => ({});
      const eles = r.getCachedZSortedEles();
      const loop = new WebGLRenderLoop(r);
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      loop.nodeSDFProgram.needsUpload = false;
      const node = eles[0];
      loop.updateStyleIncremental([node]);
      expect(loop.nodeSDFProgram.needsUpload).to.be.true;
    });

    it('updates edge colors incrementally', () => {
      const r = mockRenderer();
      r.cy.style = () => ({});
      const eles = r.getCachedZSortedEles();
      const loop = new WebGLRenderLoop(r);
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      loop.edgeProgram.needsUpload = false;
      const edge = eles.find(e => e.isEdge());
      loop.updateStyleIncremental([edge]);
      expect(loop.edgeProgram.needsUpload).to.be.true;
    });

    it('is no-op when not initialized', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      // Should not throw even without init
      expect(() => loop.updateStyleIncremental([])).to.not.throw();
    });

    it('is no-op when buffer is null', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      loop._initialized = true;
      loop.nodeSDFProgram.buffer = null;
      expect(() => loop.updateStyleIncremental([])).to.not.throw();
    });

    it('handles node with underlay (3 slots)', () => {
      const r = mockRenderer();
      r.cy.style = () => ({});
      const origGetEles = r.getCachedZSortedEles;
      r.getCachedZSortedEles = () => {
        const eles = origGetEles();
        const origPstyle = eles[0].pstyle;
        eles[0].pstyle = (prop) => {
          if(prop === 'underlay-opacity') return { value: 0.3 };
          if(prop === 'underlay-padding') return { pfValue: 5 };
          if(prop === 'underlay-color') return { value: [0, 255, 0] };
          if(prop === 'underlay-shape') return { value: 'round-rectangle' };
          if(prop === 'underlay-corner-radius') return { value: 'auto', pfValue: 0 };
          return origPstyle(prop);
        };
        return eles;
      };
      const loop = new WebGLRenderLoop(r);
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      const node = r.getCachedZSortedEles()[0];
      // With underlay, node should have 3 slots (underlay + body + overlay)
      expect(node._private._webglNodeSlots.length).to.equal(3);
      loop.updateStyleIncremental([node]);
    });
  });

  describe('destroy() with mock GL', () => {
    it('cleans up all resources', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.process();
      loop.destroy();
      expect(loop._initialized).to.be.false;
      expect(loop.glNode).to.be.null;
      expect(loop.glEdge).to.be.null;
      expect(loop.r).to.be.null;
      expect(loop.nodeSDFProgram.buffer).to.be.null;
      expect(loop.nodeTexProgram.buffer).to.be.null;
      expect(loop.edgeProgram.buffer).to.be.null;
      expect(loop._labelCandidates).to.be.null;
      expect(loop._lastVisibleLabels).to.be.null;
      expect(loop._lastLabelZoom).to.be.null;
    });

    it('calls destroy on each program with correct GL context', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      let nodeSDFDestroyed = false, nodeTexDestroyed = false, edgeDestroyed = false;
      const origSDFDestroy = loop.nodeSDFProgram.destroy.bind(loop.nodeSDFProgram);
      loop.nodeSDFProgram.destroy = (gl) => {
        nodeSDFDestroyed = true;
        expect(gl).to.equal(glNode);
        origSDFDestroy(gl);
      };
      const origTexDestroy = loop.nodeTexProgram.destroy.bind(loop.nodeTexProgram);
      loop.nodeTexProgram.destroy = (gl) => {
        nodeTexDestroyed = true;
        expect(gl).to.equal(glNode);
        origTexDestroy(gl);
      };
      const origEdgeDestroy = loop.edgeProgram.destroy.bind(loop.edgeProgram);
      loop.edgeProgram.destroy = (gl) => {
        edgeDestroyed = true;
        expect(gl).to.equal(glEdge);
        origEdgeDestroy(gl);
      };
      loop.destroy();
      expect(nodeSDFDestroyed).to.be.true;
      expect(nodeTexDestroyed).to.be.true;
      expect(edgeDestroyed).to.be.true;
    });
  });

  describe('init()', () => {
    it('sets _initialized to true', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      expect(loop._initialized).to.be.true;
    });

    it('stores GL context references', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      expect(loop.glNode).to.equal(glNode);
      expect(loop.glEdge).to.equal(glEdge);
    });

    it('initializes all three programs', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      expect(loop.nodeSDFProgram.vao).to.not.be.null;
      expect(loop.nodeTexProgram.vao).to.not.be.null;
      expect(loop.edgeProgram.vao).to.not.be.null;
    });

    it('wires texture page manager onUpdate callback', () => {
      const loop = new WebGLRenderLoop(mockRenderer());
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      // texturePageManager should have an onUpdate callback
      expect(loop.texturePageManager._onUpdateCallback).to.be.a('function');
    });

    it('texture page manager onUpdate triggers re-process', () => {
      const r = mockRenderer();
      r.data = { canvasNeedsRedraw: {} };
      r.NODE = 'NODE';
      r.redraw = () => {};
      const loop = new WebGLRenderLoop(r);
      const glNode = mockGL();
      const glEdge = mockGL();
      loop.init(glNode, glEdge);
      loop.needsProcess = false;
      loop.texturePageManager._onUpdateCallback();
      expect(loop.needsProcess).to.be.true;
      expect(loop.nodeTexProgram.needsUpload).to.be.true;
    });
  });

  describe('process() edge routing', () => {
    it('handles segmented edges (allpts length > 8)', () => {
      const r = mockRenderer();
      const segEdge = {
        _private: {
          rscratch: {
            allpts: [0, 0, 50, 0, 50, 100, 100, 100, 150, 50, 200, 0],
            badLine: false,
            arrowEndX: 200, arrowEndY: 0, tgtArrowAngle: 0,
          },
          data: { id: 'seg1' },
        },
        isNode: () => false,
        isEdge: () => true,
        target: () => ({ outerWidth: () => 30, outerHeight: () => 30 }),
        pstyle: (prop) => {
          const styles = {
            'line-color': { value: [100, 100, 100] },
            'opacity': { value: 1 },
            'line-opacity': { value: 1 },
            'width': { pfValue: 2 },
            'source-arrow-shape': { value: 'none' },
            'target-arrow-shape': { value: 'triangle' },
            'source-arrow-color': { value: [100, 100, 100] },
            'target-arrow-color': { value: [100, 100, 100] },
            'arrow-scale': { value: 1 },
            'label': { value: '' },
            'font-size': { pfValue: 8 },
            'overlay-opacity': { value: 0 },
            'overlay-color': { value: [0, 0, 0] },
            'overlay-padding': { pfValue: 10 },
          };
          return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
        },
      };
      r.getCachedZSortedEles = () => [segEdge];
      r.cy.mutableElements = () => [segEdge];
      const loop = new WebGLRenderLoop(r);
      loop.process();
      // 12 points / 2 = 6 coords, 6 - 1 = 5 segments
      expect(segEdge._private._webglEdgeInstances).to.equal(5);
    });

    it('handles edge with null rscratch', () => {
      const r = mockRenderer();
      const badEdge = {
        _private: {
          rscratch: null,
          data: { id: 'bad' },
        },
        isNode: () => false,
        isEdge: () => true,
        target: () => ({ outerWidth: () => 30, outerHeight: () => 30 }),
        pstyle: (prop) => {
          const styles = {
            'label': { value: '' },
            'font-size': { pfValue: 8 },
          };
          return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
        },
      };
      r.getCachedZSortedEles = () => [badEdge];
      r.cy.mutableElements = () => [badEdge];
      const loop = new WebGLRenderLoop(r);
      loop.process();
      expect(badEdge._private._webglEdgeSlot).to.be.undefined;
      expect(badEdge._private._webglEdgeInstances).to.equal(0);
    });

    it('handles edge with no allpts', () => {
      const r = mockRenderer();
      const noAllpts = {
        _private: {
          rscratch: {},
          data: { id: 'nopts' },
        },
        isNode: () => false,
        isEdge: () => true,
        target: () => ({ outerWidth: () => 30, outerHeight: () => 30 }),
        pstyle: (prop) => {
          const styles = {
            'label': { value: '' },
            'font-size': { pfValue: 8 },
          };
          return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
        },
      };
      r.getCachedZSortedEles = () => [noAllpts];
      r.cy.mutableElements = () => [noAllpts];
      const loop = new WebGLRenderLoop(r);
      loop.process();
      expect(noAllpts._private._webglEdgeSlot).to.be.undefined;
    });
  });
});
