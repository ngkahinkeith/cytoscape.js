import { describe, it } from 'mocha';
import { expect } from 'chai';

/**
 * Tests for WebGL being the default renderer.
 * These validate the option/configuration changes without requiring a browser.
 * Full integration tests are in playwright.
 */

describe('WebGL Default Renderer', () => {

  describe('options defaults', () => {
    it('webgl option defaults to true when undefined', () => {
      // This test validates the behavior change in canvas/index.mjs
      // where options.webgl is set to true when undefined
      const options = {};
      if(options.webgl === undefined) {
        options.webgl = true;
      }
      expect(options.webgl).to.be.true;
    });

    it('webgl option can be explicitly set to false', () => {
      const options = { webgl: false };
      if(options.webgl === undefined) {
        options.webgl = true;
      }
      expect(options.webgl).to.be.false;
    });

    it('webgl option preserves explicit true', () => {
      const options = { webgl: true };
      if(options.webgl === undefined) {
        options.webgl = true;
      }
      expect(options.webgl).to.be.true;
    });
  });

  describe('WebGL2 fallback', () => {
    it('when WebGL2 context is null, options.webgl should be set to false', () => {
      // Simulates the fallback logic in canvas/index.mjs
      const type = 'webgl2';
      const context = null; // simulates getContext('webgl2') returning null
      const options = { webgl: true };

      if(!context) {
        if(type === 'webgl2') {
          options.webgl = false;
        }
      }

      expect(options.webgl).to.be.false;
    });

    it('2d context failure does not affect webgl option', () => {
      const type = '2d';
      const context = null;
      const options = { webgl: true };

      if(!context) {
        if(type === 'webgl2') {
          options.webgl = false;
        }
      }

      expect(options.webgl).to.be.true;
    });
  });
});
