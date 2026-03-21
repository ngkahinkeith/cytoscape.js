
/**
 * WebGL utility functions used by the new rendering engine.
 */

/** Unit quad: 2 triangles forming a [0,0]-[1,1] square. Shared across all programs. */
export const UNIT_QUAD = new Float32Array([
  0, 0,  1, 0,  1, 1,
  0, 0,  1, 1,  0, 1,
]);

export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}


export function createProgram(gl, vertexSource, fragementSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragementSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Could not initialize shaders');
  }
  return program;
}

/**
 * Returns the current pan & zoom values, scaled by the pixel ratio.
 */
export function getEffectivePanZoom(r) {
  const { pixelRatio } = r;
  const zoom = r.cy.zoom();
  const pan  = r.cy.pan();
  return {
    zoom: zoom * pixelRatio,
    pan: {
      x: pan.x * pixelRatio,
      y: pan.y * pixelRatio,
    }
  };
}

export function modelToRenderedPosition(r, pan, zoom, x, y) {
  let rx = x * zoom + pan.x;
  let ry = y * zoom + pan.y;
  ry = Math.round(r.canvasHeight - ry); // adjust for webgl
  return [ rx, ry ];
}

export function vec4ToIndex(vec4) {
  return (
     vec4[0] +
    (vec4[1] << 8) +
    (vec4[2] << 16) +
    (vec4[3] << 24)
  );
}

/**
 * Creates a Frame Buffer to use for offscreen rendering.
 * @param {WebGLRenderingContext} gl
 */
export function createPickingFrameBuffer(gl) {
  // Create and bind the framebuffer
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

  // Create a texture to render to
  const targetTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, targetTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // attach the texture as the first color attachment
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  fb.setFramebufferAttachmentSizes = (width, height) => {
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  };

  return fb;
}
