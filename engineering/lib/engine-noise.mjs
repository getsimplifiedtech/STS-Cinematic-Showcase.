// Console messages that one engine writes about correct markup (Gate 5). They are counted and reported, never silently dropped, and the
// engine that writes them is part of the match: the same message in any other engine is NOT filtered and fails the check that saw it.
//   F-G5-02  Firefox logs a warning for a <link rel="preload" as="image" media="..."> whose media query does not match the current viewport,
//            which is the whole purpose of the attribute: the hero image has one preload per art direction and only one can match.
import { markup } from './project.mjs';

// pattern: the file-name part of the project's own hero preloads (sts.engineering.json, markup.heroPreloadPattern); null when the project has none, so nothing is ever classed as noise
export const makeEngineNoise = (pattern) => {
  const preloadMedia = pattern === null ? /(?!)/ : new RegExp(`Preload of \\S*${pattern} was ignored due to unknown .as. or .type. values, or non-matching .media. attribute`);
  return (engine, text) => (engine === 'firefox' && preloadMedia.test(text) ? 'F-G5-02' : null);
};
export const engineNoise = makeEngineNoise(markup.heroPreloadPattern);

// ---- E-SWGL-01: Chromium's software-renderer readback notice (owner decision of 2026-10-18; investigation: closeout SOFTWARE-GL-NOTICE-INVESTIGATION.md).
// When WebGL runs on a CPU rasteriser (SwiftShader, llvmpipe), Chromium copies each presented canvas back to memory to composite it, and its GL debug callback reports that copy as a
// "performance, high severity" ReadPixels stall. The page makes no readback call; pages without a WebGL context never produce it. It is classified as known ONLY when all of this holds, and
// anything else stays a console warning that fails the check that saw it:
//   - the engine is Chromium and the console message is a `warning`;
//   - the text is exactly this one notice (anchored at both ends; the context id may vary; the single suffix Chromium appends to the last one is the only other form);
//   - the browser that ran the page was shown to render WebGL in software: a WebGL context created in that same browser reports an unmasked renderer naming a software rasteriser;
//   - the message is not attributed to a script file: Chromium reports it at column 0 of a document (line 0, or the line of the document script that was running when the frame was presented),
//     while a console call in an external script reports that script's address and a call inside a line of an inline script a column above 0. (A page could still mimic the exact text from the
//     first column of an inline script; a project whose pages have no inline script, as the contracts check requires, cannot.)
//   - no more than SWGL_LIMIT of them have been seen on the page (Chromium prints four and then stops; more would mean something else is happening).
// A real GPU stall, any other GL Driver Message, a shader or framebuffer error, any other warning or error, a CSP violation and a page error are never touched.
export const SWGL_ID = 'E-SWGL-01';
export const SWGL_LIMIT = 4;
export const SWGL_TEXT = /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels( \(this message will no longer repeat\))?$/;
export const SOFTWARE_RENDERER = /SwiftShader|llvmpipe|softpipe/i;
const EVIDENCE = new WeakMap();
// The evidence is read once per browser from a scratch page: { software: boolean, renderer: string|null }.
export async function renderingEvidence(browser) {
  if (EVIDENCE.has(browser)) return EVIDENCE.get(browser);
  let ev = { software: false, renderer: null };
  try {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const renderer = await page.evaluate(() => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : null; } catch { return null; } });
    await ctx.close();
    ev = { software: typeof renderer === 'string' && SOFTWARE_RENDERER.test(renderer), renderer };
  } catch { /* no evidence: nothing is classified */ }
  EVIDENCE.set(browser, ev);
  return ev;
}
// seen: how many of these the page has already been given. location: the message's own location ({ url, lineNumber, columnNumber }). documents: the addresses of the documents the page has shown.
// True when this message is the known notice.
export const softwareGlNotice = ({ engine, type, text, evidence, seen, location, documents }) => engine === 'chromium' && type === 'warning' && !!evidence && evidence.software === true && seen < SWGL_LIMIT && SWGL_TEXT.test(text)
  && !!location && location.columnNumber === 0 && !!documents && documents.has(location.url);
