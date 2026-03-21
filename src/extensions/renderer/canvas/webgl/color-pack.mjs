const SHARED_BUFFER = new ArrayBuffer(4);
const FLOAT32 = new Float32Array(SHARED_BUFFER);
const INT32 = new Int32Array(SHARED_BUFFER);

/** Pack RGBA (0-255 each) into a single float. */
export function packColor(r, g, b, a) {
  INT32[0] = ((a & 0xFF) << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
  // Mask bit 24 to avoid NaN floats (sigma.js masking technique)
  INT32[0] = INT32[0] & 0xfeffffff;
  return FLOAT32[0];
}

/** Unpack a float back to [r, g, b, a]. */
export function unpackColor(f) {
  FLOAT32[0] = f;
  const v = INT32[0];
  return [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
}

/** Pack premultiplied alpha color from Cytoscape color array [r,g,b] (0-255) + opacity (0-1). */
export function packPremulColor(colorArr, opacity) {
  const a = Math.round(opacity * 255);
  const r = Math.round(colorArr[0] * opacity);
  const g = Math.round(colorArr[1] * opacity);
  const b = Math.round(colorArr[2] * opacity);
  return packColor(r, g, b, a);
}

/** Pack a pick index (integer) as RGBA float for use in picking shaders. */
export function packPickIndex(index) {
  return packColor(
    index & 0xFF,
    (index >> 8) & 0xFF,
    (index >> 16) & 0xFF,
    (index >> 24) & 0xFF
  );
}
