<!-- Generated from jade-and-ember/engineering/release/evidence-spec.json by `npm run evidence:docs`. Do not edit by hand: change the specification and regenerate. -->

# Screen readers: VoiceOver, NVDA and TalkBack: procedure

Turn the screen reader on, close your eyes or turn the display off if you can, and listen. Notice what is said, in what order and what is missing. These items are part of the five `sr-*` records.

## Starting each screen reader (check its own help for current commands)

- **NVDA (Windows, free from nvaccess.org):** Ctrl+Alt+N starts it. In a web page, H and Shift+H move between headings, D between landmarks, K between links, B between buttons, G between graphics; NVDA+F7 opens the elements list; NVDA+Down arrow reads from the cursor; Ctrl stops speech. Test with Firefox and with Chrome (two records).
- **VoiceOver on a Mac:** Command+F5 turns it on. VO means Control+Option. VO+Right and VO+Left move between items, VO+U opens the rotor (headings, links, landmarks), VO+A reads everything, Control stops speech. Test with Safari.
- **VoiceOver on iPhone or iPad:** Settings > Accessibility > VoiceOver. Swipe right and left to move, double-tap to activate, turn two fingers like a dial to open the rotor (Headings, Links, Landmarks), swipe two fingers up to read from the top. Test with Safari.
- **TalkBack on Android:** Settings > Accessibility > TalkBack. Swipe right and left to move, double-tap to activate, swipe up then down (or left then right, depending on version) to change the reading control to headings, links or controls, then swipe up or down to step through them. Test with Chrome.

## Items

The same items appear in the per-target procedures listed in the [inventory](../README.md); this page collects them so the procedure can be read on its own.

### Screen reader: every page

Do these for each page: `index.html`, `menu.html`, `our-story.html`, `visit-us.html`, `order-online.html`.

- [ ] **`sr-landmarks`**: Open the landmarks list (the screen reader's rotor, elements list or landmark gesture). *Expect:* Banner/header, navigation, main and footer (contentinfo) are listed and correctly named.
- [ ] **`sr-headings`**: Open the headings list and step through the headings in order. *Expect:* There is one main heading and the other headings follow a sensible order that matches the page.
- [ ] **`sr-links-buttons`**: Step through every link and button. *Expect:* Each one is announced with a clear name and its role (link or button); the current page link says it is current; no 'link' or 'button' without a name.
- [ ] **`sr-images`**: Step through the photographs. *Expect:* Meaningful photographs have a short description; purely decorative ones are skipped.
- [ ] **`sr-reading-order`**: Read the page from top to bottom with the screen reader's read-all command. *Expect:* The text is read in the same order you see it; no hidden or duplicate text is read.

### Screen reader: controls and key content (once per session)

Do these once per session.

- [ ] **`sr-skip-link`** (n/a allowed): Move to the first item on a page. *Expect:* The skip link is announced first and moves you to the main content.
- [ ] **`sr-menu-state`** (n/a allowed): On a narrow window or phone, find the menu button and open and close it. *Expect:* The button announces its state (expanded or collapsed) and the links appear in the reading order when open.
- [ ] **`sr-pause`** (n/a allowed): On the Home page find the Pause button. *Expect:* It is announced with its name and state (pressed or not) and works.
- [ ] **`sr-visit-details`**: On the Visit page read the address, the opening-hours table and the telephone link. *Expect:* The address is read in order, the hours table is read row by row with day and time, the telephone link says it is a link to call (a sample number).
- [ ] **`sr-order-details`**: On the Order online page read 'How ordering works' and the notices. *Expect:* The steps are read in order; the page says clearly that ordering is a sample.
- [ ] **`sr-no-surprises`**: While using the site, notice any unexpected announcements, repeated text or silence. *Expect:* None; or every surprise is written up as a finding.

## Which records this belongs to

- [`sr-nvda-firefox`](../sr-nvda-firefox.md)
- [`sr-nvda-chrome`](../sr-nvda-chrome.md)
- [`sr-voiceover-macos-safari`](../sr-voiceover-macos-safari.md)
- [`sr-voiceover-ios-safari`](../sr-voiceover-ios-safari.md)
- [`sr-talkback-android-chrome`](../sr-talkback-android-chrome.md)
