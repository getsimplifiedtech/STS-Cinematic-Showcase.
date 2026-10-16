// Visit us: practical certainty. A quiet, type-led page: the address is the headline element, the hours sit beside it, and
// "good to know" lists only what the client has filled in. No embedded map (no third-party script, no privacy or weight cost).
import { esc } from '../lib/util.mjs';
import { pageHref } from '../components/shared.mjs';
import { hours } from '../components/hours.mjs';
import { ctaBand } from '../components/cta-band.mjs';

export default function visit(cfg) {
  const { client, copy } = cfg;
  const v = copy.visit;
  const group = (g) => `
      <div class="good-group">
        <h3>${esc(g.title)}</h3>
        <ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>${g.link ? `
        <p class="good-link"><a href="${esc(pageHref(cfg, g.link.page))}">${esc(g.link.label)}</a></p>` : ''}
      </div>`;
  // The room: the page opens on the address in a nearly black room lit by one drifting, flickering pool of candle-like light. The dim jade bowls (the Our story
  // photograph, decorative here) sit behind a frosted panel that holds the address and hours. Real, ordered DOM throughout; the light is the only thing JavaScript moves.
  const img = copy.story.image;
  const main = `  <section class="visit-room" aria-labelledby="visit-title">
    <figure class="room-bg" aria-hidden="true"><img src="${esc(img.src)}" alt="" width="${img.width}" height="${img.height}" loading="lazy" decoding="async"></figure>
    <div class="candle" aria-hidden="true"></div>
    <div class="wrap room-grid">
      <div class="visit-head">
        <h1 id="visit-title">${esc(v.h1)}</h1>
        ${cfg.demo ? `<p class="sample-flag">${esc(v.fictionalNote)}</p>` : ''}
      </div>
      <section class="visit-main" aria-label="Address and opening hours">
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

  <section class="good" aria-labelledby="good-title">
    <div class="wrap good-grid">
      <h2 id="good-title">${esc(v.goodToKnow.heading)}</h2>
      <div class="good-groups">${v.goodToKnow.groups.map(group).join('')}</div>
    </div>
  </section>

  ${ctaBand(cfg, { ...v.orderBand, tone: 'pine', id: 'order-band' })}`;
  return { main, scripts: ['visit.js'], styles: ['visit.css'] };
}
