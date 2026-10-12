// Image carriers that reach outside the page or into a social card (G6-3, APR-JE-040; decision D-P4-3: no social-preview image for Jade & Ember until the media rights
// are confirmed, and the reusable framework must support approved images). This is the GATE side only and it never adds an image. A client-production build may carry
// an image reference (Open Graph and Twitter card images and video, itemprop image, JSON-LD image/logo/thumbnailUrl/contentUrl/photo, link rel icon/apple-touch-icon/
// image_src/mask-icon, <img>, <source>, <video poster>, srcset) only if it resolves to a delivered file that is in the media-rights inventory and verified by an
// in-force rights verification. A reference to another host is refused (its rights cannot be inventoried). A data: URI is inline content of the page and is not judged
// here. NOT covered, stated plainly: CSS background images (they are delivered files under media/ and are inventoried by the inventory itself), images assembled by
// script, and pages in sub-folders (the site's pages are flat; the framework must revisit this, G6-5/G6-6). The generator side belongs to the framework.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const attrs = (s) => { const o = {}; for (const m of s.matchAll(ATTR)) o[m[1].toLowerCase()] ??= m[2] ?? m[3] ?? m[4] ?? ''; return o; };
const META_KEY = /^(og:image(:[\w:]+)?|og:video(:[\w:]+)?|twitter:image(:src)?|twitter:player|image|thumbnail|thumbnailurl)$/;
const ICON_REL = new Set(['icon', 'shortcut', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'apple-touch-startup-image', 'image_src', 'mask-icon']);
const LD_KEYS = new Set(['image', 'logo', 'thumbnailUrl', 'contentUrl', 'photo', 'primaryImageOfPage']);

export function socialImages(siteDir) {
  const out = [];
  for (const f of readdirSync(siteDir).filter((x) => x.endsWith('.html')).sort()) {
    const html = readFileSync(join(siteDir, f), 'utf8');
    const add = (url, via) => out.push({ page: f, url: String(url ?? '').trim(), via });
    for (const m of html.matchAll(TAG)) {
      const tag = m[1].toLowerCase(), a = attrs(m[2]);
      if (tag === 'meta') {
        for (const k of ['property', 'name', 'itemprop']) if (a[k] !== undefined && META_KEY.test(a[k].toLowerCase())) add(a.content, `meta ${k}="${a[k]}"`);
      } else if (tag === 'link') {
        const rel = (a.rel || '').toLowerCase().split(/\s+/);
        if (rel.some((r) => ICON_REL.has(r))) add(a.href, `link rel="${a.rel}"`);
      } else if (['img', 'source', 'video', 'image', 'input'].includes(tag)) {
        if (a.src !== undefined) add(a.src, `${tag} src`);
        if (a.poster !== undefined) add(a.poster, `${tag} poster`);
        for (const key of ['srcset', 'data-srcset']) if (a[key] !== undefined) for (const c of a[key].split(',')) { const u = c.trim().split(/\s+/)[0]; if (u) add(u, `${tag} ${key}`); }
      }
    }
    for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (LD_KEYS.has(k)) for (const u of [v].flat()) { const url = typeof u === 'string' ? u : u?.url ?? u?.contentUrl; if (url) add(url, `JSON-LD ${k}`); } else walk(v); } };
        walk(JSON.parse(m[1]));
      } catch { add('', 'JSON-LD that cannot be read'); }
    }
  }
  return out;
}

// -> { ok, detail, images }
export function socialImageStatus({ siteDir, inventory, rightsIds, baseUrl = null }) {
  const images = socialImages(siteDir);
  const problems = [];
  const byPath = new Map((inventory?.assets || []).map((a) => [a.path, a]));
  let own = null; try { own = baseUrl ? new URL(baseUrl) : null; } catch { own = null; }
  for (const i of images) {
    if (/^data:/i.test(i.url)) continue;
    if (!i.url) { problems.push(`${i.page}: ${i.via} is empty or unreadable`); continue; }
    let path = null;
    if (/^(https?:)?\/\//i.test(i.url)) {
      let u; try { u = new URL(i.url.startsWith('//') ? `https:${i.url}` : i.url); } catch { u = null; }
      if (!u || !own || u.hostname.toLowerCase() !== own.hostname.toLowerCase()) { problems.push(`${i.page}: ${i.via} ${i.url} is hosted elsewhere, so its rights cannot be inventoried`); continue; }
      path = u.pathname.replace(/^\/+/, '').replace(new RegExp(`^${own.pathname.replace(/^\/+|\/+$/g, '')}/?`), '');
    } else path = i.url.replace(/^\.?\//, '').replace(/[?#].*$/, '');
    try { path = decodeURIComponent(path); } catch { problems.push(`${i.page}: ${i.via} ${i.url} is not a valid address`); continue; }
    if (!existsSync(join(siteDir, path))) { problems.push(`${i.page}: ${i.via} ${i.url} is not a delivered file`); continue; }
    const a = byPath.get(path);
    if (!a) problems.push(`${i.page}: ${i.via} ${path} is not in the media rights inventory`);
    else if (a.rights?.status !== 'verified' || !rightsIds.includes(a.rights.approval)) problems.push(`${i.page}: ${i.via} ${path} is not verified by an in-force rights verification (status ${a.rights?.status})`);
  }
  return { ok: problems.length === 0, images, detail: problems.length ? [...new Set(problems)].slice(0, 3).join('; ') : images.length ? `${images.length} image reference(s) in the pages, each inline, or a delivered, inventoried and rights-verified file` : 'the pages carry no image reference outside the page (no social-preview image may be added until its rights are verified)' };
}
