<!-- Generated from jade-and-ember/engineering/release/evidence-spec.json by `npm run evidence:docs`. Do not edit by hand: change the specification and regenerate. -->

# Device, browser and screen-reader testing: inventory

Reusable procedures and evidence templates for the testing that automation cannot do. Read the [protocol](../JADE_AND_EMBER_DEVICE_TEST_PROTOCOL.md) first. **No physical-device, screen-reader or desktop-Safari testing has been done yet**; the release gate stays closed until people record it.

| Target | Gate type | Class | Procedure | Scaffold a record | About |
|---|---|---|---|---|---|
| iPhone, Safari (physical device) | `real-device` | E3 | [iphone-safari.md](iphone-safari.md) | `npm run evidence:new -- iphone-safari` | 90 min |
| Android phone, Chrome (physical device) | `real-device` | E3 | [android-chrome.md](android-chrome.md) | `npm run evidence:new -- android-chrome` | 90 min |
| iPad or tablet, Safari (physical device) | `real-device` | E3 | [ipad-safari.md](ipad-safari.md) | `npm run evidence:new -- ipad-safari` | 60 min |
| Desktop Chrome (human, desktop browser) | `browser-matrix` | E2 | [desktop-chrome.md](desktop-chrome.md) | `npm run evidence:new -- desktop-chrome` | 60 min |
| Desktop Firefox (human, desktop browser) | `browser-matrix` | E2 | [desktop-firefox.md](desktop-firefox.md) | `npm run evidence:new -- desktop-firefox` | 60 min |
| Desktop Safari on a Mac (human, desktop browser) | `browser-matrix` | E2 | [desktop-safari.md](desktop-safari.md) | `npm run evidence:new -- desktop-safari` | 75 min |
| NVDA with Firefox (Windows) | `screen-reader` | E2 | [sr-nvda-firefox.md](sr-nvda-firefox.md) | `npm run evidence:new -- sr-nvda-firefox` | 60 min |
| NVDA with Chrome (Windows) | `screen-reader` | E2 | [sr-nvda-chrome.md](sr-nvda-chrome.md) | `npm run evidence:new -- sr-nvda-chrome` | 60 min |
| VoiceOver with Safari (macOS) | `screen-reader` | E2 | [sr-voiceover-macos-safari.md](sr-voiceover-macos-safari.md) | `npm run evidence:new -- sr-voiceover-macos-safari` | 60 min |
| VoiceOver with Safari (iPhone or iPad, physical device) | `screen-reader` | E3 | [sr-voiceover-ios-safari.md](sr-voiceover-ios-safari.md) | `npm run evidence:new -- sr-voiceover-ios-safari` | 60 min |
| TalkBack with Chrome (Android phone, physical device) | `screen-reader` | E3 | [sr-talkback-android-chrome.md](sr-talkback-android-chrome.md) | `npm run evidence:new -- sr-talkback-android-chrome` | 60 min |
| Automated verification run (GitHub Actions) | `ci-run` | E1 | [ci-run.md](ci-run.md) | `npm run evidence:new -- ci-run` | automated |

## Cross-cutting procedures

- [Keyboard-only navigation](procedures/keyboard-only.md)
- [Responsive layouts, zoom, reduced motion and media fallback](procedures/responsive-zoom-motion-media.md)
- [Screen readers: VoiceOver, NVDA and TalkBack](procedures/screen-readers.md)

## What the release gate needs

| Gate requirement | Needs (each a valid, successful, signed record bound to the release build) |
|---|---|
| `evidence:real-device` | an iPhone (Safari) (`iphone-safari`); an Android phone (Chrome) (`android-chrome`); optional: `ipad-safari` |
| `evidence:screen-reader` | NVDA (`sr-nvda-firefox` or `sr-nvda-chrome`); VoiceOver (`sr-voiceover-macos-safari` or `sr-voiceover-ios-safari`); TalkBack (`sr-talkback-android-chrome`) |
| `evidence:browser-matrix` | desktop Chrome (`desktop-chrome`); desktop Firefox (`desktop-firefox`); desktop Safari (`desktop-safari`) |
| `evidence:ci-run` | a successful CI run for the release commit (`ci-run`) |

## Evidence classes

| Class | Name | May be claimed as | Never claimed as | Allowed record types |
|---|---|---|---|---|
| E1 | Browser emulation | behaves as expected in this engine under emulation | anything about a physical device, a screen reader or a person's experience | `ci-run` |
| E2 | Human testing on a desktop browser | verified by hand in this browser on this computer | how a phone or tablet behaves | `browser-matrix`, `screen-reader` |
| E3 | Human testing on a physical device | verified on this device | anything about other devices or versions | `real-device`, `screen-reader` |
