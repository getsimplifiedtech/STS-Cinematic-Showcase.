// PROJECT-OWNED (Jade & Ember): the state screenshots the regression harness takes of the baseline and the candidate side by side, and the behaviour scenarios. They use this
// project's own controls (the phone menu button, the menu page's jump links). The harness (lib/regression.mjs) owns the comparison; it reaches this file through the
// manifest (baseline.regression). Each state is { name, run({ pair, vp, shot }) }.
export { scenarios } from './scenarios.mjs';

export const states = [
  { name: 'phone-menu-open', run: async ({ pair, vp, shot }) => { const { b, c, close } = await pair(vp('mobile-390'), 'index.html'); await Promise.all([b, c].map((p) => p.click('.nav-toggle'))); await b.waitForTimeout(300); await shot('state-phone-menu-open', b, c, { fullPage: false }); await close(); } },
  { name: 'focus-ring', run: async ({ pair, vp, shot }) => { const { b, c, close } = await pair(vp('desktop-1440'), 'index.html'); for (const p of [b, c]) { await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); } await shot('state-focus-ring', b, c, { fullPage: false }); await close(); } },
  { name: 'menu-current-jump-link', run: async ({ pair, vp, shot }) => { const { b, c, close } = await pair(vp('desktop-1440'), 'menu.html'); await Promise.all([b, c].map(async (p) => { await p.evaluate(() => { const ids = [...document.querySelectorAll('.jump a')].map((a) => a.getAttribute('href').slice(1)); const el = document.getElementById(ids[2]); scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.32, left: 0, behavior: 'instant' }); }); await p.waitForTimeout(400); })); await shot('state-menu-current-jump-link', b, c, { fullPage: false }); await close(); } },
  { name: 'menu-print', run: async ({ pair, vp, shot }) => { const { b, c, close } = await pair({ name: 'print', width: 1000, height: 1400 }, 'menu.html'); await Promise.all([b, c].map((p) => p.emulateMedia({ media: 'print' }))); await shot('state-menu-print', b, c); await close(); } },
];
