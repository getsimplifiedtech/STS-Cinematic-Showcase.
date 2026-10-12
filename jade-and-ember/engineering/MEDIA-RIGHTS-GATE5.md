# Gate 5 Phase 5: media rights inventory and outstanding evidence (`APR-JE-033`)

> **G6-3 update (`APR-JE-040`).** The binding proposed in section 7 and approved as D-P5-4 is **implemented**: a rights verification carries `subject.inventory` (the digest of the delivered media and fonts, `npm run release:rights-digest`) and `subject.basis` (`licence`, `permission` or `ownership`: authorised use is sufficient, ownership is not required); the client-production requirement `mediaRightsInventory` refuses a build while any image or video is not verified by an in-force record, any term it points at is unreviewed, or F-G2-01 or F-G5-05 is open; a rejected or revoked record un-verifies everything it covered. Provider-terms evidence (D-P5-5) is still a person's task and no asset was marked verified; the Noto notice correction (D-P5-6) and the credit-link correction (D-P5-3) were not made.

> **G6-2 update (2026-10-11, `APR-JE-039`).** A rights verification is now a structured record (`engineering/release/approvals/`, type `rights-verification`, status `approved`, `subject.sources` and `subject.verifiedOn`) bound to the candidate artifact digest, whose parts include the media-rights inventory. Binding it to individual inventory entries (D-P5-4) remains G6-3. Where this document says "approval row", read "approval record".

**Status: APPROVED and CLOSED for engineering assessment and verification by the owner (`APR-JE-034`).** **No licence or right in any generated image or video has been established, and none is asserted anywhere in this document or in the repository.** This is an inventory of what each asset is, what the repository records about where it came from, what is *not* established, and which official terms a person has to read. It was produced without legal advice and cannot establish legal rights. Nothing was generated, replaced or changed; the approved design and media are untouched.

Machine-readable form: `engineering/media-rights-inventory.json`, validated by `check:media`. Policy: `docs/JADE_AND_EMBER_MEDIA_RIGHTS_POLICY.md` (APR-JE-023): the generated media is for the fictional demonstration only; replace it for any real client; the review "has not yet been performed".

## 1. Result in brief

| | |
|---|---|
| Assets inventoried | **12**: 6 AI-generated images, 2 encodes of 1 AI-generated video, 4 font files (3 families) |
| Rights established for generated media | **none** (all 8 are `unverified`) |
| Fonts | licence text and a copyright notice are shipped for all 3 families (`licence-text-shipped`); the upstream sources are not confirmed; **one notice disagrees with its font file (finding F-G5-05)** |
| Official terms to be read by the owner | **8** (section 4); none has been reviewed |
| Evidence the repository holds | the generation record in `media/PROVENANCE.md` and the font licence file; no copy, hash or date of any provider's terms |
| New control | the inventory is checked on every run: a delivered file without an entry, a changed file, anything marked verified without a recorded rights-verification approval, or any wording that claims a licence fails `check:media` |
| Proposed release changes | section 7; **not enabled** |

## 2. Inventory

SHA-256 (first 12 hex digits); full hashes and sizes are in the JSON.

| File | Kind | SHA-256 | Origin (from `media/PROVENANCE.md`) | Rights status |
|---|---|---|---|---|
| `media/hero-wok.webp` | image 1920×1080 | `82d60c06d902…` | Hugging Face Space `mcp-tools/Z-Image-Turbo`, model Z-Image-Turbo, seed 2202, free tier, connected account, 2026-10-09; grade, resize, WebP q74 | **unverified** |
| `media/hero-wok-m.webp` | image 810×1440 | `6bf62b85bc95…` | same service, seed 2202 | **unverified** |
| `media/story-jade-bowls.webp` | image 1200×757 | `4fe042c3aaf6…` | same, seed 4404; a candle flame filled from surrounding slate | **unverified** |
| `media/dish-mapo.webp` | image 1200×800 | `7b9337cd2f8c…` | same, seed 9904 | **unverified** |
| `media/dish-charsiu.webp` | image 1200×800 | `90097aff4272…` | same, seed 9903 | **unverified** |
| `media/dish-dandan.webp` | image 1200×800 | `79afeaccabae…` | same, seed 9902 | **unverified** |
| `media/hero-loop.webm` | video 1280×720, 5.04 s, silent | `fb89d96bb312…` | Higgsfield, Kling 3.0 Omni (Frames) `kling_o3_flf`, one paid generation (5.0 credits), job `fb505a60-fe0f-4de2-a29a-611174560655`, 2026-10-09; start and end frame is `hero-wok.webp`; VP9 encode, no retouch | **unverified** |
| `media/hero-loop.mp4` | video 1280×720 | `2a7d19d836b9…` | same clip, H.264 encode | **unverified** |
| `fonts/young-serif-latin-400-normal.woff2` | font | `6ba68b9927ad…` | SIL OFL 1.1; copyright 2023 The Young Serif Project Authors | licence-text-shipped |
| `fonts/karla-latin-400-normal.woff2` | font | `250bb48fdea5…` | SIL OFL 1.1; copyright 2019 The Karla Project Authors | licence-text-shipped |
| `fonts/karla-latin-600-normal.woff2` | font | `2ca9205edf2d…` | same | licence-text-shipped |
| `fonts/noto-serif-sc-seal-600.woff2` | font (4-glyph subset) | `21668d4577a0…` | SIL OFL 1.1; the shipped notice reads "Google Inc."; the file's own notice reads "(c) 2017-2024 Adobe" | licence-text-shipped, **notice mismatch** |

`media/PROVENANCE.md` and `fonts/LICENSES.txt` are documentation and are delivered with the folders. Each video encode derives from the AI image used as its start and end frame, so the terms that bear on that image also bear on the clip.

## 3. What the available documentation does and does not give

**Records that exist and are sound:** generator, model, date, seeds, candidate counts, post-processing, prompts (`media/PROVENANCE.md`); the Higgsfield job id, credits and the hash of the start frame; the frozen v0.8 baseline; the policy of 2026-10-10; the licence text for each font.

**What is missing for any rights conclusion** (each is a gap in evidence, not a finding that a right is lacking):
1. The address and version of the Space and of the model checkpoint it ran. The Space's own README and licence were not captured.
2. The plan or tier of the Hugging Face account on the generation date and any terms attached to it.
3. A dated copy (or hash) of every provider's terms in force on 2026-10-09. The repository holds none.
4. Which terms govern the video: Higgsfield's, the model owner's, or both. The original clip is kept only in the Higgsfield account; the repository records a truncated hash (`c53f013317b5a0eb…`).
5. The unselected candidates, which are not stored (so the full set of what was generated cannot be reviewed).
6. Legal advice on whether rights exist in AI-generated output and on whether showing the demonstration publicly is a use the terms allow.
7. For fonts: no hash of an upstream release is recorded, so the files cannot be shown to be genuine or faithful subsets; no Reserved Font Name is stated for any family.

**Finding F-G5-05 (new, Minor, open, proposal below).** `fonts/LICENSES.txt` prints "Google Inc." as the copyright notice of the Noto Serif SC section. The font file's own name table says "(c) 2017-2024 Adobe (http://www.adobe.com/)". The OFL requires each copy to carry the copyright notice; the two notices in the delivered folder name different parties. Young Serif and Karla agree with their files. Proposal: replace the Noto Serif SC section with the upstream licence file for the exact source of the subset, record that source and the subset's hash, and decide whether the family declares a Reserved Font Name. This is a text change in the delivered folder: it needs an allowlist entry against the v0.8 baseline and the owner's approval, and it changes no pixel. It is **not made here**. Related, to establish: the stylesheet loads the subset under the CSS name "JE Seal" (a CSS alias); the OFL's Reserved Font Name rule applies to Modified Versions, and a subset is one.

## 4. Official terms the owner has to read and record

Addresses are where the documents were found by a search on 2026-10-11; **none was fetched or read in full**, and the notes are search-result summaries, not the texts. Each must be read in the version in force on the generation date, 2026-10-09, with a dated copy and its hash saved.

| ID | Document | Address | What it must establish | Reported by search summary (unverified) |
|---|---|---|---|---|
| T-HF-TOS | Hugging Face Terms of Service and Content Policy | `https://huggingface.co/terms-of-service` | who may use an image generated through a Space, for what, and any duty to disclose AI generation | users own content they create; nothing specific about Space outputs found |
| T-ZIMG-MODEL | Z-Image-Turbo model card and licence | `https://huggingface.co/Tongyi-MAI/Z-Image-Turbo` | the model's licence and whether it addresses outputs | header reads `license: apache-2.0` (a README view, not a live check) |
| T-ZIMG-SPACE | The Space `mcp-tools/Z-Image-Turbo` | `https://huggingface.co/spaces/mcp-tools/Z-Image-Turbo` | the model and licence the Space really ran; any extra terms from the Space owner | not retrieved |
| T-HIGGS-TOU | Higgsfield Terms of Use, Privacy Policy and the help article on ownership of generations | `https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially` | ownership of the clip and the right to use it commercially or hand it to a client, for the plan used | help article cites section 4.4 (no claim of ownership of outputs, no restriction on commercial use); the 2026 terms update took effect 7 or 27 August (sources differ); an older page describes a broad licence to the platform |
| T-KLING-TOS | Kling AI Terms of Service and membership terms | `https://kling.ai/docs/community-policy` (the terms address itself must be captured) | whether the model owner's terms apply to a clip made through Higgsfield; whether commercial use depends on a Kling membership | the membership page lists commercial use as a membership benefit; the Terms of Service text was not retrieved |
| T-OFL | SIL Open Font License 1.1 and FAQ | `https://openfontlicense.org/` | that the shipped text is the unmodified OFL 1.1; the rules for a subset; embedding in a website | the printed address `scripts.sil.org/OFL` redirects here (verified, `EXTV-2`) |
| T-FONT-UPSTREAM | Young Serif, Karla and Noto Serif SC upstream releases | `https://github.com/googlefonts/karla` and the others in the JSON | genuineness of each file, exact notices, Reserved Font Names | the Karla and Young Serif repositories answer 200 (`EXTV-2`); the Noto source is not recorded |
| T-LEGAL | Legal advice (the owner's decision) | none | copyright status of AI output; whether public display of the demo is within the terms | not applicable |

## 5. Fictional demonstration use versus authorised commercial reuse

| Use | Under the evidence today | What is needed |
|---|---|---|
| A. The fictional demonstration, as built and reviewed in this repository | **Permitted by the owner's policy** (APR-JE-023), not by any verified licence | nothing further for private review |
| B. **Public** deployment of the demonstration (for example on the studio's site, as a portfolio piece) | **Not approved** (no deployment is authorised, D-P3-5). A public showcase is itself a use that the terms of each service must allow; this is not established | T-HF-TOS, T-ZIMG-*, T-HIGGS-TOU, T-KLING-TOS and T-LEGAL read and recorded; a deployment approval |
| C. Handing the demonstration to a client as a design reference | **Not established** | the same; plus a statement to the client that the media is concept material |
| D. A real client's production site reusing this media | **Not permitted** by the policy (replace it) | real photography or footage, or media with a recorded rights-verification |
| E. Advertising, social media, resale or any reuse outside the demonstration | **Not permitted** by the policy | as D, plus the terms for that use |
| F. The fonts | The OFL text and notice are shipped; embedding fonts in a website is what the OFL describes; the upstream sources and the Noto notice remain to be confirmed | T-OFL, T-FONT-UPSTREAM; F-G5-05 resolved |

No row says the media is licensed, owned, free or cleared, and none may.

## 6. Procedure for the evidence (owner or a person named by the owner)

1. For each term in section 4: open the official page, save a dated copy (PDF or HTML), record its URL, the retrieval date, the version or effective date, and the SHA-256 of the saved copy in an evidence folder (proposed: `engineering/release/rights-evidence/`, created when the first copy exists).
2. Quote the clauses that decide ownership, commercial use, client transfer, attribution or AI disclosure, and the plan or tier they apply to.
3. Record the result in the inventory (`terms[].status: reviewed`, `reviewedOn`, `reviewedBy`) and, only then, a `rights-verification` approval row naming who verified, the sources and the date (the form the gate already requires).
4. Change an asset to `verified` only through that approval row (`rights.approval`); `check:media` refuses anything else.
5. If any term does not allow the intended use, replace the asset; do not reinterpret the term.

## 7. Proposed release-gate changes (not enabled; decision D-P5-4)

Today the gate's `rightsVerification` requires a `rights-verification` row that says "verified by", names "sources" and carries a date. It does not say *which* media it covers. Proposal:
1. **Bind the approval to the inventory:** the row must carry `inventory: <sha256>` equal to the digest of the build's delivered media and fonts (`mediaInventoryDigest`, from path and hash), printed by a new `npm run release:rights-digest`. Changing any image, video or font invalidates the approval (as `search-review` already does for search artefacts).
2. **No unverified asset in a client-production build:** every image and video of the build is `verified` in the inventory with a named approval; fonts are `licence-text-shipped` with their notice agreeing with the file.
3. **Terms reviewed:** every term an asset points at is `reviewed` with a date and a reviewer.
4. **Findings closed:** F-G2-01 (provenance states no rights) and F-G5-05 (font notice) resolved, not merely accepted.
5. **Keep** the existing scans for wording that claims a right, and the rule that client-production is blocked while any of this is open.
6. **Tests:** single-defect cases for each (no digest, a digest for other media, an asset still unverified, a term not reviewed, an open font-notice finding).

## 8. What was added

- `engineering/media-rights-inventory.json` and `engineering/lib/media-rights.mjs` (inventory check and a minimal WOFF2 name-table reader).
- `check:media` validates the inventory on every run; finding **F-G5-05** is registered and reported as a known finding.
- 22 cases in `check:selftest-gate4` (an image added or changed, an entry for a deleted file, a duplicate, marked verified with no approval, with a real approval (must pass), generated media called licence-text-shipped or given an unknown status, no origin, no terms, an unknown term, wording that claims a right, terms reviewed with no reviewer, a term over http, a missing font section, a font section without the OFL, a font called unverified, the Noto notice mismatch, the other two notices agreeing).

## 9. Owner decisions (`APR-JE-034`, 2026-10-11)

| # | Decision | Owner's answer |
|---|---|---|
| D-P5-4 | Bind the media-rights approval to the exact delivered asset inventory (section 7) | **Approved.** Licensed or otherwise authorised usage is sufficient; outright ownership is not required. The approval row and the gate must therefore ask for **authorised use**, not ownership. Implementation needs its own authorisation |
| D-P5-5 | Who captures the provider terms | **Provider-terms verification stays open until dated, authoritative evidence is reviewed** |
| D-P5-6 | The Noto Serif SC notice (F-G5-05) | **Approved after comparison with authoritative upstream licensing information, preserving any required copyright attribution.** Not made yet |
| D-P5-7 | Showing the demonstration publicly before the terms are read | **Not authorised while the applicable media-use rights remain unverified** |
