<!-- Generated from jade-and-ember/engineering/release/evidence-spec.json by `npm run evidence:docs`. Do not edit by hand: change the specification and regenerate. -->

# iPhone, Safari (physical device): test procedure

**Evidence class E3: Human testing on a physical device.** A person holding a real phone or tablet (model, operating-system version and browser version recorded). This record may be claimed as: "verified on this device". It must never be claimed as: anything about other devices or versions.

**Release-gate type:** `real-device`. **Estimated tester time:** about 90 minutes (an estimate, not a measurement). **Scaffold command:** `npm run evidence:new -- iphone-safari`.

Portrait and landscape. One iPhone is the minimum; record the model (for example iPhone 15) and the iOS version.

## What you need

- A phone running iOS with Safari.
- A **physical** phone or tablet in your hands. Emulators, simulators, browser developer-tools device modes and cloud device farms are **not** E3 and the record is rejected if it says so.
- About 90 minutes, the build named in your record, and the ability to take screenshots or a screen recording.

## Before you start

1. Get the exact build to test. The scaffolded record already names the commit and the delivered-files hash (`build.commit`, `build.assetsTree`); you must test that build. Ask the engineer for the preview package for that commit (`npm run release:prepare` writes it; nothing is deployed), or build it yourself from that commit.
2. Serve it over HTTP. On the computer that holds the files run `python3 serve.py` (from the `jade-and-ember` folder, or the folder inside the package): it supports the byte-range requests that Safari needs to play video and listens on this computer only. For a phone or tablet on the same trusted Wi-Fi run `python3 serve.py 8766 0.0.0.0` and open `http://<the computer's address>:8766/` on the device. Android can also use USB debugging with `adb reverse tcp:8766 tcp:8766` and open `http://localhost:8766/`. Do not open the pages straight from a folder (`file://`) in Safari: WebKit then shows fallback fonts by design of the browser (known finding F-G5-01), which is not what visitors see.
3. Scaffold the record: `npm run evidence:new -- iphone-safari`. It writes an unfilled template to `engineering/release/evidence/`; it never fills in a result.

## Record your setup

| Field | What to write |
|---|---|
| `tester.name`, `tester.role` | Your name and who you are (QA tester, owner, ...). You must be a person |
| `date` | The day you did the test (YYYY-MM-DD) |
| `environment.device` | `kind` (phone), `make`, `model` (both required for a physical device), and `emulated: false` |
| `environment.os` | `name` (iOS) and the exact `version` |
| `environment.browser` | `name` (Safari) and the exact `version` (open the browser's About page) |
| `environment.settings` | Anything you changed from the defaults (text size, Reduce Motion, zoom, ...) |

## Steps

Work through every item. Mark each `pass`, `fail` or `not-applicable` in your record. **Not-applicable** is allowed only on items marked *n/a allowed*, with a note of at least 15 characters saying why. A `fail` needs a finding (see below).

### Every page: it loads and reads properly

Do these for **each** of: `index.html`, `menu.html`, `our-story.html`, `visit-us.html`, `order-online.html` (items marked with a page apply only to that page).

- [ ] **`loads`**: Open the page from the start of the session (address bar or a link). Wait for it to finish loading. *Expect:* Text, photographs and the two typefaces appear; no error message, no blank area where an image should be.
- [ ] **`layout`**: Look at the whole page by scrolling from top to bottom, in the orientation(s) named for this target. *Expect:* No sideways scrolling, nothing cut off, nothing drawn over other text or controls.
- [ ] **`readable`**: Read the headings and body text at the device's normal settings, without zooming. *Expect:* Text is comfortably legible (size and contrast) and keeps its normal line breaks.
- [ ] **`links`**: Use the header links (and the brand link and footer links) to move to other pages, then use the browser's Back and Forward. *Expect:* Each link opens the right page; Back and Forward return to the page you left.
- [ ] **`images`**: Look at every photograph on the page. *Expect:* Each photograph is shown, sharp enough, not stretched or squashed.

### Navigation and header (once per session)

Do these once for the whole session.

- [ ] **`menu-open-close`**: Narrow screens: tap or press the menu button, then close the menu. Wide screens: confirm the header links are visible. *Expect:* The menu opens and closes; the button's state is clear; the links are all reachable when it is open.
- [ ] **`current-page`**: On each page look at the header link for the page you are on. *Expect:* The current page is marked as current.
- [ ] **`skip-link`** (n/a allowed): Press Tab once at the top of a page (keyboard or switch access if available), then Enter on the skip link that appears. *Expect:* A skip link appears first, becomes visible, and moves you past the header to the main content.

### Home page hero: poster, clip, Pause (once per session)

Do these once for the whole session.

- [ ] **`poster-or-clip`** (note required): Open the Home page and watch the hero for 20 seconds. Record in the note whether you saw the still poster, the looping clip, or a poster that slowly pushes in, and the window width in CSS pixels if you know it. *Expect:* What is shown matches the design for this width: phones and narrow windows get the poster; widths of 960 px and more get the clip where the browser can play it.
- [ ] **`pause-control`** (n/a allowed): If a Pause button is shown, press it and press it again. *Expect:* Pause stops the motion and Resume restarts it; the button's label changes and it is easy to hit.
- [ ] **`motion-respected`** (n/a allowed): Turn on the system setting 'Reduce Motion' (or 'Remove animations'), reload the Home page, and watch the hero. *Expect:* Nothing loops or pushes in; the still poster is shown.
- [ ] **`fallback`** (n/a allowed): If the clip does not play in this browser, look at what the hero shows instead. *Expect:* A poster is shown and nothing looks broken (no empty black box, no play icon).

### Page-specific content

Do these for **each** of: `index.html`, `menu.html`, `our-story.html`, `visit-us.html`, `order-online.html` (items marked with a page apply only to that page).

- [ ] **`menu-jump-links`** (page: menu.html): On the Menu page use the category strip (Small plates ... Sweet & tea): scroll it sideways if it overflows, then choose a category. *Expect:* The strip scrolls; each link jumps to its section and the heading is not hidden under the header.
- [ ] **`menu-readable`** (page: menu.html): On the Menu page read a few dish names, descriptions and prices. *Expect:* Names, descriptions and prices are legible and line up; the heat markers are understandable.
- [ ] **`story-readable`** (page: our-story.html): On the Our story page read the opening and one later section. *Expect:* Text and pictures sit in a sensible order; nothing overlaps.
- [ ] **`visit-address-hours`** (page: visit-us.html): On the Visit page read the address and the opening-hours table. *Expect:* The address and every day's hours are readable and the day labels do not touch the times, also when you enlarge the text.
- [ ] **`visit-phone-link`** (page: visit-us.html, order-online.html; n/a allowed): On the Visit page press the telephone number. *Expect:* The device offers to call the number shown (+1 555 0100 188 is a sample number: cancel the call).
- [ ] **`order-steps`** (page: order-online.html): On the Order online page read 'How ordering works', Pickup and Allergies. *Expect:* The steps and notices are readable in order; the page says clearly that ordering is a sample.
- [ ] **`home-sections`** (page: index.html): On the Home page scroll through 'Order these first', the kitchen story, the visit strip and the order band. *Expect:* Every section is readable and every link in them works.

### Phone and tablet handling (once per session)

Do these once for the whole session.

- [ ] **`tap-targets`**: Tap the menu button, the header links, the telephone number and a menu category link with a finger. *Expect:* Each is easy to hit on the first try; no neighbouring control is triggered by mistake.
- [ ] **`orientation`**: Rotate the device to landscape and back on the Home, Menu and Visit pages. *Expect:* The layout adapts without clipping or sideways scrolling; nothing stays in the old orientation.
- [ ] **`text-size`** (n/a allowed): Increase the system text size (Dynamic Type on iOS, Font size on Android) to a large setting and reopen the Home and Visit pages. *Expect:* Text grows without overlapping or being cut off; the menu button still works.
- [ ] **`low-power-data`** (n/a allowed): Turn on Low Power Mode / Battery Saver, and Low Data Mode / Data Saver, reload the Home page. *Expect:* The page still works; the hero shows the poster if the browser blocks the clip.
- [ ] **`address-bar`**: Scroll down and up so the browser's address bar hides and shows again. *Expect:* The header and the hero do not jump or leave a gap.

### Responsive layouts, zoom and text spacing

Do these once for the whole session.

- [ ] **`zoom-200`**: Zoom the page to 200 percent (browser zoom, or Settings > Display zoom). *Expect:* The page reflows into one column where needed; nothing is cut off; no sideways scrolling.
- [ ] **`zoom-400`** (n/a allowed): Zoom to 400 percent on a desktop browser (about 320 CSS pixels wide). *Expect:* Content stays readable in one column; only tables and code may scroll sideways (this site has none); nothing is clipped.
- [ ] **`text-only-zoom`** (n/a allowed): Enlarge only the text (Firefox: View > Zoom > Zoom Text Only; or the system text size) to the largest sensible size. *Expect:* Text grows and wraps; nothing overlaps; buttons keep their labels.
- [ ] **`pinch-zoom`** (n/a allowed): On a touch device pinch to zoom in on the Home and Menu pages. *Expect:* Pinch zoom works (the page does not block it) and the page stays usable.
- [ ] **`narrow-320`** (n/a allowed): Make the window or screen as narrow as you can (about 320 CSS pixels). *Expect:* The page still works in one column, with the menu button visible.
- [ ] **`text-spacing`** (n/a allowed): If you have a text-spacing tool or bookmarklet (line height 1.5, letter spacing 0.12 em, word spacing 0.16 em), apply it on the Visit page and read the opening hours. *Expect:* The day labels and the times do not touch or overlap; nothing is cut off.

### Reduced motion and media fallback

Do these once for the whole session.

- [ ] **`rm-poster`**: Turn on Reduce Motion in the operating system (or the browser) and open the Home page. *Expect:* The hero shows the still poster; no continuous motion anywhere on the site.
- [ ] **`images-offline`** (n/a allowed): With the connection slow or switched to a poor network (if you can), reload a page and watch the images load. *Expect:* Photographs appear without the layout jumping; text is readable while they load.
- [ ] **`clip-failure`** (n/a allowed): If the hero clip is blocked or does not play (Low Power Mode, an old browser), look at the hero. *Expect:* A poster is shown; the hero never stays empty.

## Attachments

Attach at least 3: a photo or screenshot that shows the operating-system version and the browser version (for example Settings > General > About, and the browser's About page), and at least two screenshots or a screen recording of the pages you tested. Allowed kinds: photo, screenshot, screen-recording.
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
