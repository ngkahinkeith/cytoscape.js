import { describe, it } from 'mocha';
import { expect } from 'chai';
import { DirtyTracker } from '../../src/extensions/renderer/canvas/webgl/dirty-tracker.mjs';


describe('DirtyTracker', () => {

  describe('basic operations', () => {
    it('creates without errors', () => {
      const tracker = new DirtyTracker();
      expect(tracker).to.be.an.instanceOf(DirtyTracker);
    });

    it('starts with allDirty = true', () => {
      const tracker = new DirtyTracker();
      expect(tracker.shouldDoFullUpload()).to.be.true;
    });

    it('hasDirtyElements returns true initially', () => {
      const tracker = new DirtyTracker();
      expect(tracker.hasDirtyElements()).to.be.true;
    });
  });


  describe('markDirty', () => {
    it('marks single element dirty', () => {
      const tracker = new DirtyTracker();
      tracker.clear(); // reset allDirty
      tracker.markDirty('n1');
      expect(tracker.isDirty('n1')).to.be.true;
      expect(tracker.isDirty('n2')).to.be.false;
    });

    it('tracks multiple dirty elements', () => {
      const tracker = new DirtyTracker();
      tracker.clear();
      tracker.markDirty('n1');
      tracker.markDirty('n2');
      tracker.markDirty('n3');
      expect(tracker.getDirtyCount()).to.equal(3);
    });

    it('deduplicates IDs', () => {
      const tracker = new DirtyTracker();
      tracker.clear();
      tracker.markDirty('n1');
      tracker.markDirty('n1');
      expect(tracker.getDirtyCount()).to.equal(1);
    });
  });


  describe('markAllDirty', () => {
    it('forces full upload', () => {
      const tracker = new DirtyTracker();
      tracker.clear();
      tracker.markAllDirty();
      expect(tracker.shouldDoFullUpload()).to.be.true;
    });

    it('makes isDirty return true for any element', () => {
      const tracker = new DirtyTracker();
      tracker.clear();
      tracker.markAllDirty();
      expect(tracker.isDirty('anything')).to.be.true;
    });
  });


  describe('shouldDoFullUpload', () => {
    it('returns true when allDirty', () => {
      const tracker = new DirtyTracker();
      expect(tracker.shouldDoFullUpload()).to.be.true;
    });

    it('returns false after clear with no dirty elements', () => {
      const tracker = new DirtyTracker();
      tracker.setTotalElements(100);
      tracker.clear();
      expect(tracker.shouldDoFullUpload()).to.be.false;
    });

    it('returns true when >10% of elements are dirty', () => {
      const tracker = new DirtyTracker();
      tracker.setTotalElements(100);
      tracker.clear();
      for(let i = 0; i < 11; i++) {
        tracker.markDirty(`n${i}`);
      }
      expect(tracker.shouldDoFullUpload()).to.be.true;
    });

    it('returns false when <10% of elements are dirty', () => {
      const tracker = new DirtyTracker();
      tracker.setTotalElements(100);
      tracker.clear();
      for(let i = 0; i < 5; i++) {
        tracker.markDirty(`n${i}`);
      }
      expect(tracker.shouldDoFullUpload()).to.be.false;
    });

    it('returns true when totalElements is 0', () => {
      const tracker = new DirtyTracker();
      tracker.setTotalElements(0);
      tracker.clear();
      expect(tracker.shouldDoFullUpload()).to.be.true;
    });
  });


  describe('clear', () => {
    it('clears all dirty state', () => {
      const tracker = new DirtyTracker();
      tracker.setTotalElements(100);
      tracker.markDirty('n1');
      tracker.markDirty('n2');
      tracker.clear();
      expect(tracker.getDirtyCount()).to.equal(0);
      expect(tracker.hasDirtyElements()).to.be.false;
      expect(tracker.shouldDoFullUpload()).to.be.false;
    });
  });


  describe('steady-state pan/zoom scenario', () => {
    it('no dirty elements after clear = zero buffer uploads needed', () => {
      const tracker = new DirtyTracker();
      tracker.setTotalElements(100000);

      // First frame: full upload
      expect(tracker.shouldDoFullUpload()).to.be.true;
      tracker.clear();

      // Subsequent frames (pan/zoom only): no uploads
      expect(tracker.hasDirtyElements()).to.be.false;
      expect(tracker.shouldDoFullUpload()).to.be.false;
      expect(tracker.getDirtyCount()).to.equal(0);
    });
  });


  describe('single element drag scenario', () => {
    it('only one element dirty during drag', () => {
      const tracker = new DirtyTracker();
      tracker.setTotalElements(100000);
      tracker.clear();

      // User drags one node
      tracker.markDirty('n42');

      expect(tracker.hasDirtyElements()).to.be.true;
      expect(tracker.shouldDoFullUpload()).to.be.false;
      expect(tracker.getDirtyCount()).to.equal(1);
      expect(tracker.isDirty('n42')).to.be.true;
      expect(tracker.isDirty('n1')).to.be.false;
    });
  });
});
