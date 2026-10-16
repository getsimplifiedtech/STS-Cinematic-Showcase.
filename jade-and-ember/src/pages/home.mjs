// Home: The Breath (the signature scroll sequence: flame, steam, texture, the plate), then the other two signature dishes rising out of the dark, a short
// story teaser and the way to the other pages. Content comes from config; nothing is retyped here.
// The sequence is plain, ordered DOM with a CSS-only fallback; breath.js (built from src/client) adds the footage, the live steam and the dish canvas.
import { esc, money } from '../lib/util.mjs';
import { orderLink } from '../components/shared.mjs';
import { dish } from '../components/dish.mjs';
import { hours } from '../components/hours.mjs';
import { ctaBand } from '../components/cta-band.mjs';

export default function home(cfg) {
  const { client, copy } = cfg;
  const c = copy.home;
  const h = c.hero;
  const video = client.flags.heroVideo && h.video;
  const link = (id) => esc(cfg.byId[id].file);
  const [plate, ...more] = cfg.signature;   // the sequence ends on the first signature dish; the others follow it

  const extraHead = `<link rel="preload" as="image" href="${esc(h.image.mobile)}" media="(max-aspect-ratio: 1/1) and (max-width: 959px)" fetchpriority="high">
<link rel="preload" as="image" href="${esc(h.image.desktop)}" media="(min-aspect-ratio: 1.0001/1), (min-width: 960px)" fetchpriority="high">
`;
  const beat = (s, i) => `
      <li class="beat beat-${i + 1}" data-from="${[0.105, 0.295, 0.48, 0.645][i]}" data-to="${[0.275, 0.46, 0.625, 1.02][i]}">
        <div class="beat-in">
          <h2 class="word"><span class="ln"><span>${esc(s.name)}</span></span></h2>
          <p class="copy">${esc(s.text)}</p>${i === 3 ? `
          <p class="dish-name">${esc(plate.name)} <span class="price">${money(plate.price)}</span></p>
          <!-- No-JavaScript and calm fallback: the finished dish as an ordinary figure. The live sequence draws it on its own canvas instead. -->
          <figure class="dish-static"><img src="${esc(plate.signature.image)}" alt="${esc(plate.signature.alt)}" width="${plate.signature.width}" height="${plate.signature.height}" loading="lazy" decoding="async"></figure>` : ''}
        </div>
      </li>`;

  const main = `  <section class="breath" data-breath aria-label="The Breath: how the wok makes its heat">
    <!-- The pinned stage. Without JavaScript it is still pinned (CSS sticky): the poster stays put and the text panels scroll over it. -->
    <div class="stage" data-stage data-ambient-root>
      <div class="media">
        <picture>
          <source media="(max-aspect-ratio: 1/1) and (max-width: 959px)" srcset="${esc(h.image.mobile)}" width="${h.image.mobileWidth}" height="${h.image.mobileHeight}">
          <img class="poster" src="${esc(h.image.desktop)}" alt="${esc(h.image.alt)}" width="${h.image.width}" height="${h.image.height}" fetchpriority="high" decoding="async">
        </picture>
        ${video ? `<video class="flame" muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback aria-hidden="true" tabindex="-1" width="${+h.video.width}" height="${+h.video.height}" data-webm="${esc(h.video.webm)}" data-mp4="${esc(h.video.mp4)}"></video>` : '<video class="flame" hidden></video>'}
      </div>
      <div class="dark" aria-hidden="true"></div>
      <!-- Live sequence only: the finished dish on its own canvas at full pixel density, and the steam over it. -->
      <canvas class="dish" aria-hidden="true"></canvas>
      <canvas class="steam" aria-hidden="true"></canvas>
      <!-- Calm mode plates (reduced motion, Save-Data, no WebGL2, or a failed performance check): opacity-only crossfades, no movement. -->
      <div class="plates" aria-hidden="true">
        <div class="plate plate-fire"></div>
        <div class="plate plate-steam"></div>
        <div class="plate plate-tex"></div>
        <div class="plate plate-cloud"></div>
        <div class="plate plate-dish"><img src="${esc(plate.signature.image)}" alt="" width="${plate.signature.width}" height="${plate.signature.height}" loading="lazy" decoding="async"></div>
      </div>
      <button class="pause" type="button" aria-pressed="false" hidden><span class="pause-ico" aria-hidden="true"></span><span class="pause-txt">Pause motion</span></button>
    </div>

    <!-- All narrative text is real, ordered DOM. In the live sequence these panels are pinned over the stage; otherwise they scroll over it. -->
    <div class="beats" data-beats>
      <div class="beat beat-0" data-from="0" data-to="0.085">
        <div class="beat-in">
          <p class="eyebrow">${esc(h.eyebrow)}</p>
          <h1 id="hero-title">${h.headline.map((l) => `<span class="ln"><span>${esc(l)}</span></span>`).join(' ')}</h1>
          <p class="lede">${esc(h.text)}</p>
          <p class="actions"><a class="btn btn-ember" href="${link(h.primaryCta.page)}">${esc(h.primaryCta.label)}</a> ${orderLink(cfg, 'btn btn-ink')}</p>
        </div>
      </div>
      <ol class="beat-list" data-visual aria-label="${esc(c.process.heading)}">${c.process.steps.map(beat).join('')}
      </ol>
    </div>
    <p class="vh">${esc(h.caption)}${cfg.demo ? esc(copy.demo.heroCaptionNote) : ''}</p>
  </section>
  <section class="signature" id="signature" aria-labelledby="sig-title">
    <div class="wrap">
      <header class="sec-head"><h2 id="sig-title">${esc(c.signature.heading)}</h2></header>
    </div>
    <div class="dishes">${more.map((it, i) => dish(it, { textFirst: i === 1, index: i + 1 })).join('')}
    </div>
    <div class="wrap more"><a class="btn" href="${link('menu')}">${esc(c.signature.moreLabel)}</a></div>
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

  return { main, scripts: ['breath.js'], extraHead, styles: ['home.css'] };
}
