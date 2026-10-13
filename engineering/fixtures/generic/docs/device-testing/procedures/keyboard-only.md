<!-- Generated from engineering/fixtures/generic/engineering/release/evidence-spec.json by `npm run evidence:docs`. Do not edit by hand: change the specification and regenerate. -->

# Keyboard-only navigation: procedure

Put the mouse and the trackpad aside for the whole test. Tab moves forward, Shift+Tab backward, Enter and Space activate, Escape closes. Do this in each desktop browser (Chrome, Firefox and Safari; in Safari press Option+Tab if Tab skips links, or enable "Press Tab to highlight each item" in Safari Settings > Advanced). These items are part of the `desktop-*` records.

## Items

The same items appear in the per-target procedures listed in the [inventory](../README.md); this page collects them so the procedure can be read on its own.

### Keyboard-only navigation

Do these for each page: `index.html`, `services.html`, `contact.html`.

- [ ] **`tab-reaches-all`**: Using only the keyboard, press Tab repeatedly from the top of the page to the end of the page. *Expect:* Every link and button is reached once, in the order you read them; nothing is skipped.
- [ ] **`focus-visible`**: While tabbing, look at where the focus is. *Expect:* The focused element always has a clearly visible outline or highlight; it is never hidden under the header.
- [ ] **`no-trap`**: Tab forward through the page and Shift+Tab backward again. *Expect:* Focus never gets stuck; Shift+Tab walks the same order backwards.

### Keyboard-only: menu, Pause, skip link (once per session)

Do these once per session.

- [ ] **`kb-menu`** (n/a allowed): On a narrow window use Enter or Space on the menu button, Tab through the links, then press Escape. *Expect:* The menu opens, its links can be tabbed in order, Escape closes it and focus returns to the menu button.
- [ ] **`kb-pause`** (n/a allowed): On the Home page Tab to the Pause button and press Enter or Space. *Expect:* Pause works from the keyboard and shows its state.
- [ ] **`kb-skip`**: Press Tab first on each page and activate the skip link with Enter. *Expect:* Focus moves into the main content.

## Which records this belongs to

- [`desktop-chrome`](../desktop-chrome.md)
- [`desktop-firefox`](../desktop-firefox.md)
- [`desktop-safari`](../desktop-safari.md)
