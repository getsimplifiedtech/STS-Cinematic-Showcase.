// Home: the cinematic arrival, then a short tour that hands off to the other four pages. Content comes from config; nothing is retyped here.
import { esc } from '../lib/util.mjs';
import { orderLink } from '../components/shared.mjs';
import { dish } from '../components/dish.mjs';
import { steps } from '../components/steps.mjs';
import { hours } from '../components/hours.mjs';
import { ctaBand } from '../components/cta-band.mjs';

export default function home(cfg) {
  const { client, copy } = cfg;
  const c = copy.home;
  const h = c.hero;
  const video = client.flags.heroVideo && h.video;
  const link = (id) => esc(cfg.byId[id].file);

  const extraHead = `<link rel="preload" as="image" href="${esc(h.image.mobile)}" media="(max-aspect-ratio: 1/1) and (max-width: 959px)" fetchpriority="high">
<link rel="preload" as="image" href="${esc(h.image.desktop)}" media="(min-aspect-ratio: 1.0001/1), (min-width: 960px)" fetchpriority="high">
`;

  const main = `  <section class="hero" aria-labelledby="hero-title" data-ambient-root>
    <div class="hero-media" data-ambient>
      <picture>
        <source media="(max-aspect-ratio: 1/1) and (max-width: 959px)" srcset="${esc(h.image.mobile)}" width="${h.image.mobileWidth}" height="${h.image.mobileHeight}">
        <img src="${esc(h.image.desktop)}" alt="${esc(h.image.alt)}" width="${h.image.width}" height="${h.image.height}" fetchpriority="high" decoding="async" style="--focus-d:${esc(h.image.focusDesktop)};--focus-m:${esc(h.image.focusMobile)}">
      </picture>
      ${video ? `<video class="hero-video" muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback aria-hidden="true" tabindex="-1" width="${+h.video.width}" height="${+h.video.height}" data-webm="${esc(h.video.webm)}" data-mp4="${esc(h.video.mp4)}" style="--focus-d:${esc(h.image.focusDesktop)}"></video>` : ''}
    </div>
    <div class="hero-copy">
      <p class="eyebrow">${esc(h.eyebrow)}</p>
      <h1 id="hero-title">${h.headline.map((l) => `<span>${esc(l)}</span>`).join(' ')}</h1>
      <p class="hero-text">${esc(h.text)}</p>
      <p class="hero-actions"><a class="btn btn-ember" href="${link(h.primaryCta.page)}">${esc(h.primaryCta.label)}</a> ${orderLink(cfg, 'btn hero-order')}</p>
    </div>
    <p class="hero-caption"><span class="vh">Pictured: </span>${esc(h.caption)}<span class="vh">. AI-generated concept image and video.</span></p>
    <button class="pause" type="button" aria-pressed="false" hidden><span class="pause-ico" aria-hidden="true"></span><span class="pause-txt">Pause motion</span></button>
  </section>

  <section class="process" aria-labelledby="process-title">
    <div class="wrap process-grid">
      <h2 id="process-title" class="process-line">${esc(c.process.heading)}</h2>
      <p class="process-body">${esc(c.process.body)}</p>
      ${steps(c.process.steps)}
    </div>
  </section>

  <section class="signature" id="signature" aria-labelledby="sig-title">
    <div class="wrap">
      <header class="sec-head"><h2 id="sig-title">${esc(c.signature.heading)}</h2></header>
    </div>
    <div class="dishes">${cfg.signature.map((it, i) => dish(it, { textFirst: i === 1, index: i })).join('')}
    </div>
    <div class="wrap more"><a class="btn btn-ink" href="${link('menu')}">${esc(c.signature.moreLabel)}</a></div>
  </section>

  <section class="story-teaser" aria-labelledby="story-teaser-title">
    <div class="wrap teaser-grid">
      <h2 id="story-teaser-title" class="pull">${esc(copy.story.h1)}</h2>
      <p class="teaser-text">${esc(c.storyTeaser.text)}</p>
      <p class="teaser-link"><a class="btn btn-ink" href="${link('story')}">${esc(c.storyTeaser.linkLabel)}</a></p>
    </div>
  </section>

  <section class="visit-strip" aria-labelledby="visit-strip-title">
    <div class="wrap strip-grid">
      <h2 id="visit-strip-title">${esc(c.visitStrip.heading)}</h2>
      <div class="strip-where">
        ${cfg.demo ? `<p class="sample-flag">${esc(copy.visit.fictionalNote)}</p>` : ''}
        <address>${client.address.lines.map(esc).join('<br>')}<br><a class="phone" href="${esc(client.contact.phone.href)}">${esc(client.contact.phone.display)}</a>${cfg.demo ? ' <span class="sample-inline">(sample number)</span>' : ''}</address>
        <p><a class="btn btn-ink" href="${link('visit')}">${esc(c.visitStrip.linkLabel)}</a></p>
      </div>
      ${hours(cfg, { variant: 'compact' })}
    </div>
  </section>

  ${ctaBand(cfg, { ...c.orderBand, tone: 'pine', id: 'order-band' })}`;

  return { main, scripts: ['hero.js'], extraHead };
}
