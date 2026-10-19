# Media provenance (Firelight)

Everything here is AI-generated concept media for a fictional restaurant. None of it depicts a real restaurant or real dishes. Rights in the generated media are not verified (see `docs/JADE_AND_EMBER_MEDIA_RIGHTS_POLICY.md` and `engineering/media-rights-inventory.json`): for a real client, replace it with real photography and footage or with media whose licence has been verified. The Firelight media (Home) was made on 2026-10-16 with the owner's Higgsfield account under an owner-approved credit ceiling; the earlier v0.9 hero loop, hero stills and the char siu still were removed from this branch on the same day (they remain in git history and on the v0.9 branch).

## Firelight media (2026-10-16)

| File | What it is | Source |
| --- | --- | --- |
| `hero-wok-v2.webm`, `hero-wok-v2.mp4` | 5.04 s, 1928x1072, 24 fps, silent, hard loop | Higgsfield Kling 3.0 Omni (Frames) `kling_o3_flf`, Pro, sound off, 16:9, 5 s, job `bfedee7b-bbac-4d78-8175-6559bb16ca0a`, 6.25 credits. Start and end frame: the wok reference still. Re-encoded only (H.264 CRF 22, VP9); no trim, grade or retouch. |
| `hero-wok-v2.webp` | Desktop poster, 1928x1072 | The wok reference still resized (Lanczos), WebP q60. |
| `hero-wok-v2-m.webp` | Phone poster, 810x1440 | A 9:16 crop of the same still at the focus the phone layout uses, WebP q60. No 9:16 video was generated. |
| `dish-beef.webp` | Plated dish, 2400x1610 | Plated still, resized from 5056x3392, WebP q74. |
| `dish-beef-1200.webp` | The same dish at 1200x805, for the Menu | `dish-beef.webp` resized (Lanczos), WebP q74. |
| `visit-room-a.webp` | Visit page opening photograph, 1280x859, with five people | Higgsfield (owner's account) Nano Banana 2 at 4K, Shot A Candidate 2 (owner-approved master, 5056x3392), job `f2236920-1890-4a96-a781-3376e93b3612`, 3 credits, 2026-10-17, with five AI-generated people composited on 2026-10-18 and 2026-10-19 (see below). Resized (Lanczos), WebP q46. |
| `visit-room-a-m.webp` | The phone crop of the same photograph, 720x900 | A 4:5 crop of the Shot A composite (x 1580 to 4294, full height), resized, WebP q55. |
| `visit-room-a-1920.webp`, `visit-room-a-2560.webp` | Larger sizes of the Visit opening photograph (1920x1288 and 2560x1717), chosen with `srcset` by wide and 2x screens | The same Shot A composite (5056x3392), resized directly (Lanczos), WebP q55 and q49. |
| `visit-counter-b.webp` | The wok counter from a stool, 780x968, with two people | Nano Banana 2 at 4K, Shot B image 1 (owner-approved), job `ecae65c4-09a8-448b-9abd-e8e1d2ecca76`, 3 credits, Shot A as the image reference; two AI-generated people composited on 2026-10-19 (see below). Resized from 3712x4608, WebP q66. |
| `visit-materials-c.webp` | The jade wall and niche, 1200x805 | Nano Banana 2 at 4K, Shot C image 2 (owner-approved; image 4 of the five in the review gallery), job `2b7e3a9d-8eaf-4a34-92d9-a16b102313b4`, 3 credits, Shot A as the image reference. Resized from 5056x3392, WebP q66. |
| `story-jade-bowls-860.webp` | The celadon bowls at 860x543, for the Home teaser | `story-jade-bowls.webp` resized (Lanczos), WebP q76. |
| `steam-plate.webp`, `steam-plate-m.webp`, `cloud-plate.webp`, `cloud-plate-m.webp` | Calm-mode stills (reduced motion, Save-Data, no WebGL2) | Rendered from the Breath's own steam solver over the new poster; no third-party code. |

**Reference still (wok):** Nano Banana 2 (`nano_banana_2`), 4K, 16:9, three candidates, candidate 2 chosen by the owner. Job `1c7c8add-87cf-43ad-b739-3d46d5338ee4`, 5504x3072.
**Plated still:** Nano Banana 2, 4K, 3:2, two candidates, candidate 1 approved, with the wok still as an image reference so the food matches. Job `adbaf5df-08a9-433a-8dfd-6bf078578057`, 5056x3392.
**Clip:** two attempts; clip 1 (job `6d739f30-71a9-45e2-8580-a407dab127c8`) was rejected by the owner for having no sizzle; clip 2 above was kept. Total 27.5 credits of the 65 ceiling. The full prompts are in the lab record on branch `lab/jade-and-ember-the-breath` (`creative-reset/the-breath/media/PROVENANCE.md`).
**Known defects:** two thin flame slivers stand just outside the wok edge; a bright jade patch on the wok's inner right wall is stronger than subtle; the loop is a hard cut whose first and last frames differ slightly in the flame; plate and wok food are the same dish but not the same arrangement of pieces; the food is plausible rather than studio-grade.

## Images kept from v0.9

**Generator:** Z-Image-Turbo (Hugging Face Space `mcp-tools/Z-Image-Turbo`), 9 steps, shift 3, via the connected Hugging Face account. Selected by eye from several candidates per image; the unselected candidates are not stored.

| File | Seed (candidate picked) | Source size | Candidates tried | Post-processing |
|---|---|---|---|---|
| `story-jade-bowls.webp` 1200×757 | 4404 (of 4404, 5505) | 1536×864 | 2 | candle flame behind the bowls filled from surrounding slate, crop, grade, WebP q76 |
| `dish-mapo.webp` 1200×800 | 9904 (of 6601, 6602, 9904, 9905) | 1472×1104 | 4 | crop, grade, WebP q76 |
| `dish-dandan.webp` 1200×800 | 9902 (of 8801, 8802, 9901, 9902) | 1472×1104 | 4 | crop, grade, WebP q76 |

Prompts, grade and known defects for these three are unchanged from v0.9 (dishes: studio-style prompts naming the dish and the vessel, plain dark slate, soft warm light from the left, nothing else on the table; one split-tone grade for all).

## Shot A people (2026-10-18 and 2026-10-19)

The Visit opening photograph shows five AI-generated people. Each was made separately, cut out and composited onto the approved Shot A master (job `f2236920`); the room itself was never regenerated. Verified numerically on the final composite: 0 pixels differ from the master outside the people masks, and the wok-flame box is identical. The room is therefore the approved master; the people are new.

| Person | Where | Made with | Credits |
| --- | --- | --- | --- |
| Cook (young man, black jacket, denim apron, tossing the wok) | Open kitchen | Higgsfield Nano Banana 2, Shot A candidate 1, job `6fbf40f4`, cut out and composited | 3 |
| Couple (woman in rust cardigan, man in indigo jacket) | Counter stools at the left | Higgsfield Nano Banana 2, guided pass on a crop of the master with flat placeholder figures at true scale, job `b83df313` | 3 |
| Older woman (silver hair, glasses, olive cardigan, cream scarf, teacup) | Stool at the counter's right end | Hugging Face Space `mcp-tools/FLUX.1-Kontext-Dev` (seed 23) on a crop of the master with a placeholder figure, cut out with Space `prithivMLmods/SAM3-Demo` | 0 (free tier, connected account) |
| Man in his early 50s (salt-and-pepper hair, reading glasses, brown corduroy overshirt, beer) | Far-left side table | The same two Spaces, same method, seed 23 | 0 |

Passes made and not used (3 credits each): `678cbaed`, `91fcf39f`, `16a35d83`, `f53b916f`. Credits spent on Shot A people: 18 (39 of the 45 ceiling spent in all). Not stored: the intermediate crops, placeholder drawings, raw candidates and masks (kept in the Higgsfield sandbox and the working folder, not in the repository).

## Shot B people (2026-10-19)

The wok-counter photograph shows two AI-generated people. They were rendered by the Google Gemini API (`gemini-3.1-flash-image`, Nano Banana 2) on a 1000x1250 crop of the approved Shot B master (job `ecae65c4`, 3712x4608) with two flat grey placeholder figures at the positions the owner approved, cut out of the render by its difference from the master crop, colour-fitted and composited back with a dilated mask. The room itself was never regenerated. Verified on the composite: 0 pixels differ from the master crop outside the dilated people masks (the master crop used for the check is a JPEG q95 copy of the lossless master, not the lossless file), the changes in the delivered 780 px frame are 2.46 % of its pixels and all lie inside the paste box, and the wok-flame area is identical.

| Person | Where | Made with | Credits |
| --- | --- | --- | --- |
| Woman in her early 40s (dark hair in a loose low bun, charcoal wool coat over a cream shirt, silver hoop earrings, a glass of red wine), seated side-on, looking toward the kitchen | A stool at the far end of the counter | Gemini API `gemini-3.1-flash-image`, 4K, 4:5, from the crop and the placeholders | 0 Higgsfield credits; Gemini cost unverified |
| The Shot A cook (young man, short dark hair, black jacket, denim apron with brown straps), head bowed, plating a dish | The kitchen pass window, left of the flame | The same call, with a crop of the approved Shot A cook (from the Shot A final) as a second reference image so the same person appears | as above |

Two calls were made, each returning one image of about 2,520 output tokens: the first (text description only) gave a different-looking chef and was rejected by the owner; the second (with the reference image) was kept. Neither call was retried automatically. The cost is unverified because the billing tier is not known. Known limits: the guest is somewhat larger in the render than her placeholder; the whole crop was re-rendered, so only the people are used and the colour of the room outside them is the master's; the masks come from the render's difference from the master, not from a segmentation model, and were checked by eye at preview size only; the chef is not byte-for-byte the Shot A cook; nothing here was checked on a real device. Not stored: the raw 3712x4608 renders, the placeholder drawings, the masks and the reference crop (kept in the session scratchpad and the Higgsfield sandbox, not in the repository).
