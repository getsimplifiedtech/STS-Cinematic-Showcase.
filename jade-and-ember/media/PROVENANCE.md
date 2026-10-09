# Media provenance (concept v0.3)

The six images are AI-generated concept art made with a free image generator. The hero loop (`hero-loop.webm`, `hero-loop.mp4`) is AI-generated concept footage made with one paid generation, listed at the end. None of it depicts a real restaurant or real dishes.

**Generator:** Z-Image-Turbo (Hugging Face Space `mcp-tools/Z-Image-Turbo`), 9 steps, shift 3, via the connected Hugging Face account.
Selected by eye from several candidates per image; the unselected candidates are not stored.

| File | Seed (candidate picked) | Source size | Candidates tried | Post-processing |
|---|---|---|---|---|
| `hero-wok.webp` 1920×1080 | 2202 (of 1101, 2202, 3303) | 2048×1152 | 3 | grade, resize, WebP q74 |
| `hero-wok-m.webp` 810×1440 | 2202 (of 2202, 3303) | 1152×2048 | 2 | grade, resize, WebP q74 |
| `story-jade-bowls.webp` 1200×757 | 4404 (of 4404, 5505) | 1536×864 | 2 | candle flame behind the bowls filled from surrounding slate, crop, grade, WebP q76 |
| `dish-mapo.webp` 1200×800 | 9904 (of 6601, 6602, 9904, 9905) | 1472×1104 | 4 | crop, grade, WebP q76 |
| `dish-charsiu.webp` 1200×800 | 9903 (of 7701, 7702, 9903) | 1472×1104 | 3 | crop, grade, WebP q76 |
| `dish-dandan.webp` 1200×800 | 9902 (of 8801, 8802, 9901, 9902) | 1472×1104 | 4 | crop, grade, WebP q76 |

**Prompts (shared direction):** carbon-steel wok, charcoal slate, matte black and jade-green celadon tableware, one warm directional light, shallow depth of field, 50 mm, fine film grain, no people, no hands, no text.
- Hero: "Photorealistic cinematic photograph inside a professional Chinese restaurant kitchen at night: a seasoned black carbon steel wok with two small ear handles on a roaring wok burner, stir-fried sliced beef, gai lan and red chili tossed in mid-air above the wok, a bright flare of orange flame curling up the wok wall, rising steam, a few glowing sparks, wok placed right of centre, left third of the frame is deep dark shadow with soft out-of-focus kitchen, warm ember firelight with subtle cool jade-green tint in the shadows, shallow depth of field, 50mm lens, fine film grain, no people, no hands, no text". The portrait version asks for a vertical composition with the wok in the lower half and a dark upper third.
- Dishes: studio-style prompts naming the dish, the vessel (celadon bowl for mapo tofu, matte black plate/bowl for the others), "plain dark charcoal slate surface, plain dark empty background, soft warm directional light from the left, nothing else on the table".
- Lesson recorded: the words "ember", "candle" or "no candles" made the model add candles to the scene. Describing a "soft warm directional light" and "nothing else on the table" removed them.

**Grade (one for all six):** a split tone applied by at most about 1.2% per channel: a faint jade lift in the shadows and a faint ember lift in the highlights, so the set shares one temperature.

**Known defects (Generated-media QA, Part VI.6):** the food is plausible rather than studio-grade; the hero's "gai lan" renders as broccoli (labelled broccoli on the page); the hero flame is a single frozen frame, not a captured toss; the hero kitchen background is out-of-focus steel pots, not a designed set; the rice bowl in the story image is generic. Replace all six with real photography for a real client.


## Hero loop (v0.3)

| Item | Value |
|---|---|
| Files | `hero-loop.webm` (VP9, 584 KB) and `hero-loop.mp4` (H.264 High, 891 KB); 1280×720, 24 fps, 121 frames (5.04 s), silent, tagged BT.709 |
| Source | One generation, Higgsfield Kling 3.0 Omni (Frames) `kling_o3_flf`, std, sound off, 16:9, 5 s, job `fb505a60-fe0f-4de2-a29a-611174560655`, 5.0 credits, 2026-10-09 |
| Start and end frame | `hero-wok.webp` decoded to PNG (SHA-256 `ad64b0c3015796a81ab05528aa18443df00e1da892438ba364866d1bc79831c0`), the same image for both |
| Prompt | Locked-off tripod shot, no camera movement and no zoom; a tall flame flickers and licks upward, its shape changing continuously; soft steam; a few sparks; the beef, broccoli and red chili stay settled with a tiny sizzling jostle and moving glints; the wok, handles, burner, counter and pots stay still; warm ember firelight with a faint cool jade tint; photorealistic; the final frame matches the first; no people |
| Original file | 1280×720 H.264, 3.7 MB, SHA-256 `c53f013317b5a0eb…` (kept in the Higgsfield account, not in this repository) |
| Encodes | `ffmpeg -an -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -deadline good -cpu-used 1 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv` and `ffmpeg -an -c:v libx264 -profile:v high -preset slow -crf 24 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart` |
| Retouch | None. No crossfade, trim, upscale or grade; the loop point is a hard cut |
| Known defects | The first and last frames differ in the flame (it never returns to the same shape); the flame changes shape quickly from frame to frame; 720p is soft at full size; see `docs/JADE_AND_EMBER_GATE_A_RESULT.md` |
