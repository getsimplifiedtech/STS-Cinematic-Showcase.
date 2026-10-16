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
  // printed on a ticket. The order action is a direct child of the track so it can stay in view (sticky) while the stage plays.
  const words = o.steps.map((s) => s.name.split(' ')[0]);   // the first word of each real step, set large behind the ticket
  const main = `  <div class="order-track">
    <section class="order-head" aria-labelledby="order-title">
      <div class="wrap order-head-grid">
        <h1 id="order-title">${esc(o.h1)}</h1>
        <p class="order-lede">${esc(o.text)}</p>
      </div>
    </section>
    <p class="order-action">${action}</p>

    <section class="journey" data-p="pin" aria-labelledby="steps-title">
      <div class="journey-pin">${words.length ? `
        <div class="scenes" aria-hidden="true">${words.map((w, i) => `<p class="scene scene-${i + 1}"><span>${esc(w)}</span></p>`).join('')}</div>` : ''}
        <div class="wrap journey-grid">
          <h2 id="steps-title">${esc(o.stepsHeading)}</h2>
          <div class="ticket">
            <p class="ticket-top" aria-hidden="true">${esc(client.brand.name)} <span>${esc(o.pickup.heading)}</span></p>
            ${steps(items, { cls: 'steps-3' })}
          </div>
        </div>
      </div>
    </section>
  </div>

  <section class="order-info" aria-label="Pickup, allergies and phone">
    <div class="wrap info-grid">
      <div class="info-pickup">
        <h2>${esc(o.pickup.heading)}</h2>
        <p>${esc(o.pickup.text)}</p>
        <p><a class="btn btn-ink" href="${esc(pageHref(cfg, o.pickup.link.page))}">${esc(o.pickup.link.label)}</a></p>
      </div>
      <div class="info-allergy">
        <h2>${esc(o.allergy.heading)}</h2>
        <p>${esc(copy.menu.note)}</p>
        <p class="info-call">${esc(o.phone.heading)} <a class="phone" href="${esc(client.contact.phone.href)}">${esc(client.contact.phone.display)}</a>${cfg.demo ? ' <span class="sample-inline">(sample number)</span>' : ''}</p>
      </div>
    </div>
  </section>

  ${ownerNote(cfg)}`;
  return { main, scripts: [], styles: ['order.css'] };
}
