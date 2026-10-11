<!-- Generated from jade-and-ember/engineering/release/evidence-spec.json by `npm run evidence:docs`. Do not edit by hand: change the specification and regenerate. -->

# Responsive layouts, zoom, reduced motion and media fallback: procedure

Browser zoom: Ctrl or Cmd with + or -; 200 percent is two steps past 150; 400 percent is the largest. Reduce Motion: macOS System Settings > Accessibility > Display, iOS Settings > Accessibility > Motion, Android Settings > Accessibility > Remove animations, Windows Settings > Accessibility > Visual effects > Animation effects. These items are part of the desktop records and the phone and tablet records.

## Items

The same items appear in the per-target procedures listed in the [inventory](../README.md); this page collects them so the procedure can be read on its own.

### Responsive layouts, zoom and text spacing

Do these once per session.

- [ ] **`zoom-200`**: Zoom the page to 200 percent (browser zoom, or Settings > Display zoom). *Expect:* The page reflows into one column where needed; nothing is cut off; no sideways scrolling.
- [ ] **`zoom-400`** (n/a allowed): Zoom to 400 percent on a desktop browser (about 320 CSS pixels wide). *Expect:* Content stays readable in one column; only tables and code may scroll sideways (this site has none); nothing is clipped.
- [ ] **`text-only-zoom`** (n/a allowed): Enlarge only the text (Firefox: View > Zoom > Zoom Text Only; or the system text size) to the largest sensible size. *Expect:* Text grows and wraps; nothing overlaps; buttons keep their labels.
- [ ] **`pinch-zoom`** (n/a allowed): On a touch device pinch to zoom in on the Home and Menu pages. *Expect:* Pinch zoom works (the page does not block it) and the page stays usable.
- [ ] **`narrow-320`** (n/a allowed): Make the window or screen as narrow as you can (about 320 CSS pixels). *Expect:* The page still works in one column, with the menu button visible.
- [ ] **`text-spacing`** (n/a allowed): If you have a text-spacing tool or bookmarklet (line height 1.5, letter spacing 0.12 em, word spacing 0.16 em), apply it on the Visit page and read the opening hours. *Expect:* The day labels and the times do not touch or overlap; nothing is cut off.

### Reduced motion and media fallback

Do these once per session.

- [ ] **`rm-poster`**: Turn on Reduce Motion in the operating system (or the browser) and open the Home page. *Expect:* The hero shows the still poster; no continuous motion anywhere on the site.
- [ ] **`images-offline`** (n/a allowed): With the connection slow or switched to a poor network (if you can), reload a page and watch the images load. *Expect:* Photographs appear without the layout jumping; text is readable while they load.
- [ ] **`clip-failure`** (n/a allowed): If the hero clip is blocked or does not play (Low Power Mode, an old browser), look at the hero. *Expect:* A poster is shown; the hero never stays empty.

### Phone and tablet handling (once per session)

Do these once per session.

- [ ] **`tap-targets`**: Tap the menu button, the header links, the telephone number and a menu category link with a finger. *Expect:* Each is easy to hit on the first try; no neighbouring control is triggered by mistake.
- [ ] **`orientation`**: Rotate the device to landscape and back on the Home, Menu and Visit pages. *Expect:* The layout adapts without clipping or sideways scrolling; nothing stays in the old orientation.
- [ ] **`text-size`** (n/a allowed): Increase the system text size (Dynamic Type on iOS, Font size on Android) to a large setting and reopen the Home and Visit pages. *Expect:* Text grows without overlapping or being cut off; the menu button still works.
- [ ] **`low-power-data`** (n/a allowed): Turn on Low Power Mode / Battery Saver, and Low Data Mode / Data Saver, reload the Home page. *Expect:* The page still works; the hero shows the poster if the browser blocks the clip.
- [ ] **`address-bar`**: Scroll down and up so the browser's address bar hides and shows again. *Expect:* The header and the hero do not jump or leave a gap.

### Tablet and wide-window behaviour (once per session)

Do these once per session.

- [ ] **`clip-path-960`**: At a width of 960 CSS pixels or more (tablet landscape or a wide window) open the Home page. *Expect:* The hero uses the clip path (the loop plays) or the poster fallback; either is shown cleanly.
- [ ] **`h264-fallback`**: If this browser cannot play the WebM clip (Safari), watch whether the MP4 version plays. *Expect:* The MP4 plays, or the poster is shown; nothing looks broken. Record which in the note.
- [ ] **`split-view`** (n/a allowed): On an iPad try Split View or Slide Over (or narrow the window) and rotate. *Expect:* The layout reflows at each width without sideways scrolling.

## Which records this belongs to

- [`iphone-safari`](../iphone-safari.md)
- [`android-chrome`](../android-chrome.md)
- [`ipad-safari`](../ipad-safari.md)
- [`desktop-chrome`](../desktop-chrome.md)
- [`desktop-firefox`](../desktop-firefox.md)
- [`desktop-safari`](../desktop-safari.md)
