// A closing band: one heading, one sentence, one action (ember button or text link).
import { esc } from '../lib/util.mjs';
import { orderLink } from './shared.mjs';

export function ctaBand(cfg, { heading, text, tone = 'pine', id = '' }) {
  return `<section class="cta-band cta-${esc(tone)}"${id ? ` id="${esc(id)}"` : ''} aria-labelledby="${esc(id || 'cta')}-title">
    <div class="wrap cta-grid">
      <h2 id="${esc(id || 'cta')}-title">${esc(heading)}</h2>
      <p class="cta-text">${esc(text)}</p>
      <p class="cta-action">${orderLink(cfg, 'btn btn-ember')}</p>
    </div>
  </section>`;
}
