// Order online: the one primary action, and what happens after it. Link-out only: no embed, no checkout, no claim of any integration.
import { esc } from '../lib/util.mjs';
import { pageHref } from '../components/shared.mjs';
import { steps } from '../components/steps.mjs';
import { ownerNote } from '../components/owner-note.mjs';

export default function order(cfg) {
  const { client, copy, live } = cfg;
  const o = copy.order;
  const sub = (t) => t.replace('{platform}', client.ordering.platformName).replace('{pickup}', client.ordering.pickupNote || '').trim();
  const items = o.steps.map((s) => ({ name: s.name, text: sub(s.text), link: s.link ? { href: pageHref(cfg, s.link.page), label: s.link.label } : null }));
  const action = live
    ? `<a class="btn btn-ember" href="${esc(client.ordering.url)}" target="_blank" rel="noopener noreferrer">${esc(client.ordering.label)}<span class="vh"> ${esc(o.newTab)}</span></a>`
    : `<span class="btn btn-off">${esc(client.ordering.label)} ${esc(copy.demo.exampleSuffix)}</span>`;
  // Three stations in one pinned stage, lit like the wok, the pass and the customer's hand. The words behind the ticket are decorative (aria-hidden); the ordered steps are the real content,
  // printed on a ticket. The order action sits under the lede; on a phone, where the header has no Order button, it is repeated under the ticket so it stays inside the stage and leaves with it.
  const words = o.steps.map((s) => s.name.split(' ')[0]);   // the first word of each real step, set large behind the ticket
  // the dish being ordered, set at the right of the heading: the first signature plate at the Menu's 1200 px size (a file the site already ships)
  const sig = cfg.signature[0].signature, sw = +sig.width || 1200, wide = sw > 1600;
  const plate = { src: wide ? sig.image.replace(/\.webp$/, '-1200.webp') : sig.image, width: wide ? 1200 : sw, height: wide ? Math.round(sig.height * 1200 / sw) : sig.height, alt: sig.alt };
  const main = `  <div class="order-track">
    <section class="order-head" aria-labelledby="order-title">
      <div class="wrap order-head-grid">
        <h1 id="order-title">${esc(o.h1)}</h1>
        <p class="order-lede">${esc(o.text)}</p>
        <p class="order-action">${action}</p>
        <figure class="order-plate"><img src="${esc(plate.src)}" alt="${esc(plate.alt)}" width="${plate.width}" height="${plate.height}" fetchpriority="high" decoding="async"></figure>
      </div>
    </section>

    <section class="journey" data-p="pin" aria-labelledby="steps-title">
      <div class="journey-pin">${words.length ? `
        <div class="scenes" aria-hidden="true">${words.map((w, i) => `<p class="scene scene-${i + 1}"><span>${esc(w)}</span></p>`).join('')}</div>` : ''}
        <div class="wrap journey-grid">
          <h2 id="steps-title">${esc(o.stepsHeading)}</h2>
          <div class="ticket">
            <p class="ticket-top" aria-hidden="true">${esc(client.brand.name)} <span>${esc(o.pickup.heading)}</span></p>
            ${steps(items, { cls: 'steps-3' })}
          </div>
          <p class="journey-action">${action}</p>
        </div>
      </div>
    </section>
  </div>

  <section class="order-info" aria-label="Pickup, allergies and phone">
    <div class="wrap info-grid">
      <div class="info-pickup lq">
        <h2>${esc(o.pickup.heading)}</h2>
        <p>${esc(o.pickup.text)}</p>
        <p><a class="btn btn-ink" href="${esc(pageHref(cfg, o.pickup.link.page))}">${esc(o.pickup.link.label)}</a></p>
      </div>
      <div class="info-allergy lq">
        <h2>${esc(o.allergy.heading)}</h2>
        <p>${esc(copy.menu.note)}</p>
        <p class="info-call">${esc(o.phone.heading)} <a class="phone" href="${esc(client.contact.phone.href)}">${esc(client.contact.phone.display)}</a>${cfg.demo ? ' <span class="sample-inline">(sample number)</span>' : ''}</p>
      </div>
    </div>
    <button class="pause" type="button" aria-pressed="false" data-lq hidden><span class="pause-ico" aria-hidden="true"></span><span class="pause-txt">Pause motion</span></button>
  </section>

  ${ownerNote(cfg)}`;
  return { main, scripts: ['order.js'], styles: ['order.css'] };
}
