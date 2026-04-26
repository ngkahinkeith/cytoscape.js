// Lightweight histogram with linear bucketing.
class Histogram {
  constructor(min, max, nBuckets) {
    this.min = min;
    this.max = max;
    this.nBuckets = nBuckets;
    this.bucketWidth = (max - min) / nBuckets;
    this.buckets = new Uint32Array(nBuckets);
    this.totalCount = 0;
    this.underflow = 0;
    this.overflow = 0;
  }

  push(v) {
    this.totalCount++;
    if(v < this.min) { this.underflow++; return; }
    if(v >= this.max) { this.overflow++; return; }
    const idx = Math.floor((v - this.min) / this.bucketWidth);
    this.buckets[idx]++;
  }

  reset() {
    this.buckets.fill(0);
    this.totalCount = 0;
    this.underflow = 0;
    this.overflow = 0;
  }

  toJSON() {
    return {
      min: this.min,
      max: this.max,
      nBuckets: this.nBuckets,
      buckets: Array.from(this.buckets),
      totalCount: this.totalCount,
      underflow: this.underflow,
      overflow: this.overflow,
    };
  }
}

export class PerfMetrics {
  constructor() {
    this.chordHistogram = new Histogram(0, 2000, 32);
    this.perpOffsetHistogram = new Histogram(-200, 200, 32);
    this.chordProjectionHistogram = new Histogram(-0.5, 1.5, 40); // normalized t
    this.chordProjectionOutliers = 0;
    this.totalObbArea = 0;
    this.uploadBytesPerProgram = Object.create(null);
    this.pickingRedrawCount = 0;
  }

  recordChord(chordLen) {
    this.chordHistogram.push(chordLen);
  }

  recordPerpOffset(perpOffset) {
    this.perpOffsetHistogram.push(perpOffset);
  }

  recordChordProjection(t, chordLen) {
    // t: raw chord-aligned projection of B from A, in pixels (dot(B - A, chordDir));
    //    chordLen: ||tgt - src||. Plan Guardrail #2 requires t ∈ [0, chordLen];
    //    outliers indicate hooked beziers where the control point projects outside the chord.
    if(chordLen <= 0) return;
    this.chordProjectionHistogram.push(t / chordLen);
    if(t < 0 || t > chordLen) {
      this.chordProjectionOutliers++;
    }
  }

  recordObbArea(area) {
    this.totalObbArea += area;
  }

  recordUploadBytes(programKey, bytes) {
    this.uploadBytesPerProgram[programKey] =
      (this.uploadBytesPerProgram[programKey] || 0) + bytes;
  }

  recordPickingRedraw() {
    this.pickingRedrawCount++;
  }

  snapshot() {
    return Object.freeze({
      chordHistogram: this.chordHistogram.toJSON(),
      perpOffsetHistogram: this.perpOffsetHistogram.toJSON(),
      chordProjectionHistogram: this.chordProjectionHistogram.toJSON(),
      chordProjectionOutliers: this.chordProjectionOutliers,
      totalObbArea: this.totalObbArea,
      uploadBytesPerProgram: { ...this.uploadBytesPerProgram },
      pickingRedrawCount: this.pickingRedrawCount,
    });
  }

  reset() {
    this.chordHistogram.reset();
    this.perpOffsetHistogram.reset();
    this.chordProjectionHistogram.reset();
    this.chordProjectionOutliers = 0;
    this.totalObbArea = 0;
    this.uploadBytesPerProgram = Object.create(null);
    this.pickingRedrawCount = 0;
  }
}

let _enabled = false;
let _singleton = null;

export function isMetricsEnabled() {
  return _enabled;
}

export function setMetricsEnabled(on) {
  _enabled = !!on;
  if(_enabled && !_singleton) _singleton = new PerfMetrics();
}

export function getMetrics() {
  return _singleton;
}
