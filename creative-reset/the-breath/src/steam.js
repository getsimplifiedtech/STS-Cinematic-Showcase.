// The steam: a real-time stable-fluids solver (Stam 1999: advect, vorticity confinement, pressure projection) rendered as lit vapour.
// Own implementation, derived from the MONOLITH "Stir" solver (read only). What is different here, on purpose:
//  - the fluid is steam, not a drawing mask: buoyancy, vents along the wok, and a sign-correct clearing force;
//  - scroll never writes the fluid directly. It sets "weather" (emission, spread, clearing radius). The fluid supplies the motion,
//    so scrolling backwards un-does the sequence the way a real cloud would (it drifts back in), not by playing a recording;
//  - R16F / RG16F targets instead of RGBA16F everywhere (half the memory), no pointer capture, no touch handling at all,
//    and the caller owns the frame loop so it can stop it off-screen and on a hidden tab;
//  - velocities are in units of a fixed reference grid (144 rows), so the motion looks the same on every quality tier;
//  - the dish is not drawn here any more: it has its own canvas at the screen's real pixel density (dish.js).
import { createGL, program, quad, bind, ready } from './gl.js';

// simRows/dyeRows fix the grid height; simCells/dyeCells fix the cell count instead (phones: tall, narrow frames need more rows, not fewer).
export const TIERS = {
  high: { simRows: 176, dyeRows: 560, jacobi: 16, dprCap: 1.5, maxPixels: 2.0e6, substeps: 2 },
  mid: { simRows: 144, dyeRows: 400, jacobi: 14, dprCap: 1.25, maxPixels: 1.3e6, substeps: 2 },
  low: { simCells: 18e3, dyeCells: 100e3, jacobi: 10, dprCap: 1.5, maxPixels: 0.5e6, substeps: 1 },
};
const DT = 1 / 60, REF_ROWS = 144;
const HEAD = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 uv; out vec4 o;
float h11(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h11(i), h11(i+vec2(1,0)), f.x), mix(h11(i+vec2(0,1)), h11(i+1.), f.x), f.y); }
float fbm2(vec2 p){ return vn(p)*.62 + vn(p*2.07+vec2(3.1,1.7))*.38; }
float fbm(vec2 p){ return vn(p)*.5 + vn(p*2.03+vec2(3.1,1.7))*.25 + vn(p*4.1+vec2(7.7,2.3))*.125 + vn(p*8.3+vec2(1.3,9.1))*.0625; }`;

// Five vents along the wok's reach pulse out of phase when the steam spreads: separate plumes that bulge, collide and merge, so the cloud has folds
// and edges instead of a uniform haze. vent = (span across the frame in uv, vent width squared in height units): a phone gets narrower vents,
// because five wide vents in a 390px frame overlap into one sheet. jets() returns the strength of the vent field at uv (0..~2).
const JETS = `
float jets(vec2 uv, vec2 src, float aspect, float t, float spread, vec2 vent){
  float s = 0.;
  for(int i = 0; i < 5; i++){
    float fi = float(i);
    vec2 c = vec2(src.x + (fi/4. - .5)*vent.x + .03*sin(t*.31 + fi*1.7), src.y - .10 + .05*sin(t*.23 + fi));
    vec2 q = (uv - c)*vec2(aspect, 1.);
    float pulse = pow(.5 + .5*sin(t*(.62 + .13*fi) + fi*2.3), 1.6);
    s += pulse*exp(-dot(q,q)/vent.y);
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

export async function createSteam({ canvas, tier = 'mid' }) {
  const T = { ...(TIERS[tier] || TIERS.mid) };
  //#lab
  { const qq = new URLSearchParams(location.search); if (qq.get('sim')) T.simCells = +qq.get('sim'); if (qq.get('dye')) T.dyeCells = +qq.get('dye'); if (qq.get('px')) T.maxPixels = +qq.get('px'); }   // lab: grid size sweeps
  //#endlab
  const S = createGL(canvas, { dprCap: T.dprCap, maxPixels: T.maxPixels });
  if (!S) throw new Error('webgl2');
  const gl = S.gl;
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('float render targets');
  const Q = quad(gl), progs = [], prog = (src) => { const p = program(gl, src); progs.push(p); return p; };

  // ---------------------------------------------------------------- state
  const P = { emit: 0.4, spread: 0, clear: 0, haze: 1, glow: 0.6, detail: 0.4, flick: 0.5, media: 1 };   // set by the caller each frame
  // placement and look (stage uv, y up); the caller sets these per layout. vent: [span, width^2], noise: detail frequency, wisp: how ragged the vapour is,
  // band: how much the lower frame gives off vapour, radMax: widest the source gets, alt: dissipation with height
  const L = { src: [0.5, 0.45], dc: [0.62, 0.5], shade: [1, 0], aspect: 1.6, reach: 1.1, vent: [.9, .02], noise: 2.3, wisp: .5, band: 1, radMax: .14, alt: .25, lobe: 1 };
  //#lab
  { const l = new URLSearchParams(location.search).get('lobe'); if (l !== null) L.lobe = +l; }   // lab: A/B the billow lighting (0 = round-1 shading)
  //#endlab
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
    const sr = T.simCells ? Math.round(Math.sqrt(T.simCells / aspect)) : T.simRows, dr = T.dyeCells ? Math.round(Math.sqrt(T.dyeCells / aspect)) : T.dyeRows;
    SIM = { w: Math.max(48, Math.round(sr * aspect)), h: sr };
    DYE = { w: Math.max(96, Math.round(dr * aspect)), h: dr };
    vel = pair(SIM.w, SIM.h, 'rg'); prs = pair(SIM.w, SIM.h, 'r'); dye = pair(DYE.w, DYE.h, 'r'); div = target(SIM.w, SIM.h, 'r'); crl = target(SIM.w, SIM.h, 'r');
    simAspect = aspect;
  }

  // ---------------------------------------------------------------- solver programs
  // FORCE: buoyancy, the wok's updraft and billow, the outward puff when the steam spreads, and the ring that pushes steam aside as it clears.
  const FORCE = prog( `${HEAD}${JETS}
uniform sampler2D vel, dye; uniform vec2 src, dc, stir, vent; uniform vec3 stirV; uniform float aspect, dt, spread, push, clearR, time, emit, reach;
void main(){
  vec2 v = texture(vel, uv).xy; float d = texture(dye, uv).x; vec2 asp = vec2(aspect, 1.);
  vec2 q = (uv - src)*asp; float r = length(q) + 1e-4;
  v.y += (46.*d)*dt;                                                      // warm vapour rises
  float col = exp(-(q.x*q.x)/(.006 + .05*spread));                           // updraft over the wok
  v.y += (46.*emit*col*smoothstep(-.05, .1, q.y + .05))*dt;
  float t = time;
  v.y += 70.*jets(uv, src, aspect, t, spread, vent)*dt;
  v.x += (vn(vec2(uv.y*7. - t*.9, t*.35)) - .5)*70.*col*dt*(.4 + emit);   // the plume billows sideways as it climbs
  v += (q/r)*(24.*spread*exp(-r*r/.30))*dt;                              // spreading: the cloud expands outward from the wok
  vec2 e = (uv - dc)*asp; float er = length(e) + 1e-4; float ring = exp(-pow((er - clearR*reach)/(.14*reach), 2.));
  v += (e/er)*(push*70.*ring)*dt;                                          // clearing shoves steam aside (and, scrolling back, draws it in)
  vec2 sd = (uv - stir.xy)*asp; v += stirV.xy*stirV.z*exp(-dot(sd,sd)/.004);   // a mouse parting the steam (pointer: mouse only)
  o = vec4(clamp(v, -400., 400.), 0., 1.);
}`);
  const CURL = prog( `${HEAD}
uniform sampler2D vel; uniform vec2 px;
void main(){ float L = texture(vel, uv - vec2(px.x,0)).y, R = texture(vel, uv + vec2(px.x,0)).y, T = texture(vel, uv + vec2(0,px.y)).x, B = texture(vel, uv - vec2(0,px.y)).x; o = vec4(.5*(R-L-T+B),0,0,1); }`);
  const VORT = prog( `${HEAD}
uniform sampler2D vel, curl; uniform vec2 px; uniform float strength, dt;
void main(){ float L = texture(curl, uv - vec2(px.x,0)).x, R = texture(curl, uv + vec2(px.x,0)).x, T = texture(curl, uv + vec2(0,px.y)).x, B = texture(curl, uv - vec2(0,px.y)).x, C = texture(curl, uv).x;
  vec2 f = .5*vec2(abs(T)-abs(B), abs(R)-abs(L)); f /= length(f)+1e-4; f *= strength*C; f.y *= -1.;
  vec2 v = texture(vel, uv).xy + f*dt; o = vec4(clamp(v, -400., 400.), 0., 1.); }`);
  const DIVG = prog( `${HEAD}
uniform sampler2D vel; uniform vec2 px;
void main(){ vec2 C = texture(vel, uv).xy; float L = texture(vel, uv - vec2(px.x,0)).x, R = texture(vel, uv + vec2(px.x,0)).x, T = texture(vel, uv + vec2(0,px.y)).y, B = texture(vel, uv - vec2(0,px.y)).y;
  if(uv.x - px.x < 0.) L = -C.x; if(uv.x + px.x > 1.) R = -C.x; if(uv.y + px.y > 1.) T = -C.y; if(uv.y - px.y < 0.) B = -C.y;
  o = vec4(.5*(R-L+T-B),0,0,1); }`);
  const JACOBI = prog( `${HEAD}
uniform sampler2D prs, div; uniform vec2 px;
void main(){ float L = texture(prs, uv - vec2(px.x,0)).x, R = texture(prs, uv + vec2(px.x,0)).x, T = texture(prs, uv + vec2(0,px.y)).x, B = texture(prs, uv - vec2(0,px.y)).x;
  o = vec4((L+R+T+B - texture(div, uv).x)*.25, 0., 0., 1.); }`);
  const PROJ = prog( `${HEAD}
uniform sampler2D prs, vel; uniform vec2 px;
void main(){ float L = texture(prs, uv - vec2(px.x,0)).x, R = texture(prs, uv + vec2(px.x,0)).x, T = texture(prs, uv + vec2(0,px.y)).x, B = texture(prs, uv - vec2(0,px.y)).x;
  o = vec4(texture(vel, uv).xy - vec2(R-L, T-B)*.5, 0., 1.); }`);
  const SCALE = prog( `${HEAD}
uniform sampler2D src; uniform float k; void main(){ o = texture(src, uv)*k; }`);
  const ADVV = prog( `${HEAD}
uniform sampler2D vel; uniform vec2 vpx; uniform float dt, diss;
void main(){ vec2 c = uv - dt*texture(vel, uv).xy*vpx; o = vec4(diss*texture(vel, c).xy, 0., 1.); }`);
  // DYEADV: advect the vapour, let it cool away slowly (faster the higher it climbs), add what the wok gives off, and remove it inside the clearing.
  const DYEADV = prog( `${HEAD}${JETS}
uniform sampler2D vel, dye; uniform vec2 vpx, src, dc, dsz, vent; uniform float aspect, dt, diss, emit, spread, time, clearR, reach, band, radMax, alt;
void main(){
  vec2 c = uv - dt*texture(vel, uv).xy*vpx; float d = catrom(dye, c, dsz)*diss; vec2 asp = vec2(aspect, 1.);
  vec2 q = (uv - src)*asp; float t = time;
  float n = vn(vec2(uv.x*5. + t*.7, uv.y*4. - t*1.1));
  float rad = mix(.04, radMax, spread);
  float e = emit*exp(-dot(q,q)/(rad*rad))*(.55 + .9*n);
  float bnd = spread*band*(1. - smoothstep(.0, .8, uv.y))*(.25 + 1.1*vn(vec2(uv.x*3.5 - t*.35, uv.y*2. + t*.25)));     // later the lower frame gives off vapour in drifting patches: it fills the viewport
  vec2 e2 = (uv - dc)*asp; float hole = (1. - smoothstep(clearR*reach - .2*reach, clearR*reach + .02*reach, length(e2))) * step(.001, clearR);
  d += (e*1.7 + bnd*.9 + jets(uv, src, aspect, t, spread, vent)*6.4)*dt*(1. - hole);
  d *= 1. - clamp((5.*hole + 1.5*d + alt*smoothstep(src.y, 1., uv.y)*(1. - .6*spread))*dt, 0., 1.);   // thick vapour sheds faster, and so does vapour that has climbed away from the heat: the cloud keeps structure instead of saturating
  o = vec4(clamp(d, 0., 2.), 0., 0., 1.);
}`);

  // ---------------------------------------------------------------- compositor: lit vapour. The position the vapour is read from is pushed around by
  // turbulence (curls and ragged edges), thin vapour is eroded away (so it breaks into wisps), and only thick vapour holds a body.
  const COMP = prog( `${HEAD}
uniform sampler2D tDye, tVel; uniform vec2 dyePx, src, dc, shade;
uniform float aspect, time, clearR, haze, glow, detail, flick, reach, media, noise, wisp, lobe;
//#lab
uniform float dbg;
//#endlab
void main(){
  vec2 asp = vec2(aspect, 1.);
  vec2 vel = texture(tVel, uv).xy;
  // ---- steam: density, broken up by detail that is carried by the fluid so it never slides over the picture
  vec2 wp = uv*asp*noise + vel*.0016 + vec2(0., -time*.04);
  vec2 wv = vec2(fbm2(wp*1.5 + vec2(0., time*.07)), fbm2(wp*1.5 + vec2(8.3, 2.1 - time*.07))) - .5;
  vec2 uw = uv + wv*(.05*wisp)/asp;
  float d = texture(tDye, uw).x;
  float nz = fbm(wp*1.3 + wv);
  float dd = d*(.55 + .9*nz);
  float a = min(1. - exp(-max(dd - .04*wisp, 0.)*1.8), .9)*haze;
  // thick parts bulge toward the camera and catch the flame light. Two gradient scales: a narrow one keeps the wisps sharp, a wide one gives whole billows
  // their lobes. Then the light is marched a few steps back toward the wok through the vapour itself: lobes facing the flame are lit, the folds between
  // them and the far side fall into shadow, so the cloud reads as volume with gaps instead of one even veil.
  vec2 gs = dyePx*5., gw = dyePx*15.;
  vec2 g = vec2(texture(tDye, uw + vec2(gs.x,0)).x - texture(tDye, uw - vec2(gs.x,0)).x, texture(tDye, uw + vec2(0,gs.y)).x - texture(tDye, uw - vec2(0,gs.y)).x);
  vec2 gb = vec2(texture(tDye, uw + vec2(gw.x,0)).x - texture(tDye, uw - vec2(gw.x,0)).x, texture(tDye, uw + vec2(0,gw.y)).x - texture(tDye, uw - vec2(0,gw.y)).x)*.4;
  vec3 n = normalize(vec3(-(g*(.55 + 1.0*detail)*(1. - .55*smoothstep(.6, 1.6, d)) + gb*lobe), 1.));
  vec2 toS = (src - uv)*asp; float dist = length(toS);
  vec2 stp = toS/(dist + .12)/asp;                                                    // one step toward the wok, in uv (shrinks to nothing over the wok, so there is no crease where the direction flips)
  float occ = 0.;
  for(int i = 1; i <= 4; i++) occ += texture(tDye, uw + stp*(.018*float(i*i)*(1. + 1.6*lobe))).x;
  float lit = mix(.5, 1., exp(-occ*.4*lobe));
  vec3 Ld = normalize(vec3(toS/(dist + .08), .55));
  float diff = max(dot(n, Ld), 0.);
  float near = exp(-dist*dist/.075), mid = exp(-dist*dist/.55);
  vec3 ember = vec3(1., .5, .2), cool = vec3(.56, .58, .64), warm = vec3(1., .66, .38);
  float rim = pow(1. - n.z, 2.)*(.3 + .5*detail);
  float lightK = clamp(.24 + .8*mid*(.4 + .9*diff)*mix(1., lit, lobe), 0., 1.5)*(.78 + .5*flick)*mix(.8, 1., media);   // how much flame light reaches this bit of cloud
  vec3 sc = mix(cool*.42, warm, clamp(lightK*.8, 0., 1.))*lightK*(.6 + .85*nz) + cool*rim*.2;
  sc *= 1. - .35*smoothstep(.7, 1.8, d)*(1. - near);                                      // the heart of a thick cloud is in its own shadow
  sc *= 1. - shade.x*.6*(1. - smoothstep(0., .62, uv.x)) - shade.y*.55*smoothstep(.5, .92, uv.y);   // keep the type side dark
  vec3 rgb = sc*a;
  float al = a;
  // ---- light the flame throws into the room. Once the footage has faded out into the cloud (media = 0) this ember wash is what lights the steam, and
  // it settles into a soft warm floor on the type side that the plate then sits in. Kept a valid premultiplied colour.
  vec2 e = (uv - dc)*asp;
  float R = clearR*reach*1.08, wid = .22*reach;
  float open = (1. - smoothstep(R - wid, R + .02*reach, length(e))) * step(.001, clearR);
  float f = .6 + .8*flick;
  float glw = glow*exp(-dist*dist/.16)*.07*f*(1. - open) + (1. - media)*.09*exp(-dist*dist/.42)*f*(1. - open) + (1. - media)*.07*exp(-length((uv - vec2(.0, .45))*asp)*1.6)*smoothstep(.0, .4, clearR);
  rgb += ember*glw; al = max(al, max(rgb.r, max(rgb.g, rgb.b)));
  rgb += (h11(gl_FragCoord.xy + fract(time)*61.) - .5)*.014*al;
//#lab
  if(dbg > .5){ float dv = texture(tDye, uv).x; vec2 vv = texture(tVel, uv).xy; o = dbg < 1.5 ? vec4(vec3(dv*.5), 1.) : vec4(.5 + vv*.01, 0., 1.); return; }
//#endlab
  o = vec4(rgb, al);
}`);

  await ready(gl, progs);   // all programs compile in parallel, off the main thread where the driver allows it

  // ---------------------------------------------------------------- stepping
  const bindTex = (pr, name, tex, unit) => { bind(gl, tex, unit); pr.seti(name, unit); };
  const blit = (dst) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h); Q.draw(); };
  function step() {
    push = Math.max(-3, Math.min(3, push + (((P.clear - lastClear) / DT) - push)*0.12)); lastClear = P.clear;
    const px = [1 / SIM.w, 1 / SIM.h], A = L.aspect, st = stirs.length ? stirs.shift() : null, vpx = [1 / (REF_ROWS * A), 1 / REF_ROWS];
    const clearR = P.clear;
    FORCE.use(); bindTex(FORCE, 'vel', vel.read.tex, 4); bindTex(FORCE, 'dye', dye.read.tex, 5);
    FORCE.set('src', ...L.src); FORCE.set('dc', ...L.dc); FORCE.set('vent', ...L.vent); FORCE.set('aspect', A); FORCE.set('dt', DT); FORCE.set('spread', P.spread); FORCE.set('push', push); FORCE.set('clearR', clearR); FORCE.set('reach', L.reach); FORCE.set('time', time); FORCE.set('emit', P.emit);
    FORCE.set('stir', st ? st[0] : -9, st ? st[1] : -9); FORCE.set('stirV', st ? st[2] : 0, st ? st[3] : 0, st ? 1 : 0);
    blit(vel.write); vel.swap();
    CURL.use(); bindTex(CURL, 'vel', vel.read.tex, 4); CURL.set('px', ...px); blit(crl);
    VORT.use(); bindTex(VORT, 'vel', vel.read.tex, 4); bindTex(VORT, 'curl', crl.tex, 5); VORT.set('px', ...px); VORT.set('strength', (9 + 9*P.detail)*SIM.h/REF_ROWS); VORT.set('dt', DT); blit(vel.write); vel.swap();
    DIVG.use(); bindTex(DIVG, 'vel', vel.read.tex, 4); DIVG.set('px', ...px); blit(div);
    SCALE.use(); bindTex(SCALE, 'src', prs.read.tex, 4); SCALE.set('k', .8); blit(prs.write); prs.swap();
    JACOBI.use(); bindTex(JACOBI, 'div', div.tex, 5); JACOBI.set('px', ...px);
    for (let i = 0; i < jacobi; i++) { bindTex(JACOBI, 'prs', prs.read.tex, 4); blit(prs.write); prs.swap(); }
    PROJ.use(); bindTex(PROJ, 'prs', prs.read.tex, 4); bindTex(PROJ, 'vel', vel.read.tex, 5); PROJ.set('px', ...px); blit(vel.write); vel.swap();
    ADVV.use(); bindTex(ADVV, 'vel', vel.read.tex, 4); ADVV.set('vpx', ...vpx); ADVV.set('dt', DT); ADVV.set('diss', .988); blit(vel.write); vel.swap();
    DYEADV.use(); bindTex(DYEADV, 'vel', vel.read.tex, 4); bindTex(DYEADV, 'dye', dye.read.tex, 5); DYEADV.set('vpx', ...vpx); DYEADV.set('dsz', DYE.w, DYE.h);
    DYEADV.set('src', ...L.src); DYEADV.set('dc', ...L.dc); DYEADV.set('vent', ...L.vent); DYEADV.set('aspect', A); DYEADV.set('dt', DT); DYEADV.set('diss', .9962);
    DYEADV.set('emit', P.emit); DYEADV.set('spread', P.spread); DYEADV.set('time', time); DYEADV.set('clearR', clearR); DYEADV.set('reach', L.reach);
    DYEADV.set('band', L.band); DYEADV.set('radMax', L.radMax); DYEADV.set('alt', L.alt);
    blit(dye.write); dye.swap();
    time += DT;
  }
  function draw() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, S.w, S.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    COMP.use(); bindTex(COMP, 'tDye', dye.read.tex, 4); bindTex(COMP, 'tVel', vel.read.tex, 5);
    COMP.set('dyePx', 1 / DYE.w, 1 / DYE.h); COMP.set('src', ...L.src); COMP.set('dc', ...L.dc); COMP.set('shade', ...L.shade);
    COMP.set('aspect', L.aspect); COMP.set('time', time); COMP.set('clearR', P.clear); COMP.set('reach', L.reach); COMP.set('haze', P.haze); COMP.set('glow', P.glow); COMP.set('detail', P.detail); COMP.set('flick', P.flick);
    COMP.set('media', P.media); COMP.set('noise', L.noise); COMP.set('wisp', L.wisp); COMP.set('lobe', L.lobe);
    COMP.set('dbg', P.dbg || 0);   //#lab
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
    get gpuBytes() { return gpuBytes; },
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
    //#lab
    probeDye() { gl.bindFramebuffer(gl.FRAMEBUFFER, dye.read.fb); const w = DYE.w, h = DYE.h, buf = new Float32Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf); let mx = 0, sum = 0; for (let i = 0; i < w * h; i++) { const v = buf[i * 4]; mx = Math.max(mx, v); sum += v; } return { max: mx, mean: sum / (w * h) }; },
    //#endlab
    dispose() { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); },
  };
  return api;
}
