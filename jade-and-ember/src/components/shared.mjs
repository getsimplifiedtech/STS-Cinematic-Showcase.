// Link and label helpers used by several components.
import { esc } from '../lib/util.mjs';

export const pageHref = (cfg, id) => cfg.byId[id].file;
export const ctaPage = (cfg) => cfg.pages.find((p) => p.cta);

// The one place that decides where an "Order online" action goes.
// Default: the branded Order page. headerCta "direct" (live ordering URL only) goes straight to the platform.
export function orderTarget(cfg, { direct = false } = {}) {
  if (direct && cfg.live) return { href: esc(cfg.client.ordering.url), attrs: ' target="_blank" rel="noopener noreferrer"' };
  return { href: esc(pageHref(cfg, ctaPage(cfg).id)), attrs: '' };
}

// An "Order online" link or button that goes to the Order page (or, per config, the platform).
export function orderLink(cfg, cls, { direct = false } = {}) {
  const t = orderTarget(cfg, { direct: direct && cfg.client.ordering.headerCta === 'direct' });
  return `<a class="${esc(cls)}" href="${t.href}"${t.attrs}>${esc(cfg.client.ordering.label)}</a>`;
}

export const sealMark = (cfg) => `<span class="seal" lang="zh-Hans" aria-hidden="true"><span>${esc(cfg.client.brand.seal[0])}</span><span>${esc(cfg.client.brand.seal[1])}</span></span>`;
