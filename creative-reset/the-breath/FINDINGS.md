# The Breath: findings

Prototype for the Jade & Ember **Firelight** direction. Branch `lab/jade-and-ember-the-breath`, cut from the tip of `feature/jade-and-ember-v0.9`. Everything lives in `creative-reset/the-breath/`. Nothing under `jade-and-ember/` differs from v0.9, MONOLITH was not touched, no package was added, and nothing was generated or downloaded.

**Real-device status: not validated.** All measurements below come from headless Chromium with software WebGL (SwiftShader). They show the worst case for the code path, not how it will run on an iPhone or a mid-range Android phone. Those tests are still required.

## 1. Visual choreography

One progress value runs along a pinned track (660svh on desktop, 560svh on phones). Contact sheets: `shots/choreography-desktop.jpg`, `shots/choreography-mobile.jpg`.

| p | Beat | What happens |
| --- | --- | --- |
| 0 – .09 | Hero | The Kling flame sets the scene. Wok steam rises from a live fluid solver and drifts across the baked steam in the footage. |
| .105 – .275 | Fire | Flame at full height. Slow push-in on the footage and the steam together. Ember light warms the vapour near the wok. |
| .295 – .46 | Steam | Five vents along the wok's reach pulse out of phase. Plumes bulge, collide and merge. The cloud grows to the edges of the frame. |
| .48 – .645 | Texture | Densest, most turbulent point. Vorticity rises, the cloud fills the viewport and the flame glows through it. |
| .665 – 1 | The plate | A clearing opens from the middle and shoves steam aside. The char siu plate appears through the haze, lit warm from the flame side, then settles on soot. The stage hands over to the page in the same soot colour. |

Scroll sets the weather (emission, spread, clearing radius), never the fluid directly, so reverse scrolling is not a recording played backwards. In the reverse test the clearing closed (0.90 to 0.000002) and the spread returned (0.13 to 0.99) when going back from p = .8 to p = .52.

Type: each word rises out of its own line mask and leaves upward; the copy follows. Words are real headings in DOM order (checked: all five headings are exposed). On phones the type sits at the top and the dish below, a separate composition rather than a scaled desktop.

## 2. Reused STS components

| Component | Status in this prototype |
| --- | --- |
| Stir (stable-fluids solver) | **Reused and reworked.** Same method (Stam: advect, vorticity confinement, pressure projection). New: buoyancy, vents, a sign-correct clearing force, sharper dye advection with a limiter, R16F / RG16F targets (half the memory), scroll-driven weather, no touch handling. |
| `shared/gl.js` | **Reused with fixes.** No `preserveDrawingBuffer`, premultiplied alpha, DPR and pixel caps. The loop moved to the caller, which fixes the no-op `document.hidden \|\| 0`. |
| MONOLITH native scroll timeline | **Pattern reused.** One progress value on a CSS-sticky track, no scroll library. Written fresh. |
| Ambient Cinematic Hero | **Reused.** Idle-time start, 960px gate, Save-Data and 2g stop, startup and stall fallbacks, Pause control, off-screen pause. The clip plays normally and is never scrubbed. |
| Dust (GPU particles) | **Not used.** The footage already carries its own sparks, and extra particles would be the purposeless effect the brief rules out. |
| Glass (refraction) | **Not used here.** Kept for the jade lacquer surfaces in the wider redesign. |
| CSS View Transitions | **Not exercised.** A single-page lab has no navigation. The handoff to the other pages is untested. |
| HorizonX fluid-mask reference | Inspiration only. Nothing copied. |

## 3. Engineering requirements

| Requirement | Result | Evidence |
| --- | --- | --- |
| Solver mobile touch handling | Fixed by removal. No touch listeners, no pointer capture, no `touch-action` override. Only a mouse parts the steam, via a passive listener. | Code; mobile emulation. **Not tested on a real touch device.** |
| Pause GPU off-screen and on hidden tab | Done. | 0 frames in 2 s with a hidden tab, 0 frames in 2 s when the track is off-screen, loop resumes on return. `results.json` → `gating`. |
| Remove drawing-buffer preservation | Done. | `js/gl.js` |
| Adaptive resolution, DPR and GPU workload limits | Done: DPR cap (1 to 1.5), pixel cap, canvas scale 0.55 to 1, Jacobi iterations 14 to 8, then hand over to the calm layout after three slow windows. | Logic only. **Never exercised on real hardware.** Headless runs use `perf=off`. |
| Scrolling and navigation preserved | Yes. | PageDown moved the page by 787px with the Pause button focused. Tab order is brand, Pause, See the menu, Order online. |
| Accessible Pause control | Yes. 44px target, `aria-pressed`, label changes to "Play motion", works with Enter and Space, visible focus ring. Pausing switches to the calm layout at the same scroll position. | `results.json` → `keyboard`. |
| Narrative text as real DOM | Yes. Hidden beats stay in the accessibility tree (opacity, not `visibility`). Only the hero links are removed from the tab order when off-screen. | Heading check. Screen-reader testing was **not** done. |
| Reduced motion, Save-Data, no WebGL2, no JS | All four have a designed fallback. | Screenshots in `shots/mode-*`. Reduced motion and Save-Data load no video. |
| Hero media-loading protections | Ported from v0.9 `hero.js`. | With video on, the clip reached `playing` and advanced about 1.7s of playback in 1.5s, no errors. |

## 4. Performance, memory and size

Software GL only. Treat as a floor.

| Case | Frames | Frame interval (p50 / p95) | JS per frame |
| --- | --- | --- | --- |
| 1440×900, `mid` tier | 8 in 8 s | 1083 ms / 2067 ms | 0.5 ms |
| 390×844, `low` tier | 132 in 8 s | 67 ms / 83 ms | 0.2 ms |

The JS side is negligible, so cost is all in the shaders. No real-GPU number exists yet.

Memory: JS heap about 9.5 MB. GPU textures, estimated from allocation sizes, 6.4 MB on desktop and 5.1 MB on phones (the 1200×800 dish texture is 5.1 MB of that).

Sizes (bytes, gzip for text):

| Asset | Bytes |
| --- | --- |
| `index.html` | 6,072 (2,301 gz) |
| `breath.css` | 12,262 (3,997 gz) |
| `js/breath.js`, `steam.js`, `gl.js` | 18,836 / 20,182 / 4,117 (6,903 / 7,338 / 1,820 gz, 16,062 gz total, not minified) |
| `hero-wok.webp`, `hero-wok-m.webp` | 61,464, 54,436 |
| `dish-charsiu.webp` | 61,404 |
| `steam-plate.webp`, `steam-plate-m.webp` (calm mode only) | 28,174, 14,574 |
| `hero-loop.webm`, `.mp4` (unchanged, 960px+ only) | 598,073, 913,066 |
| Fonts (same files as production) | 54,580 |

**Budgets.** The v0.9 budgets are unchanged and the prototype is measured separately. Against them: JS is 16,062 B gzip against 3,000 B per page, and three modules against two scripts. Images are within the 68 KB limit. A revised envelope should wait for real-device numbers, but the shape I would propose is: Home gets its own JS budget (about 16 KB gzip unminified, to be re-measured minified and bundled into one request), the other four pages keep 3,000 B and load none of it, and a frame-time target and bail-out threshold are set from real phones.

## 5. Known defects and unresolved risks

1. **No real-device validation.** Frame rate, thermal behaviour, Safari's handling of float render targets and the premultiplied glow are all untested. Highest risk.
2. **Stills cannot show motion quality.** Judge the steam by scrolling the live prototype.
3. **Captures used `video=off`.** The clip was checked separately (plays, advances, no errors) but the full sequence with moving footage was not photographed.
4. **Phone steam is softer.** The `low` tier (112-row solver) reads closer to fog than billows. The dish is drawn in the canvas at up to 1.5× DPR, so it is softer than a DOM image on high-density screens.
5. **Mid-transition overlap.** Around p = .70 the plate hovers over the still-visible wok before the steam closes around it. It looks deliberate in stills but needs a motion check.
6. **Fast jumps.** Landing mid-sequence (anchor, scrollbar drag, reload) runs a catch-up of 120 to 150 solver steps over about 15 frames, so the first moments after a jump can look thin.
7. **No-JS height differs.** The no-JS layout is about 500svh against 660svh live, so a browser restoring scroll before the script runs lands slightly off.
8. **Not measured:** text contrast over the steam at p = .52, Lighthouse, axe, screen-reader behaviour. The type looks strong in captures, which is not a measurement.
9. **The 45-check v0.9 gate was not run.** The lab sits outside `jade-and-ember/`, and the verify workflow triggers on pushes to the v0.9 branch and on pull requests. No pull request was opened.
10. Mouse-parting of the steam is implemented but was not visually checked.

## 6. Comparison against Firelight

| Principle | Result |
| --- | --- |
| Soot and charcoal set the environment | Met. Soot ground, dark gradients, dish floor in the same soot as the page that follows. |
| Ember as illumination, not orange buttons | Met. Warm light appears in the steam and on the plate. Buttons stay outlined rice. |
| Jade selectively, as lacquer | Light touch only: the eyebrow and the gai lan. The lacquer surfaces are still to come. |
| Rice-coloured type carries contrast | Met visually. Not measured. |
| Fire, steam, texture, plating as the narrative | Met. |
| Flame-lit photography | The dish is regraded warm on the flame side and cooled on the far side. It is the existing studio photograph, graded, not re-shot. A real flame-lit shoot would improve it. |
| Preserve footage, hero composition, wok-hei idea, brand, functionality | Met. The hero composition is unchanged, links and copy are the production ones. |
| No MONOLITH Drawing Set language | Met. |

## 7. Recommendation

**The Breath is ready for your visual review, not yet for integration.** The direction works: the steam reads as steam, the dish reveal is the strongest moment, and the phone composition holds. Before integrating I would want, in order: (1) a real-device pass on an iPhone and a mid-range Android phone with the tier and bail-out thresholds adjusted, (2) your visual sign-off, (3) approval of a Home-only budget, then (4) minify and bundle the three modules into one. If a real phone cannot hold the sequence, the calm layout is a complete page, so the downside is a still page, not a broken one.
