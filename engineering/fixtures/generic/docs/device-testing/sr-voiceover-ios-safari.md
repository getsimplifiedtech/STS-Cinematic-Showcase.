<!-- Generated from engineering/fixtures/generic/engineering/release/evidence-spec.json by `npm run evidence:docs`. Do not edit by hand: change the specification and regenerate. -->

# VoiceOver with Safari (iPhone or iPad, physical device): test procedure

**Evidence class E3: Human testing on a physical device.** A person holding a real phone or tablet (model, operating-system version and browser version recorded). This record may be claimed as: "verified on this device". It must never be claimed as: anything about other devices or versions.

**Release-gate type:** `screen-reader`. **Estimated tester time:** about 60 minutes (an estimate, not a measurement). **Scaffold command:** `npm run evidence:new -- sr-voiceover-ios-safari`.

## What you need

- A phone or tablet running iOS or iPadOS with Safari and the screen reader VoiceOver.
- A **physical** phone or tablet in your hands. Emulators, simulators, browser developer-tools device modes and cloud device farms are **not** E3 and the record is rejected if it says so.
- About 60 minutes, the build named in your record, and the ability to take screenshots or a screen recording.

## Before you start

1. Get the exact build to test. The scaffolded record already names the commit, the delivered-files hash and the **candidate artifact digest** (`build.commit`, `build.assetsTree`, `build.candidate`); you must test that build. The digest is what the release approval is bound to: if anything in the artifact changes, the digest changes and this record stops counting (`npm run release:candidate` prints it). Ask the engineer for the preview package for that commit (`npm run release:prepare` writes it; nothing is deployed), or build it yourself from that commit.
2. Serve it over HTTP. On the computer that holds the files run `python3 serve.py` (from the `engineering/fixtures/generic` folder, or the folder inside the package): it supports the byte-range requests that Safari needs to play video and listens on this computer only. For a phone or tablet on the same trusted Wi-Fi run `python3 serve.py 8766 0.0.0.0` and open `http://<the computer's address>:8766/` on the device. Android can also use USB debugging with `adb reverse tcp:8766 tcp:8766` and open `http://localhost:8766/`. Do not open the pages straight from a folder (`file://`) in Safari: WebKit then shows fallback fonts by design of the browser (known finding F-G5-01), which is not what visitors see.
3. Scaffold the record: `npm run evidence:new -- sr-voiceover-ios-safari`. It writes an unfilled template to `engineering/release/evidence/`; it never fills in a result.

## Record your setup

| Field | What to write |
|---|---|
| `tester.name`, `tester.role` | Your name and who you are (QA tester, owner, ...). You must be a person |
| `date` | The day you did the test (YYYY-MM-DD) |
| `environment.device` | `kind` (phone or tablet), `make`, `model` (both required for a physical device), and `emulated: false` |
| `environment.os` | `name` (iOS or iPadOS) and the exact `version` |
| `environment.browser` | `name` (Safari) and the exact `version` (open the browser's About page) |
| `environment.screenReader` | `name` (VoiceOver) and its `version` |
| `environment.settings` | Anything you changed from the defaults (text size, Reduce Motion, zoom, ...) |

## Steps

Work through every item. Mark each `pass`, `fail` or `not-applicable` in your record. **Not-applicable** is allowed only on items marked *n/a allowed*, with a note of at least 15 characters saying why. A `fail` needs a finding (see below).

### Screen reader: every page

Do these for **each** of: `index.html`, `services.html`, `contact.html` (items marked with a page apply only to that page).

- [ ] **`sr-landmarks`**: Open the landmarks list (the screen reader's rotor, elements list or landmark gesture). *Expect:* Banner/header, navigation, main and footer (contentinfo) are listed and correctly named.
- [ ] **`sr-headings`**: Open the headings list and step through the headings in order. *Expect:* There is one main heading and the other headings follow a sensible order that matches the page.
- [ ] **`sr-links-buttons`**: Step through every link and button. *Expect:* Each one is announced with a clear name and its role (link or button); the current page link says it is current; no 'link' or 'button' without a name.
- [ ] **`sr-images`**: Step through the photographs. *Expect:* Meaningful photographs have a short description; purely decorative ones are skipped.
- [ ] **`sr-reading-order`**: Read the page from top to bottom with the screen reader's read-all command. *Expect:* The text is read in the same order you see it; no hidden or duplicate text is read.

### Screen reader: controls and key content (once per session)

Do these once for the whole session.

- [ ] **`sr-skip-link`** (n/a allowed): Move to the first item on a page. *Expect:* The skip link is announced first and moves you to the main content.
- [ ] **`sr-menu-state`** (n/a allowed): On a narrow window or phone, find the menu button and open and close it. *Expect:* The button announces its state (expanded or collapsed) and the links appear in the reading order when open.
- [ ] **`sr-pause`** (n/a allowed): On the Home page find the Pause button. *Expect:* It is announced with its name and state (pressed or not) and works.
- [ ] **`sr-visit-details`**: On the Contact page read the address, the opening-hours table and the telephone link. *Expect:* The address is read in order, the hours table is read row by row with day and time, the telephone link says it is a link to call (a sample number).
- [ ] **`sr-order-details`**: On the Order online page read 'How ordering works' and the notices. *Expect:* The steps are read in order; the page says clearly that ordering is a sample.
- [ ] **`sr-no-surprises`**: While using the site, notice any unexpected announcements, repeated text or silence. *Expect:* None; or every surprise is written up as a finding.

## Attachments

Attach at least 2: a screen recording or audio recording, or a written transcript, of the screen reader reading the Home and Contact pages, and a screenshot showing the screen reader and browser versions. Allowed kinds: audio, screen-recording, transcript, screenshot.
Save at least 1 of them under `engineering/release/evidence/files/` and list each in `attachments` with its `kind`, a short `description`, its `path` (relative to that folder) and its SHA-256 (`npm run evidence:hash -- <file>`). Others may be an https `url` with the SHA-256 you computed. The same file cannot be used for two records.

## Findings

Write every problem you saw in `findings`: `id`, `page` (one of the five pages, or `session`), `severity`, `description` (what you did, what you saw, what you expected) and `status` (`open`, `fixed` or `accepted`). Severity:

- **Blocker**: a visitor cannot read a page, reach a page or complete the main task.
- **Major**: content is lost or a main task is hard for a group of visitors.
- **Minor**: a cosmetic problem or a small annoyance with an easy workaround.
- **Info**: an observation, not a defect.

Every `fail` needs at least one finding for that page. The record's `conclusion` is `failure` if anything failed, otherwise `success`. An open Blocker or Major finding stops the record from counting.

## Sign it

Set `status` to `"completed"` and fill `attestation`: `statement` exactly "I performed this test myself in the environment described in this record and the outcomes are my own observations.", `signedBy` your name (the same as `tester.name`), `date`. **Do not sign work you did not do.**

## What the release gate checks

- the record is complete (every item has an outcome, every page is covered, nothing left empty) and is no longer a template;
- the class matches the target (E3) and is consistent with the device, operating system and browser you recorded; a record that mentions emulation, simulation, DevTools, headless browsers or a device farm is rejected;
- it names a real person and carries the exact signed statement;
- it is bound to the build: the commit exists in the repository, is the release commit or an ancestor of it, the delivered-files hash equals the release build's, and the date is not in the future or before that commit;
- conclusions agree with outcomes, every failure has a finding, no open Blocker or Major finding remains;
- the attachments exist, match their SHA-256 and are not reused by another record.

**What it cannot do:** prove that you did the test. That is your attestation and the owner's release approval.
