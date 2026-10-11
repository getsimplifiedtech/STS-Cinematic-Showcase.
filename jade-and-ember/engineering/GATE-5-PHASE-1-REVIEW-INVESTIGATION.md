# Gate 5 Phase 1 review: investigation report (F-G5-03 verification, F-G5-04 investigation)

Status: **for owner review.** Authority: APR-JE-028. Nothing in the site changed: no page, style, font, media or configuration. Every candidate CSS rule below was injected by script in a browser and thrown away. Phase 2 has not started. Evidence: `engineering/evidence/gate5-phase1-review/` (screenshots and the raw measurement lines), produced by `engineering/tools/gate5-diagnose.mjs` in GitHub Actions runs 19, 20 and 21.

## 1. CI outcome asked for

| Run | Commit | Result |
|---|---|---|
| 18 (`38093062615`) | `e9c43db` | **success, all four jobs.** Chromium `verify` (all 34 checks, verify step 14 min 24 s), macOS fast checks, Firefox 157.0 14 of 14, WebKit 27.2 14 of 14 browser-driven checks |
| 19 (`38094000731`) | `39c2168` | success, all four jobs; first diagnostic output |
| 20 (`38095192662`) | `264797c` | success, all four jobs; root-cause experiments and width sweep |
| 21 (`38096483408`) | `21ba5ea` | success, all four jobs (Chromium verify step 14 min 30 s); engine-scoped candidates |

All passing browser checks still pass. The v0.8 baseline branch was not touched, and the regression comparison against v0.8 (same engine) still reports no differences in Chromium, Firefox and WebKit.

## 2. F-G5-03 (Firefox category strip): verified

Firefox 157.0, Menu page, 390 x 844 (the strip only overflows, and so only becomes a Tab stop, at phone width; at 1440 px it is not a stop):

| Question | Result |
|---|---|
| Visible focus indicator? | **Yes.** `:focus-visible` matches; 3 px solid outline (`rgb(169, 210, 190)`, 3 px offset) around the whole strip; 2,487 pixels change between focused and unfocused. Screenshot: `strip-focused-390-firefox.png` |
| Keyboard-operable? | **Yes.** ArrowRight scrolls the strip (scrollLeft 0 to 143), ArrowLeft scrolls it back; Enter on a link jumps to its section (`#wok`) |
| Focus trap? | **None.** Tab moves forward through the five links and on to "Order online", Home, Menu (eight distinct stops); Shift+Tab walks back through them to the strip and out |
| Other engines | Chromium 141 and WebKit 27.2: the strip is not a Tab stop (no change from before) |

F-G5-03 is therefore accepted with its verification complete. The extra Tab stop is Firefox's own access to scrolled content, and it is visibly focused.

## 3. F-G5-04 (WebKit, Visit hours table under text spacing)

### 3.1 What WebKit renders
`hours-default-webkit.png` (normal), `hours-spacing-webkit.png` (spacing override applied after load). In the spaced state the label "Tuesday – Thursday" runs straight into the value "5:00 pm – 9:30 pm": the last letter of the label touches the first digit of the value, with no gap. In Chromium and Firefox the same state keeps a 24 px gap.

### 3.2 Exact elements and CSS
- Elements: `table.hours` in `.visit-grid` on `visit-us.html`, row 2: `th[scope=row]` "Tuesday – Thursday" and its `td` "5:00 pm – 9:30 pm". (Row 3, "Friday – Saturday", is within 15.8 px of the value, the next closest.)
- CSS in play (all in `styles.css`): `.hours{border-collapse:collapse;width:100%}`, `.hours th{padding-right:var(--s5);white-space:nowrap}` and the table's automatic column layout. The override is the WCAG 1.4.12 set (line height 1.5, letter spacing 0.12 em, word spacing 0.16 em, paragraph spacing 2 em).
- Measurement (1440 px): the spaced label needs 192.4 px of text plus 24 px of padding = 216.4 px. Chromium and Firefox size the label column at 216.4 px. **WebKit leaves it at 189.3 px, the width it had before the override**, so the label's text (right edge at 1026.4 px) runs 3.1 px past the cell edge (1023.3 px) into the value's text (starting at 1023.3 px). `th.scrollWidth` 192 against `clientWidth` 189.

### 3.3 Root cause (experiments, run 20, WebKit 27.2)
| Experiment | Label column | Gap to value |
|---|---|---|
| Spacing rule is in the HTML from the first layout | 216.4 px | 24 px (**correct**) |
| Same rule injected after the page loaded (what `check:reflow`, bookmarklets and extensions do) | 189.3 px | **-3.1 px** |
| ... then hide and re-show the table | 216.4 px | 24 px (repaired) |
| ... then resize the window by 1 px and back | 216.4 px | 24 px (repaired) |
| ... then rewrite the label text | 189.3 px | -3.1 px (not repaired) |
| letter-spacing only, or word-spacing only, injected after load | 189.3 px | 2.3 px or 33.6 px (letter-spacing alone already breaks the gap) |
| rule scoped to `th, td`, to the table, or inherited from `body`, injected after load | 189.3 px | -3.1 px (scope does not matter) |

Firefox and Chromium recompute the column in every case. **Conclusion: WebKit does not recompute the automatic table's column widths when text-spacing properties change after layout; the page's rule (`white-space: nowrap` on the label) turns that stale width into an overflow instead of a harmless wrap.** A forced relayout (any resize, zoom or rotation) repairs it. This is the Playwright Linux build of WebKit; whether real Safari on macOS or iOS behaves the same is **[unverified]** (human device testing).

### 3.4 Is it a genuine accessibility defect or a test artifact?
**Genuine but minor, and the check overstates one number.**
- Genuine: the screenshot shows the label and value touching; a person who applies a text-spacing tool in a WebKit browser would see it until the next relayout. Nothing is lost (all text remains present and readable, no clipping, no hidden content), so it is a crowding defect, not a loss of content (WCAG 1.4.12 requires no loss of content or functionality; this is close to its edge, not clearly beyond it).
- Overstated: the check reports a 3.1 px overlap of text *rectangles*, which include the trailing letter-spacing (2 px); the drawn glyphs do not share a single pixel (ink-pixel overlap 0; bounding boxes overlap by 1 px).
- Wider than the check shows: `check:reflow` samples only 1440 and 390 px. In WebKit the same fault appears at **1024 px and 1100 px (rectangle overlap 18.2 px), 1280 px (5.7 px) and 1440 px (3.1 px)**; not at 820 px or below, where the table stacks or is wide enough. Chromium and Firefox have no overlap at any of the seven widths.
- It is not a test artifact in method: injecting spacing after load is exactly how the WCAG 1.4.12 test is normally done.

### 3.5 Candidate corrections tested (nothing committed)
Each row: does it remove the overlap in WebKit at all seven widths, and is the **normal** page pixel-identical (full-page screenshots, five pages, seven widths) in each engine? Chromium figures are from a local Chromium 141 run of the same tool.

| Candidate (CSS) | WebKit overlap | Normal appearance: WebKit | Firefox | Chromium | Verdict |
|---|---|---|---|---|---|
| K1m `@media (min-width:1200px){.hours th{white-space:normal}}` | fixed at 1280 and 1440; **1024 and 1100 still 18.2 px** | identical | identical | identical | incomplete |
| K5 `.hours th{white-space:normal;min-width:max-content}` | fixed at every width | identical | **changes 1024 and 1100 px** | **changes 1024 and 1100 px** | rejected (changes other engines) |
| K9 `.hours th{width:1px}` | not fixed | identical | changes 1440, 1280, 820 px | | rejected |
| K10 gap moved to the value cell | fixed | **changes 1440 to 820 px** | changes 1440, 1280, 820 px | | rejected |
| Grid layout (K4) | fixed | changes every width | changes every width | changes every width; also overflows at 320 px | rejected |
| `min-width:max-content` or `width:max-content` alone (K2, K3) | not fixed | | | | rejected |
| **K11 `@supports (hanging-punctuation:first){.hours th{white-space:normal;min-width:max-content}}`** | **fixed at every width (0 px at 390, 600, 820, 1024, 1100, 1280, 1440)** | **identical (0 pixels at seven widths, all pages)** | **identical: rule not matched, nothing changes** | **identical: not matched (local)** | **only candidate that is complete and leaves other engines untouched** |

Under K11 the spaced label wraps ("Tuesday – / Thursday", `hours-spacing-K11-webkit.png`) instead of overflowing; the normal state is pixel-identical in WebKit. `hanging-punctuation` is supported by WebKit (confirmed in run 21) and not by Chromium or Firefox. K12 (`-webkit-touch-callout`, iOS WebKit) does not match in this Linux build, so it cannot be evidence here.

### 3.6 Risks of K11 (for the decision)
1. It is **engine detection by feature probe**: if Chromium or Firefox ever ship `hanging-punctuation`, K5's changes at 1024 and 1100 px would start applying there. The cross-browser jobs (the pixel comparison against v0.8 in each engine) would catch that change on the next Playwright upgrade.
2. It is verified only on Playwright's Linux WebKit; Safari and iOS Safari are **[unverified]** and need the human device pass.
3. It adds one CSS rule (a visible-layout rule under text spacing only, none in the normal state); under the Gate 2 rule that needs your approval.
4. It would be added to the page's stylesheet, which changes the delivered CSS bytes (hash, the build's `check:determinism` and `check:regression` source comparison against v0.8 would record an intentional, approved difference).

### 3.7 Options for the owner
- **A. Accept and document** (no CSS change). Rationale: minor, transient, WebKit-specific, user-tool-triggered, readable; the finding stays registered and the check keeps reporting it. Smallest risk.
- **B. Approve K11** as the correction (recommended if you want it fixed). I would then add the rule, widen the `check:reflow` spacing contexts to the widths where WebKit fails (1024, 1100, 1280 as well as 1440 and 390), remove F-G5-04 from the register once WebKit passes without it, and re-run all three engines.
- **C. Do nothing about the page but widen the check** (add 1024, 1100 and 1280 to the spacing contexts) so the extent of the finding is measured every run, while the finding stays open.

Recommendation: **B if you want WebKit users who apply their own text spacing to see a clean table; otherwise A with C.** Either way, none of this affects the approved appearance.

## 4. Housekeeping and what I did not do
- The temporary diagnostic step in the Firefox and WebKit jobs (about 4 minutes each, running in parallel) is still in the workflow. I propose removing both steps once you have reviewed this report; the script stays in `engineering/tools/` like the latency probe.
- No CSS, page, font or media change; no Phase 2 work; no framework repository change; no merge, deployment or paid generation.

## 5. Resolution (APR-JE-029)
Option B was approved. The K11 rule is in `styles.css` (the only source difference from v0.8, allowlist entry IMM-1). In WebKit 27.2 (Actions run 23) the text-spacing measurements pass at 390, 1024, 1100, 1280 and 1440 px, `check:supports` confirms the rule applies, the v0.8 regression comparison passes with the hours-table label differing only as approved (ASD-1) and 0 pixel problems, and F-G5-04 is removed from the register. Firefox and Chromium are unaffected (the rule does not apply; computed styles and pixels identical to v0.8). The diagnostic steps were removed from the workflow; this report, the script and the evidence stay. See `QA.md` and `CI.md` for the final verification run.
