# The Breath (lab prototype)

The signature scroll sequence for the Jade & Ember **Firelight** direction, built in isolation from the five-page site. Nothing here is production code and nothing in `jade-and-ember/` imports it.

Open `index.html` through any static server. The one in `tools/` handles HTTP Range requests, which the flame clip needs:

```
python3 creative-reset/the-breath/tools/serve.py 8431
# then open http://localhost:8431/
```

Scroll down the page. Scroll back up to run it in reverse. Add `?quality=low|mid|high` to force a quality tier, `?mode=calm` to see the still layout, `?video=off` to skip the flame clip. Lab-only (needs `js/breath.lab.js`, see Build): `?lab=1`, `?view=dye`, `?sim= &dye= &px=` for cost sweeps.

## What it does

One progress value `p` (0 to 1) runs along a pinned 660svh track (560svh on phones; the calm layout uses a shorter 440svh, 400svh on phones). Everything is a function of `p`:

| p | Beat | What the viewer sees |
| --- | --- | --- |
| 0 to .09 | Hero | The Kling flame establishes the scene. Wok steam rises, driven by a live fluid solver. |
| .105 to .275 | Fire | Flame at full height. The camera pushes in slowly. Ember light warms the steam. |
| .295 to .46 | Steam | Five vents pulse out of phase. Plumes bulge, collide and merge. |
| .48 to .645 | Texture | The steam is at its densest and most turbulent. It fills the frame and the flame glows through it. |
| .56 to .68 | Handover (1) | The footage sinks into its own steam and fades to soot. The clip stops decoding once hidden. |
| .70 to .92 | Handover (2) | Only now the clearing opens. The dish appears out of cleared soot and settles from 1.035x to 1x. |
| .665 to 1 | The plate | The char siu plate, lit from the flame side, on soot. |

Footage and dish are never visible together (`lab.overlap()` = 0). Scroll sets the "weather" (emission, spread, clearing radius). The fluid supplies the motion, so scrolling backwards is not a recording played in reverse: the cloud drifts back in. The Kling clip plays normally underneath. It is never scrubbed.

## Reused STS components

See `FINDINGS.md`.

## Files

```
index.html          real DOM for every beat; works with no JavaScript
breath.css          layouts: no-JS, live (WebGL2), calm (stills, opacity only), phone composition
src/gl.js           WebGL2 helper (pixel budget, non-blocking shader compile)
src/steam.js        stable-fluids solver + steam shading (phone and desktop looks)
src/dish.js         the dish on its own canvas at the screen's real pixel density
src/breath.js       scroll controller, handover timeline, modes, Pause, gating, adaptive quality, lab hooks
js/breath.min.js    built, shipped bundle (index.html loads this one)
js/breath.lab.js    built, same code plus window.lab test hooks (tests only)
media/              Kling clip, posters, dish, calm-mode steam stills (rendered by tools/plates.mjs)
fonts/              Young Serif, Karla, seal glyphs (same files as production)
tools/build.mjs     src/ -> js/ (no dependencies; strips //#lab blocks, minifies JS and GLSL)
tools/serve.py      local server with Range support
tools/capture.mjs   screenshots and measurements (needs an existing Playwright)
tools/contrast.py   text contrast against the rendered frames (Pillow, numpy)
tools/flame-table.py regenerates the clip's per-frame brightness table (needs ffmpeg)
tools/plates.mjs    renders the calm-mode steam stills from the solver
tools/frames.mjs, sweep.mjs, sheet.py   frame grabber, phone cost sweep, contact sheets
tools/check-layout.mjs  brand, Pause and headings stay inside the viewport and unclipped (13 viewports x 17 positions)
tools/axe-audit.mjs, tools/package.json  axe audit (dev-only deps: lighthouse, @axe-core/playwright; `cd tools && npm install`)
tools/handover-scan.py  p95 luminance per frame across the wok-to-dish handover (near-black fails)
shots/              captured screenshots, evidence sheets, results.json, contrast-results.json
```

## Deploying a separate preview

`vercel.json` and `.vercelignore` make this folder a standalone static site (no build step; `js/breath.min.js` is committed). In Vercel, create a NEW project from the repository with Root Directory `creative-reset/the-breath`, Framework Preset "Other", Production Branch `lab/jade-and-ember-the-breath`. It does not touch the existing Jade & Ember project.

## Build

`node tools/build.mjs` after any change under `src/`. If the Kling clip is replaced, rerun `tools/flame-table.py` and paste its table into `src/breath.js`.
