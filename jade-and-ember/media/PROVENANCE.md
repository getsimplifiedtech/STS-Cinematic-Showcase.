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
| `visit-room-a.webp` | Visit page opening photograph, 1280x859 | Higgsfield (owner's account) Nano Banana 2 at 4K, Shot A Candidate 2 (owner-approved master, 5056x3392), job `f2236920-1890-4a96-a781-3376e93b3612`, 3 credits, 2026-10-17. Resized (Lanczos), WebP q46. |
| `visit-room-a-m.webp` | The phone crop of the same photograph, 720x900 | A 4:5 crop of Shot A (x 1400 to 4114, full height), resized, WebP q56. |
| `visit-counter-b.webp` | The wok counter from a stool, 780x968 | Nano Banana 2 at 4K, Shot B image 1 (owner-approved), job `ecae65c4-09a8-448b-9abd-e8e1d2ecca76`, 3 credits, Shot A as the image reference. Resized from 3712x4608, WebP q66. |
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
