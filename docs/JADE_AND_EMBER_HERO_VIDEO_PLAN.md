# Jade & Ember — Cinematic Hero Video Production Plan

**Status:** Proposal for approval. **No video has been generated, no media uploaded to a generator, nothing merged, deployed or published.**
**Builds on:** `jade-and-ember/` v0.2 (`2382116`, approved as the working foundation).
**Standard applied:** STS Premium Web Design v2.0 (Part VI media justification and source-media discipline, Part V motion, Part XI accessibility, performance and real-device QA).
**Prepared:** 2026-10-09.

---

## 1. Recommendation in one table

| Item | Recommendation |
|---|---|
| Deliverable | One silent, looping 16:9 hero clip behind the existing copy, desktop and landscape only. Mobile portrait keeps the still by default. |
| Source frame | The delivered desktop poster, `jade-and-ember/media/hero-wok.webp` (1920×1080, seed 2202), used unchanged as the first frame and, for loop generation, the last frame. |
| Camera | Locked off. No push, no zoom, no pan. |
| Motion | The flame flickers and licks, steam drifts, a few sparks rise, oil glints and the food jostles slightly. Everything rigid stays rigid. **No ingredient toss.** |
| Duration | 5 s at 24 fps, as generated. Looped; 4 s if the crossfade fallback is needed. |
| Loop | Generate with first frame = last frame. Fall back to a zero-credit crossfade loop. Never ping-pong (rising steam would visibly fall). |
| Model | **Kling 3.0 Omni (Frames)** (`kling_o3_flf`), standard mode, sound off, 16:9, 5 s. |
| Cost | **5 credits per attempt. Expected 5 to 10 credits; hard cap 30 credits** (balance 240.5). |
| Fallback in the page | Poster still (LCP), plus the v0.2 slow push for visitors who allow motion but get no video; still-only for reduced motion, Save-Data, slow connections and no-JS. |
| Gates | Gate A (desktop clip) is what this plan asks you to approve. Gate B (portrait clip) and Gate C (a real ingredient toss) are optional and each needs its own approval. |

---

## 2. What is verified and what is not

**Verified in this session (read-only or local):**
- Credit prices below come from the generator's own `get_cost` preflight. That call is documented to return the cost without submitting a job. Your balance was 240.5 before and after, and your transaction history shows no spend today other than two earlier Kling clips.
- Model capabilities (start and end frame roles, durations, resolutions, audio parameter) come from the model catalog.
- Your own Kling v3.0 standard clips from Oct 9 render at 1280×720, so that is the expected native size for the same model family. The resolution of the recommended Omni (Frames) model in standard mode is not stated in the catalog: **[unverified]** until the first result.
- The crossfade-loop `ffmpeg` filter graph in section 6 was run on a synthetic 5 s clip and produced a 4.0 s, 96-frame output as expected.

**Not verified:**
- Whether any of these models will keep this particular flame, steam and food believable. That can only be learned by generating, which this plan does not do.
- The QA measurement commands in section 9 have not been run; they will be dry-run on a synthetic clip before any credit is spent (step 0).
- Whether iPhone or Safari plays, autoplays or throttles the clip **[unverified]**. Real-device testing is required before the video is called done.
- Prices can change; every submission is preceded by a fresh `get_cost`.

---

## 3. Is video justified here? (Part VI.1)

All of the following must hold.
1. **Experiential subject a still cannot convey:** yes, wok hei is flame, steam and heat in motion.
2. **One subject can carry the viewport:** yes, the pan and its flame.
3. **Owned or truthful:** the clip is concept media derived from a concept still; the page already labels the imagery as AI-generated concept art and the restaurant as fictional.
4. **Source quality and performance headroom:** the page is 139 KiB at LCP 1.8 s with CLS 0; a deferred 1 MB clip does not touch the LCP path.
5. **Content works without it:** yes, v0.2 is a complete designed still.

Conclusion: justified for one hero loop. It is not justified anywhere else on the page.

---

## 4. Source frame

**File:** `jade-and-ember/media/hero-wok.webp`, 1920×1080, 16:9. Generated with Z-Image-Turbo (seed 2202, 2048×1152 source), split-tone graded, resized (see `media/PROVENANCE.md`).

**Why this frame:** it is already the poster and the approved look. Using the exact poster as frame 0 means the handoff from still to video is invisible (no pop, no grade jump). Aspect ratio matches the delivery box (Part VI.5 rule 4).

**Review against Part VI.5 (composition before prompt):**

| Rule | Assessment |
|---|---|
| The source frame makes the intended motion obvious | Yes. A tall flame and a steam plume already occupy the centre; the model has a clear thing to animate. |
| Fix the still, not the prompt | One thing to decide: the flame is a single large frozen flare. If the model "settles" it, the clip could lose drama. Mitigation: the prompt asks the flame to keep moving to the last frame. If a run fails because of the frame, replace the frame (new seed from the same prompt, same grade) rather than re-prompting. |
| Light consistent and named identically | Still: warm ember firelight with a faint cool jade tint in the shadows. The prompt uses the same words and no words implying time passing (no "dims", "fades", "settles"). |
| Control the invented | Remove from the still anything unwanted. Remaining in frame: out-of-focus steel pots (left), steel counter (right and bottom), a stray bowl corner (bottom-left, outside the hero crop on desktop). These are all rigid objects; they are listed as "must not move". No people, hands, vehicles or text are present. |
| One consistent subject | Yes, one wok scene. |

**Regions for QA (percent of the 1920×1080 frame; to be confirmed on the frame before running):**

| Region | Box | Expected motion |
|---|---|---|
| Flame | x 44–68 %, y 8–62 % | high |
| Steam | x 28–72 %, y 0–55 % | medium, upward |
| Food in pan | x 31–67 %, y 56–76 % | low (jostle, glints only) |
| Rigid: pan body, handles, burner | x 21–83 %, y 48–62 % (handles) and x 24–80 %, y 70–100 % | none |
| Rigid: background pots and walls | x 0–30 % | none |

**Text interplay:** the left 0–32 % of the page is charcoal with copy, and the scrim already holds ≥ 99 % of pixels behind the copy at ≥ 4.5:1. The flame sits at about x 44–68 % of the image, i.e. away from the copy. The contrast test will be re-run on video frames (section 11).

**Upload:** the generator needs the still as an input. Approval of this plan includes uploading `hero-wok.webp` (the already-approved poster) to your Higgsfield account, converted to PNG. No other file is uploaded.

---

## 5. Camera and motion design

**Camera: locked off.** Reasons: it makes first = last frame achievable, keeps the dark copy zone aligned with the scrim, prevents a second moving layer under text, and removes the most common source of generative-video geometry drift. The page's own CSS push is switched off whenever the video is playing, so there is exactly one primary motion on the page (Part V.4).

**Environmental motion (the mood):**
1. Flame: flickers and licks upward; shape changes continuously; the base stays attached to the pan wall.
2. Steam: soft wisps drift upward and slightly right (away from the copy), 8 s-class slowness, not billowing.
3. Sparks: a few small embers rise and fade near the flame; never more than a handful.
4. Heat shimmer: none requested (models turn it into haze or bloom).

**Food motion (the priority):**
Realistic food motion in a generated clip is motion that is physically coupled to something visible. So the clip asks for:
- tiny jostle of the beef and broccoli as if the pan is sizzling,
- moving highlights on glossy beef and oil,
- steam passing in front of the food.

It deliberately does **not** ask for an airborne toss. A toss is the highest-risk motion for generative video: pieces change count, shape and colour mid-air (morphing), and it is the most likely way to produce "uncanny food". Part VI.5 also says to prefer less motion over more risk. If you want a visible toss, that is Gate C with a different model and a bigger budget (section 7), and it should be approved only after seeing Gate A.

**Must not move:** the wok, both handles, the burner, the steel counter, the pots and walls, the pan's rim and food outline (apart from the jostle). Pan rim straightness is a measured pass/fail item.

**Draft prompt (positive phrasing; minimal negatives, because negative nouns can summon the thing, as happened with "candles" in image generation):**

> Locked-off tripod shot, no camera movement and no zoom. A tall flame flickers and licks upward from the wok, its shape changing continuously until the last frame. Soft steam rises in slow wisps. A few small sparks drift up and fade. The beef, broccoli and red chili stay settled in the pan with a tiny sizzling jostle and moving glints on the glossy oil. The wok, its two handles, the burner, the steel counter and the out-of-focus pots stay completely still. Warm ember firelight with a faint cool jade tint in the shadows, identical to the first frame. Photorealistic, natural speed. The final frame matches the first frame. No people.

Settings: aspect 16:9, duration 5, mode `std`, sound `off`, start image = poster, end image = poster, one result (no count > 1), no preset, no prompt enhancement.

---

## 6. Duration and seamless-loop strategy

**Duration:** 5 s at 24 fps. Reasons: the cheapest tier (Kling cost scales about 1 to 1.5 credits per second); long enough for flame and steam to avoid a visible cycle; short enough to weigh about 1 MB. Anything over 5 s auto-playing beside content needs a visible Pause control (WCAG 2.2.2); that control already exists and will be retargeted to the video.

**Loop options, ranked:**

| # | Strategy | Cost | Risk | Use |
|---|---|---|---|---|
| 1 | **First frame = last frame at generation** (`end_image` = the same poster) | 0 extra | The model may freeze the flame in the middle or drift to a different scene and return abruptly. | Primary. |
| 2 | **Crossfade loop in post:** blend the last 1 s into the first 1 s, drop 1 s from length | 0 credits | Slight double-exposure of the food in the dissolve. Acceptable because food is nearly still. Output is 4 s. | Fallback if 1 passes everything except the endpoint. |
| 3 | Ping-pong (forward then reverse) | 0 credits | Steam and sparks visibly fall in reverse. | **Rejected.** (It worked for the architecture template only because a camera push is symmetric.) |
| 4 | Generate a longer clip and trim a seamless window | 7.5 to 12 credits | Costs more; drift grows with length. | Not planned. |

**Crossfade command (run on a synthetic 5 s, 24 fps clip: output 4.0 s, 96 frames; `L` = clip length, `d` = overlap):**

```bash
ffmpeg -i clip.mp4 -filter_complex \
"[0:v]split=3[a][b][c];\
[a]trim=start=0:end=1,setpts=PTS-STARTPTS[head];\
[b]trim=start=1:end=4,setpts=PTS-STARTPTS[mid];\
[c]trim=start=4:end=5,setpts=PTS-STARTPTS[tail];\
[tail][head]xfade=transition=fade:duration=1:offset=0[blend];\
[blend][mid]concat=n=2:v=1:a=0[v]" -map "[v]" loop.mp4
```
(With `L = 5`, `d = 1`.) The output begins at `c(L-d)` and ends at `c(L-d)` minus one frame, so the cut point is continuous.

---

## 7. Model selection and credits

All figures are `get_cost` quotes taken on 2026-10-09 for a silent clip with no extras. Balance: **240.5 credits** (plan: starter).

| Model | Frames supported | Setting | Credits | Note |
|---|---|---|---|---|
| **Kling 3.0 Omni (Frames)** `kling_o3_flf` | first and last | std, 5 s, sound off | **5.0** | **Recommended.** Cheapest option that accepts a last frame. 6 s = 6.0; pro 5 s = 6.25; 9:16 5 s = 5.0. |
| Kling v3.0 `kling3_0` | first and last | std, 5 s, sound off | 7.5 | Backup #1. Proven in this studio (template hero; your Oct 9 clips: 1280×720). Sound on is 10, 8 s is 12, pro 8.75, 4K 30. |
| Seedance 1.5 Pro `seedance1_5` | first and last | 4 s, 720p, no audio | 4.8 | Cheap alternative if Kling struggles with the flame. 8 s = 9.6. |
| MiniMax Hailuo 2.3 `minimax_hailuo` | first and last | 6 s, 1080 | 10 | Tagged "natural physics". Backup #2 for food and steam realism. |
| Kling 3.0 Turbo | first only | 5 s, 720p | 7.5 | No last frame, so no loop-by-construction. Not chosen. |
| Grok Imagine 1.5 Lite | first only | 5 s, 720p | 5.0 | No last frame. Not chosen. |
| Grok Video 1.5 | first only | 5 s, 720p | 22.5 | Not chosen. |
| Seedance 2.5 | first and last | 5 s, no audio, 480p draft | 15 | Only formal draft path. 720p 35, 1080p 60. For Gate C only. |

**Why Kling 3.0 Omni (Frames) first:** it is the cheapest path that gives the loop by construction (rule 1), it is silent (sound on doubles Kling cost), and it stays in a model family we have already used for this studio's hero loops. It is the least proven of the Kling options for this subject, so if its first result fails on the model rather than the frame, the plan moves to Kling v3.0 rather than re-prompting repeatedly.

**Not used:** the unlimited-generation allowance (none is available on this account), 4K output, any upscaler, audio, batches, variants (`count` 1 only), presets.

### Credit budget

| Gate | Purpose | Attempts allowed | Cost per attempt | Expected | Hard cap |
|---|---|---|---|---|---|
| **A** | Desktop 16:9 loop | up to 4 | 5.0 (A1, A2), 7.5 (A3), 10 (A4) | **5 to 10** | **30** |
| B (optional) | Portrait 9:16 loop from `hero-wok-m.webp` | up to 3 | 5.0 | 5 to 10 | 15 |
| C (optional, not requested) | Visible ingredient toss | separate plan | 15 draft then 60 final (Seedance 2.5) or 10 (Hailuo) | n/a | n/a |

- Best case for Gate A: **5 credits** (about 2 % of the balance).
- Requested approval: **up to 30 credits** (Gate A only). With Gate B: up to 45. Remaining balance in the worst approved case: 195.5.
- Attempt ladder: A1 Omni (Frames) with the draft prompt, 5.0. A2 Omni (Frames) with one prompt revision or one new seed of the same still, 5.0. A3 Kling v3.0 std first and last frame, 7.5. A4 Hailuo 2.3 6 s, 10.0. Stop and report after A3 if no attempt is close; A4 only with a go-ahead.
- Rules: a fresh `get_cost` before every submission; abort if it exceeds the quoted figure; one job at a time; no second attempt before the previous one is reviewed; every attempt is logged with job id, model, settings, cost and verdict.

---

## 8. Source-media pass criteria (defined before any run)

Per Part VI.5 rule 7. Numbers are starting defaults and will be recorded with the results.

| Criterion | Pass |
|---|---|
| Looks like the poster | Frame 0 visually matches the poster; no grade or white-balance jump |
| Rigid objects stay rigid | Pan rim, handles, burner, pots: region SSIM against frame 0 ≥ 0.97 on every frame; no visible warping of the rim |
| Food stays believable | No change in the number or colour of visible pieces; food-region SSIM against frame 0 ≥ 0.85; no frame-to-frame jump above 2× the median |
| The scene is alive | Flame-region luma varies frame to frame (not frozen); steam region changes |
| No drift | Mean luma excluding the flame region within ±6 % of frame 0; no haze, bloom or veiling |
| Endpoints match (for loop by construction) | SSIM(first, last) ≥ 0.97 |
| Seam is invisible when looped | Difference at the cut ≤ 1.5× the median adjacent-frame difference; reviewed by eye on two consecutive loops |
| Photosensitivity | No more than 3 flashes per second (frame-mean luma change < 10 % between consecutive frames); no large-area red flashing |
| Generated-media defects (Part VI.6) | None of: texture swimming, edge crawl, gibberish text, extra hands, melted detail, sharpness falling off, new objects appearing |
| Resolution | At least 1280×720 native; no upscaler in the budget |

Review process: first, middle and last frames side by side with the poster; then the clip at full size, twice looped; then the numeric checks. Any single "fail" on rows 2, 3 or the loop rows means the clip is not production footage.

The measurement commands (frame extraction, SSIM, per-frame luma with `signalstats`, region crops) have **not yet been run**; step 0 dry-runs them on a synthetic clip.

---

## 9. Post-production and delivery

All local, zero credits.

1. Verify (section 8).
2. If the endpoint criterion fails but everything else passes, apply the crossfade loop (section 6).
3. Match grade: compare frame 0 with the poster; apply a minimal colour correction if the mean RGB differs visibly.
4. Encode, silent: H.264 High, yuv420p, `+faststart`, target **≤ 1.0 MB**; WebM VP9, target **≤ 0.7 MB**. 24 fps, 1280×720 (no upscale to 1920).
5. Keep the poster as the LCP image and the first frame. Poster: `hero-wok.webp` unchanged.
6. Record provenance in `media/PROVENANCE.md`: model, settings, job id, prompt, seed, credit cost, retouch and encode steps, known defects.

Page-weight budget: video is **not** in the LCP path and is not preloaded. Current page: 139 KiB, LCP 1.8 s. Expected added transfer: about 1 MB, deferred and conditional. Lighthouse performance must stay at or above 95, CLS 0.

---

## 10. Fallback behaviour

| Visitor or condition | What renders |
|---|---|
| Desktop or landscape, motion allowed, normal connection, JS on | Poster first (LCP). After `load` and idle time, the clip starts muted and inline; the poster crossfades into it over about 400 ms. Pause motion works and pauses the video. The CSS push is off. |
| `prefers-reduced-motion: reduce` | Poster only. The video file is never requested. No Pause button (nothing is moving). |
| `Save-Data` on, or slow or very slow connection (`effectiveType` 2g and slow-2g) | Poster only. Video never requested. |
| Video fails to load, stalls over 3 s, or errors | Poster stays; the existing v0.2 slow push and Pause continue. Nothing visible breaks. |
| Autoplay blocked (for example iOS Low Power Mode) | Poster stays. No play-button UI is shown over the hero. **[unverified on a real device]** |
| Tab hidden or hero off screen | Video paused, then resumed on return. |
| No JS | Poster only (the page is complete without JS). |
| Phone portrait | Poster only (v0.2 composition) unless Gate B is approved. Data cost and battery are the reasons. |
| Data-saving or very small viewports | Same as portrait. |

WCAG: the clip loops past 5 s beside content, so the visible Pause control stays mandatory. The `<video>` is decorative (`aria-hidden`, no captions needed: no speech, no audio track). Flash rule (2.3.1) is part of the pass criteria.

---

## 11. Integration plan (after the clip is approved; separate gate)

- `config.json`: `hero.video { mp4, webm, width, height, loopSeconds }`; `build.mjs` emits one `<video muted loop playsinline preload="none" disablepictureinpicture aria-hidden="true">` inside `.hero-media`, with no `src` until JS decides.
- `site.js`: conditions from section 10; `IntersectionObserver` and `visibilitychange` pause; Pause button targets `video.pause()`; label and `aria-pressed` unchanged; remove the CSS push while the video plays.
- `tests/qa.mjs`: no video request under reduced motion or Save-Data; Pause pauses the element; a failed video request leaves the poster and push; poster-first LCP unchanged.
- `tests/contrast.mjs`: sample video frames at 0, 25, 50, 75 and 100 % in place of CSS push positions; same 99 % gate.
- Re-run axe, contrast, Lighthouse; update `QA.md`; mark Safari, iPhone and Android as **[unverified]** until tested.
- Real-device protocol (Part XI): recent iPhone, older or low-memory iPhone if available, mid-tier Android, desktop; cold load on cellular, background and return, Low Power Mode, reduced motion on; record device, OS, build id, observed behaviour and heat. Emulators are not evidence.

---

## 12. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Flame freezes or looks "looped" because the model is told to end where it began | Medium | Prompt asks for continuous change; pass criterion tests for a living flame; crossfade fallback; alternative model |
| Food morphs or pieces appear or disappear | Medium | Food motion is limited to jostle and glints; numeric and visual food checks; Hailuo and Seedance as physics-oriented alternatives |
| Native output is 720p and looks soft on large screens | Medium | Grain, scrim and a dark scene hide it; at a 1920×1080 viewport the hero shows the clip at roughly 1.2× upscale (1306×880 window over a 1280×720 clip), less on smaller screens. If it looks too soft, the answer is a different attempt, not an upscaler, and needs approval |
| Haze, bloom or colour drift against the poster | Medium | Color match step; criteria for luma and drift |
| Generator ignores "stay still" for background pots | Low to medium | Rigid-region SSIM; trim or reject |
| iOS blocks or throttles autoplay | Medium | Poster fallback is complete; test on real devices |
| Credit price changes | Low | Re-quote before each job |
| The result is not clearly better than the still | Low to medium | Mute test already passes without video; the video is only kept if it adds clear value at full size |

---

## 13. Decisions requested

1. **Approve Gate A** with the source frame in section 4 and the model ladder and credit cap in section 7 (expected 5 to 10, hard cap 30 credits).
2. **Confirm no ingredient toss** in this round (recommended), or ask for Gate C to be planned.
3. **Confirm mobile stays still** (recommended), or approve Gate B (up to 15 more credits).
4. **Approve uploading** `hero-wok.webp` to your Higgsfield account as the start and end frame.
5. **Confirm** the 1.0 MB MP4 and 0.7 MB WebM delivery targets and that video is deferred and conditional.

Until then: no upload, no generation, no change to the site.

---

## Appendix A. Credit quotes (2026-10-09, `get_cost`, silent, no extras)

| Model | Setting | Credits |
|---|---|---|
| Kling 3.0 Omni (Frames) | std 5 s, 16:9 | 5.0 |
| Kling 3.0 Omni (Frames) | std 5 s, 9:16 | 5.0 |
| Kling 3.0 Omni (Frames) | std 6 s | 6.0 |
| Kling 3.0 Omni (Frames) | pro 5 s | 6.25 |
| Kling v3.0 | std 5 s, sound off | 7.5 |
| Kling v3.0 | std 5 s, sound on | 10 |
| Kling v3.0 | std 8 s, sound off | 12 |
| Kling v3.0 | pro 5 s, sound off | 8.75 |
| Kling v3.0 | 4k 5 s, sound off | 30 |
| Kling 3.0 Turbo | 720p 5 s | 7.5 |
| Kling 3.0 Turbo | 1080p 5 s | 10 |
| Seedance 1.5 Pro | 720p 4 s, no audio | 4.8 |
| Seedance 1.5 Pro | 720p 8 s, no audio | 9.6 |
| Seedance 2.5 | 480p 5 s (also the draft setting) | 15 |
| Seedance 2.5 | 720p 5 s | 35 |
| Seedance 2.5 | 1080p 5 s | 60 |
| MiniMax Hailuo 2.3 | 6 s, 1080 | 10 |
| Grok Imagine 1.5 Lite | 720p 5 s | 5 |
| Grok Video 1.5 | 720p 5 s | 22.5 |

Preflights were run without media attached, so they assume the start and end image add no cost. Confirm with the quote taken after the still is attached, before the first submission.

## Appendix B. Delivery encode (planned; not yet run)

```bash
# H.264, silent, web-friendly
ffmpeg -i loop.mp4 -an -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 25 -preset slow -movflags +faststart hero-loop.mp4
# VP9 WebM, silent
ffmpeg -i loop.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 hero-loop.webm
```
CRF values are starting points; adjust to hit the size targets with no visible blocking in the flame.
