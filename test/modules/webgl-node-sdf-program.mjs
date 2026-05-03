import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  NodeSDFProgram, NODE_STRIDE, SHAPE_ENUM,
  NODE_LOD, computeNodeSimplifyLevel,
  VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE, FRAGMENT_SHADER_PICKING_SOURCE,
} from '../../src/extensions/renderer/canvas/webgl/programs/node-sdf.mjs';
import { unpackColor } from '../../src/extensions/renderer/canvas/webgl/color-pack.mjs';

// Mock node
function mockNode(opts = {}) {
  return {
    position: () => ({ x: opts.x || 0, y: opts.y || 0 }),
    outerWidth: () => opts.w || 30,
    outerHeight: () => opts.h || 30,
    pstyle: (prop) => {
      const styles = {
        'background-color': { value: opts.bgColor || [255, 0, 0] },
        'background-opacity': { value: opts.bgOpacity !== undefined ? opts.bgOpacity : 1 },
        'border-width': { value: opts.borderWidth || 0 },
        'border-color': { value: opts.borderColor || [0, 0, 0] },
        'border-opacity': { value: opts.borderOpacity !== undefined ? opts.borderOpacity : 1 },
        'border-position': { value: opts.borderPos || 'center' },
        'shape': { value: opts.shape || 'ellipse' },
        'corner-radius': { value: opts.cornerRadius || 'auto', pfValue: opts.cornerRadiusPx || 0 },
      };
      return styles[prop] || { value: null, pfValue: 0 };
    },
  };
}

describe('NodeSDFProgram', () => {
  it('NODE_STRIDE is 11', () => {
    expect(NODE_STRIDE).to.equal(11);
  });

  it('SHAPE_ENUM maps all shapes', () => {
    expect(SHAPE_ENUM['rectangle']).to.equal(0);
    expect(SHAPE_ENUM['square']).to.equal(0);
    expect(SHAPE_ENUM['ellipse']).to.equal(3);
    expect(SHAPE_ENUM['triangle']).to.equal(4);
    expect(SHAPE_ENUM['star']).to.equal(10);
    expect(SHAPE_ENUM['round-rectangle']).to.equal(1);
    expect(SHAPE_ENUM['roundrectangle']).to.equal(1);
    expect(SHAPE_ENUM['bottom-round-rectangle']).to.equal(2);
    expect(SHAPE_ENUM['bottomroundrectangle']).to.equal(2);
    expect(SHAPE_ENUM['diamond']).to.equal(5);
    expect(SHAPE_ENUM['pentagon']).to.equal(6);
    expect(SHAPE_ENUM['hexagon']).to.equal(7);
    expect(SHAPE_ENUM['heptagon']).to.equal(8);
    expect(SHAPE_ENUM['octagon']).to.equal(9);
    expect(SHAPE_ENUM['tag']).to.equal(11);
    expect(SHAPE_ENUM['vee']).to.equal(12);
    expect(SHAPE_ENUM['rhomboid']).to.equal(13);
    expect(SHAPE_ENUM['barrel']).to.equal(14);
    expect(SHAPE_ENUM['cut-rectangle']).to.equal(15);
    expect(SHAPE_ENUM['cutrectangle']).to.equal(15);
    expect(SHAPE_ENUM['concave-hexagon']).to.equal(16);
    expect(SHAPE_ENUM['concavehexagon']).to.equal(16);
  });

  it('processNode packs position correctly', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 100, y: 200 }), 0);
    expect(prog.buffer[0]).to.equal(100);
    expect(prog.buffer[1]).to.equal(200);
  });

  it('processNode packs size correctly', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ w: 40, h: 50 }), 0);
    expect(prog.buffer[2]).to.equal(40);
    expect(prog.buffer[3]).to.equal(50);
  });

  it('processNode packs color as packed float', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ bgColor: [255, 0, 0], bgOpacity: 1.0 }), 0);
    const packed = prog.buffer[4];
    expect(typeof packed).to.equal('number');
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(255);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.be.at.least(254);
  });

  it('processNode packs border properties', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ borderWidth: 3, borderColor: [0, 0, 255], borderOpacity: 0.5 }), 0);
    expect(prog.buffer[6]).to.equal(3); // border width
    const [r, g, b, a] = unpackColor(prog.buffer[5]); // border color
    expect(b).to.be.greaterThan(0);
  });

  it('processNode packs zero border as transparent color', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ borderWidth: 0 }), 0);
    const [r, g, b, a] = unpackColor(prog.buffer[5]);
    expect(r).to.equal(0);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.equal(0);
  });

  it('processNode packs zero border opacity as transparent color', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ borderWidth: 3, borderOpacity: 0 }), 0);
    const [r, g, b, a] = unpackColor(prog.buffer[5]);
    expect(r).to.equal(0);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.equal(0);
  });

  it('processNode packs shape enum', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ shape: 'hexagon' }), 0);
    expect(prog.buffer[7]).to.equal(SHAPE_ENUM['hexagon']);
  });

  it('processNode packs unknown shape as 0 (rectangle)', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ shape: 'unknown-shape' }), 0);
    expect(prog.buffer[7]).to.equal(0);
  });

  it('processNode packs corner radius', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ cornerRadius: 10, cornerRadiusPx: 10 }), 0);
    expect(prog.buffer[8]).to.equal(10);
  });

  it('processNode resolves auto corner radius via getRoundRectangleRadius', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    // outerWidth=30, outerHeight=30 → getRoundRectangleRadius(30, 30) = min(7.5, 7.5, 8) = 7.5
    prog.processNode(0, mockNode({ cornerRadius: 'auto' }), 0);
    expect(prog.buffer[8]).to.equal(7.5);
  });

  it('processNode packs border position', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;

    prog.processNode(0, mockNode({ borderPos: 'inside' }), 0);
    expect(prog.buffer[9]).to.equal(1);

    prog.processNode(0, mockNode({ borderPos: 'outside' }), 0);
    expect(prog.buffer[9]).to.equal(2);

    prog.processNode(0, mockNode({ borderPos: 'center' }), 0);
    expect(prog.buffer[9]).to.equal(0);
  });

  it('processNode packs pick index', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode(), 42);
    const [r, g, b, a] = unpackColor(prog.buffer[10]);
    expect(r).to.equal(42);
    expect(g).to.equal(0);
  });

  it('processNode packs large pick index across bytes', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    const idx = 256 + 42; // 42 in second byte, 0+42 in first
    prog.processNode(0, mockNode(), idx);
    const [r, g, b, a] = unpackColor(prog.buffer[10]);
    expect(r).to.equal(idx & 0xFF);       // 42
    expect(g).to.equal((idx >> 8) & 0xFF); // 1
  });

  it('reallocate grows buffer and preserves data', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(10);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 99, y: 88 }), 0);
    prog.reallocate(100);
    expect(prog.buffer[0]).to.equal(99);
    expect(prog.buffer[1]).to.equal(88);
    expect(prog.capacity).to.be.at.least(100);
  });

  it('reallocate does not shrink', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(100);
    const cap = prog.capacity;
    prog.reallocate(50); // should be a no-op
    expect(prog.capacity).to.equal(cap);
  });

  it('reallocate sets needsUpload', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(10);
    expect(prog.needsUpload).to.be.true;
  });

  it('reallocate minimum capacity is 256', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    expect(prog.capacity).to.be.at.least(256);
  });

  it('updatePosition changes only x,y', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 10, y: 20, w: 30, h: 40 }), 0);
    prog.updatePosition(0, 50, 60);
    expect(prog.buffer[0]).to.equal(50);
    expect(prog.buffer[1]).to.equal(60);
    expect(prog.buffer[2]).to.equal(30); // size unchanged
    expect(prog.buffer[3]).to.equal(40);
  });

  it('updatePosition sets needsUpload', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ x: 10, y: 20 }), 0);
    prog.needsUpload = false;
    prog.updatePosition(0, 50, 60);
    expect(prog.needsUpload).to.be.true;
  });

  it('processNode handles 1000 nodes', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1000);
    prog.count = 1000;
    for(let i = 0; i < 1000; i++) {
      prog.processNode(i, mockNode({ x: i, y: i * 2 }), i);
    }
    expect(prog.buffer[0]).to.equal(0);
    expect(prog.buffer[999 * NODE_STRIDE]).to.equal(999);
    expect(prog.buffer[999 * NODE_STRIDE + 1]).to.equal(1998);
  });

  it('processNode packs all shape types', () => {
    const prog = new NodeSDFProgram();
    const shapes = Object.keys(SHAPE_ENUM);
    prog.reallocate(shapes.length);
    prog.count = shapes.length;
    shapes.forEach((shape, i) => {
      prog.processNode(i, mockNode({ shape }), i);
      expect(prog.buffer[i * NODE_STRIDE + 7]).to.equal(SHAPE_ENUM[shape]);
    });
  });

  it('processNode packs premultiplied colors correctly with half opacity', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(1);
    prog.count = 1;
    prog.processNode(0, mockNode({ bgColor: [200, 100, 50], bgOpacity: 0.5 }), 0);
    const [r, g, b, a] = unpackColor(prog.buffer[4]);
    expect(r).to.equal(100); // 200 * 0.5
    expect(g).to.equal(50);  // 100 * 0.5
    expect(b).to.equal(25);  // 50 * 0.5
    expect(a).to.be.closeTo(128, 1); // 255 * 0.5
  });

  it('buffer layout matches NODE_STRIDE offsets', () => {
    const prog = new NodeSDFProgram();
    prog.reallocate(2);
    prog.count = 2;
    prog.processNode(0, mockNode({ x: 1, y: 2, w: 3, h: 4 }), 0);
    prog.processNode(1, mockNode({ x: 10, y: 20, w: 30, h: 40 }), 1);
    // Second node starts at offset NODE_STRIDE
    expect(prog.buffer[NODE_STRIDE + 0]).to.equal(10);
    expect(prog.buffer[NODE_STRIDE + 1]).to.equal(20);
    expect(prog.buffer[NODE_STRIDE + 2]).to.equal(30);
    expect(prog.buffer[NODE_STRIDE + 3]).to.equal(40);
  });
});


describe('Per-node graded LOD ("per-element pixel ratio")', () => {

  describe('NODE_LOD thresholds', () => {
    it('exposes a frozen object with the three breakpoints', () => {
      expect(NODE_LOD).to.have.property('CULL_PX');
      expect(NODE_LOD).to.have.property('TIER_2_MAX_PX');
      expect(NODE_LOD).to.have.property('TIER_1_MAX_PX');
      expect(Object.isFrozen(NODE_LOD)).to.be.true;
    });

    it('thresholds are strictly increasing', () => {
      expect(NODE_LOD.CULL_PX).to.be.lessThan(NODE_LOD.TIER_2_MAX_PX);
      expect(NODE_LOD.TIER_2_MAX_PX).to.be.lessThan(NODE_LOD.TIER_1_MAX_PX);
    });
  });

  describe('computeNodeSimplifyLevel — boundaries', () => {
    it('returns -1 (cull) below CULL_PX', () => {
      expect(computeNodeSimplifyLevel(10, 0.3)).to.equal(-1);
      expect(computeNodeSimplifyLevel(NODE_LOD.CULL_PX - 0.1, 1)).to.equal(-1);
    });

    it('returns 2 (flat fill) at CULL_PX through just under TIER_2_MAX_PX', () => {
      expect(computeNodeSimplifyLevel(NODE_LOD.CULL_PX, 1)).to.equal(2);
      expect(computeNodeSimplifyLevel(NODE_LOD.TIER_2_MAX_PX - 0.1, 1)).to.equal(2);
      expect(computeNodeSimplifyLevel(30, 0.2)).to.equal(2); // 6 px
    });

    it('returns 1 (solid border, no AA) from TIER_2_MAX_PX through just under TIER_1_MAX_PX', () => {
      expect(computeNodeSimplifyLevel(NODE_LOD.TIER_2_MAX_PX, 1)).to.equal(1);
      expect(computeNodeSimplifyLevel(NODE_LOD.TIER_1_MAX_PX - 0.1, 1)).to.equal(1);
      expect(computeNodeSimplifyLevel(30, 0.5)).to.equal(1); // 15 px
    });

    it('returns 0 (full quality) at and above TIER_1_MAX_PX', () => {
      expect(computeNodeSimplifyLevel(NODE_LOD.TIER_1_MAX_PX, 1)).to.equal(0);
      expect(computeNodeSimplifyLevel(30, 1.0)).to.equal(0);
      expect(computeNodeSimplifyLevel(100, 4.0)).to.equal(0);
    });
  });

  describe('picking-pass override', () => {
    const PICKING_ZOOM = 1e6;

    it('forces tier 0 even for tiny nodes during picking', () => {
      expect(computeNodeSimplifyLevel(0.01, PICKING_ZOOM)).to.equal(0);
      expect(computeNodeSimplifyLevel(1, PICKING_ZOOM)).to.equal(0);
      expect(computeNodeSimplifyLevel(10, PICKING_ZOOM)).to.equal(0);
    });

    it('still culls truly degenerate nodes (size = 0)', () => {
      expect(computeNodeSimplifyLevel(0, PICKING_ZOOM)).to.equal(-1);
    });
  });

  describe('GLSL ↔ JS threshold parity', () => {
    it('vertex shader contains the cull threshold', () => {
      expect(VERTEX_SHADER_SOURCE).to.include(`screenSize < ${NODE_LOD.CULL_PX}.0`);
    });

    it('vertex shader contains the tier-2 threshold', () => {
      expect(VERTEX_SHADER_SOURCE).to.include(`screenSize < ${NODE_LOD.TIER_2_MAX_PX}.0`);
    });

    it('vertex shader contains the tier-1 threshold', () => {
      expect(VERTEX_SHADER_SOURCE).to.include(`screenSize < ${NODE_LOD.TIER_1_MAX_PX}.0`);
    });

    it('vertex shader declares vSimplifyLevel as a flat-out int', () => {
      expect(VERTEX_SHADER_SOURCE).to.match(/flat\s+out\s+int\s+vSimplifyLevel\s*;/);
    });

    it('fragment shader declares vSimplifyLevel as a flat-in int', () => {
      expect(FRAGMENT_SHADER_SOURCE).to.match(/flat\s+in\s+int\s+vSimplifyLevel\s*;/);
    });

    it('fragment shader branches on vSimplifyLevel == 2 and == 1', () => {
      expect(FRAGMENT_SHADER_SOURCE).to.include('vSimplifyLevel == 2');
      expect(FRAGMENT_SHADER_SOURCE).to.include('vSimplifyLevel == 1');
    });

    it('picking fragment shader still re-evaluates the full SDF (does not branch on tier)', () => {
      expect(FRAGMENT_SHADER_PICKING_SOURCE).to.include('#define PICKING_MODE');
      expect(FRAGMENT_SHADER_PICKING_SOURCE).to.match(
        /#ifdef PICKING_MODE[\s\S]*?computeSDF\s*\([\s\S]*?#endif/
      );
    });
  });
});
