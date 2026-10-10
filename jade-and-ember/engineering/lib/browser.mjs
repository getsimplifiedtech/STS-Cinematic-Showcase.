// Launches the pinned test browser. Honours CHROMIUM_PATH / CHROME_PATH (a preinstalled build), else Playwright's own download,
// else a build found under PLAYWRIGHT_BROWSERS_PATH. Returns { browser, name, version }.
import { chromium, firefox, webkit } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, readJson } from './git.mjs';

export const environment = () => readJson(join(engDir, 'environment.json'));
const engines = { chromium, firefox, webkit };

function chromiumFromBrowsersPath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return null;
  for (const d of readdirSync(root).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const p = join(root, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return null;
}

// ---- engine adaptation (Gate 5, Phase 1). Playwright does not offer every context option on every engine. Rather than let a whole check crash on
// one option, the launcher removes an option an engine cannot honour, COUNTS it, and the cross-browser runner prints every adaptation next to the
// result of the check that needed it. An adaptation is never silent and never changes what is asserted: baseline and candidate are always given the
// same adapted options, so a comparison inside one engine stays valid.
const UNSUPPORTED = {
  chromium: {},
  firefox: { isMobile: 'Playwright does not support the isMobile context option in Firefox: the viewport and hasTouch are applied, mobile viewport-meta handling and text autosizing are not emulated' },
  webkit: {},
};
const ADAPTED = new Map();
export function adaptContextOptions(name, opts) {
  if (!opts) return opts;
  const out = { ...opts };
  for (const [key, why] of Object.entries(UNSUPPORTED[name] || {})) {
    if (out[key] !== undefined) {
      if (out[key]) ADAPTED.set(`${name}: dropped ${key}=true (${why})`, (ADAPTED.get(`${name}: dropped ${key}=true (${why})`) || 0) + 1);
      delete out[key];
    }
  }
  return out;
}
// Adaptations recorded since the last call; the counter is reset so each check reports only its own.
export function takeAdaptations() { const list = [...ADAPTED].map(([k, v]) => `${k} (x${v})`); ADAPTED.clear(); return list; }

export async function launchBrowser(name = 'chromium') {
  const env = environment();
  const engine = engines[name];
  if (!engine) throw new Error(`unknown browser "${name}" (chromium, firefox or webkit)`);
  const args = name === 'chromium' ? env.launchArgs : [];
  let executablePath = name === 'chromium' ? process.env.CHROMIUM_PATH || process.env.CHROME_PATH : undefined;
  let browser;
  try {
    browser = await engine.launch({ args, ...(executablePath ? { executablePath } : {}) });
  } catch (first) {
    if (name !== 'chromium' || executablePath) throw first;
    executablePath = chromiumFromBrowsersPath();
    if (!executablePath) throw first;
    browser = await engine.launch({ args, executablePath });
  }
  if (Object.keys(UNSUPPORTED[name] || {}).length) { const orig = browser.newContext.bind(browser); browser.newContext = (opts) => orig(adaptContextOptions(name, opts)); }
  return { browser, name, version: browser.version() };
}
