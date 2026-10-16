// The dish: the finished photograph on its own canvas, drawn at the screen's real pixel density instead of inside the (scaled-down) steam canvas.
// Why: the steam is soft by nature and is rendered at a reduced size, but a photograph that is drawn at 0.6 to 1.5 device pixels per CSS pixel looks
// soft on a 2x or 3x screen. Here the canvas is sized to the dish and the screen's pixel ratio (capped at 3x and 4 megapixels), the photograph is
// resampled with Catmull-Rom, sharpened with a limited unsharp mask (it cannot overshoot its neighbourhood, so no halos) and given a fine static grain so
// upscaled areas keep a photographic texture. It redraws only while the clearing is moving or the layout changes, so it costs nothing at rest.
// No new imagery: the source is still the 1200x800 photograph; this only decides how its pixels reach the screen.
import { createGL, program, quad, texture, bind, ready } from './gl.js';

const FS = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 uv; out vec4 o;
uniform sampler2D tex; uniform vec2 texSize, dc; uniform vec4 rect; uniform float aspect, clearR, reach, sharp;
float h11(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h11(i), h11(i+vec2(1,0)), f.x), mix(h11(i+vec2(0,1)), h11(i+1.), f.x), f.y); }
float fbm(vec2 p){ return vn(p)*.5 + vn(p*2.03+vec2(3.1,1.7))*.25 + vn(p*4.1+vec2(7.7,2.3))*.125; }
// Catmull-Rom in 9 bilinear fetches
vec3 cr(vec2 p){
  vec2 pos = p*texSize, c = floor(pos - .5) + .5, f = pos - c;
  vec2 w0 = f*(-.5 + f*(1. - .5*f)), w1 = 1. + f*f*(-2.5 + 1.5*f), w2 = f*(.5 + f*(2. - 1.5*f)), w3 = f*f*(-.5 + .5*f);
  vec2 w12 = w1 + w2, t0 = (c - 1.)/texSize, t3 = (c + 2.)/texSize, t12 = (c + w2/w12)/texSize;
  vec3 r = texture(tex, vec2(t0.x, t0.y)).rgb*w0.x*w0.y + texture(tex, vec2(t12.x, t0.y)).rgb*w12.x*w0.y + texture(tex, vec2(t3.x, t0.y)).rgb*w3.x*w0.y;
  r += texture(tex, vec2(t0.x, t12.y)).rgb*w0.x*w12.y + texture(tex, vec2(t12.x, t12.y)).rgb*w12.x*w12.y + texture(tex, vec2(t3.x, t12.y)).rgb*w3.x*w12.y;
  r += texture(tex, vec2(t0.x, t3.y)).rgb*w0.x*w3.y + texture(tex, vec2(t12.x, t3.y)).rgb*w12.x*w3.y + texture(tex, vec2(t3.x, t3.y)).rgb*w3.x*w3.y;
  return r;
}
void main(){
  // where the clearing is, in stage space (same shape the steam solver uses for its hole)
  vec2 suv = rect.xy + (uv - .5)*rect.zw, asp = vec2(aspect, 1.);
  float warp = (fbm(suv*asp*2.6) - .45)*.3;
  float R = clearR*reach*1.08, wid = .22*reach;
  float A = (1. - smoothstep(R - wid, R + .02*reach, length((suv - dc)*asp) + warp*reach*smoothstep(0., .5, clearR))) * step(.001, clearR);
  if(A <= 0.){ o = vec4(0.); return; }
  vec3 c = cr(uv);
  // limited unsharp mask: the boost is clamped to the range of the four nearest source pixels
  vec2 p = uv*texSize - .5, b = floor(p) + .5;
  vec3 a0 = texture(tex, b/texSize).rgb, a1 = texture(tex, (b + vec2(1,0))/texSize).rgb, a2 = texture(tex, (b + vec2(0,1))/texSize).rgb, a3 = texture(tex, (b + 1.)/texSize).rgb;
  vec3 lo = min(min(a0, a1), min(a2, a3)), hi = max(max(a0, a1), max(a2, a3));
  c = clamp(c + sharp*(c - textureLod(tex, uv, 1.).rgb), lo - .02, hi + .02);
  // the grade: flame side warm, far side cooled and dropped; the plate keeps its light, everything round it falls into the soot
  float side = clamp(1. - uv.x, 0., 1.);
  c *= mix(vec3(.62, .68, .8), vec3(1.28, 1.02, .78), side);
  c = pow(max(c, 0.), vec3(1.22))*1.12;
  float plate = 1. - smoothstep(.96, 1.3, length((uv - vec2(.49, .53))/vec2(.36, .30)));
  vec2 e = min(uv, 1. - uv); float win = smoothstep(0., .14, e.x)*smoothstep(0., .2, e.y);   // the photograph dissolves into soot before the edge of its canvas
  c = c*mix(.03, 1., plate)*win + vec3(.055, .05, .047)*(1. - plate*win);
  c += (h11(gl_FragCoord.xy) - .5)*.02;
  o = vec4(max(c, 0.)*A, A);
}`;

export async function createDish({ canvas, image, onLost }) {
  const S = createGL(canvas, { dprCap: 3, maxPixels: 4e6 });
  if (!S) throw new Error('webgl2');
  const gl = S.gl, Q = quad(gl), pr = program(gl, FS);
  const tex = texture(gl, image, { unit: 0, mips: true });
  await ready(gl, [pr]);
  canvas.style.visibility = 'hidden';
  let view = { rect: [.5, .5, 1, 1], dc: [.5, .5], aspect: 1, reach: 1 }, dirty = true, last = '', shown = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (onLost) onLost(); });
  return {
    // css: the canvas box in stage pixels; rect: the same box in stage uv (centre x, centre y, width, height; y up)
    layout({ css, rect, dc, aspect, reach }) {
      const st = canvas.style; st.left = css[0] + 'px'; st.top = css[1] + 'px'; st.width = css[2] + 'px'; st.height = css[3] + 'px';
      view = { rect, dc, aspect, reach }; S.resize(); dirty = true;
    },
    // draw only while the clearing moves (or after a layout change); hide the canvas while nothing is revealed
    draw(clear) {
      const on = clear > 0.001;
      if (on !== shown) { shown = on; canvas.style.visibility = on ? '' : 'hidden'; dirty = true; }
      if (!on) return false;
      const sig = clear.toFixed(3);
      if (!dirty && sig === last) return false;
      last = sig; dirty = false;
      const up = S.w / image.naturalWidth;                           // output pixels per source pixel
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, S.w, S.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      pr.use(); bind(gl, tex, 0); pr.seti('tex', 0);
      pr.set('texSize', image.naturalWidth, image.naturalHeight); pr.set('rect', ...view.rect); pr.set('dc', ...view.dc);
      pr.set('aspect', view.aspect); pr.set('clearR', clear); pr.set('reach', view.reach); pr.set('sharp', Math.max(.25, Math.min(.9, .25 + .35 * (up - 1))));
      Q.draw(); return true;
    },
    get size() { return [S.w, S.h]; },
    get gpuBytes() { return (image.naturalWidth * image.naturalHeight * 4 * 1.33 + S.w * S.h * 4) | 0; },
    dispose() { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); },
  };
}
