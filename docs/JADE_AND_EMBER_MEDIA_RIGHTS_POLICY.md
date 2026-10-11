# Jade & Ember: media rights policy (documentation policy, adopted `APR-JE-023`)

**Adopted by the owner on 2026-10-10 (finding F-G2-01, Option A of `docs/JADE_AND_EMBER_MEDIA_RIGHTS_PROPOSAL.md`).** This is a documentation policy. It asserts no right or licence over any generated media. `jade-and-ember/media/PROVENANCE.md` and the frozen v0.8 baseline are unchanged; this policy lives outside them and applies to every later version.

## Policy
**No licence or rights over the generated media of Jade & Ember have been verified.** The six images and the hero loop were produced with the AI generation services named in `jade-and-ember/media/PROVENANCE.md`. The terms of those services, and any copyright in their output, have not been reviewed for commercial use, and no right in this media is claimed or granted by this repository.

1. The media is used only in the fictional Jade & Ember demonstration, a website design concept by Simplified Tech Solutions. It depicts no real restaurant, dish or person.
2. It must not be reused, redistributed, sold or supplied to a client until the terms of the generation services in force on the generation dates (images and video: 2026-10-09) have been reviewed and the outcome is recorded.
3. For any real client, replace all of it with real photography or footage, or with media whose licence is verified.
4. The fonts are separate: their licences (SIL Open Font License 1.1) are in `jade-and-ember/fonts/LICENSES.txt`.
5. Review record: **not yet performed.**

## How the policy is enforced
- `check:media` keeps reporting that `PROVENANCE.md` states no licence terms as a **known, accepted finding** (F-G2-01), so the gap stays visible in every run and cannot be mistaken for a pass.
- The release gate (`check:release`, `npm run release:gate`) requires, for any client-production build, a recorded **media-rights verification** (a `rights-verification` approval record (since G6-2 a structured record in `engineering/release/approvals/`, earlier a row in the approvals log) naming the verifier, the sources reviewed and the date) before the build can pass. None exists, so no client-production build can pass today.
- Nothing in documentation, pages, the manifest or the structured data may state that the media is licensed, owned, free to use or cleared; `check:seo` and `check:release` scan for such wording in generated output.

## What would change this
A verification by the owner of the points in section 2 of the proposal, recorded as a new approval row. Then the policy is updated by a superseding entry, never by editing this one.
