// Jade & Ember static build. No dependencies. Run: node build.mjs
// Reads config.json and writes index.html. Everything restaurant-specific lives in config.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const c = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => `$${esc(n)}`;

const ordering = c.ordering || {};
const live = typeof ordering.url === 'string' && /^https:\/\//.test(ordering.url);
const orderHref = live ? esc(ordering.url) : '#order';
const orderAttrs = live ? ' target="_blank" rel="noopener noreferrer"' : '';
const orderLabel = live ? esc(ordering.label) : `${esc(ordering.label)} <span class="vh">(example, not functional)</span>`;
const orderLink = (cls) => `<a class="btn ${cls}" href="${orderHref}"${orderAttrs}>${orderLabel}</a>`;

const h = c.hero;
const seal = `<span class="seal" lang="zh-Hans" aria-hidden="true"><span>${esc(c.brand.seal[0])}</span><span>${esc(c.brand.seal[1])}</span></span>`;

const heat = (n) => (n ? `<span class="heat" role="img" aria-label="Heat ${n} of 3">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>` : '');
const nav = c.nav.map((n) => `<li><a href="${esc(n.href)}">${esc(n.label)}</a></li>`).join('');

const sig = c.signature.items.map((d, i) => {
  const fig = `<figure class="dish-fig"><img src="${esc(d.image)}" alt="${esc(d.alt)}" width="1200" height="800" loading="lazy" decoding="async" style="--pos:${esc(d.focus || '50% 50%')}"></figure>`;
  const text = `<div class="wrap dish-text">
          <h3>${esc(d.name)}</h3>
          <p class="dish-desc">${esc(d.text)}</p>
          <p class="dish-meta"><span class="price">${money(d.price)}</span>${heat(d.heat)}<span class="tag">${esc(d.tag)}</span></p>
        </div>`;
  // The second plate puts its text above the frame so the three do not repeat the same picture-then-caption rhythm.
  return `
      <article class="dish dish-${i + 1}">
        ${i === 1 ? `${text}
        ${fig}` : `${fig}
        ${text}`}
      </article>`;
}).join('');

const cats = c.menu.categories;
const tabs = cats.map((k) => `<li><a class="tab" id="tab-${esc(k.id)}" href="#cat-${esc(k.id)}">${esc(k.name)}</a></li>`).join('');
const panels = cats.map((k) => `
        <section class="cat" id="cat-${esc(k.id)}" aria-labelledby="cat-${esc(k.id)}-h">
          <h3 class="cat-title" id="cat-${esc(k.id)}-h">${esc(k.name)}</h3>
          <ul class="items">${k.items.map((it) => `
            <li class="item"><div class="item-head"><span class="item-name">${esc(it.name)}</span>${heat(it.heat)}<span class="leader" aria-hidden="true"></span><span class="price">${money(it.price)}</span></div>
              <p class="item-text">${esc(it.text)}${it.tags ? ` <span class="item-tags">${it.tags.map(esc).join(' · ')}</span>` : ''}</p></li>`).join('')}
          </ul>
        </section>`).join('');

const hours = c.visit.hours.map((r) => `<tr><th scope="row">${esc(r.days)}</th><td>${esc(r.time)}</td></tr>`).join('');

const html = `<!doctype html>
<html lang="${esc(c.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.meta.title)}</title>
<meta name="description" content="${esc(c.meta.description)}">
${c.meta.robots ? `<meta name="robots" content="${esc(c.meta.robots)}">` : ''}
<meta name="theme-color" content="${esc(c.meta.themeColor)}">
<meta property="og:title" content="${esc(c.meta.title)}">
<meta property="og:description" content="${esc(c.meta.description)}">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230f1110'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%237fb9a2' stroke-width='2.5'/%3E%3Ccircle cx='16' cy='16' r='2.6' fill='%23e2803a'/%3E%3C/svg%3E">
<link rel="preload" as="font" type="font/woff2" href="fonts/young-serif-latin-400-normal.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="fonts/karla-latin-400-normal.woff2" crossorigin>
<link rel="preload" as="image" href="${esc(h.image.mobile)}" media="(max-aspect-ratio: 1/1) and (max-width: 959px)" fetchpriority="high">
<link rel="preload" as="image" href="${esc(h.image.desktop)}" media="(min-aspect-ratio: 1.0001/1), (min-width: 960px)" fetchpriority="high">
<link rel="stylesheet" href="styles.css">
<script>document.documentElement.className+=' js'</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<aside class="disclosure" aria-label="Fictional restaurant notice"><p><span class="bar-long">${esc(c.disclosure.bar)}</span><span class="bar-short">${esc(c.disclosure.barShort)}</span> <a href="${esc(c.disclosure.backHref)}"><span class="bar-long">${esc(c.disclosure.backLabel)}</span><span class="bar-short">${esc(c.disclosure.backShort)}</span></a></p></aside>
<header class="top" id="top">
  <div class="top-in">
    <a class="brand" href="#top">${seal}<span class="brand-name">${esc(c.brand.name)}</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span>Menu</span></button>
    <nav class="site-nav" id="site-nav" aria-label="Primary"><ul>${nav}<li class="nav-order"><a href="${orderHref}"${orderAttrs}>${orderLabel}</a></li></ul></nav>
    ${orderLink('btn-sm top-cta')}
  </div>
</header>

<main id="main">
  <section class="hero" aria-labelledby="hero-title" data-ambient-root>
    <div class="hero-media" data-ambient>
      <picture>
        <source media="(max-aspect-ratio: 1/1) and (max-width: 959px)" srcset="${esc(h.image.mobile)}" width="${h.image.mobileWidth}" height="${h.image.mobileHeight}">
        <img src="${esc(h.image.desktop)}" alt="${esc(h.image.alt)}" width="${h.image.width}" height="${h.image.height}" fetchpriority="high" decoding="async" style="--focus-d:${esc(h.image.focusDesktop)};--focus-m:${esc(h.image.focusMobile)}">
      </picture>
      ${h.video ? `<video class="hero-video" muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback aria-hidden="true" tabindex="-1" width="${+h.video.width}" height="${+h.video.height}" data-webm="${esc(h.video.webm)}" data-mp4="${esc(h.video.mp4)}" style="--focus-d:${esc(h.image.focusDesktop)}"></video>` : ''}
    </div>
    <div class="hero-copy">
      <p class="eyebrow">${esc(h.eyebrow)}</p>
      <h1 id="hero-title">${h.headline.map((l) => `<span>${esc(l)}</span>`).join(' ')}</h1>
      <p class="hero-text">${esc(h.text)}</p>
      <p class="hero-actions"><a class="btn btn-ember" href="${esc(h.primaryCta.href)}">${esc(h.primaryCta.label)}</a> ${orderLink('hero-order')}</p>
    </div>
    <p class="hero-caption"><span class="vh">Pictured: </span>${esc(h.caption)}<span class="vh">. AI-generated concept image and video.</span></p>
    <button class="pause" type="button" aria-pressed="false" hidden><span class="pause-ico" aria-hidden="true"></span><span class="pause-txt">Pause motion</span></button>
  </section>

  <section class="process" aria-labelledby="process-title">
    <div class="wrap process-grid">
      <h2 id="process-title" class="process-line">${esc(c.intro.text)}</h2>
      <p class="process-body">${esc(c.intro.body)}</p>
      <ol class="steps">${c.intro.items.map((it, i) => `
        <li><h3><span class="step-no" aria-hidden="true">${i + 1}</span>${esc(it.name)}</h3><p>${esc(it.text)}</p></li>`).join('')}
      </ol>
    </div>
  </section>

  <section class="signature" id="signature" aria-labelledby="sig-title">
    <div class="wrap">
      <header class="sec-head"><h2 id="sig-title">${esc(c.signature.heading)}</h2></header>
    </div>
    <div class="dishes">${sig}
    </div>
  </section>

  <section class="menu" id="menu" aria-labelledby="menu-title">
    <div class="wrap menu-grid">
      <header class="sec-head"><h2 id="menu-title">${esc(c.menu.heading)}</h2></header>
      <div class="menu-main">
        <div class="menu-bar">
          <ul class="tabs" aria-label="Menu categories">${tabs}</ul>
          <div class="menu-cta">${orderLink('btn-ink')}</div>
        </div>
        <div class="cats">${panels}
        </div>
        <p class="menu-cta-end">${orderLink('btn-ink')}</p>
      </div>
      <p class="menu-note">${esc(c.menu.note)}</p>
    </div>
  </section>

  <section class="story" id="story" aria-labelledby="story-title">
    <div class="wrap story-head"><h2 id="story-title" class="pull">${esc(c.story.pull)}</h2></div>
    <figure class="story-fig">
      <img src="${esc(c.story.image.src)}" alt="${esc(c.story.image.alt)}" width="${c.story.image.width}" height="${c.story.image.height}" loading="lazy" decoding="async">
      <figcaption class="wrap">${esc(c.story.caption)}</figcaption>
    </figure>
    <div class="wrap story-body">
      <div class="story-text">${c.story.paragraphs.slice(0, -1).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      <p class="story-coda">${esc(c.story.paragraphs[c.story.paragraphs.length - 1])}</p>
    </div>
  </section>

  <section class="visit" id="visit" aria-labelledby="visit-title">
    <div class="wrap visit-grid">
      <header class="sec-head"><h2 id="visit-title">${esc(c.visit.heading)}</h2></header>
      <div class="visit-where">
        <p class="sample-flag">${esc(c.visit.fictionalNote)}</p>
        <address>${c.visit.address.map(esc).join('<br>')}<br><span class="phone">${esc(c.visit.phone.display)}</span> <span class="sample-inline">(sample number)</span></address>
        <ul class="notes">${c.visit.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>
      <table class="hours"><caption class="vh">Opening hours (sample)</caption><tbody>${hours}</tbody></table>
    </div>
  </section>

  <section class="order" id="order" aria-labelledby="order-title">
    <div class="wrap order-grid">
      <div>
        <h2 id="order-title">${esc(c.order.heading)}</h2>
        <p class="order-text">${esc(c.order.text)}</p>
        <p class="order-actions">${live ? orderLink('btn-ember') : `<span class="btn btn-off">${esc(ordering.label)} (example)</span>`}</p>
      </div>
      <div class="order-note"${live ? ' hidden' : ''}>
        <p class="note-title">For restaurant owners</p>
        <p>${esc(ordering.demoNote)}</p>
        <p>${esc(ordering.platformNote)}</p>
      </div>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-grid">
    <p class="foot-brand">${seal}<span>${esc(c.brand.name)}</span> <span class="foot-desc">${esc(c.brand.descriptor)}</span></p>
    <p class="foot-disc">${esc(c.disclosure.footer)}</p>
    <p class="foot-meta"><a href="${esc(c.disclosure.backHref)}">${esc(c.disclosure.backLabel)}</a><a href="${esc(c.footer.builtByHref)}">${esc(c.footer.builtBy)}</a><span>${esc(c.footer.stamp)}</span></p>
  </div>
</footer>
<script src="site.js" defer></script>
</body>
</html>
`;

writeFileSync(join(dir, 'index.html'), html);
console.log(`index.html written (${html.length} bytes). Ordering: ${live ? 'live URL' : 'demo placeholder'}.`);
