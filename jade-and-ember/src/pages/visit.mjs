// Visit us: practical certainty. A quiet, type-led page: the address is the headline element, the hours sit beside it, and
// "good to know" lists only what the client has filled in. No embedded map (no third-party script, no privacy or weight cost).
import { esc } from '../lib/util.mjs';
import { pageHref } from '../components/shared.mjs';
import { hours } from '../components/hours.mjs';
import { ctaBand } from '../components/cta-band.mjs';

// The three interior photographs (owner-approved Shots A, B and C, generated for the project). They are art direction, not client copy, so they live with the page
// renderer (the shared copy schema has no field for them), as on Our story. Shot A opens the page; the counter and the materials follow as editorial pairs.
// All three are AI-generated concept images of the same fictional room, and the captions say so.
const ART = {
  room: { src: 'media/visit-room-a.webp', width: 1280, height: 859, srcset: [['media/visit-room-a.webp', 1280], ['media/visit-room-a-1920.webp', 1920], ['media/visit-room-a-2560.webp', 2560]], mobile: { src: 'media/visit-room-a-m.webp', width: 720, height: 900 },
    alt: 'The dining room from the door: concrete walls, a wood-slat ceiling and a jade-tile alcove of bowls. A man in a brown overshirt has a beer at a side table; a couple talk at the walnut counter, an older woman is at its end, a cook tosses a flaming wok.',
    caption: 'The room, from the door to the fire. Concept image; the room and the people are AI-generated.' },
  counter: { src: 'media/visit-counter-b.webp', width: 780, height: 968,
    alt: 'Looking along the curved walnut counter from a stool: three celadon bowls and chopsticks set out, leather-seated stools in a row, and the wok flaring orange in the open kitchen beyond.',
    caption: 'The wok counter. Concept image, AI-generated.',
    heading: 'Eight seats at the fire.',
    text: 'The wok counter is the centre of the room. Sit at the curved walnut and the cook is an arm\u2019s length away: the flame, the toss, the bowl set down in front of you.',
    link: { page: 'menu', label: 'See the menu' } },
  materials: { src: 'media/visit-materials-c.webp', width: 1200, height: 805,
    alt: 'The jade-tile wall with its brass-edged niche of stacked celadon bowls, a copper wall light warming the concrete beside it, and the open kitchen\u2019s wok flame glowing softly behind.',
    caption: 'Jade, brass and concrete. Concept image, AI-generated.',
    heading: 'Jade, brass and concrete.',
    text: 'Celadon bowls stand in a jade-tile niche edged with brass. Board-formed concrete keeps the walls quiet, and copper lamps warm it where the fire cannot reach.',
    link: { page: 'story', label: 'Read the story of the name' } },
};

export default function visit(cfg) {
  const { client, copy } = cfg;
  const v = copy.visit;
  const group = (g) => `
      <div class="good-group">
        <h3>${esc(g.title)}</h3>
        <ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>${g.link ? `
        <p class="good-link"><a href="${esc(pageHref(cfg, g.link.page))}">${esc(g.link.label)}</a></p>` : ''}
      </div>`;
  // The room: the page opens on Shot A, the dining room seen from the door, with the address and hours on a frosted panel beside it. A pool of candle-like light drifts
  // over the photograph; the photograph itself only drifts a little as the page scrolls (CSS only, and only when motion is allowed). Real, ordered DOM throughout; the
  // light is the only thing JavaScript moves. The phone gets its own crop of the same photograph, and it is the only image that loads before the first scroll. Larger screens choose among three sizes of the same master (1280, 1920 and 2560 px wide), so a wide or 2x display is not stretching a small file.
  const a = ART.room;
  const pair = (id, a, cls) => `
  <section class="visit-pair ${cls}" aria-labelledby="${id}-h">
    <div class="wrap pair-grid">
      <figure class="pair-fig"><img src="${esc(a.src)}" alt="${esc(a.alt)}" width="${a.width}" height="${a.height}" loading="lazy" decoding="async"><figcaption>${esc(a.caption)}</figcaption></figure>
      <div class="pair-body">
        <h2 id="${id}-h">${esc(a.heading)}</h2>
        <p>${esc(a.text)}</p>
        <p class="pair-link"><a href="${esc(pageHref(cfg, a.link.page))}">${esc(a.link.label)}</a></p>
      </div>
    </div>
  </section>`;
  const main = `  <section class="visit-room" aria-labelledby="visit-title">
    <figure class="room-photo"><picture><source media="(max-width: 759px)" srcset="${esc(a.mobile.src)}" width="${a.mobile.width}" height="${a.mobile.height}"><source srcset="${a.srcset.map(([f, w]) => `${esc(f)} ${w}w`).join(', ')}" sizes="(min-width: 1600px) 1600px, 100vw"><img src="${esc(a.src)}" alt="${esc(a.alt)}" width="${a.width}" height="${a.height}" fetchpriority="high" decoding="async"></picture><figcaption>${esc(a.caption)}</figcaption></figure>
    <div class="room-fx" aria-hidden="true"><div class="candle"></div></div>
    <div class="wrap room-grid">
      <div class="visit-head">
        <h1 id="visit-title">${esc(v.h1)}</h1>
        ${cfg.demo ? `<p class="sample-flag">${esc(v.fictionalNote)}</p>` : ''}
      </div>
      <section class="visit-main lq" aria-label="Address and opening hours">
        <div class="visit-where">
          <address class="visit-address">${client.address.lines.map(esc).join('<br>')}</address>
          <p class="visit-contact"><a class="phone" href="${esc(client.contact.phone.href)}">${esc(client.contact.phone.display)}</a>${cfg.demo ? ' <span class="sample-inline">(sample number)</span>' : ''}${client.contact.email ? ` <a href="mailto:${esc(client.contact.email)}">${esc(client.contact.email)}</a>` : ''}</p>
          ${client.address.mapUrl ? `<p><a class="btn btn-ink" href="${esc(client.address.mapUrl)}" target="_blank" rel="noopener noreferrer">${esc(v.directionsLabel)}<span class="vh"> (opens a map in a new tab)</span></a></p>` : ''}
        </div>
        ${hours(cfg)}
      </section>
    </div>
    <button class="pause" type="button" aria-pressed="false" hidden><span class="pause-ico" aria-hidden="true"></span><span class="pause-txt">Pause motion</span></button>
  </section>

  ${pair('counter', ART.counter, 'visit-counter')}
  ${pair('materials', ART.materials, 'visit-materials')}

  <section class="good" aria-labelledby="good-title">
    <div class="wrap good-grid">
      <h2 id="good-title">${esc(v.goodToKnow.heading)}</h2>
      <div class="good-groups">${v.goodToKnow.groups.map(group).join('')}</div>
    </div>
  </section>

  ${ctaBand(cfg, { ...v.orderBand, tone: 'kiln', id: 'order-band' })}`;
  return { main, scripts: ['visit.js'], styles: ['visit.css'] };
}
