import { describe, it } from 'mocha';
import { expect } from 'chai';
import { packColor, unpackColor, packPremulColor } from '../../src/extensions/renderer/canvas/webgl/color-pack.mjs';

describe('Color Packing', () => {
  it('round-trips RGBA through float packing', () => {
    const packed = packColor(255, 128, 64, 200);
    expect(typeof packed).to.equal('number');
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(255);
    expect(g).to.equal(128);
    expect(b).to.equal(64);
    // Note: bit 24 masking may affect alpha slightly
    expect(a).to.be.closeTo(200, 1);
  });

  it('handles full opacity white', () => {
    const packed = packColor(255, 255, 255, 255);
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(255);
    expect(g).to.equal(255);
    expect(b).to.equal(255);
    // Alpha might be 254 due to bit masking
    expect(a).to.be.at.least(254);
  });

  it('handles transparent (0,0,0,0)', () => {
    const packed = packColor(0, 0, 0, 0);
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(0);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.equal(0);
  });

  it('handles pure red', () => {
    const packed = packColor(255, 0, 0, 255);
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(255);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
  });

  it('handles pure green', () => {
    const packed = packColor(0, 255, 0, 255);
    const [r, g, b, a] = unpackColor(packed);
    expect(g).to.equal(255);
    expect(r).to.equal(0);
    expect(b).to.equal(0);
  });

  it('handles pure blue', () => {
    const packed = packColor(0, 0, 255, 255);
    const [r, g, b, a] = unpackColor(packed);
    expect(b).to.equal(255);
    expect(r).to.equal(0);
    expect(g).to.equal(0);
  });

  it('packs premultiplied alpha color', () => {
    const packed = packPremulColor([200, 100, 50], 0.5);
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(100); // 200 * 0.5
    expect(g).to.equal(50);  // 100 * 0.5
    expect(b).to.equal(25);  // 50 * 0.5
    expect(a).to.be.closeTo(128, 1); // 255 * 0.5 ≈ 128
  });

  it('packPremulColor with full opacity', () => {
    const packed = packPremulColor([255, 128, 64], 1.0);
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(255);
    expect(g).to.equal(128);
    expect(b).to.equal(64);
    expect(a).to.be.at.least(254);
  });

  it('packPremulColor with zero opacity', () => {
    const packed = packPremulColor([255, 128, 64], 0.0);
    const [r, g, b, a] = unpackColor(packed);
    expect(r).to.equal(0);
    expect(g).to.equal(0);
    expect(b).to.equal(0);
    expect(a).to.equal(0);
  });

  it('produces a finite float (not NaN or Infinity)', () => {
    for(let i = 0; i < 256; i += 17) {
      const packed = packColor(i, 255 - i, i / 2, i);
      expect(isFinite(packed)).to.be.true;
      expect(isNaN(packed)).to.be.false;
    }
  });
});
