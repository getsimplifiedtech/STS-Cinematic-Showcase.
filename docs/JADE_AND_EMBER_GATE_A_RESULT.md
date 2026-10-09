# Jade & Ember — Gate A result (one Kling 3.0 Omni attempt)

**Status:** Trial complete, awaiting review. **Not integrated, not merged, not deployed.** No second attempt was made.
**Date:** 2026-10-09. **Plan:** `docs/JADE_AND_EMBER_HERO_VIDEO_PLAN.md`. **Pre-flight:** `docs/JADE_AND_EMBER_GATE_A_PREFLIGHT.md`.

## 1. What was run and what it cost

| Item | Value |
|---|---|
| Model | Kling 3.0 Omni (Frames), `kling_o3_flf` (billed as "Kling O3 Video") |
| Settings | std, sound off, 16:9, 5 s, count 1, literal prompt (the suggested "IN THE DARK" preset was declined) |
| Start and end frame | The approved poster PNG, SHA-256 `ad64b0c3…31c0`, uploaded once as media `6981e0f2-de82-4103-95e7-d71892ae426c` (the same image for both roles; the generator accepted it) |
| Prompt | As in the plan, section 5 |
| Fresh cost check (frame attached) | 5.0 credits, run before submitting |
| **Credits spent** | **5.0 (balance 240.5 → 235.5)**. One job, one charge; the transaction list shows a single "Kling O3 Video −5" |
| Job | `fb505a60-fe0f-4de2-a29a-611174560655`, finished in about 1 minute |
| Result file | `…/hf_20261009_184041_fb505a60-fe0f-4de2-a29a-611174560655.mp4` in your Higgsfield account; local copy SHA-256 `c53f0133…513d` |

**Submission note:** the first submit call timed out at 60 s with no job id. I did not retry blindly. I waited about four minutes, checked the generation history (including in-progress jobs) and the balance, found no job and no charge, and then submitted once more. Exactly one job exists. (Per the tool's own guidance a timed-out submit has an unknown outcome; the check established it.)

## 2. The file

H.264 Main, 1280×720, 24 fps, 121 frames (5.04 s), **no audio stream**, 3.7 MB at 5.9 Mbps. Native size is 1280×720, as expected; no upscaler used.

Contact sheet (frames 0, 24, 48, 72, 96, 120): `docs/hero-video/gate-a-result-contact-sheet.webp`.

## 3. Numeric QA (`jade-and-ember/tools/video-qa.py`, thresholds as pre-registered)

| Check | Result | Detail |
|---|---|---|
| Resolution | PASS | 1280×720 |
| Duration and fps | PASS | 5.04 s at 24 fps |
| Silent | PASS | no audio stream |
| Rigid objects stay rigid | **FAIL** | worst region SSIM 0.920 (left handle), need ≥ 0.97 |
| Food keeps its look | PASS (marginal) | min SSIM 0.856 against a 0.85 limit; largest frame step 1.38× the median |
| Flame and steam are alive | PASS | flame 28.5, steam 5.65 mean change per frame |
| No luma drift | PASS | 3.8 % |
| Endpoints match | **FAIL** | SSIM(first, last) 0.866, need ≥ 0.97 |
| Loop seam | PASS | closing step 5.80 vs median step 4.81 = 1.20×, limit 3.0× |
| Flash proxy | PASS | 0 large opposite luma steps; frame-mean luma varies only 48.8 to 54.9 |
| Frame 0 matches the poster | PASS | SSIM 0.983, worst channel mean difference 2.4 levels |

Raw output: `docs/hero-video/gate-a-result-qa.json`.

**Under the pre-registered rule (a fail on a rigid or loop row means "not production footage"), the clip formally does not pass.** Both failures need explaining; I do not change the thresholds after the fact.

### Why the two rows failed

Extra diagnostics (full-resolution phase correlation, per-region numbers):
- **Rigid objects:** measured translation of every rigid region against frame 0 is **0 px** (left and right handle, burner ring, pots, counter). The handle's outline is unchanged in the enlarged crops. Four of the five rigid regions have minimum SSIM from 0.978 to 0.995. The one failing region (left handle, minimum at frame 70) sits right next to the steam plume, so passing steam and changing highlights lower its SSIM. Reading: the rigid objects are rigid and the metric is catching steam, but I cannot rule out slight highlight shimmer on the handle without playback.
- **Endpoints:** the flame region's SSIM between first and last frame is 0.288 (the flame is a different shape at the end, as any flame would be), while every non-flame region matches: food 0.952, steam 0.703, burner flame 0.943, handles 0.976 and 0.992, burner ring 0.995, pots 0.996, counter 0.996. The generator did not return the same flame at the end, so "loop by construction" is only partly achieved: everything except the flame returns to its starting state.
- **Is the cut visible?** The flame changes shape strongly from one frame to the next (median 27.9 on the flame region per step, max 41), and the step from the last frame back to the first measures 28.0, so the jump at the loop point is the same size as any ordinary frame change. By these numbers the cut sits inside the normal churn of the flame. This needs to be confirmed by watching it loop.

## 4. Visual review (stills and crops; I cannot play video here)

- **Realism:** the frames are photographic. The flame reads as real fire with tongues and detail, steam and smoke drift convincingly, a few sparks appear, and the burner flame flickers. Colour and grade match the poster; no haze, bloom, drift or banding.
- **Food:** broccoli, beef and chili stay settled in the same arrangement from frame 0 to frame 120; only tiny shifts and glints. No pieces appear, disappear or change colour at the enlarged crops. This met the "realistic food motion, no toss" goal.
- **Rigid objects:** wok, both handles, burner, counter and the out-of-focus pots hold position. The camera is locked.
- **New objects, text, hands, faces:** none seen.
- **Weaknesses:**
  - The flame changes very fast (see above). At 24 fps it may read as agitated rather than calm; this is the main thing for you to judge in playback. 
  - The flame is larger and brighter than the still in some frames; the steam in frames 72 to 120 is denser and greyer than the poster.
  - 720p is soft at full size; it is fine behind the scrim at 1920 wide but would show on a 4K display.
  - Not verified: texture swimming or edge crawl in motion, and the seam at the loop point.

## 5. Delivery size (local encodes of this clip, not integrated)

| Encode | Size |
|---|---|
| H.264 CRF 24 | 891 KB |
| H.264 CRF 28 | 558 KB |
| H.264 CRF 32 | 349 KB |
| VP9 CRF 36 | 507 KB |
| VP9 CRF 40 | 401 KB |

Targets from the plan (MP4 ≤ 1.0 MB, WebM ≤ 0.7 MB) are reachable without re-generating. Visual quality of these encodes has not been reviewed.

## 6. Crossfade-loop fallback (zero credits, tested locally)

A 1 s crossfade loop of this clip (4.04 s) gives the same two failures (rigid 0.927, endpoints 0.883) and a seam ratio of 0.97×. It does not fix the endpoint difference, because the cross-faded region is the flame itself; it would also put a double-exposed flame in the first second. I do not recommend it over the plain clip unless the plain loop point is visibly bad on playback.

## 7. Tool calibration findings (for the next recalibration, no retroactive change made)

1. The "endpoints match" metric should exclude the alive regions (flame, steam, burner flame): a flame can never match its first frame, so this check will always fail on any flame clip.
2. The rigid check should add a translation test (phase correlation) and judge steam-covered regions separately; plain SSIM mixes real motion with steam passing in front.
3. A flame-churn metric (median per-frame change in the flame region) would flag clips that look agitated; the plan has no threshold for this yet.

## 8. Decisions for you

1. **Watch the clip** (attached to the report). Does the flame speed look right? Is the loop cut acceptable?
2. If yes: accept it as the Gate A clip. Next would be recalibrating the checker (section 7), choosing the encode (for example H.264 CRF 24 and VP9 CRF 36), and a separate integration plan and approval. Nothing is wired into the site.
3. If no: this was the single authorised attempt. Any further generation (a different prompt, model or seed) needs a new approval and credit budget (remaining balance 235.5; Kling O3 5 credits, Kling v3.0 7.5, Hailuo 2.3 10 per attempt).
