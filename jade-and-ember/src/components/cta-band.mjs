// A closing band: one heading, one sentence, one primary action (the Order page), and an optional secondary text link.
import { esc } from '../lib/util.mjs';
import { orderLink, pageHref } from './shared.mjs';

export function ctaBand(cfg, { heading, text, tone = 'pine', id = '', secondary = null }) {
  return `<section class="cta-band cta-${esc(tone)}"${id ? ` id="${esc(id)}"` : ''} aria-labelledby="${esc(id || 'cta')}-title">
    <div class="wrap cta-grid">
      <h2 id="${esc(id || 'cta')}-title">${esc(heading)}</h2>
      <p class="cta-text">${esc(text)}</p>
      <p class="cta-action">${orderLink(cfg, 'btn btn-ember')}${secondary ? ` <a class="btn btn-ink" href="${esc(pageHref(cfg, secondary.page))}">${esc(secondary.label)}</a>` : ''}</p>
    </div>
  </section>`;
}
