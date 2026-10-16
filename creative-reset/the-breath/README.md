# The Breath (lab prototype)

The signature scroll sequence for the Jade & Ember **Firelight** direction, built in isolation from the five-page site. Nothing here is production code and nothing in `jade-and-ember/` imports it.

Open `index.html` through any static server. The one in `tools/` handles HTTP Range requests, which the flame clip needs:

```
python3 creative-reset/the-breath/tools/serve.py 8431
# then open http://localhost:8431/
```

Scroll down the page. Scroll back up to run it in reverse. Add `?quality=low|mid|high` to force a quality tier, `?mode=calm` to see the still layout, `?video=off` to skip the flame clip, `?view=dye` (with `?lab=1`) to see the raw fluid.

## What it does

One progress value `p` (0 to 1) runs along a pinned 660svh track (560svh on phones). Everything is a function of `p`:

| p | Beat | What the viewer sees |
| --- | --- | --- |
| 0 to .09 | Hero | The Kling flame establishes the scene. Wok steam rises, driven by a live fluid solver. |
| .105 to .275 | Fire | Flame at full height. The camera pushes in slowly. Ember light warms the steam. |
| .295 to .46 | Steam | Five vents pulse out of phase along the wok's reach. Plumes bulge, collide and merge. |
| .48 to .645 | Texture | The steam is at its densest and most turbulent. It fills the frame and the flame glows through it. |
| .665 to 1 | The plate | A clearing opens from the centre and pushes steam aside. The char siu plate is revealed, lit from the flame side, on soot. |

Scroll sets the "weather" (emission, spread, clearing radius). The fluid supplies the motion, so scrolling backwards is not a recording played in reverse: the cloud drifts back in. The Kling clip plays normally underneath. It is never scrubbed.

## Reused STS components

See `FINDINGS.md`.

## Files

```
index.html          real DOM for every beat; works with no JavaScript
breath.css          layouts: no-JS, live (WebGL2), calm (stills, opacity only), phone composition
js/gl.js            WebGL2 helper (no preserveDrawingBuffer, pixel budget)
js/steam.js         stable-fluids solver + steam shading + dish compositor
js/breath.js        scroll controller, modes, Pause, gating, adaptive quality, lab hooks
media/              Kling clip, posters, dish, calm-mode steam stills (rendered by tools/plates.mjs)
fonts/              Young Serif, Karla, seal glyphs (same files as production)
tools/serve.py      local server with Range support
tools/capture.mjs   screenshots and measurements (needs an existing Playwright)
tools/plates.mjs    renders the calm-mode steam stills from the solver
shots/              captured screenshots and results.json
```
