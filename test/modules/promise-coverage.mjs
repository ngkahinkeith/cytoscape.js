import { describe, it } from 'mocha';
import { expect } from 'chai';

// Import the internal Thenable/Promise implementation.
// The module exports native Promise if available, but we test via the public
// API which uses the same semantics.
import Promise from '../../src/promise.mjs';

describe('Promise utilities (src/promise.mjs)', function () {

  it('exports a constructor (native Promise or polyfill)', function () {
    expect(Promise).to.be.a('function');
  });

  describe('Promise.resolve', function () {
    it('resolves with the given value', function (done) {
      Promise.resolve(42).then(function (val) {
        expect(val).to.equal(42);
        done();
      });
    });

    it('resolves with undefined when no value given', function (done) {
      Promise.resolve().then(function (val) {
        expect(val).to.be.undefined;
        done();
      });
    });

    it('resolves with a string', function (done) {
      Promise.resolve('hello').then(function (val) {
        expect(val).to.equal('hello');
        done();
      });
    });

    it('resolves with an object', function (done) {
      var obj = { a: 1 };
      Promise.resolve(obj).then(function (val) {
        expect(val).to.equal(obj);
        done();
      });
    });
  });

  describe('Promise.reject', function () {
    it('rejects with the given reason', function (done) {
      Promise.reject('err').then(null, function (reason) {
        expect(reason).to.equal('err');
        done();
      });
    });

    it('rejects with an Error object', function (done) {
      var error = new Error('boom');
      Promise.reject(error).then(null, function (reason) {
        expect(reason).to.equal(error);
        done();
      });
    });
  });

  describe('then chaining', function () {
    it('chains resolved values', function (done) {
      Promise.resolve(1)
        .then(function (v) { return v + 1; })
        .then(function (v) { return v * 3; })
        .then(function (v) {
          expect(v).to.equal(6);
          done();
        });
    });

    it('catches errors thrown in then', function (done) {
      Promise.resolve('ok')
        .then(function () { throw new Error('fail'); })
        .then(null, function (err) {
          expect(err).to.be.an.instanceOf(Error);
          expect(err.message).to.equal('fail');
          done();
        });
    });

    it('skips onFulfilled and calls onRejected on rejection', function (done) {
      Promise.reject('bad')
        .then(function () {
          done(new Error('should not be called'));
        }, function (reason) {
          expect(reason).to.equal('bad');
          done();
        });
    });

    it('recovery in onRejected resumes fulfilled chain', function (done) {
      Promise.reject('err')
        .then(null, function () { return 'recovered'; })
        .then(function (val) {
          expect(val).to.equal('recovered');
          done();
        });
    });
  });

  describe('Promise.all', function () {
    it('resolves with array of values', function (done) {
      Promise.all([
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3)
      ]).then(function (vals) {
        expect(vals).to.deep.equal([1, 2, 3]);
        done();
      });
    });

    it('handles non-promise values in the array', function (done) {
      Promise.all([10, 20, 30]).then(function (vals) {
        expect(vals).to.deep.equal([10, 20, 30]);
        done();
      });
    });

    it('handles mixed promise and non-promise values', function (done) {
      Promise.all([
        Promise.resolve('a'),
        'b',
        Promise.resolve('c')
      ]).then(function (vals) {
        expect(vals).to.deep.equal(['a', 'b', 'c']);
        done();
      });
    });

    it('rejects if any promise rejects', function (done) {
      Promise.all([
        Promise.resolve(1),
        Promise.reject('fail'),
        Promise.resolve(3)
      ]).then(
        function () { done(new Error('should not resolve')); },
        function (reason) {
          expect(reason).to.equal('fail');
          done();
        }
      );
    });

    it('preserves order of results', function (done) {
      // Use chained thens to create different "delays"
      var p1 = Promise.resolve('first');
      var p2 = Promise.resolve('second');
      var p3 = Promise.resolve('third');

      Promise.all([p1, p2, p3]).then(function (vals) {
        expect(vals[0]).to.equal('first');
        expect(vals[1]).to.equal('second');
        expect(vals[2]).to.equal('third');
        done();
      });
    });

    it('handles empty array', function (done) {
      Promise.all([]).then(function (vals) {
        expect(vals).to.deep.equal([]);
        done();
      });
    });
  });
});
