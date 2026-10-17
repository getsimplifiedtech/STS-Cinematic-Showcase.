// A closing band: one heading, one sentence, one primary action (the Order page), and an optional secondary text link. A page may give its closing its own picture (art):
// decorative, lazy, and always one the page already ships, so each page ends on its own subject instead of the same green block.
import { esc } from '../lib/util.mjs';
import { orderLink, pageHref } from './shared.mjs';

export function ctaBand(cfg, { heading, text, tone = 'pine', id = '', art = null, secondary = null }) {
  return `<section class="cta-band cta-${esc(tone)}"${id ? ` id="${esc(id)}"` : ''} aria-labelledby="${esc(id || 'cta')}-title">${art ? `
    <figure class="cta-art" aria-hidden="true"><img src="${esc(art.src)}" alt="" width="${art.width}" height="${art.height}" loading="lazy" decoding="async" style="--pos:${esc(art.pos || '50% 50%')}"></figure>` : ''}
    <div class="wrap cta-grid">
      <h2 id="${esc(id || 'cta')}-title">${esc(heading)}</h2>
      <p class="cta-text">${esc(text)}</p>
      <p class="cta-action">${orderLink(cfg, 'btn btn-ember')}${secondary ? ` <a class="btn btn-ink" href="${esc(pageHref(cfg, secondary.page))}">${esc(secondary.label)}</a>` : ''}</p>
    </div>
  </section>`;
}
