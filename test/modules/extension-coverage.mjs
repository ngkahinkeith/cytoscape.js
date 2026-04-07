import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import cytoscape from '../../src/index.mjs';

// ===========================================================================
// src/extension.mjs coverage
// ===========================================================================

describe('Extension (src/extension.mjs)', function () {

  describe('Prototype pollution guard', function () {
    it('registering type __proto__ throws an error', function () {
      expect(function () {
        cytoscape('__proto__', 'evil', function () {});
      }).to.throw(/illegal type/);
    });

    it('registering type constructor throws an error', function () {
      expect(function () {
        cytoscape('constructor', 'evil', function () {});
      }).to.throw(/illegal type/);
    });

    it('registering type prototype throws an error', function () {
      expect(function () {
        cytoscape('prototype', 'evil', function () {});
      }).to.throw(/illegal type/);
    });
  });

  describe('Layout extension auto-generates start() from run()', function () {
    it('layout with only run() gets a start() method', function () {
      function MyLayout(options) {
        this.options = options;
      }
      MyLayout.prototype.run = function () {
        this.options.eles.nodes().layoutPositions(this, this.options, function () {
          return { x: 0, y: 0 };
        });
        return this;
      };

      cytoscape('layout', 'testAutoStart', MyLayout);
      const cy = cytoscape({ headless: true, elements: [{ data: { id: 'n1' } }] });
      const layout = cy.layout({ name: 'testAutoStart' });

      // start() should exist and be callable
      expect(layout.start).to.be.a('function');
      layout.start();
      cy.destroy();
    });

    it('layout with only start() gets a run() method', function () {
      function MyLayout2(options) {
        this.options = options;
      }
      MyLayout2.prototype.start = function () {
        this.options.eles.nodes().layoutPositions(this, this.options, function () {
          return { x: 5, y: 5 };
        });
        return this;
      };

      cytoscape('layout', 'testAutoRun', MyLayout2);
      const cy = cytoscape({ headless: true, elements: [{ data: { id: 'n1' } }] });
      const layout = cy.layout({ name: 'testAutoRun' });

      expect(layout.run).to.be.a('function');
      layout.run();
      cy.destroy();
    });
  });

  describe('Layout extension stop() stops animations', function () {
    it('stop() emits layoutstop when no custom stop is defined', function () {
      function StopLayout(options) {
        this.options = options;
      }
      StopLayout.prototype.run = function () {
        return this;
      };

      cytoscape('layout', 'testStop', StopLayout);
      const cy = cytoscape({ headless: true, elements: [{ data: { id: 'n1' } }] });
      const layout = cy.layout({ name: 'testStop' });

      let stopped = false;
      layout.on('layoutstop', function () { stopped = true; });
      layout.run();
      layout.stop();
      expect(stopped).to.be.true;
      cy.destroy();
    });

    it('stop() calls the custom stop function when defined', function () {
      let customStopCalled = false;

      function StopLayout2(options) {
        this.options = options;
      }
      StopLayout2.prototype.run = function () {
        return this;
      };
      StopLayout2.prototype.stop = function () {
        customStopCalled = true;
      };

      cytoscape('layout', 'testStopCustom', StopLayout2);
      const cy = cytoscape({ headless: true, elements: [{ data: { id: 'n1' } }] });
      const layout = cy.layout({ name: 'testStopCustom' });
      layout.run();
      layout.stop();
      expect(customStopCalled).to.be.true;
      cy.destroy();
    });
  });

  describe('getExtension(type, name)', function () {
    it('retrieves a registered layout extension', function () {
      function GetLayout(options) {
        this.options = options;
      }
      GetLayout.prototype.run = function () { return this; };

      cytoscape('layout', 'testGetExt', GetLayout);
      const ext = cytoscape('layout', 'testGetExt');
      expect(ext).to.be.a('function');
    });

    it('returns undefined for unregistered extension', function () {
      const ext = cytoscape('layout', 'nonexistent_layout_xyz');
      expect(ext).to.be.undefined;
    });

    it('retrieves a core extension', function () {
      cytoscape('core', 'testCoreGet123', function () { return 42; });
      const cy = cytoscape({ headless: true });
      expect(cy.testCoreGet123()).to.equal(42);
      cy.destroy();
    });

    it('retrieves a collection extension', function () {
      cytoscape('collection', 'testCollGet123', function () { return 99; });
      const cy = cytoscape({ headless: true, elements: [{ data: { id: 'n' } }] });
      expect(cy.nodes().testCollGet123()).to.equal(99);
      cy.destroy();
    });
  });

  describe('Module get/set (4-arg and 5-arg calls)', function () {
    it('5-arg call sets a module, 4-arg call gets it', function () {
      const impl = { draw: function () {} };
      cytoscape('renderer', 'testMod', 'nodeShape', 'star', impl);
      const retrieved = cytoscape('renderer', 'testMod', 'nodeShape', 'star');
      expect(retrieved).to.equal(impl);
    });

    it('4-arg get returns undefined for unregistered module', function () {
      const retrieved = cytoscape('renderer', 'testMod', 'nodeShape', 'nonexistent_xyz');
      expect(retrieved).to.be.undefined;
    });
  });

  describe('Layout extension has destroy() and cy()', function () {
    it('layout has destroy() method', function () {
      function DestroyLayout(options) {
        this.options = options;
      }
      DestroyLayout.prototype.run = function () { return this; };

      cytoscape('layout', 'testDestroy', DestroyLayout);
      const cy = cytoscape({ headless: true, elements: [{ data: { id: 'n1' } }] });
      const layout = cy.layout({ name: 'testDestroy' });
      expect(layout.destroy).to.be.a('function');
      expect(layout.destroy()).to.equal(layout); // returns this
      cy.destroy();
    });

    it('layout.cy() returns the cytoscape instance', function () {
      function CyLayout(options) {
        this.options = options;
      }
      CyLayout.prototype.run = function () { return this; };

      cytoscape('layout', 'testCyRef', CyLayout);
      const cy = cytoscape({ headless: true, elements: [{ data: { id: 'n1' } }] });
      const layout = cy.layout({ name: 'testCyRef' });
      expect(layout.cy()).to.equal(cy);
      cy.destroy();
    });
  });
});
