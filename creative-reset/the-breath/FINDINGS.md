# The Breath: findings, round 2 (corrected prototype)

Branch `lab/jade-and-ember-the-breath`, everything inside `creative-reset/the-breath/`. Nothing under `jade-and-ember/` differs from v0.9, MONOLITH was not touched, no production budget was changed, nothing was generated, bought or downloaded, and no package was added.

**Real-device status: not validated.** Every measurement below comes from headless Chromium with software WebGL (SwiftShader) on a 4-core container. It is a floor for the code path, not a prediction for an iPhone or a mid-range Android phone. **Real iPhone Safari and Android testing remain outstanding.** Screenshots and contact sheets are evidence of composition, not of motion quality: judge the steam by scrolling the live prototype.

**Reference-first rule (CLAUDE.md).** The STS Technology Reference Registry was consulted before changing the animation and shaders. Its only related entry is Three.js (particles), which is not needed: the steam, the dish pass and the build script are STS-authored code with no third-party dependency. Nothing from the registry or the dormant references was installed, run or integrated. Playwright (already installed, listed in the registry) is used only to test. Lighthouse and axe are not installed, so they were not run (installing them needs your approval); the Lighthouse-style numbers below come from the browser's own APIs and are labelled as such.

## Round 4 (replacement footage integrated)

The owner approved Wok-Seared Beef & Broccoli ($26) as the one dish, approved the reference still and plated still, and then chose clip 2. Everything below is in the lab only; the original media is unchanged and still in `media/`. Same limits: headless software GL, no real device. Provenance, prompts, job ids and spend are in `media/PROVENANCE.md` (27.5 of the 65 credit ceiling).

- **Footage:** Kling Omni Frames Pro, 1928x1072, 5.04 s, silent. Flames sit under and around the wok base and lick up its outside wall; none inside the pan or through the metal or food; no steam in the footage. Measured on the file: camera shift 0 px, background drift 0.4 on a 0 to 255 scale, food step 0.36 (clip 1 was 0.23, which the owner rejected as having no sizzle), first and last frame close enough for a hard-cut loop. It plays as `hero-wok-v2.webm` on wide screens (confirmed in headless: the webm loads and plays); phones keep the poster and the live steam, as decided.
- **One dish:** the poster, the wok on screen and the plated dish are the same beef, broccoli and chili. Dish copy is now "Wok-seared beef and broccoli, $26"; alt text describes what is shown.
- **Wiring:** the flame brightness table was regenerated from the new clip; the steam source and every chapter camera were re-measured for a wok that now sits right of centre; the dish shader's plate mask was re-fitted to the new plate (still rendered from a 2400 px source, 2x the old 1200 px, so it stays sharp at 2x); the desktop headline was reduced (`7.2vw`) and the crop focus moved so the headline sits on the dark left, off the food.
- **Steam:** with the new, brighter picture the steam was too faint against the dark wok wall, so a small room-light term (`amb`, desktop .6, phone .4, lab override `?amb=`) lifts the vapour. It still starts over the food, the food stays visible, and it thickens near the cooking surface.
- **Verified on the final build (headless):** handover scan lowest p95 64 (threshold 38), none near-black in live or calm, desktop or phone; layout check 0 problems in live and calm across 13 viewports x 17 positions; footage and dish never together (0, both directions); fallbacks, keyboard, resize, gating all ok; contrast 40 boxes, 0 below threshold (lowest 5.08:1); axe 0 violations in 24 audits; shipped script 12,832 B gzip.
- **Lighthouse (headless, software GL, not a real device):** accessibility 100 and best practices 100 on both presets. Performance was 69 to 88 on desktop across five runs on this loaded container (earlier build: 90 to 99) and 71 on the phone preset; total blocking time rose. The likely cause is the dish texture, now 2400 px and about 4 MP, being decoded and uploaded on a software GPU. Not diagnosed further, and not measured on real hardware.
- **Known defects of the footage:** two thin flame slivers just outside the wok edge; a bright jade patch on the wok's inner right wall, stronger than subtle; modest sizzle; hard-cut loop. Steam motion and the footage's motion quality are judged from stills and numbers, so they need the owner's eye on the live scroll. The calm layout and phones still show stills, not video.
- **Not done:** no 9:16 video (owner decision); Vercel's Production Branch was not changed (no Vercel access from this session); real iPhone and Android testing outstanding.

## Round 4 follow-up: Lighthouse and axe (installed with the owner's approval)

Dev-only, isolated in `tools/package.json` (not at the lab root, so Vercel never installs them; `tools/` is in `.vercelignore`): `lighthouse` 13.5.0 (Apache-2.0) and `@axe-core/playwright` 4.13.0 (MPL-2.0), pinned, installed with `--ignore-scripts`. Nothing was added to the shared framework or the site bundle. Run with `node tools/axe-audit.mjs` and `tools/node_modules/.bin/lighthouse`.

- **axe:** 24 audits (live and calm, desktop and phone, six scroll positions each): 0 violations. `color-contrast` is reported as incomplete everywhere because text sits over video and canvas, which axe cannot sample; `tools/contrast.py` covers that (40 boxes, 0 below threshold).
- **Lighthouse 13.5.0 (headless Chromium, software GL, local server, not a real device):** desktop performance 90 to 99 across runs, accessibility 100, best practices 100 after fixes, SEO 63. Phone preset: performance 83 (FCP and LCP 2.2 s, TBT 540 ms under 4x CPU throttle), accessibility 100, best practices 96 before fixes. SEO 63 is the deliberate `noindex` on the lab.
- **Two things it found and I fixed:** the brand link's `aria-label` did not contain its visible text ("Jade & Ember"), so the label was removed and the link name is now its visible text; and a missing favicon logged a 404, so an empty `data:` icon was added. Re-run on desktop only after the fix.
- Real-device performance is still unmeasured.

## Round 4 (owner review corrections), summary

Changes since `0557834`. Same limits: headless software GL, no real device. The review was worked in its priority order.

1. **Deployment.** The stable lab URL was still serving `acac577` (checked through GitHub's deployment API, since Vercel itself is unreachable from the build container). Newer commits build as Previews until the project's Production Branch is set to `lab/jade-and-ember-the-breath` or the latest Preview is promoted. That is a Vercel setting only the owner can change.
2. **Brand collision and clipping.** The header is now fixed, with a soft scrim and safe-area padding, so it no longer scrolls out of the viewport. `tools/check-layout.mjs` measures brand, tag, Pause and every chapter heading at 13 viewports (320x568 to 2560x1440) and 17 scroll positions: before 324 problems, after 0 in live and 0 in calm.
3. **"Texture" clipped.** A rem cap on the heading width was narrower than the word at large font sizes. The heading block is now `fit-content`, line padding is in `em`, and the full word is visible at every position (evidence-6-texture-1920.jpg). The word was not shortened.
4. **Dark handover.** In the calm layout the wok faded to near-black before the dish arrived (p95 luminance 13 at p .68 to .70). A dense-cloud plate (`cloud-plate`, 7 KB desktop and 5 KB phone) now bridges them. After: no frame is near-black. Lowest p95 is 47 live desktop, 85 live phone, 57 calm desktop, 78 calm phone (threshold 38). `tools/handover-scan.py` repeats it.
5. **Chapters read as different places.** A camera track per layout (`CAM`) moves media and steam together: Fire is low and close on the burner, Steam is wide, Texture pushes in on the food, then releases. The calm layout has matching crops (fire, steam, texture, cloud, dish).
6. **Steam.** Texture haze is reduced so the food stays visible, and the cloud concentrates near the cooking surface. Billow lighting from round 3 is kept. Live motion quality is not judged by stills.
7. **Plate reveal.** The dish is centred on its own canvas with type above and the dish name below on wide screens, and a warm sweep of light crosses it as it settles. The canvas is still at the screen's real pixel density. The 1200 px source remains the limit on 2x screens.
8. **Pacing.** Calm track shortened to 440svh (400svh phone). The live track is unchanged (660svh and 560svh); headings were reduced to `clamp(3.25rem, 6.6vw, 7rem)`. Not reworked: live pacing beyond that.
9. **Replacement footage.** Specified only, nothing generated and no credits spent. See the plan document (dish choice, reference still, prompts, model, preflight prices: Pro 6.25 credits, 4K 30 credits for 5 s, expected total about 31, ceiling 65). Original assets are untouched.

Re-verified on this build (headless): handover co-presence 0 on desktop and phone both ways; all fallback modes, keyboard, resize, gating (hidden, off-screen and paused draw calls 0; dish 0 draws at rest); calm layout check 0 problems; contrast 40 text boxes, 0 below threshold (lowest 4.66:1). The matrix caught one regression, the phone Fire copy at 4.26:1 over the closer camera crop, fixed by a stronger phone top scrim. Shipped script 12,775 B gzip (was 12,413).

Known limits of this round: the 1280x720 clip is enlarged about 1.9x at the Texture push-in on a 1440 screen, so footage looks soft there; the phone Fire and Steam crops are close to each other and steam is faint in headless runs; frame rate and GPU memory were not re-measured after the extra compositor reads; Lighthouse and axe are not installed here and were not run; real iPhone Safari and Android testing remain outstanding.

## Round 3 (Firelight continuation), summary

Changes since round 2 (commit c806243). Same limits: headless software GL, no real device.

- **Steam now reads as volume.** The compositor lights the vapour from the wok through the vapour itself (four light-march samples toward the source) and uses a wide gradient scale for whole-billow lobes, so lobes facing the flame are lit and the folds and far sides fall into shadow, instead of one even veil. Desktop got finer wisps (noise 3.4, wisp .85, narrower vents, lobe 1.4). A crease that appeared over the wok when the light direction flipped is fixed by shrinking the step over the source. Evidence: `shots/evidence-4-steam-volume-r3.jpg` (phone p .36, .62, .66) and `shots/evidence-4-steam-volume-r3-desktop.jpg` (p .66). Stills only; motion is unjudged.
- **Headline gap closed.** "Texture" leaves at p .625 and "The plate" arrives at p .645, so there is always a headline while the cloud covers the footage.
- **Warmer cloud at the handover.** The ember wash that lights the cloud once the footage has faded is a little stronger (.05 to .09).
- **Re-verified on this build:** handover co-presence 0 on desktop and phone in both directions; all four fallback modes (reduced motion, Save-Data, no WebGL2, no JavaScript); keyboard; resize; hidden-tab, off-screen and paused draw calls 0; dish 0 draws at rest; contrast 40 text boxes, 0 below threshold (lowest 4.89:1). Shipped script 12,413 B gzip (was 12,251).
- **Not re-measured:** frame rate and GPU memory. The compositor gained about six texture reads per pixel, so phone cost should be a little higher than round 2; check on a real phone.
- **Vercel:** deployed by the owner as `jade-ember-the-breath-lab` from this folder (`vercel.json`, `.vercelignore`).

## 1. The three corrections

Contact sheets for the whole sequence: `shots/choreography-desktop.jpg`, `shots/choreography-mobile.jpg`. The round-1 frames are kept in `shots/before/`.

### Priority 1: plate and wok overlap (p ≈ 0.62 to 0.74)

**Cause.** The dish was drawn through a soft-edged hole over footage that was still fully visible. At p = 0.70 the plate floated over the lit wok, and the hole in the steam opened exactly where the wok was.

**Fix (default I chose, since the brief left the mechanism open).** The handover now happens in a fixed order, so the footage and the dish are never on screen together:

| p | What happens |
| --- | --- |
| 0.56 to 0.68 | The flame and wok sink into their own steam. The cloud is at its densest and carries the transition; the footage fades to soot and the flame light dims with it. The clip stops decoding once it is hidden. |
| 0.70 | Only now does the clearing open. Steam is pushed aside and the dish rises out of cleared soot. |
| 0.70 to 0.92 | The dish settles back from 1.035× to exactly 1× so it lands on the pixel grid. |
| 0.74 to 1 | The type side keeps a soft ember floor that the plate sits in. |

The calm layout (reduced motion, Save-Data, no WebGL2) had the same overlap because its steam still contains the wok. It now dissolves poster and steam still to soot first, then brings the dish in over soot.

**Evidence** (`shots/evidence-1-handover-desktop.jpg`, `shots/evidence-1-handover-mobile.jpg`, desktop and mobile composed independently):

| Measure | Before | After |
| --- | --- | --- |
| Worst co-presence of footage and dish over the whole track, `min(footage opacity, dish opacity at plate centre)` (`lab.overlap()`) | 1.00 at p ≈ 0.67 (calm layout 0.50) | 0.00, desktop and phone |
| Real scroll loop, 16 stops forward and back (p 0.2, 0.5, 0.62, 0.66, 0.70, 0.74, 0.78, 0.84 and back to 0), stops with footage above 2% opacity and the dish canvas visible | not measured | 0 of 16, desktop and phone |
| Reverse | closed (round 1) | Clearing closed from 0.90 to 0 and footage returned to 1.0 by p = 0.5 on both layouts. Frames: `shots/handover-{desktop,mobile}-{fwd,back}-p0xx.jpg` |

### Priority 2: steam realism on phones

**Cause.** Five wide vents (about 84 px across in a 390 px frame, 88 px apart) overlapped into one sheet, so the plume read as fog. The phone solver also had only about 5.8 thousand cells, a source that spread wide, and an alpha curve that saturated.

**Fix.**
- Phone gets its own look: narrower vents (about 46 px), a smaller source, finer noise, less lower-frame vapour, and vapour that thins out as it climbs, so plumes rise as separate billows.
- The vapour is read through a turbulence warp and eroded where it is thin, so edges curl and break into wisps instead of fading smoothly; dense cloud shades as one soft body, not a crumpled surface.
- Phone grid: 52×112 solver and 133×288 dye became 91×197 and 215×465. Velocities are now in reference units, so motion looks the same on every quality tier.
- The same shader also gives desktop sharper wisps (`shots/evidence-2-steam-desktop.jpg`).
- Heat, flame and steam stay linked: the steam is lit from the wok, and once the footage fades the dying ember wash lights the cloud.

**Evidence:** `shots/evidence-2-steam-mobile.jpg` (before and after at p 0.20, 0.36, 0.52) and `shots/choreography-mobile.jpg` (p 0.62 to 0.74 is where the difference is largest). Honest read: the early beats were already wispy on phones, the mid beats are noticeably more structured, and the dense cloud around the handover now reads as billowing smoke. A still cannot prove "rising and dissipating"; that needs your eye on the live scroll.

### Priority 3: dish sharpness

**Cause.** The dish was drawn inside the steam canvas, which renders at 1 to 1.5 device pixels per CSS pixel and shrinks under load. On a 3× phone the plate was resampled down to about 0.65× of the source and then enlarged by the browser, and on a 2× laptop it was enlarged 2× with plain bilinear filtering.

**Source image (reviewed).** `dish-charsiu.webp` is 1200×800, cropped from a 1472×1104 generation (seed 9903, `jade-and-ember/media/PROVENANCE.md`). The unselected and original files were not kept. The plate is 72% of the width, so about 864 source pixels. Displayed plate sizes: 864 CSS px on a 1440 desktop (1728 device px at 2×, a 2.0× upscale) and 374 CSS px on a 390 phone (1122 device px at 3×, a 1.3× upscale).

**Fix (no new imagery).** The dish has its own canvas, sized to the dish and the screen's real pixel density (up to 3× and 4 megapixels), placed on whole CSS pixels. It resamples with Catmull-Rom, applies an unsharp mask clamped to the range of the four nearest source pixels (so no halos), and adds a fine static grain so upscaled areas keep a photographic texture. The same grade as before is kept (flame side warm, far side cooled). It redraws only while the clearing moves: 0 draw calls in 3 seconds at rest.

**Evidence:** `shots/evidence-3-dish-sharpness-desktop-2x.jpg` (1440 px viewport at 2×) and `shots/evidence-3-dish-sharpness-mobile-3x.jpg` (390 px viewport at 3×), the same region before and after, 1:1 pixels. The desktop gain is clear (glaze edges, fibre, seeds). The phone gain is smaller because the source is nearer its natural size there.

**Limit.** At 2× desktop the plate is still enlarged 2× from the source. The new path is as good as the existing pixels allow, but real crispness at that size needs a source of at least about 2400×1600. Options needing your approval: a regenerated or real photograph, or re-rendering seed 9903 at larger size. I did not generate anything.

## 2. Performance

Software GL, headless, 4-core container, shipped bundle `js/breath.min.js` unless stated. Treat as a floor. Raw numbers: `shots/results.json` (`perf`, `load`, `gating`, `assets`).

### JavaScript size and what was trimmed

| | Round 1 | Round 2 |
| --- | --- | --- |
| Shipped JS | 3 modules, 16,062 B gzip, unminified | 1 file, **12,251 B gzip** (11,063 brotli, 32,876 B raw), including the new dish pass |
| Same code without the build | n/a | 17,017 B gzip |
| Requests for script | 3 | 1 |

Done: one bundle (one request), comments and whitespace removed including inside the shaders, lab and debug code stripped (about 0.7 KB gzip), per-frame video readback removed, dish moved out of the steam shader. `tools/build.mjs` is plain Node with no dependency and does not rename identifiers. Not done: identifier mangling (my estimate is about 1 to 1.5 KB gzip, unmeasured) and shader simplification (shader text is about 3 KB gzip of the 12). The 3,000 B per page budget cannot hold a fluid solver; the production budget was not touched.

### Findings that changed the code

1. **A CPU-waits-for-GPU stall.** Every 120 ms the page copied the video into a canvas and read the pixels back, to measure flame brightness. With the video running, headless showed a 4,047 ms long task at start and a ~900 ms long task on every frame afterwards. Now: one 212 ms task at start and none after. The brightness of each clip frame is read from a 121-entry table measured offline (`tools/flame-table.py`); regenerate it if the clip is replaced. On real hardware the stall will be smaller than in software, but the pattern (CPU readback queued behind GPU work) is a known risk on phones.
2. **Shader compile no longer blocks the page.** Programs compile with `KHR_parallel_shader_compile` where the driver offers it and are checked when ready. In headless this showed no change (about 200 ms either way), so the benefit is unproven; it matters on drivers with slow synchronous links.
3. **Where the phone cost is.** A sweep at p = 0.55 on a 390×844 viewport at 2×: solver and dye grids hardly matter (26k/150k cells 9.0 fps, 5.8k/38k cells 12.0 fps), while canvas pixels matter a lot (0.75 Mpx 10.6 fps, 0.45 Mpx 14.4 fps, 0.33 Mpx 16.3 fps). The final phone tier is 18k/100k cells and 0.5 Mpx (about 12.9 fps in the same software setup).

### Desktop (1440×900, tier `mid`, DPR 1)

| Measure | Result |
| --- | --- |
| Frame rate in software GL | 1.1 to 1.5 fps (p50 774 to 978 ms). Meaningless as a device number; it shows the load is GPU-bound |
| Main-thread (renderer) CPU while animating | 0.00 s per s |
| GPU process CPU (software GL) | about 3.7 s per s (saturated), no real-GPU number exists |
| Solver passes per frame | 47 (2 sub-steps × 23 passes + 1 composite). The measured draw-call counts in `results.json` are inflated by a start-up catch-up burst, so use this figure |
| GPU memory (estimated from allocations) | 10.0 MB at DPR 1 (was 6.4), **21 MB at DPR 2** because the dish canvas is 2400×1600 |
| Dish draws | about 1 per frame while the clearing moves, 0 at rest |

### Phone (390×844, tier `low`, DPR 2 and 3)

| Measure | Result |
| --- | --- |
| Frame rate in software GL | 10 to 13 fps (p50 71 to 93 ms, p95 122 to 193 ms). Round 1 measured 15 fps with the old, coarser phone solver |
| Main-thread CPU while animating | 0.02 s per s |
| Solver passes per frame | 20 (1 step × 19 + 1 composite) |
| GPU memory (estimated) | about 6 MB at DPR 1, **12 MB at DPR 3** (dish canvas 1560×1041) |
| Adaptive load | Unchanged and never exercised on real hardware: canvas scale 0.55 to 1, then fewer pressure iterations, then hand over to the calm layout after three slow windows. The dish canvas is not scaled down by it |

### Loading (cold cache, shipped bundle, Lighthouse-style, not Lighthouse)

| Run | FCP / LCP | Total blocking time | CLS | Requests | Transferred |
| --- | --- | --- | --- | --- | --- |
| Desktop, unthrottled | 52 ms | 10 ms | 0 | 11 | 838 KB (598 KB is the clip) |
| Desktop, slow 4G + 4× CPU | 876 ms | 182 ms | 0.031 | 12 | 838 KB |
| Phone, unthrottled | 56 ms | 33 ms | 0 | 10 | 234 KB (no clip) |
| Phone, slow 4G + 4× CPU | 864 ms | 144 ms | 0 | 10 | 234 KB |

The clip loads only on 960 px and wider, after load and when idle. Phones never request it. The 0.031 desktop CLS appeared only in the throttled run and was not diagnosed (below the 0.1 threshold).

### Suspension and Pause (draw calls on the steam and dish canvases in 2 s)

Visible 133, hidden tab **0**, resumed 266, off-screen **0**, back on screen 180, paused by the visitor **0** (calm layout), played again 399. Also checked: the clip pauses when the footage is hidden at p = 0.8 and plays again at p = 0.3.

### Recommended Home-specific budget (a recommendation only; no production budget was changed)

- Home: one script request, **up to 14 KB gzip** (12.3 KB shipped now), no inline JS beyond today's 64 B. The other four pages keep the 3,000 B budget and load none of it.
- Runtime ceilings, to be set from real phones: main-thread work under 2 ms per frame, steam canvas up to 0.5 Mpx on phones and 1.3 Mpx on desktop, GPU memory up to about 25 MB, zero draw calls while hidden or off-screen (met in headless).
- Images: the dish stays within 68 KB today. If a sharper dish source is approved, a Home-only exception of about 180 KB for that one image is the cost of crispness at 2×.
- The "delivered bytes +0.5% over v0.8" rule cannot apply to Home. Give Home its own baseline.
- Do not set thresholds on frame time until an iPhone and a mid-range Android phone have been measured.

## 3. Verification (shipped bundle for the first block; headless, not a real device)

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop and phone viewports | Live sequence runs on both, no console errors, no horizontal overflow | `shots/results.json`, `shots/*-p0xx.jpg` |
| Reduced motion | Calm layout, no clip requested, Pause hidden, new dissolve-through-soot handover | `shots/mode-reduced-motion-*` |
| Save-Data | Same as reduced motion | `shots/mode-save-data-*` |
| No WebGL2 | Calm layout, no errors | `shots/mode-no-webgl2-*` |
| JavaScript disabled | Complete page, dish as an ordinary figure | `shots/mode-no-javascript-*` |
| Keyboard | Tab order: brand, Pause, See the menu, Order online; 2px focus ring; Enter and Space toggle Pause (live, calm, live); PageDown scrolled 787 px; all five headings in the accessibility tree; both canvases `aria-hidden` | `results.json` → `keyboard`, `shots/keyboard-focus-pause.jpg` |
| Reverse scrolling | Handover and clearing reverse correctly on both layouts (section 1) | `shots/handover-*` |
| Viewport resizing | 1024×768, 390×844, 844×390 and back to 1440×900: grids, steam canvas and dish canvas re-allocated, no overflow, still live | `results.json` → `resize` |
| Pause and resume | Pause switches to calm at the same scroll position and back | `results.json` → `keyboard`, `gating` |
| Off-screen and hidden-tab suspension | 0 draw calls hidden, off-screen and paused | section 2 |
| Contrast | 36 text boxes measured against the rendered frames without the text (95th-percentile background, worst case). **All pass**: lowest are the hero eyebrow at 4.9:1 (needs 4.5, raised from 4.07 by lightening the jade), "Texture" at 3.2:1 and the hero headline at 3.5:1 (large text needs 3:1). Means are 7:1 and above | `shots/contrast-results.json`, `tools/contrast.py` |
| Lighthouse | **Not run.** Not installed; installing needs your approval | |
| Screen reader, axe | **Not run** | |

Limits of the contrast check: headless frames at seven positions on each layout, text shadows ignored, boxes under 50% opacity (mid-transition) excluded. It samples the sequence; it does not prove every frame.

## 4. Remaining defects and limitations

1. **No real-device validation.** Frame rate, thermal behaviour, Safari's float render targets, `KHR_parallel_shader_compile` support and premultiplied glow are unverified. Highest risk.
2. **Dish still enlarged 2× on a 2× laptop.** A larger source needs your approval (section 1).
3. **More GPU memory.** 21 MB on a 2× laptop and 12 MB on a 3× phone, up from 6.4 and 5.1, because the dish now has real pixels. The adaptive logic does not shrink it. A cap at about 3 megapixels would save about 5 MB on desktop.
4. **Phone cost rose in software GL** (15 fps to about 13 fps) after the finer grid and richer shader. The sweep says canvas size is the lever if a real phone struggles.
5. **Stills cannot show motion quality.** Steam, dissipation and the mouse-parting effect (still not visually checked) need your eye on the live scroll.
6. **A short text gap.** Around p = 0.66 the Texture copy has left and "The plate" has not arrived yet, about a ninth of a screen without a headline. It reads as a breath over the cloud; say if you want it closed.
7. **Fast jumps** (anchor, scrollbar drag, reload mid-way) still run a 120 to 150 step catch-up over about 15 frames.
8. **No-JS height** is about 500svh against 660svh live, so scroll restoration before the script runs can land slightly off.
9. **Calm layout** now reaches the dish through soot with no steam in between. That is deliberate for reduced motion, and the calm steam stills were re-rendered from the new solver.
10. **The 45-check v0.9 gate was not run** on this lab: it sits outside `jade-and-ember/` and no pull request was opened. The gate was not changed or weakened.
11. **Preview frame.** The hosted preview is a claude.ai artifact; whether it runs WebGL2 and a tall sticky scroll inside that frame was not verified. If it does not, the local server in `tools/serve.py` is the reference.
12. **CLS 0.031** on desktop under throttling was not diagnosed.

## 5. Reproduce

```
python3 creative-reset/the-breath/tools/serve.py 8431
node creative-reset/the-breath/tools/build.mjs          # src/ -> js/breath.min.js (shipped) and js/breath.lab.js (adds window.lab for tests)
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node creative-reset/the-breath/tools/capture.mjs --only=shots,modes,keyboard,handover,resize,gating,perf,load,contrast,assets
python3 creative-reset/the-breath/tools/contrast.py
```

`tools/frames.mjs` grabs single frames at any DPR, `tools/sweep.mjs` runs the phone-tier sweep, `tools/sheet.py` builds contact sheets and crops, `tools/plates.mjs` re-renders the calm steam stills.
