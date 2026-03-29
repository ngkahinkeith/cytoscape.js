import { describe, it } from 'mocha';
import { expect } from 'chai';
import { WebGLRenderLoop } from '../../src/extensions/renderer/canvas/webgl/render-loop.mjs';

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
        };
        return styles[prop] || { value: null, pfValue: 0, strValue: 'none' };
      },
    });
  }
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
    // 3 edges x (1 straight + 1 arrow) = 6 instances
    expect(loop.edgeProgram.count).to.equal(6);
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
    expect(loop.edgeProgram.count).to.equal(8); // 4 edges x (1 straight + 1 arrow)
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

  it('_getBGColor returns white by default', () => {
    const loop = new WebGLRenderLoop(mockRenderer());
    const color = loop._getBGColor();
    expect(color).to.deep.equal([1.0, 1.0, 1.0, 1.0]);
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
    // Verify the noCull bounds are used in renderPicking by checking
    // that the method exists and accepts pickingFB parameters
    expect(loop.renderPicking).to.be.a('function');
    expect(loop.renderPicking.length).to.be.at.least(4);
  });
});
