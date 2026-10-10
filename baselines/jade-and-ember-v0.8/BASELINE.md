# Jade & Ember v0.8: frozen design baseline

**Status (owner decision, 2026-10-10, `APR-JE-017`): v0.8 is design-baseline approved as the completed Anthropic Frontend Design baseline. It is NOT approved for public deployment or client production.** Every version after it is built from it, and it is visually immutable: **any visual change needs separate owner approval** (`docs/JADE_AND_EMBER_APPROVALS.md`).

## 1. Exact source
| Item | Value |
|---|---|
| Source commit | `32afde77d29b3a30443c17ad7ea27d7882adcd5d` (`32afde7`, "renumber the five-page build v0.8"), branch `feature/jade-and-ember-brief` |
| Git tree of the whole repository at that commit | `c5ca5e45ba8ee8c562015d37207f5e8d2a73d933` |
| Git tree of `jade-and-ember/` at that commit | `833b291d2509f920e225f124e6f1de86b5f0068d` |
| Tag | `jade-and-ember-v0.8` (annotated, points at the source commit). **Created locally only: pushing it to `origin` was refused** ("the remote end hung up unexpectedly", three attempts; branch pushes work). Until the owner creates it on the remote (or permits another marker), the commit SHA above and the checksums below are the authoritative reference |
| Documentation-only successor | `81311f7` adds the framework reference, approval records and brief amendments. `git diff 32afde7 81311f7 -- . ':!*.md'` is empty: **no site, config, media, test or build file differs**. Only `jade-and-ember/README.md` and `QA.md` (one note each) and `docs/*.md` changed |
| Framework and design-skill reference | `docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md` (framework commit `d2803c0`, skill SHA-256 recorded there) |

## 2. What is frozen and how to check it
| Frozen item | Where | Checksums |
|---|---|---|
| Entire `jade-and-ember/` source tree (60 files) | git commit above | `SHA256SUMS.source-tree.txt` |
| **Configuration** (`config/client.json`, `menu.json`, `copy.json`, `site.json`) | inside the tree | same file; e.g. client `7656828a…`, copy `0cc61c1b…`, menu `616de1a8…`, site `bbb325a9…` |
| **Media** (6 WebP images, `hero-loop.webm`, `hero-loop.mp4`, `PROVENANCE.md`) and **fonts** (4 WOFF2 and licences) | inside the tree | same file; hero loop WebM `fb89d96b…`, MP4 `2a7d19d8…` |
| Built pages and shared assets (`index.html`, `menu.html`, `our-story.html`, `visit-us.html`, `order-online.html`, `styles.css`, `site.js`, `hero.js`, `menu.js`) | inside the tree | same file |
| **Preview package** `jade-and-ember-v0.8-preview.zip` (1,908,749 bytes, 24 files plus `START-HERE.txt`) | this folder | SHA-256 `58aca9e24665a2cae069967101e0767590e81440e5af750d117f1bab63a8c86a` in `SHA256SUMS.preview-package.txt`; contents in `SHA256SUMS.preview-contents.txt` |

Verified when this baseline was recorded (2026-10-10): every site file, the `media/` folder and the `fonts/` folder inside the ZIP are byte-identical to the files at the source commit; the ZIP's `START-HERE.txt` names `32afde7`; the five pages equal a fresh build of the committed sources.

To verify later:
```
git archive 32afde7 jade-and-ember | tar -x -C /tmp/v08 && (cd /tmp/v08 && sha256sum -c <(cd <repo>/baselines/jade-and-ember-v0.8 && cat SHA256SUMS.source-tree.txt))
sha256sum -c SHA256SUMS.preview-package.txt        # in baselines/jade-and-ember-v0.8
```

## 3. State at the baseline (as recorded in `jade-and-ember/QA.md`, not re-run for this record)
Five pages; Jade Lacquer design; cinematic hero loop at widths of 960 px and up with all fallbacks; axe 0 violations on all five pages in six contexts; contrast 0 of 374 hero lines and 0 of 4,267 other text blocks below the gate; Lighthouse mobile accessibility and best practices 100, performance 99 to 100; `tests/site.mjs`, `variants.mjs`, `extracted.mjs` pass. Open items listed in `QA.md` and the compliance audit (M-4, M-5, minors) are **not** closed by this freeze.

## 4. Immutability rules
1. Nothing in the frozen items above may be edited. Later work happens on later branches and versions.
2. v0.9 and later builds are compared against this baseline; any difference in pixels, visible text, assets, fonts, layout or motion behaviour is a **visual change** and needs a separate owner approval recorded before it is merged.
3. The site stays `noindex, nofollow` and is not published. No merge, deployment, publication or paid spend is authorised by this baseline.
