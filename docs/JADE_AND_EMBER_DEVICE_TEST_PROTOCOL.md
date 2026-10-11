# Jade & Ember: device, browser and screen-reader test protocol

Gate 5, Phase 2 (`APR-JE-030`). This protocol, the per-target procedures in [`device-testing/`](device-testing/README.md) and the evidence tooling exist so that **people** can do the testing that no automated check can do, and so that the release gate can tell real, complete, correctly classified evidence from anything else.

> **Status: no physical-device, screen-reader or desktop-Safari testing has been done.** Everything here is paperwork and tooling. The automated checks run Chromium, Firefox and WebKit under emulation in CI (class E1); they are not a substitute for any of the procedures below. The client-production release gate stays closed until people record this evidence.

## 1. The three evidence classes

Every record states one class, and each class allows only its own claim. The gate checks that the class, the record type and the environment agree.

| Class | What it is | May be claimed as | Never claimed as | Record types |
|---|---|---|---|---|
| **E1** | Automated and emulated: Playwright engines, device descriptors, viewport and forced-colours emulation, a CI run | "behaves as expected in this engine under emulation" | anything about a physical device, a screen reader or a person's experience | `ci-run` only |
| **E2** | A **person** on a real **desktop or laptop**, in a real desktop browser (Safari on a Mac, Firefox, Chrome), including desktop screen readers (NVDA, VoiceOver on macOS) | "verified by hand in this browser on this computer" | how a phone or tablet behaves | `browser-matrix`, `screen-reader` |
| **E3** | A **person** holding a **physical phone or tablet** (model, operating-system version and browser version recorded), including VoiceOver on iOS and TalkBack | "verified on this device" | anything about other devices or versions | `real-device`, `screen-reader` |

Emulation is **never** recorded as E2 or E3: not a browser's device mode, not a simulator, not an emulator, not a headless browser, not a cloud device farm. A record whose environment mentions any of these is rejected. (A cloud device farm is paid and is not part of this plan unless the owner approves it.)

## 2. What has to be tested

| Target | Class | Gate requirement | About |
|---|---|---|---|
| iPhone, Safari | E3 | `evidence:real-device` | 90 min |
| Android phone, Chrome | E3 | `evidence:real-device` | 90 min |
| iPad or tablet (optional; adds the Safari clip answer) | E3 | optional | 60 min |
| Desktop Chrome, Firefox and Safari (each includes the keyboard-only and zoom items) | E2 | `evidence:browser-matrix` | 60 to 75 min each |
| NVDA (Firefox or Chrome), VoiceOver (macOS or iOS), TalkBack | E2 or E3 | `evidence:screen-reader` | 60 min each |
| Automated verification of the release commit | E1 | `evidence:ci-run` | automated |

The times are estimates, not measurements: about six to ten hours across several people. The full list, with the exact steps, is the [inventory](device-testing/README.md). Cross-cutting procedures: [keyboard-only](device-testing/procedures/keyboard-only.md), [responsive layouts, zoom, reduced motion and media fallback](device-testing/procedures/responsive-zoom-motion-media.md), [screen readers](device-testing/procedures/screen-readers.md).

## 3. How a test is done

1. **Choose a target** from the inventory and read its procedure.
2. **Get the exact build.** Evidence is bound to the delivered bytes: the record names the commit and the hash of the delivered files (`build.assetsTree`). If the site changes after you test, the evidence no longer matches and the page must be re-tested.
3. **Scaffold the record:** `npm run evidence:new -- <target>` (run from the `jade-and-ember` folder). It writes an **unfilled** template to `engineering/release/evidence/`: every outcome empty, nothing signed. It never fills in a result.
4. **Do the test yourself**, in the environment the target names, following the steps. Take the screenshots or recordings the procedure asks for.
5. **Fill the record**: who you are, the date, the device, operating system and browser (and screen reader) with exact versions, an outcome for every item on every page, the findings, the attachments with their SHA-256 (`npm run evidence:hash -- <file>`), and your signed statement. Set `status` to `completed`.
6. **Check it before you hand it in:** `npm run evidence:validate -- <record.json>` judges the record the way the release gate will.
7. **Hand it to the engineer**, who commits the record and its attachment files. One record per device (or per screen-reader and browser combination); a re-test is a new file.

## 4. Findings

Every problem goes in the record's `findings` (page, severity, description). The engineer adds each one to the findings register (`engineering/findings.json`) with a proposal; a visible change still needs the owner's approval. Severity: **Blocker**: a visitor cannot read or reach a page or complete the main task. **Major**: content is lost or a main task is hard for a group of visitors. **Minor**: a cosmetic problem or a small annoyance with an easy workaround. **Info**: an observation. An open Blocker or Major finding stops a record from counting and blocks the release gate.

## 5. What the release gate checks, and what it cannot

The gate (`npm run release:gate`) accepts evidence only when **all** of this holds for each record, and rejects it otherwise:

- **Complete:** not a template; every item on every page has an outcome; not-applicable only where allowed and explained; every failure has a finding; the conclusion agrees with the outcomes; nothing left empty.
- **Correctly classified:** the class is allowed for the target and the record type; the device kind, operating system, browser and screen reader fit the target (an iPhone record names iOS and Safari, an NVDA record names Windows); the environment does not mention emulation, simulation, developer tools, headless browsers or device farms; `emulated` is the boolean `false`.
- **Bound to this build:** the commit exists in the repository and is the release commit or an ancestor of it; the hash of the delivered files equals the release build's; the date is real, not in the future and not before that commit.
- **A person's signed statement:** a name that is not a tool or placeholder, the exact attestation sentence, signed by the same name.
- **Verifiable attachments:** present, matching their SHA-256, within the allowed folder, never reused by another record, and enough of them.
- **Covering the requirement:** the gate needs an iPhone **and** an Android phone (E3), NVDA, VoiceOver and TalkBack passes, desktop Chrome, Firefox and Safari (E2), and a successful CI run (E1) for the release commit. A failure, a missing target or an open Blocker or Major finding does not count.

**What it cannot do is prove that a person actually did the test.** That rests on the named tester's signature and on the owner's release approval. **Never create or sign a record for work that has not been done.** A record that was invented, copied or edited to look complete is a false statement about the release.

## 6. Rules

- No result is ever filled in by tooling: the scaffolding command leaves every outcome empty.
- Do not use an emulator, simulator, browser device mode or device farm for E2 or E3 evidence.
- Test Safari over HTTP, not from a folder: WebKit shows fallback fonts over `file://` (known finding F-G5-01), which is not what visitors see. See each procedure's "Before you start".
- Real-device, screen-reader and desktop-Safari testing, and the owner's decisions on any finding, are human work and release requirements: they are never claimed as done by the engineering tooling.
