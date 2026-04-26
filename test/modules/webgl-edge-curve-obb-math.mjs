import { describe, it } from 'mocha';
import { expect } from 'chai';

// Pure-JS reproduction of the Phase 3a OBB math from
// src/extensions/renderer/canvas/webgl/programs/edge-curve.mjs (VS lines ~92-127).
// Groups A-G test geometric correctness without importing any production code,
// so a regression in the JS reproducer here vs. the GLSL VS can be flagged by
// the shader-source-string assertions in webgl-edge-curve-program.mjs.

/**
 * JS reproducer of the VS OBB construction from edge-curve.mjs.
 * Mirrors the GLSL math byte-for-byte (mod FP precision).
 *
 * @param {Object} args
 * @param {number[]} args.vCpA - source point [x, y] in viewport pixels
 * @param {number[]} args.vCpB - control point [x, y] in viewport pixels
 * @param {number[]} args.vCpC - target point [x, y] in viewport pixels
 * @param {number}   args.padding - line width + AA margin (>= 0)
 * @param {number[]} args.aVertex - unit-quad vertex [x, y] in {0,1}^2
 * @returns {number[]} viewport-space position [x, y]
 */
function reproduceObbVS({ vCpA, vCpB, vCpC, padding, aVertex }) {
  const dx = vCpC[0] - vCpA[0];
  const dy = vCpC[1] - vCpA[1];
  const chordLen = Math.hypot(dx, dy);

  if(chordLen < 0.001) {
    // Self-loop AABB
    const minX = Math.min(vCpA[0], vCpB[0], vCpC[0]) - padding;
    const minY = Math.min(vCpA[1], vCpB[1], vCpC[1]) - padding;
    const maxX = Math.max(vCpA[0], vCpB[0], vCpC[0]) + padding;
    const maxY = Math.max(vCpA[1], vCpB[1], vCpC[1]) + padding;
    return [
      minX + (maxX - minX) * aVertex[0],
      minY + (maxY - minY) * aVertex[1],
    ];
  }

  // Chord-aligned OBB with asymmetric extents (Phase 3a)
  const chordDir = [dx / chordLen, dy / chordLen];
  const chordNorm = [-chordDir[1], chordDir[0]];
  const midX = (vCpA[0] + vCpC[0]) * 0.5;
  const midY = (vCpA[1] + vCpC[1]) * 0.5;
  const mx = vCpB[0] - midX;
  const my = vCpB[1] - midY;
  const perpOffset = mx * chordNorm[0] + my * chordNorm[1];

  const controlSideExtent = Math.abs(perpOffset) * 0.5 + padding;
  const farSideExtent = padding;

  const u = aVertex[1] - 0.5;
  const side = Math.sign(perpOffset);
  const vertExtent = u * side > 0 ? controlSideExtent : farSideExtent;
  const across = Math.sign(u) * vertExtent;

  const along = (aVertex[0] - 0.5) * (chordLen + 2.0 * padding);

  return [
    midX + chordDir[0] * along + chordNorm[0] * across,
    midY + chordDir[1] * along + chordNorm[1] * across,
  ];
}

/**
 * Build the 4-corner OBB by sampling reproduceObbVS at the unit-quad corners.
 * Returns corners in [(0,0), (1,0), (1,1), (0,1)] order.
 */
function buildObb(A, B, C, padding) {
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(av =>
    reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: av })
  );
}

/** Sample n+1 evenly-spaced points along the quadratic bezier B(t). */
function sampleBezier(A, B, C, n = 100) {
  const pts = [];
  for(let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * A[0] + 2 * u * t * B[0] + t * t * C[0],
      u * u * A[1] + 2 * u * t * B[1] + t * t * C[1],
    ]);
  }
  return pts;
}

/**
 * Test point-in-OBB using chord-aligned axes.
 * Phase 3a OBB has asymmetric across-chord extents.
 *
 * Returns true if point p is inside the OBB enclosing the bezier A-B-C with given padding.
 * For chordLen < 0.001, returns null (use AABB test instead).
 *
 * Tolerance EPS = 1e-6 to absorb FP rounding.
 */
function isInsideObb(p, A, C, padding, perpOffset, eps = 1e-6) {
  const dx = C[0] - A[0], dy = C[1] - A[1];
  const chordLen = Math.hypot(dx, dy);
  if(chordLen < 0.001) return null;
  const cdx = dx / chordLen, cdy = dy / chordLen;
  const nx = -cdy, ny = cdx;
  const midX = (A[0] + C[0]) * 0.5;
  const midY = (A[1] + C[1]) * 0.5;
  const dpX = p[0] - midX;
  const dpY = p[1] - midY;
  const along = dpX * cdx + dpY * cdy;
  const across = dpX * nx + dpY * ny;
  const halfAlong = chordLen / 2 + padding;
  const controlSide = Math.abs(perpOffset) / 2 + padding;
  const farSide = padding;

  if(Math.abs(along) > halfAlong + eps) return false;

  if(perpOffset > 0) {
    return across <= controlSide + eps && across >= -farSide - eps;
  } else if(perpOffset < 0) {
    return across <= farSide + eps && across >= -controlSide - eps;
  } else {
    return Math.abs(across) <= padding + eps;
  }
}

/** Compute perpOffset given source A, control B, target C in viewport pixels. */
function computePerpOffset(A, B, C) {
  const dx = C[0] - A[0], dy = C[1] - A[1];
  const chordLen = Math.hypot(dx, dy);
  if(chordLen < 0.001) return 0;
  const nx = -dy / chordLen, ny = dx / chordLen;
  const midX = (A[0] + C[0]) * 0.5, midY = (A[1] + C[1]) * 0.5;
  return (B[0] - midX) * nx + (B[1] - midY) * ny;
}

/** Polygon area via shoelace formula. */
function polygonArea(corners) {
  let s = 0;
  for(let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    s += corners[i][0] * corners[j][1] - corners[j][0] * corners[i][1];
  }
  return Math.abs(s) / 2;
}

// --------------------------------------------------------------------------
// Group A — VS reproducer self-tests (sanity)
// --------------------------------------------------------------------------
describe('OBB math — VS reproducer self-tests', () => {
  it('produces 4 distinct points for a normal bezier', () => {
    const obb = buildObb([0, 0], [50, 30], [100, 0], 4);
    expect(obb).to.have.lengthOf(4);
    // All 4 points should be distinct
    const set = new Set(obb.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`));
    expect(set.size).to.equal(4);
  });

  it('produces finite values (no NaN/Infinity)', () => {
    const obb = buildObb([0, 0], [50, 30], [100, 0], 4);
    for(const p of obb) {
      expect(Number.isFinite(p[0])).to.be.true;
      expect(Number.isFinite(p[1])).to.be.true;
    }
  });

  it('center of OBB is the chord midpoint along chord; offset across chord matches asymmetric extents', () => {
    const A = [0, 0], B = [50, 30], C = [100, 0], padding = 4;
    const obb = buildObb(A, B, C, padding);
    // Center = average of 4 corners; along-chord component should equal chord midpoint
    const cx = obb.reduce((s, p) => s + p[0], 0) / 4;
    const cy = obb.reduce((s, p) => s + p[1], 0) / 4;
    expect(cx).to.be.closeTo((A[0] + C[0]) / 2, 1e-6);
    // For the asymmetric OBB, mean across-chord coordinate is (controlSide - farSide)/2 along chordNorm.
    // controlSide = |perpOffset|/2 + padding, farSide = padding -> diff/2 = |perpOffset|/4.
    // Direction is sign(perpOffset). Here chord is along +x so chordNorm = (0, +1),
    // therefore mean y = sign(perpOffset) * |perpOffset|/4 = perpOffset/4.
    const perpOffset = computePerpOffset(A, B, C); // 30
    const expectedMeanY = perpOffset / 4; // 7.5
    expect(cy).to.be.closeTo(expectedMeanY, 1e-6);
  });
});

// --------------------------------------------------------------------------
// Group B — Bezier curve enclosure (the main test group)
// --------------------------------------------------------------------------
describe('OBB math — bezier curve enclosure', () => {
  const PADDING = 4;
  const SAMPLES = 200;

  function checkEnclosure(A, B, C, padding = PADDING) {
    const perpOffset = computePerpOffset(A, B, C);
    const samples = sampleBezier(A, B, C, SAMPLES);
    for(const p of samples) {
      const inside = isInsideObb(p, A, C, padding, perpOffset);
      expect(inside, `bezier point [${p[0].toFixed(2)}, ${p[1].toFixed(2)}] not enclosed by OBB (perpOffset=${perpOffset})`).to.be.true;
    }
  }

  it('encloses bezier with positive perpOffset, axis-aligned chord', () => {
    checkEnclosure([0, 0], [50, 30], [100, 0]);
  });

  it('encloses bezier with negative perpOffset, axis-aligned chord', () => {
    checkEnclosure([0, 0], [50, -30], [100, 0]);
  });

  it('encloses bezier with collinear A-B-C (perpOffset = 0)', () => {
    checkEnclosure([0, 0], [50, 0], [100, 0]);
  });

  it('encloses bezier with extreme curvature (perpOffset > chordLen)', () => {
    checkEnclosure([0, 0], [50, 200], [100, 0]);
  });

  it('encloses bezier with sub-pixel curvature (perpOffset < 1)', () => {
    checkEnclosure([0, 0], [50, 0.1], [100, 0]);
  });

  it('encloses bezier with non-axis-aligned chord (rotated)', () => {
    checkEnclosure([10, 20], [70, 90], [120, 60]);
  });

  it('encloses bezier with diagonal chord and large curvature', () => {
    checkEnclosure([0, 0], [40, 80], [100, 100]);
  });

  it('encloses bezier with control point on chord-far side (negative angle)', () => {
    checkEnclosure([0, 0], [50, -45], [100, 0]);
  });
});

// --------------------------------------------------------------------------
// Group C — Vertex position correctness
// --------------------------------------------------------------------------
describe('OBB math — vertex position correctness', () => {
  const padding = 4;

  it('positive perpOffset, axis-aligned: aVertex.y=0 vertices at y = -padding', () => {
    const A = [0, 0], B = [50, 30], C = [100, 0];
    const v00 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [0, 0] });
    const v10 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [1, 0] });
    expect(v00[1]).to.be.closeTo(-padding, 1e-6);
    expect(v10[1]).to.be.closeTo(-padding, 1e-6);
  });

  it('positive perpOffset, axis-aligned: aVertex.y=1 vertices at y = perpOffset/2 + padding', () => {
    const A = [0, 0], B = [50, 30], C = [100, 0];
    const expectedY = 30 / 2 + padding; // 19
    const v01 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [0, 1] });
    const v11 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [1, 1] });
    expect(v01[1]).to.be.closeTo(expectedY, 1e-6);
    expect(v11[1]).to.be.closeTo(expectedY, 1e-6);
  });

  it('negative perpOffset, axis-aligned: aVertex.y=0 vertices at y = -(|perpOffset|/2 + padding) (control side)', () => {
    const A = [0, 0], B = [50, -30], C = [100, 0];
    const expectedY = -(30 / 2 + padding); // -19
    const v00 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [0, 0] });
    const v10 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [1, 0] });
    expect(v00[1]).to.be.closeTo(expectedY, 1e-6);
    expect(v10[1]).to.be.closeTo(expectedY, 1e-6);
  });

  it('negative perpOffset, axis-aligned: aVertex.y=1 vertices at y = +padding (chord-far side)', () => {
    const A = [0, 0], B = [50, -30], C = [100, 0];
    const v01 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [0, 1] });
    const v11 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [1, 1] });
    expect(v01[1]).to.be.closeTo(padding, 1e-6);
    expect(v11[1]).to.be.closeTo(padding, 1e-6);
  });

  it('along-extent: aVertex.x=0 at midpoint - (chord/2 + padding), aVertex.x=1 at midpoint + (chord/2 + padding)', () => {
    const A = [0, 0], B = [50, 30], C = [100, 0];
    const expectedHalfAlong = 100 / 2 + padding; // 54
    const midX = 50;
    const v00 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [0, 0] });
    const v10 = reproduceObbVS({ vCpA: A, vCpB: B, vCpC: C, padding, aVertex: [1, 0] });
    expect(v00[0]).to.be.closeTo(midX - expectedHalfAlong, 1e-6);
    expect(v10[0]).to.be.closeTo(midX + expectedHalfAlong, 1e-6);
  });
});

// --------------------------------------------------------------------------
// Group D — Sign symmetry
// --------------------------------------------------------------------------
describe('OBB math — sign symmetry', () => {
  it('mirror perpOffset -> mirrored OBB y-coordinates (axis-aligned)', () => {
    const A = [0, 0], C = [100, 0], padding = 4;
    const positive = buildObb(A, [50, 30], C, padding);
    const negative = buildObb(A, [50, -30], C, padding);
    const positiveYs = positive.map(c => c[1]).sort((a, b) => a - b);
    const negativeYs = negative.map(c => c[1]).sort((a, b) => a - b);
    // negative's sorted ys should be the mirror of positive's: [-y3, -y2, -y1, -y0]
    expect(negativeYs[0]).to.be.closeTo(-positiveYs[3], 1e-6);
    expect(negativeYs[1]).to.be.closeTo(-positiveYs[2], 1e-6);
    expect(negativeYs[2]).to.be.closeTo(-positiveYs[1], 1e-6);
    expect(negativeYs[3]).to.be.closeTo(-positiveYs[0], 1e-6);
  });

  it('OBB area is identical for +/-perpOffset of equal magnitude', () => {
    const A = [0, 0], C = [100, 0], padding = 4;
    const a1 = polygonArea(buildObb(A, [50, 30], C, padding));
    const a2 = polygonArea(buildObb(A, [50, -30], C, padding));
    expect(a1).to.be.closeTo(a2, 1e-6);
  });

  it('OBB perimeter is identical for +/-perpOffset', () => {
    const A = [0, 0], C = [100, 0], padding = 4;
    function perim(corners) {
      let s = 0;
      for(let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        s += Math.hypot(corners[j][0] - corners[i][0], corners[j][1] - corners[i][1]);
      }
      return s;
    }
    expect(perim(buildObb(A, [50, 30], C, padding))).to.be.closeTo(perim(buildObb(A, [50, -30], C, padding)), 1e-6);
  });
});

// --------------------------------------------------------------------------
// Group E — Quantitative area reduction vs pre-Phase-3a algorithm
// --------------------------------------------------------------------------
describe('OBB math — area reduction vs pre-Phase-3a', () => {
  // Pre-Phase-3a (old) area derivation:
  //   halfAcross = |perpOffset|/2 + padding
  //   centerBias = perpOffset / 2
  //   At aVertex.y=1 (perpOffset > 0): perpOffset/2 + halfAcross = perpOffset + padding
  //   At aVertex.y=0: perpOffset/2 - halfAcross = -padding
  //   Total across-chord extent: |perpOffset| + 2*padding
  //   Total along-chord extent: chordLen + 2*padding (unchanged)
  //   Old area: (chordLen + 2*padding) * (|perpOffset| + 2*padding)
  //
  // New (Phase 3a):
  //   controlSide = |perpOffset|/2 + padding (extends only this much on control side)
  //   farSide = padding
  //   Total across-chord: |perpOffset|/2 + 2*padding
  //   New area: (chordLen + 2*padding) * (|perpOffset|/2 + 2*padding)
  function oldArea(chordLen, perpOffset, padding) {
    return (chordLen + 2 * padding) * (Math.abs(perpOffset) + 2 * padding);
  }
  function newArea(chordLen, perpOffset, padding) {
    return (chordLen + 2 * padding) * (Math.abs(perpOffset) / 2 + 2 * padding);
  }

  it('reduction is positive for nonzero perpOffset', () => {
    const old = oldArea(50, 30, 4);
    const neu = newArea(50, 30, 4);
    expect(neu).to.be.lessThan(old);
  });

  it('zero reduction at perpOffset = 0 (straight edge)', () => {
    expect(newArea(50, 0, 4)).to.equal(oldArea(50, 0, 4));
  });

  it('reduction grows monotonically with perpOffset', () => {
    const r1 = (oldArea(50, 5, 4) - newArea(50, 5, 4)) / oldArea(50, 5, 4);
    const r2 = (oldArea(50, 50, 4) - newArea(50, 50, 4)) / oldArea(50, 50, 4);
    expect(r2).to.be.greaterThan(r1);
  });

  it('asymptotic 50% reduction across-chord as perpOffset -> infinity', () => {
    const huge = 1e8;
    const ratio = newArea(50, huge, 4) / oldArea(50, huge, 4);
    expect(ratio).to.be.closeTo(0.5, 1e-6);
  });

  it('measured ~39% across-chord extent reduction at perpOffset = 30, padding = 4', () => {
    // Old across: 30 + 8 = 38
    // New across: 15 + 8 = 23
    // Reduction: 15/38 = 39.47%
    const oldAcross = 30 + 2 * 4;
    const newAcross = 30 / 2 + 2 * 4;
    expect((oldAcross - newAcross) / oldAcross).to.be.closeTo(0.395, 0.005);
  });

  it('OBB built from reproduceObbVS has exact expected area', () => {
    const A = [0, 0], B = [50, 30], C = [100, 0], padding = 4;
    const obb = buildObb(A, B, C, padding);
    const expected = newArea(100, 30, padding);
    expect(polygonArea(obb)).to.be.closeTo(expected, 1e-6);
  });
});

// --------------------------------------------------------------------------
// Group F — Edge cases
// --------------------------------------------------------------------------
describe('OBB math — edge cases', () => {
  it('perpOffset = exactly 0 produces symmetric padding-band OBB', () => {
    const A = [0, 0], B = [50, 0], C = [100, 0], padding = 4;
    const obb = buildObb(A, B, C, padding);
    const ys = obb.map(c => c[1]).sort((a, b) => a - b);
    expect(ys[0]).to.be.closeTo(-padding, 1e-6);
    expect(ys[1]).to.be.closeTo(-padding, 1e-6);
    expect(ys[2]).to.be.closeTo(padding, 1e-6);
    expect(ys[3]).to.be.closeTo(padding, 1e-6);
  });

  it('perpOffset = 1e-9 (FP near-zero) degrades smoothly', () => {
    const A = [0, 0], B = [50, 1e-9], C = [100, 0], padding = 4;
    const obb = buildObb(A, B, C, padding);
    const ys = obb.map(c => c[1]).sort((a, b) => a - b);
    // Lower extent should still be ~-padding (chord-far side)
    expect(ys[0]).to.be.closeTo(-padding, 1e-6);
    // Upper extent should be padding + tiny correction (control side)
    expect(ys[3]).to.be.closeTo(padding + 0.5e-9, 1e-6);
  });

  it('chordLen just above 0.001 threshold uses OBB path (not AABB)', () => {
    // chordLen ~= 0.001 + epsilon
    const A = [0, 0], B = [0.0006, 0.5], C = [0.0012, 0], padding = 4;
    const chordLen = Math.hypot(0.0012, 0);
    expect(chordLen).to.be.greaterThan(0.001);
    const obb = buildObb(A, B, C, padding);
    expect(obb).to.have.lengthOf(4);
    obb.forEach(p => {
      expect(Number.isFinite(p[0]), `x=${p[0]} not finite`).to.be.true;
      expect(Number.isFinite(p[1]), `y=${p[1]} not finite`).to.be.true;
    });
  });

  it('chordLen < 0.001 uses AABB self-loop path', () => {
    const A = [50, 50], B = [80, 20], C = [50, 50], padding = 4;
    const obb = buildObb(A, B, C, padding);
    const expectedMin = [Math.min(50, 80, 50) - padding, Math.min(50, 20, 50) - padding];
    const expectedMax = [Math.max(50, 80, 50) + padding, Math.max(50, 20, 50) + padding];
    // Corner [0,0] of unit quad -> minBound; [1,1] -> maxBound
    expect(obb[0]).to.deep.equal(expectedMin);
    expect(obb[2]).to.deep.equal(expectedMax);
  });

  it('extreme curvature (perpOffset = 1000): OBB still encloses bezier', () => {
    const A = [0, 0], B = [50, 1000], C = [100, 0], padding = 4;
    const perpOffset = computePerpOffset(A, B, C);
    const samples = sampleBezier(A, B, C, 100);
    for(const p of samples) {
      expect(isInsideObb(p, A, C, padding, perpOffset)).to.be.true;
    }
  });

  it('zero padding (degenerate): bezier still tightly enclosed', () => {
    const A = [0, 0], B = [50, 30], C = [100, 0], padding = 0;
    const perpOffset = computePerpOffset(A, B, C);
    const samples = sampleBezier(A, B, C, 100);
    for(const p of samples) {
      expect(isInsideObb(p, A, C, padding, perpOffset)).to.be.true;
    }
  });
});

// --------------------------------------------------------------------------
// Group G — Self-loop AABB enclosure (Plan Guardrail #1)
// --------------------------------------------------------------------------
describe('OBB math — self-loop AABB (Plan Guardrail #1)', () => {
  it('AABB encloses all 3 control points with padding margin', () => {
    const A = [50, 50], B = [80, 20], C = [50, 50], padding = 4;
    // For self-loop, OBB == AABB: bounded box around A, B, C with padding
    const minX = Math.min(50, 80, 50) - padding;
    const minY = Math.min(50, 20, 50) - padding;
    const maxX = Math.max(50, 80, 50) + padding;
    const maxY = Math.max(50, 20, 50) + padding;
    // sample bezier and verify enclosure
    const samples = sampleBezier(A, B, C, 50);
    for(const p of samples) {
      expect(p[0]).to.be.greaterThan(minX - 1e-6);
      expect(p[0]).to.be.lessThan(maxX + 1e-6);
      expect(p[1]).to.be.greaterThan(minY - 1e-6);
      expect(p[1]).to.be.lessThan(maxY + 1e-6);
    }
  });

  it('AABB corners match expected min/max + padding (no Phase 3a influence)', () => {
    const A = [50, 50], B = [80, 20], C = [50, 50], padding = 4;
    const obb = buildObb(A, B, C, padding);
    // minBound = (min(50,80,50) - 4, min(50,20,50) - 4) = (46, 16)
    // maxBound = (max(50,80,50) + 4, max(50,20,50) + 4) = (84, 54)
    const expectedCorners = [
      [46, 16], [84, 16], [84, 54], [46, 54], // unit-quad order: (0,0), (1,0), (1,1), (0,1)
    ];
    for(let i = 0; i < 4; i++) {
      expect(obb[i][0]).to.be.closeTo(expectedCorners[i][0], 1e-9);
      expect(obb[i][1]).to.be.closeTo(expectedCorners[i][1], 1e-9);
    }
  });

  it('coincident endpoints (chord exactly 0): falls into AABB path', () => {
    const A = [50, 50], B = [50, 50], C = [50, 50], padding = 4;
    const obb = buildObb(A, B, C, padding);
    // All 3 points coincident -> AABB is just a padded square at (50, 50)
    expect(obb[0]).to.deep.equal([46, 46]);
    expect(obb[2]).to.deep.equal([54, 54]);
  });
});
