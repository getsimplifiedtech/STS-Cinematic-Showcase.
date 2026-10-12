// Social-preview images (G6-3, APR-JE-040; decision D-P4-3: no social-preview image for Jade & Ember until the media rights are confirmed, and the reusable
// framework must support approved images). This is the GATE side only and it never adds an image: a client-production build may carry a social-preview
// image (Open Graph, Twitter card, JSON-LD "image") only if that image is a delivered file, is in the media-rights inventory, and is verified by an in-force
// rights verification. An image hosted elsewhere is refused (its rights cannot be inventoried). The generator side belongs to the framework (G6-5/G6-6).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const META_RE = /<meta\b[^>]*>/gi;
const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag); return m ? (m[2] ?? m[3]) : null; };

export function socialImages(siteDir) {
  const out = [];
  for (const f of readdirSync(siteDir).filter((x) => x.endsWith('.html')).sort()) {
    const html = readFileSync(join(siteDir, f), 'utf8');
    for (const tag of html.match(META_RE) || []) {
      const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
      if (['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(key)) out.push({ page: f, url: attr(tag, 'content') || '', via: key });
    }
    for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/gi)) out.push({ page: f, url: attr(m[0], 'href') || '', via: 'link image_src' });
    for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'image' || k === 'logo' || k === 'thumbnailUrl') for (const u of [v].flat()) { const url = typeof u === 'string' ? u : u?.url; if (url) out.push({ page: f, url, via: `JSON-LD ${k}` }); } else walk(v); } };
        walk(JSON.parse(m[1]));
      } catch { out.push({ page: f, url: '', via: 'JSON-LD that cannot be read' }); }
    }
  }
  return out;
}

// -> { ok, detail, images }
export function socialImageStatus({ siteDir, inventory, rightsIds, baseUrl = null }) {
  const images = socialImages(siteDir);
  const problems = [];
  const byPath = new Map((inventory?.assets || []).map((a) => [a.path, a]));
  for (const i of images) {
    if (!i.url) { problems.push(`${i.page}: ${i.via} is empty or unreadable`); continue; }
    let path = null;
    if (/^https?:\/\//i.test(i.url)) {
      let u; try { u = new URL(i.url); } catch { u = null; }
      let own = null; try { own = baseUrl ? new URL(baseUrl) : null; } catch { own = null; }
      if (!u || !own || u.hostname.toLowerCase() !== own.hostname.toLowerCase()) { problems.push(`${i.page}: ${i.via} ${i.url} is hosted elsewhere, so its rights cannot be inventoried`); continue; }
      path = decodeURIComponent(u.pathname.replace(/^\/+/, '').replace(new RegExp(`^${own.pathname.replace(/^\/+|\/+$/g, '')}/?`), ''));
    } else path = i.url.replace(/^\.?\//, '').replace(/[?#].*$/, '');
    if (!existsSync(join(siteDir, path))) { problems.push(`${i.page}: ${i.via} ${i.url} is not a delivered file`); continue; }
    const a = byPath.get(path);
    if (!a) problems.push(`${i.page}: ${i.via} ${path} is not in the media rights inventory`);
    else if (a.rights?.status !== 'verified' || !rightsIds.includes(a.rights.approval)) problems.push(`${i.page}: ${i.via} ${path} is not verified by an in-force rights verification (status ${a.rights?.status})`);
  }
  return { ok: problems.length === 0, images, detail: problems.length ? [...new Set(problems)].slice(0, 3).join('; ') : images.length ? `${images.length} social image reference(s), each a delivered, inventoried and rights-verified file` : 'the build carries no social-preview image (none may be added until its rights are verified)' };
}
