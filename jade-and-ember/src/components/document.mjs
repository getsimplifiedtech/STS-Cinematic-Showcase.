// The full HTML document: head, disclosure bar, header, main, footer, scripts. Every page goes through this one function.
import { esc } from '../lib/util.mjs';
import { pageHref, ctaPage, orderLink, sealMark } from './shared.mjs';
import { canonicalFor, jsonLdFor } from '../lib/seo.mjs';

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23101211'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%23a9d2be' stroke-width='2.5'/%3E%3Ccircle cx='16' cy='16' r='2.6' fill='%23f08a3c'/%3E%3C/svg%3E";

function headTags(cfg, page, extraHead) {
  const { client, copy, site } = cfg;
  const meta = copy[page.id].meta;
  const title = client.seo.titleTemplate.replace('{page}', meta.title).replace('{brand}', client.brand.name) + (cfg.demo ? site.demo.titleSuffix : '');
  const canonical = !client.seo.noindex && client.seo.baseUrl ? `<meta property="og:url" content="${esc(canonicalFor(cfg, page))}">\n<link rel="canonical" href="${esc(canonicalFor(cfg, page))}">` : '';
  const jsonLd = jsonLdFor(cfg, page);   // '' unless an indexable client build turned structured data on
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.description)}">
${client.seo.noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<meta name="theme-color" content="${esc(client.seo.themeColor)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:type" content="website">
${canonical}${jsonLd ? '\n' + jsonLd : ''}
<link rel="icon" href="${FAVICON}">
<link rel="preload" as="font" type="font/woff2" href="fonts/young-serif-latin-400-normal.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="fonts/karla-latin-400-normal.woff2" crossorigin>
${extraHead || ''}<link rel="stylesheet" href="styles.css">
<script>document.documentElement.className+=' js'</script>`;
}

function disclosureBar(cfg) {
  if (!cfg.demo) return '';
  const d = cfg.site.demo;
  return `<aside class="disclosure" aria-label="Fictional restaurant notice"><p><span class="bar-long">${esc(d.bar)}</span><span class="bar-short">${esc(d.barShort)}</span> <a href="${esc(d.backHref)}"><span class="bar-long">${esc(d.backLabel)}</span><span class="bar-short">${esc(d.backShort)}</span></a></p></aside>`;
}

function header(cfg, page) {
  const cta = ctaPage(cfg);
  const current = (p) => (p.id === page.id ? ' aria-current="page"' : '');
  const links = cfg.pages.filter((p) => !p.cta).map((p) => `<li><a href="${esc(p.file)}"${current(p)}>${esc(p.nav)}</a></li>`).join('');
  // The Order page is the fifth destination. On wide screens it is the button at the right; in the phone menu it is the last link.
  const target = cfg.client.ordering.headerCta === 'direct' && cfg.live ? { href: esc(cfg.client.ordering.url), attrs: ' target="_blank" rel="noopener noreferrer"' } : { href: esc(cta.file), attrs: '' };
  const btnCurrent = cta.id === page.id ? ' aria-current="page"' : '';
  return `<header class="top" id="top">
  <div class="top-in">
    <a class="brand" href="index.html" aria-label="${esc(cfg.client.brand.name)}, home">${sealMark(cfg)}<span class="brand-name">${esc(cfg.client.brand.name)}</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span>Menu</span></button>
    <nav class="site-nav" id="site-nav" aria-label="Primary"><ul>${links}<li class="nav-order"><a href="${target.href}"${target.attrs}${btnCurrent}>${esc(cta.nav)}</a></li></ul></nav>
    <a class="btn btn-sm top-cta" href="${target.href}"${target.attrs}${btnCurrent}>${esc(cta.nav)}</a>
  </div>
</header>`;
}

function footer(cfg, page) {
  const { client, site } = cfg;
  const current = (p) => (p.id === page.id ? ' aria-current="page"' : '');
  const links = cfg.pages.map((p) => `<li><a href="${esc(p.file)}"${current(p)}>${esc(p.nav)}</a></li>`).join('');
  const demo = cfg.demo ? `<p class="foot-disc">${esc(site.demo.footer)}</p>` : '';
  const showcase = cfg.demo ? `<a href="${esc(site.demo.backHref)}">${esc(site.demo.backLabel)}</a>` : '';
  return `<footer class="foot">
  <div class="wrap foot-grid">
    <p class="foot-brand">${sealMark(cfg)}<span>${esc(client.brand.name)}</span> <span class="foot-desc">${esc(client.brand.descriptor)}</span></p>
    <nav class="foot-nav" aria-label="Footer"><ul>${links}</ul></nav>
    ${demo}
    <p class="foot-meta">${showcase}<a href="${esc(site.credit.href)}">${esc(site.credit.label)}</a>${cfg.demo ? `<span>${esc(site.demo.stamp)}</span>` : ''}</p>
  </div>
</footer>`;
}

export function document(cfg, page, { main, scripts = [], extraHead = '' }) {
  const body = `<body>
<a class="skip" href="#main">Skip to content</a>
${disclosureBar(cfg)}
${header(cfg, page)}

<main id="main">
${main}
</main>

${footer(cfg, page)}
${['site.js', ...scripts].map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>`;
  return `<!doctype html>\n<html lang="${esc(cfg.site.lang)}" data-page="${esc(page.id)}">\n<head>\n${headTags(cfg, page, extraHead)}\n</head>\n${body}\n</html>\n`;
}
