// Tiny WebGL2 helper for The Breath. Derived from the MONOLITH creative-reset helper (read only, not modified), with the lab fixes:
//  - no preserveDrawingBuffer (it forces a copy of the canvas every frame and holds a second full-size buffer);
//  - premultiplied alpha, because the canvas is composited over the flame video;
//  - a pixel budget (DPR cap, pixel cap and a live scale factor) instead of a fixed DPR;
//  - no rAF loop in here: the caller decides when frames run, so it can stop them off-screen and on a hidden tab.
export function createGL(canvas, { dprCap = 1.5, maxPixels = 1.6e6 } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'default', preserveDrawingBuffer: false });
  if (!gl) return null;
  const S = { gl, canvas, w: 0, h: 0, scale: 1, cssW: 0, cssH: 0, dprCap, maxPixels };
  // Size from the layout box. Called when the box changes or the adaptive scale changes, not every frame.
  S.resize = () => {
    const cssW = canvas.clientWidth || 2, cssH = canvas.clientHeight || 2;
    let k = Math.min(window.devicePixelRatio || 1, S.dprCap) * S.scale;
    let w = Math.max(2, Math.round(cssW * k)), h = Math.max(2, Math.round(cssH * k));
    if (w * h > S.maxPixels) { const f = Math.sqrt(S.maxPixels / (w * h)); w = Math.max(2, Math.round(w * f)); h = Math.max(2, Math.round(h * f)); }
    if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
    S.w = w; S.h = h; S.cssW = cssW; S.cssH = cssH;
    return S;
  };
  S.resize();
  return S;
}
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;
// Programs are compiled without waiting: linking is started here and checked later by ready(). With KHR_parallel_shader_compile the driver compiles on its
// own threads and the page keeps painting and scrolling meanwhile (a synchronous link can block the main thread for hundreds of milliseconds on phones).
export function program(gl, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const vsh = mk(gl.VERTEX_SHADER, VS), fsh = mk(gl.FRAGMENT_SHADER, fs);
  const pr = gl.createProgram(); gl.attachShader(pr, vsh); gl.attachShader(pr, fsh); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
  const loc = {}; const L = (n) => (n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(pr, n)));
  return {
    pr,
    check() { if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('shader: ' + (gl.getShaderInfoLog(fsh) || gl.getProgramInfoLog(pr))); },
    set(name, ...v) { const l = L(name); if (l === null) return; gl[v.length === 1 ? 'uniform1f' : v.length === 2 ? 'uniform2f' : v.length === 3 ? 'uniform3f' : 'uniform4f'](l, ...v); },
    seti(name, v) { const l = L(name); if (l !== null) gl.uniform1i(l, v); },
    use() { gl.useProgram(pr); },
  };
}
// Resolves when every program has linked (polling the completion flag so the main thread stays free), rejects with the compiler log if one failed.
export function ready(gl, list) {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  return new Promise((res, rej) => {
    const poll = () => {
      try { if (ext && !list.every((p) => gl.getProgramParameter(p.pr, ext.COMPLETION_STATUS_KHR))) { setTimeout(poll, 8); return; } list.forEach((p) => p.check()); res(); } catch (e) { rej(e); }
    };
    poll();
  });
}
export function quad(gl) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return { draw() { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); } };
}
export function texture(gl, src, { unit = 0, mips = true } = {}) {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
export function bind(gl, tex, unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
export const loadImage = (url) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
