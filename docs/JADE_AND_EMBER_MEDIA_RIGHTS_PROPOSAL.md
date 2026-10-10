# Jade & Ember: proposed media rights and licensing amendment (finding F-G2-01)

**Status: PROPOSAL ONLY. Not applied. Nothing in this document is an approval, and nothing in it asserts that any right or licence over the generated media exists.** It was prepared under `APR-JE-022` for the owner to review. The frozen v0.8 baseline (`baseline/jade-and-ember-v0.8`) and the file `jade-and-ember/media/PROVENANCE.md` are unchanged.

**The finding.** `media/PROVENANCE.md` records how the six images and the hero loop were made, but states no licence or rights terms for them (audit finding m-8; automated by `check:media`, known finding `F-G2-01`, severity Minor, documentation only, no visual or behavioural effect).

## 1. What the repository can support (facts, from `media/PROVENANCE.md` and `fonts/LICENSES.txt`)
| Item | What is recorded |
|---|---|
| Six WebP images (`hero-wok`, `hero-wok-m`, `story-jade-bowls`, `dish-mapo`, `dish-charsiu`, `dish-dandan`) | AI-generated concept art. Generator named as "Z-Image-Turbo (Hugging Face Space `mcp-tools/Z-Image-Turbo`), 9 steps, shift 3, via the connected Hugging Face account". Seeds, candidates tried, prompts and post-processing (grade, crop, resize, WebP encode; a candle flame filled from surrounding slate in the story image) are recorded. Unselected candidates are not stored |
| Hero loop (`hero-loop.webm`, `hero-loop.mp4`) | AI-generated concept footage. One generation with "Higgsfield Kling 3.0 Omni (Frames) `kling_o3_flf`", job `fb505a60-fe0f-4de2-a29a-611174560655`, 5.0 credits, 2026-10-09, start and end frame the approved `hero-wok.webp`. No retouch; encodes recorded |
| What they depict | No real restaurant, no real dishes, no people. The site states that the media is AI-generated concept media |
| Fonts (four WOFF2) | `fonts/LICENSES.txt` carries the SIL Open Font License 1.1 text and copyright notice for each family (for example "Copyright 2023 The Young Serif Project Authors") |
| Prior owner statements | `docs/JADE_AND_EMBER_APPROVALS.md` section C: **client use of the generated media and of the sample copy has not been approved** |

## 2. What the repository cannot support, and must be verified by the owner before any statement is made
Each line below is an open question, not a claim. None may be written as fact until verified against the current terms at the source, and the terms of the day recorded.

1. **Image model terms.** The licence of the Z-Image-Turbo model and of the Hugging Face Space that ran it, whether they permit commercial use, and whether they place conditions on generated outputs (attribution, disclosure, restricted uses).
2. **Platform terms for the images.** The Hugging Face account terms in force on the generation dates, and whether they transfer or limit rights in outputs.
3. **Video generator terms.** The Higgsfield and Kling terms and the subscription plan in force on 2026-10-09: whether outputs may be used commercially, by whom, and for how long; whether credits or plan affect commercial rights; whether any watermark or disclosure duty applies.
4. **Ownership and copyright.** Whether AI-generated outputs attract any copyright in the relevant jurisdictions, who would hold it (the account holder, STS, the provider, no one), and the effect of STS's own post-processing (grade, crop, fill, encode).
5. **Third-party content.** Whether any output resembles a protected work, brand, trademark or person (none is intended; no check has been made by anyone but a human looking).
6. **Client use.** Whether and on what conditions STS may sublicense or transfer the media to a client, or whether each client must receive newly sourced media.
7. **Fonts.** The OFL 1.1 text is present; whether the seal font subset (`noto-serif-sc-seal-600.woff2`) honours the Reserved Font Name clause of its source licence should be confirmed by whoever made the subset.

## 3. Proposed wording
### Option A (recommended now): states only what is true, asserts no right
To be appended to `media/PROVENANCE.md` as a new final section:

```markdown
## Rights and licence (status: not verified)

**No licence or rights over the generated media in this folder has been verified.** The six images and the hero loop were produced with the
AI generation services named above. The terms of those services, and any copyright in their output, have not been reviewed for commercial
use, and no right in this media is claimed or granted here.

- This media is used only in the fictional Jade & Ember demonstration, which is a website design concept by Simplified Tech Solutions. It
  depicts no real restaurant, dish or person.
- It must not be reused, redistributed, sold or supplied to a client until the terms of the generation services in force on the generation
  dates (images: 2026-10-09; video: 2026-10-09) have been reviewed and the outcome is recorded in this file.
- Replace all of it with real photography or footage, or with media whose licence is verified, for any real client.
- The fonts in `../fonts/` are separate: their licences (SIL Open Font License 1.1) are in `../fonts/LICENSES.txt`.

Review record: not yet performed.
```

### Option B (to adopt only after the owner has verified section 2): a completed statement
The same section, with these placeholders filled by the owner and nothing else added:

```markdown
## Rights and licence

- Images (generated 2026-10-09 with [OWNER TO CONFIRM: exact model name and version] through [OWNER TO CONFIRM: service and account]):
  terms reviewed on [OWNER TO CONFIRM: date]; [OWNER TO CONFIRM: what the terms allow, quoted or cited with the URL and version].
- Hero loop (generated 2026-10-09, job fb505a60-fe0f-4de2-a29a-611174560655): terms reviewed on [OWNER TO CONFIRM: date];
  [OWNER TO CONFIRM: what the plan and terms allow, with the URL and version].
- Ownership and conditions: [OWNER TO CONFIRM, or "not determined"].
- Permitted use of this media: [OWNER TO CONFIRM: for example "the fictional demonstration only" or a described wider use].
- Reviewed by: [OWNER TO CONFIRM: name or role].
```

## 4. What applying it would involve (so the decision is informed)
- `media/PROVENANCE.md` is part of the frozen v0.8 source (SHA-256 in `baselines/jade-and-ember-v0.8/SHA256SUMS.source-tree.txt`) and of the v0.8 preview package. Editing it is a change to a frozen file: it needs your explicit approval, recorded in the approval log. It changes no pixel, word on any page or behaviour, and is not visual.
- The regression harness compares `media/` byte for byte. An approved edit needs a named allowlist entry (`immutability-allowlist.json`, `visual: false`, reason, work package). The allowlist currently normalises only text files outside `media/`; applying the amendment needs a small extension so that this one text file can be listed (a tool change, not a site change).
- `assets.manifest.json` and the delivered-size budget change by a few hundred bytes (budget headroom covers it); `check:media` would then pass without the known-finding entry, which must be removed from `findings.json` in the same commit.
- The preview package name stays `jade-and-ember-v0.9-preview.zip` (D-10); the v0.8 package is untouched.
- The baseline branch is never modified: the amended file lives only on the v0.9 branch.

## 5. Decision requested
1. Approve **Option A** now (my recommendation: it closes the finding honestly without claiming anything), or approve Option B after you have verified section 2, or leave the finding open.
2. If approved, authorise the three small related changes (the `PROVENANCE.md` edit, the allowlist extension and entry, and the findings entry removal) as one reviewed commit.
