# Jade & Ember: framework and design-authority reference

**Purpose:** record exactly which STS framework state and which design skill this project follows, so the reference cannot change silently. It is a documentation record for an HTML-first project; the framework's compile-and-lock pipeline (`architecture/08`, `14`) is Lovable-oriented and is not used here.
**Recorded:** 2026-10-10, on branch `feature/jade-and-ember-brief`. **Project state described:** Jade & Ember v0.8 at commit `32afde7` (the parent of the commit that added this file).
**This file records references and an owner-stated policy. It does not approve v0.8, publication or production readiness** (see `docs/JADE_AND_EMBER_APPROVALS.md`, section C).

## 1. Framework reference

| Item | Value |
|---|---|
| Repository | `getsimplifiedtech/sts-web-design-framework` |
| Branch followed | `feature/anthropic-frontend-design-standard` |
| **Commit pinned** | **`d2803c02408c27d4489ccddee0a11478621e26dd`** (`d2803c0`, "docs: archive packaged legacy STS design reference") |
| Relationship to `main` | `main` is `f05f41f2e9112397d1b1755117e5b6314853a492` ("review: add the final freeze re-check to main"); the branch is 19 commits ahead of `main` and 0 behind |
| Framework release identifier | **None exists.** The repository has no tag, version file or release artifact (compliance audit finding F-1). The commit above is therefore the only exact reference available |
| Architecture status | Specifications 01 to 15 (Layer Model v2.1, Vocabulary v1.2, Profile Schema v1.1, Package Contract v1.2, Compatibility Matrix v1.1, Precedence v1.1, Determination Interface v1.2, Compiler v1.1, QA Model v1, Editorial Migration v1, Layer Registry v1.1, Contribution/Token Model v1.1, Tier Contract v1.1, Release/Lock/Lifecycle v1.1, Approval Records v1.1). Freeze verdict READY_FOR_ARCHITECTURE_FREEZE at `7f111ae`, owner authorisation recorded 2026-09-23 (`reviews/CLAUDE_FINAL_FREEZE_RECHECK.md`, "FINAL VERDICT") |
| Read for this project | 2026-10-09 and 2026-10-10, read-only, from the repository and a scratch clone |

## 2. Design skill reference: Anthropic Frontend Design

| Item | Value |
|---|---|
| Role | **Active creative authority** for this project (policy in section 4) |
| Name in front matter | `frontend-design` (`license: Complete terms in LICENSE.txt`) |
| Path in the framework | `.claude/skills/frontend-design/SKILL.md` (71 lines, 9,390 bytes) and `.claude/skills/frontend-design/LICENSE.txt` (Apache License 2.0, 177 lines) |
| `SKILL.md` SHA-256 | `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3` |
| `LICENSE.txt` SHA-256 | `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` |
| Vendored in the framework by | `615b2a8` (`SKILL.md`) and `f542c17` (`LICENSE.txt`), both 2026-10-09, commit messages "vendor official Anthropic frontend-design skill" |
| Upstream source | **Not recorded in the framework repository, and not verified here.** This project relies on the framework's statement that the vendored copy is the official, unmodified skill. Upstream URL, upstream commit and byte-for-byte equality with it are open (audit finding F-6) and should be added by the framework owner |

If either hash above changes at the pinned commit's successor, this file must be updated and an approval record added before the project follows the new text.

## 3. Retired authority: STS Premium Web Design (historical only)

| Item | Status |
|---|---|
| `skills/PREMIUM_WEB_DESIGN.md` (v2.0) | Archived and superseded; banner at line 1 (commit `617aa20`) |
| `.claude/skills/sts-premium-web-design/SKILL.md` | Reduced to a deprecation redirect on the pinned branch (commit `f486426`); its text says not to combine the old aesthetic rules with the active skill |
| `.claude/skills/sts-premium-web-design/references/PREMIUM_WEB_DESIGN.md` | Archived copy with a banner (commit `d2803c0`) |
| Branch `claude/premium-web-design-skill` | The branch the original build brief pointed at; it still carries the old skill as active text, not the redirect |

Its aesthetic rules (premium-versus-template scoring language, swap, squint and mute tests, "Part" numbering, and similar) are **not applied** to this project and **must not be combined** with Frontend Design. Earlier project documents that used its vocabulary are kept as history and are marked as such (brief, hero plan, `jade-and-ember/QA.md`). Project-specific engineering requirements that older documents expressed in its terms (accessibility, reduced motion, source-media discipline, real-device testing, media licensing, deployment approvals) remain in force through the project's own brief and QA documents and through STS engineering authority; they are not aesthetic rules.

## 4. Authority policy (owner decision, 2026-10-10)

Recorded as stated by the owner (approval record `APR-JE-016`):

1. **Anthropic Frontend Design governs creative direction.** Palette, typography, layout, composition, imagery and motion direction are decided by following that skill's process (plan, review against defaults, build, critique), within any visual direction a project brief pins down.
2. **STS retains authority over architecture, engineering, accessibility, security, QA and delivery.** This includes the project structure, build, configuration, test and release controls, accessibility and performance requirements, security and privacy, approvals, and deployment.
3. **STS visual packages may provide reusable implementation tokens and configurations**, for example named colour, type and spacing tokens, or component and configuration conventions. They **must not impose competing aesthetic rules** on top of the skill's direction.

**Adoption status.** This policy is recorded in this repository only. The framework repository has **not** been modified, so audit finding F-3 (framework specifications `01`, `02`, `04` still describe STS aesthetic "visual packages") remains open there until the owner changes the framework. Until then, where a framework specification and this policy appear to conflict on creative direction, this policy governs this project.

## 5. Template lineage (conventions only)

`templates/sts-cinematic-template-v02` v0.3.1 in the same framework is the HTML-first lineage for this project's **engineering conventions**: config-driven build to committed static pages, `package.json` scripts and the dev-dependency set (`@axe-core/playwright ^4.10.0`, `@lhci/cli ^0.15.0`, `playwright ^1.48.0`), static-first progressive enhancement, no external requests, media provenance. It is **not** an aesthetic authority for Jade & Ember. Known divergences: the config is split into four files under `config/`; the test suite is a superset; there is no `VERSION.json` and no CI workflow yet (audit findings m-1 and m-2).

## 6. What this project pins, and what it does not

- **Pinned:** npm development tools by `jade-and-ember/package-lock.json`; the framework commit and skill hashes above (by this record); the project's own state by git commit and by the generated pages, which equal a fresh build of the committed sources (verified 2026-10-10).
- **Not pinned:** the framework has no release or lockfile (F-1); the skill's upstream identity (F-6).
- **Not used:** Lovable; the framework's Design Profile, compiler and lockfile pipeline; STS visual packages (none exist in the framework repository).
- **Environment caveat observed 2026-10-10 (outside this repository):** the local framework checkout was on `claude/premium-web-design-skill` at `f2a03dc`, where the retired skill is still the active text, and the synced user-level skill list still advertised `sts-premium-web-design` with its original description (audit finding F-4). Nothing was changed.

## 7. Keeping this record current

When the framework commit, the skill text or its license changes: update section 1 and 2 (commit, hashes), re-read the skill, note any effect on the project, and add an entry to `docs/JADE_AND_EMBER_APPROVALS.md` stating what the owner approved. Do not change the reference without that record.
