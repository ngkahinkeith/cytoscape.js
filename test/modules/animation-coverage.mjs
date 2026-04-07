import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import cytoscape from '../../src/index.mjs';

// ===========================================================================
// src/animation.mjs coverage
// ===========================================================================

describe('Animation (src/animation.mjs)', function () {
  let cy;

  beforeEach(function () {
    cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { data: { id: 'n1' }, position: { x: 0, y: 0 } },
        { data: { id: 'n2' }, position: { x: 100, y: 100 } }
      ],
      style: [
        { selector: 'node', style: { width: 30, height: 30 } }
      ]
    });
  });

  afterEach(function () { cy.destroy(); });

  describe('fastforward()', function () {
    it('sets progress to 1', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 5000
      });

      expect(ani.progress()).to.equal(0);
      ani.fastforward();
      expect(ani.progress()).to.equal(1);
    });

    it('completed() returns true after fastforward()', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 5000
      });

      ani.fastforward();
      expect(ani.completed()).to.be.true;
    });

    it('fastforward() is chainable', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 5000
      });

      const ret = ani.fastforward();
      expect(ret).to.equal(ani);
    });
  });

  describe('time() getter returns duration * progress', function () {
    it('time() at progress 0 returns 0', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      expect(ani.time()).to.equal(0); // 0 * 1000 = 0
    });

    it('time() after setting progress to 0.5 returns duration/2', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      ani.progress(0.5);
      expect(ani.time()).to.equal(500); // 0.5 * 1000
    });

    it('time() after fastforward returns full duration', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 2000
      });

      ani.fastforward();
      expect(ani.time()).to.equal(2000); // 1.0 * 2000
    });
  });

  describe('time(t) setter sets progress from time value', function () {
    it('time(t) sets progress to t/duration', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      ani.time(250);
      expect(ani.progress()).to.equal(0.25); // 250 / 1000
    });

    it('time(0) sets progress to 0', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      ani.progress(0.5);
      ani.time(0);
      expect(ani.progress()).to.equal(0);
    });

    it('time(duration) sets progress to 1', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 500
      });

      ani.time(500);
      expect(ani.progress()).to.equal(1);
    });

    it('time(t) is chainable', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      const ret = ani.time(100);
      expect(ret).to.equal(ani);
    });
  });

  describe('rewind() sets progress to 0', function () {
    it('rewind() resets progress', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      ani.progress(0.75);
      ani.rewind();
      expect(ani.progress()).to.equal(0);
    });
  });

  describe('stop() and pause()', function () {
    it('stop() marks animation as stopped', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      ani.play();
      expect(ani.playing()).to.be.true;
      ani.stop();
      expect(ani.playing()).to.be.false;
    });

    it('pause() marks animation as not playing', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      ani.play();
      ani.pause();
      expect(ani.playing()).to.be.false;
    });
  });

  describe('aliases', function () {
    it('complete is an alias for completed', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      expect(ani.complete).to.equal(ani.completed);
    });

    it('run is an alias for play', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      expect(ani.run).to.equal(ani.play);
    });

    it('running is an alias for playing', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      expect(ani.running).to.equal(ani.playing);
    });
  });

  describe('core animation', function () {
    it('core animation captures start pan and zoom', function () {
      const ani = cy.animation({
        zoom: 3,
        pan: { x: 100, y: 200 },
        duration: 1000
      });

      // The animation should capture start state
      expect(ani._private.startPan).to.deep.equal(cy.pan());
      expect(ani._private.startZoom).to.equal(cy.zoom());
    });
  });

  describe('instanceString()', function () {
    it('returns "animation"', function () {
      const ani = cy.$('#n1').animation({
        style: { width: 200 },
        duration: 1000
      });

      expect(ani.instanceString()).to.equal('animation');
    });
  });
});
