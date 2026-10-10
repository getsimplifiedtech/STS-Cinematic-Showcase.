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
  return { browser, name, version: browser.version() };
}
