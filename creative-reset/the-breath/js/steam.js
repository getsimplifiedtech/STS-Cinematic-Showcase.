// The steam: a real-time stable-fluids solver (Stam 1999: advect, vorticity confinement, pressure projection) rendered as lit vapour,
// plus the compositor that reveals the finished dish through the cleared steam. Own implementation, derived from the MONOLITH "Stir"
// solver (read only). What is different here, on purpose:
//  - the fluid is steam, not a drawing mask: buoyancy, a source at the wok, and a sign-correct clearing force;
//  - scroll never writes the fluid directly. It sets "weather" (emission, spread, clearing radius). The fluid supplies the motion,
//    so scrolling backwards un-does the sequence the way a real cloud would (it drifts back in), not by playing a recording;
//  - R16F / RG16F targets instead of RGBA16F everywhere (half the memory), no pointer capture, no touch handling at all,
//    and the caller owns the frame loop so it can stop it off-screen and on a hidden tab.
import { createGL, program, quad, texture, bind } from './gl.js';

export const TIERS = {
  high: { simRows: 176, dyeRows: 560, jacobi: 16, dprCap: 1.5, maxPixels: 2.0e6, substeps: 2 },
  mid: { simRows: 144, dyeRows: 400, jacobi: 14, dprCap: 1.25, maxPixels: 1.3e6, substeps: 2 },
  low: { simRows: 112, dyeRows: 288, jacobi: 10, dprCap: 1.5, maxPixels: 0.75e6, substeps: 1 },
};
const DT = 1 / 60;
const HEAD = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 uv; out vec4 o;
float h11(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h11(i), h11(i+vec2(1,0)), f.x), mix(h11(i+vec2(0,1)), h11(i+1.), f.x), f.y); }
float fbm(vec2 p){ return vn(p)*.5 + vn(p*2.03+vec2(3.1,1.7))*.25 + vn(p*4.1+vec2(7.7,2.3))*.125 + vn(p*8.3+vec2(1.3,9.1))*.0625; }`;

// Five vents along the wok's reach pulse out of phase when the steam spreads: separate plumes that bulge, collide and merge, so the cloud has folds
// and edges instead of a uniform haze. jets() returns the strength of the vent field at uv (0..~2).
const JETS = `
float jets(vec2 uv, vec2 src, float aspect, float t, float spread){
  float s = 0.;
  for(int i = 0; i < 5; i++){
    float fi = float(i);
    vec2 c = vec2(src.x + (fi/4. - .5)*.9 + .03*sin(t*.31 + fi*1.7), src.y - .10 + .05*sin(t*.23 + fi));
    vec2 q = (uv - c)*vec2(aspect, 1.);
    float pulse = pow(.5 + .5*sin(t*(.62 + .13*fi) + fi*2.3), 1.6);
    s += pulse*exp(-dot(q,q)/.02);
  }
  return s*spread;
}
float catrom(sampler2D t, vec2 uv, vec2 size){
  vec2 pos = uv*size, c = floor(pos - .5) + .5, f = pos - c;
  vec2 w0 = f*(-.5 + f*(1. - .5*f)), w1 = 1. + f*f*(-2.5 + 1.5*f), w2 = f*(.5 + f*(2. - 1.5*f)), w3 = f*f*(-.5 + .5*f);
  vec2 w12 = w1 + w2, t0 = (c - 1.)/size, t3 = (c + 2.)/size, t12 = (c + w2/w12)/size;
  float r = 0.;
  r += texture(t, vec2(t0.x, t0.y)).x*w0.x*w0.y + texture(t, vec2(t12.x, t0.y)).x*w12.x*w0.y + texture(t, vec2(t3.x, t0.y)).x*w3.x*w0.y;
  r += texture(t, vec2(t0.x, t12.y)).x*w0.x*w12.y + texture(t, vec2(t12.x, t12.y)).x*w12.x*w12.y + texture(t, vec2(t3.x, t12.y)).x*w3.x*w12.y;
  r += texture(t, vec2(t0.x, t3.y)).x*w0.x*w3.y + texture(t, vec2(t12.x, t3.y)).x*w12.x*w3.y + texture(t, vec2(t3.x, t3.y)).x*w3.x*w3.y;
  // keep the sharpened result inside the range of its four nearest samples: no ringing, no negative vapour
  float a0 = texture(t, (c + vec2(0., 0.))/size).x, a1 = texture(t, (c + vec2(1., 0.))/size).x, a2 = texture(t, (c + vec2(0., 1.))/size).x, a3 = texture(t, (c + vec2(1., 1.))/size).x;
  return clamp(r, min(min(a0, a1), min(a2, a3)), max(max(a0, a1), max(a2, a3)));
}`;

export function createSteam({ canvas, dish, tier = 'mid' }) {
  const T = { ...(TIERS[tier] || TIERS.mid) };
  const S = createGL(canvas, { dprCap: T.dprCap, maxPixels: T.maxPixels });
  if (!S) throw new Error('webgl2');
  const gl = S.gl;
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('float render targets');
  const Q = quad(gl);

  // ---------------------------------------------------------------- state
  const P = { emit: 0.4, spread: 0, clear: 0, haze: 1, glow: 0.6, detail: 0.4, dishLight: 1, flick: 0.5 };   // set by the caller each frame
  const L = { src: [0.5, 0.45], dc: [0.62, 0.5], dishRect: [0.62, 0.5, 0.8, 0.8], shade: [1, 0], aspect: 1.6, reach: 1.1 };   // placement (stage uv, y up)
  let vel, prs, dye, div, crl, SIM = { w: 2, h: 2 }, DYE = { w: 2, h: 2 }, gpuBytes = 0, acc = 0, time = 0, lastClear = 0, push = 0, stirs = [];
  let jacobi = T.jacobi;

  const FMT = {
    r: [gl.R16F, gl.RED], rg: [gl.RG16F, gl.RG],
  };
  const target = (w, h, f) => {
    const [ifmt, fmt] = FMT[f];
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.HALF_FLOAT, null);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('float render targets');
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gpuBytes += w * h * (f === 'r' ? 2 : 4);
    return { tex, fb, w, h };
  };
  const pair = (w, h, f) => { let a = target(w, h, f), b = target(w, h, f); return { get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; }, free() { for (const t of [a, b]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } } }; };
  const free = (t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } };
  let simAspect = 0;
  function allocate(aspect) {
    if (vel) { vel.free(); prs.free(); dye.free(); free(div); free(crl); }
    gpuBytes = 0;
    SIM = { w: Math.max(48, Math.round(T.simRows * aspect)), h: T.simRows };
    DYE = { w: Math.max(96, Math.round(T.dyeRows * aspect)), h: T.dyeRows };
    vel = pair(SIM.w, SIM.h, 'rg'); prs = pair(SIM.w, SIM.h, 'r'); dye = pair(DYE.w, DYE.h, 'r'); div = target(SIM.w, SIM.h, 'r'); crl = target(SIM.w, SIM.h, 'r');
    simAspect = aspect;
  }

  // ---------------------------------------------------------------- solver programs
  // FORCE: buoyancy, the wok's updraft and billow, the outward puff when the steam spreads, and the ring that pushes steam aside as it clears.
  const FORCE = program(gl, `${HEAD}${JETS}
uniform sampler2D vel, dye; uniform vec2 src, dc, stir; uniform vec3 stirV; uniform float aspect, dt, spread, push, clearR, time, emit, reach;
void main(){
  vec2 v = texture(vel, uv).xy; float d = texture(dye, uv).x; vec2 asp = vec2(aspect, 1.);
  vec2 q = (uv - src)*asp; float r = length(q) + 1e-4;
  v.y += (46.*d)*dt;                                                      // warm vapour rises
  float col = exp(-(q.x*q.x)/(.006 + .05*spread));                           // updraft over the wok
  v.y += (46.*emit*col*smoothstep(-.05, .1, q.y + .05))*dt;
  float t = time;
  v.y += 70.*jets(uv, src, aspect, t, spread)*dt;
  v.x += (vn(vec2(uv.y*7. - t*.9, t*.35)) - .5)*70.*col*dt*(.4 + emit);   // the plume billows sideways as it climbs
  v += (q/r)*(24.*spread*exp(-r*r/.30))*dt;                              // spreading: the cloud expands outward from the wok
  vec2 e = (uv - dc)*asp; float er = length(e) + 1e-4; float ring = exp(-pow((er - clearR*reach)/(.14*reach), 2.));
  v += (e/er)*(push*70.*ring)*dt;                                          // clearing shoves steam aside (and, scrolling back, draws it in)
  vec2 sd = (uv - stir.xy)*asp; v += stirV.xy*stirV.z*exp(-dot(sd,sd)/.004);   // a mouse parting the steam (pointer: mouse only)
  o = vec4(clamp(v, -400., 400.), 0., 1.);
}`);
  const CURL = program(gl, `${HEAD}
uniform sampler2D vel; uniform vec2 px;
void main(){ float L = texture(vel, uv - vec2(px.x,0)).y, R = texture(vel, uv + vec2(px.x,0)).y, T = texture(vel, uv + vec2(0,px.y)).x, B = texture(vel, uv - vec2(0,px.y)).x; o = vec4(.5*(R-L-T+B),0,0,1); }`);
  const VORT = program(gl, `${HEAD}
uniform sampler2D vel, curl; uniform vec2 px; uniform float strength, dt;
void main(){ float L = texture(curl, uv - vec2(px.x,0)).x, R = texture(curl, uv + vec2(px.x,0)).x, T = texture(curl, uv + vec2(0,px.y)).x, B = texture(curl, uv - vec2(0,px.y)).x, C = texture(curl, uv).x;
  vec2 f = .5*vec2(abs(T)-abs(B), abs(R)-abs(L)); f /= length(f)+1e-4; f *= strength*C; f.y *= -1.;
  vec2 v = texture(vel, uv).xy + f*dt; o = vec4(clamp(v, -400., 400.), 0., 1.); }`);
  const DIVG = program(gl, `${HEAD}
uniform sampler2D vel; uniform vec2 px;
void main(){ vec2 C = texture(vel, uv).xy; float L = texture(vel, uv - vec2(px.x,0)).x, R = texture(vel, uv + vec2(px.x,0)).x, T = texture(vel, uv + vec2(0,px.y)).y, B = texture(vel, uv - vec2(0,px.y)).y;
  if(uv.x - px.x < 0.) L = -C.x; if(uv.x + px.x > 1.) R = -C.x; if(uv.y + px.y > 1.) T = -C.y; if(uv.y - px.y < 0.) B = -C.y;
  o = vec4(.5*(R-L+T-B),0,0,1); }`);
  const JACOBI = program(gl, `${HEAD}
uniform sampler2D prs, div; uniform vec2 px;
void main(){ float L = texture(prs, uv - vec2(px.x,0)).x, R = texture(prs, uv + vec2(px.x,0)).x, T = texture(prs, uv + vec2(0,px.y)).x, B = texture(prs, uv - vec2(0,px.y)).x;
  o = vec4((L+R+T+B - texture(div, uv).x)*.25, 0., 0., 1.); }`);
  const PROJ = program(gl, `${HEAD}
uniform sampler2D prs, vel; uniform vec2 px;
void main(){ float L = texture(prs, uv - vec2(px.x,0)).x, R = texture(prs, uv + vec2(px.x,0)).x, T = texture(prs, uv + vec2(0,px.y)).x, B = texture(prs, uv - vec2(0,px.y)).x;
  o = vec4(texture(vel, uv).xy - vec2(R-L, T-B)*.5, 0., 1.); }`);
  const SCALE = program(gl, `${HEAD}
uniform sampler2D src; uniform float k; void main(){ o = texture(src, uv)*k; }`);
  const ADVV = program(gl, `${HEAD}
uniform sampler2D vel; uniform vec2 px; uniform float dt, diss;
void main(){ vec2 c = uv - dt*texture(vel, uv).xy*px; o = vec4(diss*texture(vel, c).xy, 0., 1.); }`);
  // DYEADV: advect the vapour, let it cool away slowly, add what the wok gives off, and remove it inside the clearing.
  const DYEADV = program(gl, `${HEAD}${JETS}
uniform sampler2D vel, dye; uniform vec2 px, src, dc, dsz; uniform float aspect, dt, diss, emit, spread, time, clearR, reach;
void main(){
  vec2 c = uv - dt*texture(vel, uv).xy*px; float d = catrom(dye, c, dsz)*diss; vec2 asp = vec2(aspect, 1.);
  vec2 q = (uv - src)*asp; float t = time;
  float n = vn(vec2(uv.x*5. + t*.7, uv.y*4. - t*1.1));
  float rad = mix(.04, .14, spread);
  float e = emit*exp(-dot(q,q)/(rad*rad))*(.55 + .9*n);
  float band = spread*(1. - smoothstep(.0, .8, uv.y))*(.25 + 1.1*vn(vec2(uv.x*3.5 - t*.35, uv.y*2. + t*.25)));     // later the whole lower frame gives off vapour in drifting patches: it fills the viewport
  vec2 e2 = (uv - dc)*asp; float hole = (1. - smoothstep(clearR*reach - .2*reach, clearR*reach + .02*reach, length(e2))) * step(.001, clearR);
  d += (e*1.7 + band*.9 + jets(uv, src, aspect, t, spread)*6.4)*dt*(1. - hole);
  d *= 1. - clamp((5.*hole + 1.5*d)*dt, 0., 1.);                                          // thick vapour sheds faster: the cloud keeps structure instead of saturating
  o = vec4(clamp(d, 0., 2.), 0., 0., 1.);
}`);

  // ---------------------------------------------------------------- compositor: lit vapour over a graded dish
  const tDish = texture(gl, dish, { unit: 3, mips: true });
  const COMP = program(gl, `${HEAD}
uniform sampler2D tDye, tVel, tDish; uniform vec2 dyePx, src, dc, shade; uniform vec4 dishRect;
uniform float aspect, time, clearR, haze, glow, detail, flick, dishLight, reach, dbg;
void main(){
  vec2 asp = vec2(aspect, 1.);
  vec2 vel = texture(tVel, uv).xy;
  // ---- steam: density, broken up by detail that is carried by the fluid so it never slides over the picture
  float d = texture(tDye, uv).x;
  vec2 wp = uv*asp*2.3 + vel*.0016 + vec2(0., -time*.04);
  float nz = fbm(wp);
  float dd = d*(.78 + .44*nz);
  float a = min(1. - exp(-dd*1.4), .9)*haze;
  // thick parts bulge toward the camera and catch the flame light; the gradient is taken over a wide stencil so only real folds show
  vec2 gs = dyePx*4.;
  vec2 g = vec2(texture(tDye, uv + vec2(gs.x,0)).x - texture(tDye, uv - vec2(gs.x,0)).x, texture(tDye, uv + vec2(0,gs.y)).x - texture(tDye, uv - vec2(0,gs.y)).x);
  vec3 n = normalize(vec3(-g*(.8 + 1.3*detail), 1.));
  vec2 toS = (src - uv)*asp; float dist = length(toS);
  vec3 Ld = normalize(vec3(toS/(dist + .08), .55));
  float diff = max(dot(n, Ld), 0.);
  float near = exp(-dist*dist/.075), mid = exp(-dist*dist/.55);
  vec3 ember = vec3(1., .5, .2), cool = vec3(.62, .60, .60), warm = vec3(1., .66, .38);
  float rim = pow(1. - n.z, 2.)*(.4 + .8*detail);
  float lightK = clamp(.20 + .7*mid*(.5 + .8*diff), 0., 1.4)*(.78 + .5*flick);   // how much flame light reaches this bit of cloud
  vec3 sc = mix(cool*.5, warm, clamp(lightK*.8, 0., 1.))*lightK*(.7 + .6*nz) + cool*rim*.18;
  sc *= 1. - .45*smoothstep(.7, 1.8, d)*(1. - near);                                      // the heart of a thick cloud is in its own shadow
  sc *= 1. - shade.x*.6*(1. - smoothstep(0., .62, uv.x)) - shade.y*.55*smoothstep(.5, .92, uv.y);   // keep the type side dark
  // ---- the dish, in the same room as the flame
  vec2 e = (uv - dc)*asp;
  float warp = (fbm(uv*asp*2.6 + vel*.003) - .45)*.3;
  float R = clearR*reach*1.08, wid = .22*reach;
  float dishA = 1. - smoothstep(R - wid, R + .02*reach, length(e) + warp*reach*smoothstep(.0, .5, clearR));
  dishA *= step(.001, clearR);
  vec2 iuv = (uv - dishRect.xy)/dishRect.zw + .5;
  vec3 c = texture(tDish, iuv).rgb;
  float inside = step(0., iuv.x)*step(iuv.x, 1.)*step(0., iuv.y)*step(iuv.y, 1.);
  float pr = length((iuv - vec2(.49, .53))/vec2(.36, .30));
  float plate = (1. - smoothstep(.96, 1.3, pr))*inside;
  float side = clamp(1. - iuv.x, 0., 1.);
  c *= mix(vec3(.62, .68, .8), vec3(1.28, 1.02, .78), side);   // flame side warm, far side cooled and dropped
  c = pow(max(c, 0.), vec3(1.22))*1.12;
  c *= mix(.1, 1., plate);
  c *= (.9 + .2*flick)*dishLight;
  vec3 floor_ = vec3(.055, .05, .047) + ember*.07*exp(-length((uv - vec2(.0, .45))*asp)*1.6)*dishLight;
  vec3 dishC = floor_*(1. - plate) + c;
  // ---- composite, premultiplied: dish under, steam over
  vec3 rgb = sc*a + dishC*dishA*(1. - a);
  float al = a + dishA*(1. - a);
  float glw = glow*exp(-dist*dist/.16)*.07*(.6 + .8*flick)*(1. - dishA);          // light the flame throws into the room (kept a valid premultiplied colour)
  vec3 gc = ember*glw; rgb += gc; al = max(al, max(rgb.r, max(rgb.g, rgb.b)));
  rgb += (h11(gl_FragCoord.xy + fract(time)*61.) - .5)*.014*al;
  if(dbg > .5){ float dv = texture(tDye, uv).x; vec2 vv = texture(tVel, uv).xy; o = dbg < 1.5 ? vec4(vec3(dv*.5), 1.) : vec4(.5 + vv*.01, 0., 1.); return; }
  o = vec4(rgb, al);
}`);

  // ---------------------------------------------------------------- stepping
  const bindTex = (pr, name, tex, unit) => { bind(gl, tex, unit); pr.seti(name, unit); };
  const blit = (dst) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h); Q.draw(); };
  function step() {
    push = Math.max(-3, Math.min(3, push + (((P.clear - lastClear) / DT) - push)*0.12)); lastClear = P.clear;
    const px = [1 / SIM.w, 1 / SIM.h], A = L.aspect, st = stirs.length ? stirs.shift() : null;
    const clearR = P.clear;
    FORCE.use(); bindTex(FORCE, 'vel', vel.read.tex, 4); bindTex(FORCE, 'dye', dye.read.tex, 5);
    FORCE.set('src', ...L.src); FORCE.set('dc', ...L.dc); FORCE.set('aspect', A); FORCE.set('dt', DT); FORCE.set('spread', P.spread); FORCE.set('push', push); FORCE.set('clearR', clearR); FORCE.set('reach', L.reach); FORCE.set('time', time); FORCE.set('emit', P.emit);
    FORCE.set('stir', st ? st[0] : -9, st ? st[1] : -9); FORCE.set('stirV', st ? st[2] : 0, st ? st[3] : 0, st ? 1 : 0);
    blit(vel.write); vel.swap();
    CURL.use(); bindTex(CURL, 'vel', vel.read.tex, 4); CURL.set('px', ...px); blit(crl);
    VORT.use(); bindTex(VORT, 'vel', vel.read.tex, 4); bindTex(VORT, 'curl', crl.tex, 5); VORT.set('px', ...px); VORT.set('strength', 9 + 9*P.detail); VORT.set('dt', DT); blit(vel.write); vel.swap();
    DIVG.use(); bindTex(DIVG, 'vel', vel.read.tex, 4); DIVG.set('px', ...px); blit(div);
    SCALE.use(); bindTex(SCALE, 'src', prs.read.tex, 4); SCALE.set('k', .8); blit(prs.write); prs.swap();
    JACOBI.use(); bindTex(JACOBI, 'div', div.tex, 5); JACOBI.set('px', ...px);
    for (let i = 0; i < jacobi; i++) { bindTex(JACOBI, 'prs', prs.read.tex, 4); blit(prs.write); prs.swap(); }
    PROJ.use(); bindTex(PROJ, 'prs', prs.read.tex, 4); bindTex(PROJ, 'vel', vel.read.tex, 5); PROJ.set('px', ...px); blit(vel.write); vel.swap();
    ADVV.use(); bindTex(ADVV, 'vel', vel.read.tex, 4); ADVV.set('px', ...px); ADVV.set('dt', DT); ADVV.set('diss', .988); blit(vel.write); vel.swap();
    DYEADV.use(); bindTex(DYEADV, 'vel', vel.read.tex, 4); bindTex(DYEADV, 'dye', dye.read.tex, 5); DYEADV.set('px', ...px); DYEADV.set('dsz', DYE.w, DYE.h);
    DYEADV.set('src', ...L.src); DYEADV.set('dc', ...L.dc); DYEADV.set('aspect', A); DYEADV.set('dt', DT); DYEADV.set('diss', .9962);
    DYEADV.set('emit', P.emit); DYEADV.set('spread', P.spread); DYEADV.set('time', time); DYEADV.set('clearR', clearR); DYEADV.set('reach', L.reach);
    blit(dye.write); dye.swap();
    time += DT;
  }
  function draw() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, S.w, S.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    COMP.use(); bindTex(COMP, 'tDye', dye.read.tex, 4); bindTex(COMP, 'tVel', vel.read.tex, 5); bind(gl, tDish, 3); COMP.seti('tDish', 3);
    COMP.set('dyePx', 1 / DYE.w, 1 / DYE.h); COMP.set('src', ...L.src); COMP.set('dc', ...L.dc); COMP.set('shade', ...L.shade); COMP.set('dishRect', ...L.dishRect);
    COMP.set('aspect', L.aspect); COMP.set('time', time); COMP.set('clearR', P.clear); COMP.set('reach', L.reach); COMP.set('haze', P.haze); COMP.set('glow', P.glow); COMP.set('detail', P.detail); COMP.set('flick', P.flick); COMP.set('dishLight', P.dishLight); COMP.set('dbg', P.dbg || 0);
    Q.draw();
  }
  function relayout() {
    S.resize();
    const aspect = S.cssW / S.cssH; L.aspect = aspect;
    if (!vel || Math.abs(aspect - simAspect) / simAspect > 0.08) allocate(aspect);
  }
  relayout();

  const api = {
    P, L, tier: T, canvas,
    get gpuBytes() { return gpuBytes + (dish.naturalWidth * dish.naturalHeight * 4 * 1.33 | 0); },
    get grids() { return { sim: [SIM.w, SIM.h], dye: [DYE.w, DYE.h], canvas: [S.w, S.h], scale: S.scale, jacobi }; },
    relayout,
    setScale(k) { S.scale = Math.max(0.4, Math.min(1, k)); S.resize(); },
    get scale() { return S.scale; },
    setJacobi(n) { jacobi = Math.max(6, n | 0); },
    get jacobi() { return jacobi; },
    // pointer: a gentle parting of the steam (mouse only; the caller never forwards touch)
    stir(x, y, vx, vy) { if (stirs.length < 4) stirs.push([x, y, vx, vy]); },
    // advance the fluid by real time (fixed 1/60 substeps, at most `substeps` per frame so a slow device slows the steam, not the page), then draw
    frame(dtReal) {
      acc = Math.min(acc + dtReal, DT*T.substeps + 1e-4);
      let n = 0; while (acc >= DT && n < T.substeps) { step(); acc -= DT; n++; }
      draw(); return n;
    },
    // run the fluid forward without drawing: used when the visitor lands mid-sequence or returns after the loop was parked
    warm(n) { for (let i = 0; i < n; i++) step(); },
    settle() { push = 0; lastClear = P.clear; },
    draw,
    // lab only: dye statistics (max, mean) read back from the GPU
    probeDye() { gl.bindFramebuffer(gl.FRAMEBUFFER, dye.read.fb); const w = DYE.w, h = DYE.h, buf = new Float32Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf); let mx = 0, sum = 0; for (let i = 0; i < w * h; i++) { const v = buf[i * 4]; mx = Math.max(mx, v); sum += v; } return { max: mx, mean: sum / (w * h) }; },
    dispose() { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); },
  };
  return api;
}
