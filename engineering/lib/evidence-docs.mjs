// The human procedures, generated from release/evidence-spec.json so that they cannot drift from what the templates and the release gate demand.
// npm run evidence:docs writes them; check:evidence fails if the files in docs/device-testing/ differ from what this module renders.
import { basename } from 'node:path';
import { itemsFor } from './evidence.mjs';
import { project, projectFolder } from './project.mjs';

const GEN = `<!-- Generated from ${projectFolder}/engineering/release/evidence-spec.json by \`npm run evidence:docs\`. Do not edit by hand: change the specification and regenerate. -->`;
const list = (a) => a.join(' or ');
const SEVERITY = ['**Blocker**: a visitor cannot read a page, reach a page or complete the main task.', '**Major**: content is lost or a main task is hard for a group of visitors.', '**Minor**: a cosmetic problem or a small annoyance with an easy workaround.', '**Info**: an observation, not a defect.'];

const HOW_TO_RUN = (spec, id) => [
  '1. Get the exact build to test. The scaffolded record already names the commit, the delivered-files hash and the **candidate artifact digest** (`build.commit`, `build.assetsTree`, `build.candidate`); you must test that build. The digest is what the release approval is bound to: if anything in the artifact changes, the digest changes and this record stops counting (`npm run release:candidate` prints it). Ask the engineer for the preview package for that commit (`npm run release:prepare` writes it; nothing is deployed), or build it yourself from that commit.',
  '2. Serve it over HTTP. On the computer that holds the files run `python3 serve.py` (from the `' + projectFolder + '` folder, or the folder inside the package): it supports the byte-range requests that Safari needs to play video and listens on this computer only. For a phone or tablet on the same trusted Wi-Fi run `python3 serve.py 8766 0.0.0.0` and open `http://<the computer\'s address>:8766/` on the device. Android can also use USB debugging with `adb reverse tcp:8766 tcp:8766` and open `http://localhost:8766/`. Do not open the pages straight from a folder (`file://`) in Safari: WebKit then shows fallback fonts by design of the browser (known finding F-G5-01), which is not what visitors see.',
  `3. Scaffold the record: \`npm run evidence:new -- ${id}\`. It writes an unfilled template to \`engineering/release/evidence/\`; it never fills in a result.`,
];

export function renderTarget(spec, id) {
  const t = spec.targets[id];
  const cls = spec.classes[t.classes[0]];
  const L = [GEN, '', `# ${t.title}: test procedure`, ''];
  L.push(`**Evidence class ${t.classes.join(' or ')}: ${cls.name}.** ${cls.meaning}. This record may be claimed as: "${cls.mayClaim}". It must never be claimed as: ${cls.neverClaim}.`, '');
  L.push(`**Release-gate type:** \`${t.gateType}\`. **Estimated tester time:** about ${t.estimatedMinutes} minutes (an estimate, not a measurement). **Scaffold command:** \`npm run evidence:new -- ${id}\`.`, '');
  if (t.notes) L.push(t.notes, '');
  if (t.gateType === 'ci-run') {
    L.push('## What this is', '', 'The recorded result of the automated GitHub Actions verification of the candidate artifact. It is **E1**: automated and emulated. It supports the release gate\'s `ci-run` requirement and **cannot** stand in for any human test.', '', '## How to record it', '', '1. Wait for the verify workflow run that verified the candidate artifact to finish and open its run page and its **Verify** job log.', `2. \`npm run evidence:new -- ci-run\`, then fill \`date\`, \`by\` (who recorded it), \`url\` (the run page, \`https://github.com/<owner>/<repo>/actions/runs/<number>\`), \`summary\` (what ran and the outcome), \`conclusion: "success"\`, copy the line \`verification record: ...\` printed at the end of the Verify job into \`verification\` (candidate, engineDigest, registryDigest, checks.total and checks.passed, seal, runner "github-actions", runId) and set \`status\` to \`"completed"\`.`, '3. The run must have verified exactly the candidate artifact (`build.candidate`), with all of the checks the current verifier defines, made by the current verification code. `build.commit` records the commit it ran on and must be the release commit or an earlier commit of it.', '');
    L.push('## What the release gate checks', '', '- the record is for the release commit, the class is E1, the URL is a GitHub Actions run, the conclusion is `success`;', '- an unfilled template, another commit, another class or a failed run is rejected.', '');
    return L.join('\n');
  }
  const e = t.environment;
  L.push('## What you need', '', `- A ${list(e.deviceKinds)} running ${list(e.osNames)} with ${list(e.browserNames)}${e.screenReaders ? ` and the screen reader ${list(e.screenReaders)}` : ''}.`, `- ${t.classes.includes('E3') ? 'A **physical** phone or tablet in your hands. Emulators, simulators, browser developer-tools device modes and cloud device farms are **not** E3 and the record is rejected if it says so.' : 'A **real** computer and a **real** browser. Emulation, DevTools responsive mode and headless browsers are **not** E2 and the record is rejected if it says so.'}`, '- About ' + t.estimatedMinutes + ' minutes, the build named in your record, and the ability to take screenshots or a screen recording.', '');
  L.push('## Before you start', '', ...HOW_TO_RUN(spec, id), '');
  L.push('## Record your setup', '', '| Field | What to write |', '|---|---|', '| `tester.name`, `tester.role` | Your name and who you are (QA tester, owner, ...). You must be a person |', '| `date` | The day you did the test (YYYY-MM-DD) |', `| \`environment.device\` | \`kind\` (${list(e.deviceKinds)}), \`make\`, \`model\`${t.classes.includes('E3') ? ' (both required for a physical device)' : ''}, and \`emulated: false\` |`, `| \`environment.os\` | \`name\` (${list(e.osNames)}) and the exact \`version\` |`, `| \`environment.browser\` | \`name\` (${list(e.browserNames)}) and the exact \`version\` (open the browser's About page) |`, ...(e.screenReaders ? [`| \`environment.screenReader\` | \`name\` (${list(e.screenReaders)}) and its \`version\` |`] : []), '| `environment.settings` | Anything you changed from the defaults (text size, Reduce Motion, zoom, ...) |', '');
  const items = itemsFor(spec, id);
  L.push('## Steps', '', `Work through every item. Mark each \`pass\`, \`fail\` or \`not-applicable\` in your record. **Not-applicable** is allowed only on items marked *n/a allowed*, with a note of at least ${spec.notApplicableMinNoteLength} characters saying why. A \`fail\` needs a finding (see below).`, '');
  for (const sid of t.sections) {
    const sec = spec.sections[sid];
    L.push(`### ${sec.title}`, '');
    if (sec.scope === 'page') L.push(`Do these for **each** of: ${(sec.pages || spec.pages).map((p) => `\`${p}\``).join(', ')} (items marked with a page apply only to that page).`, '');
    else L.push('Do these once for the whole session.', '');
    for (const it of sec.items) {
      const flags = [it.pages ? `page: ${it.pages.join(', ')}` : '', it.naAllowed ? 'n/a allowed' : '', it.needsNote ? 'note required' : ''].filter(Boolean);
      L.push(`- [ ] **\`${it.id}\`**${flags.length ? ` (${flags.join('; ')})` : ''}: ${it.text} *Expect:* ${it.expect}`);
    }
    L.push('');
  }
  L.push('## Attachments', '', `Attach at least ${t.attachments.minimum}: ${t.attachments.required}. Allowed kinds: ${t.attachments.kinds.join(', ')}.`, `Save at least ${t.attachments.minimumLocal} of them under \`${spec.attachmentDir}/\` and list each in \`attachments\` with its \`kind\`, a short \`description\`, its \`path\` (relative to that folder) and its SHA-256 (\`npm run evidence:hash -- <file>\`). Others may be an https \`url\` with the SHA-256 you computed. The same file cannot be used for two records.`, '');
  L.push('## Findings', '', 'Write every problem you saw in `findings`: `id`, `page` (one of the five pages, or `session`), `severity`, `description` (what you did, what you saw, what you expected) and `status` (`open`, `fixed` or `accepted`). Severity:', '', ...SEVERITY.map((s) => `- ${s}`), '', 'Every `fail` needs at least one finding for that page. The record\'s `conclusion` is `failure` if anything failed, otherwise `success`. An open Blocker or Major finding stops the record from counting.', '');
  L.push('## Sign it', '', `Set \`status\` to \`"completed"\` and fill \`attestation\`: \`statement\` exactly "${spec.attestation}", \`signedBy\` your name (the same as \`tester.name\`), \`date\`. **Do not sign work you did not do.**`, '');
  L.push('## What the release gate checks', '', '- the record is complete (every item has an outcome, every page is covered, nothing left empty) and is no longer a template;', `- the class matches the target (${t.classes.join(' or ')}) and is consistent with the device, operating system and browser you recorded; a record that mentions emulation, simulation, DevTools, headless browsers or a device farm is rejected;`, '- it names a real person and carries the exact signed statement;', '- it is bound to the build: the commit exists in the repository, is the release commit or an ancestor of it, the delivered-files hash equals the release build\'s, and the date is not in the future or before that commit;', '- conclusions agree with outcomes, every failure has a finding, no open Blocker or Major finding remains;', '- the attachments exist, match their SHA-256 and are not reused by another record.', '', '**What it cannot do:** prove that you did the test. That is your attestation and the owner\'s release approval.', '');
  return L.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
const PROC = {
  keyboard: { title: 'Keyboard-only navigation', sections: ['keyboard', 'keyboard-session'], intro: 'Put the mouse and the trackpad aside for the whole test. Tab moves forward, Shift+Tab backward, Enter and Space activate, Escape closes. Do this in each desktop browser (Chrome, Firefox and Safari; in Safari press Option+Tab if Tab skips links, or enable "Press Tab to highlight each item" in Safari Settings > Advanced). These items are part of the `desktop-*` records.' },
  responsive: { title: 'Responsive layouts, zoom, reduced motion and media fallback', sections: ['zoom-responsive', 'reduced-motion-media', 'mobile-device', 'tablet-wide'], intro: 'Browser zoom: Ctrl or Cmd with + or -; 200 percent is two steps past 150; 400 percent is the largest. Reduce Motion: macOS System Settings > Accessibility > Display, iOS Settings > Accessibility > Motion, Android Settings > Accessibility > Remove animations, Windows Settings > Accessibility > Visual effects > Animation effects. These items are part of the desktop records and the phone and tablet records.' },
  screen: { title: 'Screen readers: VoiceOver, NVDA and TalkBack', sections: ['screen-reader', 'screen-reader-session'], intro: 'Turn the screen reader on, close your eyes or turn the display off if you can, and listen. Notice what is said, in what order and what is missing. These items are part of the five `sr-*` records.' },
};
const SR_HELP = [
  '## Starting each screen reader (check its own help for current commands)', '',
  '- **NVDA (Windows, free from nvaccess.org):** Ctrl+Alt+N starts it. In a web page, H and Shift+H move between headings, D between landmarks, K between links, B between buttons, G between graphics; NVDA+F7 opens the elements list; NVDA+Down arrow reads from the cursor; Ctrl stops speech. Test with Firefox and with Chrome (two records).',
  '- **VoiceOver on a Mac:** Command+F5 turns it on. VO means Control+Option. VO+Right and VO+Left move between items, VO+U opens the rotor (headings, links, landmarks), VO+A reads everything, Control stops speech. Test with Safari.',
  '- **VoiceOver on iPhone or iPad:** Settings > Accessibility > VoiceOver. Swipe right and left to move, double-tap to activate, turn two fingers like a dial to open the rotor (Headings, Links, Landmarks), swipe two fingers up to read from the top. Test with Safari.',
  '- **TalkBack on Android:** Settings > Accessibility > TalkBack. Swipe right and left to move, double-tap to activate, swipe up then down (or left then right, depending on version) to change the reading control to headings, links or controls, then swipe up or down to step through them. Test with Chrome.', '',
];
export function renderProcedure(spec, key) {
  const p = PROC[key];
  const L = [GEN, '', `# ${p.title}: procedure`, '', p.intro, ''];
  if (key === 'screen') L.push(...SR_HELP);
  L.push('## Items', '', 'The same items appear in the per-target procedures listed in the [inventory](../README.md); this page collects them so the procedure can be read on its own.', '');
  for (const sid of p.sections) {
    const sec = spec.sections[sid];
    L.push(`### ${sec.title}`, '', sec.scope === 'page' ? `Do these for each page: ${(sec.pages || spec.pages).map((x) => `\`${x}\``).join(', ')}.` : 'Do these once per session.', '');
    for (const it of sec.items) L.push(`- [ ] **\`${it.id}\`**${it.pages ? ` (page: ${it.pages.join(', ')})` : ''}${it.naAllowed ? ' (n/a allowed)' : ''}: ${it.text} *Expect:* ${it.expect}`);
    L.push('');
  }
  const used = Object.entries(spec.targets).filter(([, t]) => t.sections.some((s) => p.sections.includes(s))).map(([id]) => id);
  L.push('## Which records this belongs to', '', used.map((u) => `- [\`${u}\`](../${u}.md)`).join('\n'), '');
  return L.join('\n');
}

export function renderInventory(spec) {
  const L = [GEN, '', '# Device, browser and screen-reader testing: inventory', '', 'Reusable procedures and evidence templates for the testing that automation cannot do. Read the [protocol](../' + basename(project.governance.documents.deviceTestProtocol) + ') first. **No physical-device, screen-reader or desktop-Safari testing has been done yet**; the release gate stays closed until people record it.', '',
    '| Target | Gate type | Class | Procedure | Scaffold a record | About |', '|---|---|---|---|---|---|'];
  for (const [id, t] of Object.entries(spec.targets)) L.push(`| ${t.title} | \`${t.gateType}\` | ${t.classes.join('/')} | [${id}.md](${id}.md) | \`npm run evidence:new -- ${id}\` | ${t.estimatedMinutes ? `${t.estimatedMinutes} min` : 'automated'} |`);
  L.push('', '## Cross-cutting procedures', '', '- [Keyboard-only navigation](procedures/keyboard-only.md)', '- [Responsive layouts, zoom, reduced motion and media fallback](procedures/responsive-zoom-motion-media.md)', '- [Screen readers: VoiceOver, NVDA and TalkBack](procedures/screen-readers.md)', '',
    '## What the release gate needs', '', '| Gate requirement | Needs (each a valid, successful, signed record bound to the release build) |', '|---|---|');
  for (const [g, d] of Object.entries(spec.gate)) L.push(`| \`evidence:${g}\` | ${d.needs.map((n) => `${n.label} (${n.targets.map((t) => `\`${t}\``).join(' or ')})`).join('; ')}${d.optional.length ? `; optional: ${d.optional.map((t) => `\`${t}\``).join(', ')}` : ''} |`);
  L.push('', '## Evidence classes', '', '| Class | Name | May be claimed as | Never claimed as | Allowed record types |', '|---|---|---|---|---|');
  for (const [c, d] of Object.entries(spec.classes)) L.push(`| ${c} | ${d.name} | ${d.mayClaim} | ${d.neverClaim} | ${d.allowedTypes.map((t) => `\`${t}\``).join(', ')} |`);
  L.push('');
  return L.join('\n');
}

// Everything docs/device-testing should contain: { relative path: text }.
export function renderAll(spec) {
  const out = { 'README.md': renderInventory(spec), 'procedures/keyboard-only.md': renderProcedure(spec, 'keyboard'), 'procedures/responsive-zoom-motion-media.md': renderProcedure(spec, 'responsive'), 'procedures/screen-readers.md': renderProcedure(spec, 'screen') };
  for (const id of Object.keys(spec.targets)) out[`${id}.md`] = renderTarget(spec, id);
  return out;
}
