// Shared by the browser checks: serve a delivered site folder, open it in the pinned browser, and report in one format.
// A check takes { root } (a delivered folder; default: the working tree built fresh) so the self-test can run it on a damaged copy.
import { rmSync } from 'node:fs';
import { serve } from '../tests/serve.mjs';
import { environment, launchBrowser } from './browser.mjs';
import { assembleCandidate, pagesOf } from './site.mjs';
import { projectDir } from './git.mjs';

// Runs fn({ browser, base, root, pages, newPage }) with a served folder. Cleans up the folder it assembled.
// pages: restrict the run to some pages (self-tests only).
export async function withSite(fn, { root = null, browserName = 'chromium', pages: only = null } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'gate2');
  const { server, base } = serve(dir);
  const { browser, version } = await launchBrowser(browserName);
  const env = environment();
  const pages = only ? pagesOf(dir).filter((f) => only.includes(f)) : pagesOf(dir);
  // A page in a fresh context with the pinned locale, time zone and colour scheme. opts override the viewport, motion, forced colours and so on.
  const newPage = async (opts = {}, file = null) => {
    const ctx = await browser.newContext({ locale: env.context.locale, timezoneId: env.context.timezoneId, colorScheme: env.context.colorScheme, deviceScaleFactor: 1, reducedMotion: 'reduce', ...opts });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`js error: ${e.message}`));
    if (file) { await page.goto(base + file); await settleFonts(page); }
    return { page, ctx, errors, close: () => ctx.close() };
  };
  try { return await fn({ browser, version, base, root: dir, pages, newPage, env }); }
  finally { await browser.close(); server.close(); if (own) rmSync(dir, { recursive: true, force: true }); }
}

// Loads every declared web font and the images before measuring (document.fonts.ready can resolve too early) and returns to the top.
export async function settleFonts(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
    await Promise.all([...document.fonts].filter((f) => !/Fallback/.test(f.family)).map((f) => f.load().catch(() => {})));
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 150));
  });
}

export const urlFor = (file) => file;
export const label = (file, ctx) => `${file.replace('.html', '')}@${ctx}`;
