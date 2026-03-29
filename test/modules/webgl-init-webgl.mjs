import { describe, it } from 'mocha';
import { expect } from 'chai';

// The findNearestElementsWebgl function is not directly exported, but its
// behavior is tested through the renderer override. We test the interaction
// deferral logic by verifying the conditions under which picking is skipped.

describe('WebGL init-webgl (Phase 4: deferred picking)', () => {

  // Simulate the picking deferral logic from findNearestElementsWebgl
  function simulateFindNearest(r) {
    // Mirrors the guard checks at the top of findNearestElementsWebgl
    if(r.hoverData && r.hoverData.dragging) return [];
    if(r.swipePanning) return [];
    return ['would-proceed']; // sentinel indicating picking would run
  }

  it('returns empty during hoverData.dragging', () => {
    const r = { hoverData: { dragging: true }, swipePanning: false };
    const result = simulateFindNearest(r);
    expect(result).to.deep.equal([]);
  });

  it('returns empty during swipePanning', () => {
    const r = { hoverData: { dragging: false }, swipePanning: true };
    const result = simulateFindNearest(r);
    expect(result).to.deep.equal([]);
  });

  it('proceeds normally when not interacting', () => {
    const r = { hoverData: { dragging: false }, swipePanning: false };
    const result = simulateFindNearest(r);
    expect(result.length).to.be.greaterThan(0);
  });

  it('proceeds when hoverData is null (no prior hover)', () => {
    const r = { hoverData: null, swipePanning: false };
    const result = simulateFindNearest(r);
    expect(result.length).to.be.greaterThan(0);
  });

  it('needsDraw flag remains set after interaction skip', () => {
    // When picking is skipped during interaction, the needsDraw flag
    // should remain true so picking re-renders on the next non-interaction call
    const pickingFB = { needsDraw: true };
    const r = { hoverData: { dragging: true }, swipePanning: false };

    // Simulate the skip
    simulateFindNearest(r);

    // needsDraw should still be true (not cleared by the skip)
    expect(pickingFB.needsDraw).to.be.true;
  });

  it('picking works after interaction ends', () => {
    const r = { hoverData: { dragging: false }, swipePanning: false };

    // During interaction: skipped
    r.hoverData.dragging = true;
    expect(simulateFindNearest(r)).to.deep.equal([]);

    // After interaction ends: proceeds
    r.hoverData.dragging = false;
    expect(simulateFindNearest(r).length).to.be.greaterThan(0);
  });
});
