// The page renderer of the generic fixture: one function per page, all through document(). Pure; it writes no file. It escapes every value it prints.
import { canonicalFor, jsonLdFor } from '../../../generators/seo.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const img = (i, lazy = true) => `<img src="${esc(i.src)}" width="${i.width}" height="${i.height}" alt="${esc(i.alt)}"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">`;

function head(cfg, page, title, description) {
  const { client, site } = cfg;
  const full = client.seo.titleTemplate.replace('{page}', title).replace('{brand}', client.brand.name) + (cfg.demo ? site.demo.titleSuffix : '');
  const canonical = !client.seo.noindex && client.seo.baseUrl && page.file ? `<meta property="og:url" content="${esc(canonicalFor(cfg, page))}">\n<link rel="canonical" href="${esc(canonicalFor(cfg, page))}">\n` : '';
  const jsonLd = page.id ? jsonLdFor(cfg, page) : '';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
${client.seo.noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<meta name="theme-color" content="${esc(client.seo.themeColor)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${canonical}${jsonLd ? jsonLd + '\n' : ''}<link rel="icon" href="data:,">
<link rel="stylesheet" href="styles.css">
<script>document.documentElement.className+=' js'</script>`;
}

function header(cfg, page) {
  const links = cfg.pages.filter((p) => !p.cta).map((p) => `<li><a href="${esc(p.file)}"${p.id === page.id ? ' aria-current="page"' : ''}>${esc(p.nav)}</a></li>`).join('');
  const cta = cfg.pages.find((p) => p.cta);
  const cur = cta.id === page.id ? ' aria-current="page"' : '';
  return `<header class="top" id="top">
  <div class="top-in">
    <a class="brand" href="index.html" aria-label="${esc(cfg.client.brand.name)}, home"><span class="brand-name">${esc(cfg.client.brand.name)}</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span>Menu</span></button>
    <nav class="site-nav" id="site-nav" aria-label="Primary"><ul>${links}<li class="nav-cta"><a href="${esc(cta.file)}"${cur}>${esc(cta.nav)}</a></li></ul></nav>
    <a class="btn top-cta" href="${esc(cta.file)}"${cur}>${esc(cta.nav)}</a>
  </div>
</header>`;
}

function footer(cfg) {
  const { client, site } = cfg;
  const links = cfg.pages.map((p) => `<li><a href="${esc(p.file)}">${esc(p.nav)}</a></li>`).join('');
  return `<footer class="foot">
  <div class="wrap foot-grid">
    <address>${client.address.lines.map(esc).join('<br>')}<br><a href="${esc(client.contact.phone.href)}">${esc(client.contact.phone.display)}</a></address>
    <nav class="foot-nav" aria-label="Footer"><ul>${links}</ul></nav>
    ${cfg.demo ? `<p class="foot-disc">${esc(site.demo.footer)}</p>` : ''}
    <p class="credit"><a href="${esc(site.credit.href)}" target="_blank" rel="noopener noreferrer">${esc(site.credit.label)}</a></p>
  </div>
</footer>`;
}

export function document(cfg, page, body, meta) {
  const bar = cfg.demo ? `<aside class="disclosure" aria-label="Fictional studio notice"><p><span class="bar-long">${esc(cfg.site.demo.bar)}</span><span class="bar-short">${esc(cfg.site.demo.barShort)}</span></p></aside>\n` : '';
  return `<!doctype html>
<html lang="${esc(cfg.site.lang)}">
<head>
${head(cfg, page, meta.title, meta.description)}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${bar}${header(cfg, page)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(cfg)}
<script src="site.js" defer></script>
</body>
</html>
`;
}

const pages = {
  home: (cfg) => { const c = cfg.copy.home; return `<section class="hero wrap"><h1>${esc(c.hero.heading)}</h1><p class="lead">${esc(c.hero.lead)}</p>${img(c.hero.image, false)}<p><a class="btn" href="contact.html">Ask about a job</a></p></section>
${c.sections.map((s) => `<section class="wrap" id="${esc(s.id)}"><h2>${esc(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('\n')}`; },
  services: (cfg) => { const c = cfg.copy.services; return `<section class="wrap"><h1>${esc(c.heading)}</h1><p class="lead">${esc(c.intro)}</p>
<ul class="cards">${c.items.map((i) => `<li><h2>${esc(i.name)}</h2><p>${esc(i.text)}</p>${i.image ? img(i.image) : ''}</li>`).join('')}</ul><p><a class="btn" href="contact.html">Ask about a job</a></p></section>`; },
  visit: (cfg) => { const c = cfg.copy.visit, k = cfg.client; return `<section class="wrap"><h1>${esc(c.heading)}</h1><p class="lead">${esc(c.intro)}</p>
<h2>Opening hours</h2><table class="hours"><tbody>${k.hours.rows.map((r) => `<tr><th scope="row">${esc(r.days)}</th><td>${esc(r.time)}</td></tr>`).join('')}</tbody></table>
<h2>Telephone</h2><p><a class="btn" href="${esc(k.contact.phone.href)}">${esc(k.contact.phone.display)}</a></p>${k.ordering?.url ? `<p><a href="${esc(k.ordering.url)}">Book a job online</a></p>` : ''}<p>${esc(c.note)}</p></section>`; },
};

export const renderPage = (cfg, page) => document(cfg, page, pages[page.id](cfg), cfg.copy[page.id].meta);
// The error page: the hosting rules require one (a missing 404 is a live blocker); it is not a registry page.
export const renderNotFound = (cfg) => document(cfg, { id: null, file: null }, `<section class="wrap"><h1>${esc(cfg.copy.notFound.heading)}</h1><p class="lead">${esc(cfg.copy.notFound.text)}</p></section>`, cfg.copy.notFound.meta);
