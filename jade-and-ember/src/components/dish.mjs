// A signature dish: the plate on its own, lit from the flame side, with its name, text and price set beside it. textFirst puts the text before the plate.
// The photograph keeps its real pixel size (the signature carries it: see loadConfig). The wrapper is the scroll-progress element (data-p, see site.js).
import { esc, money, heat } from '../lib/util.mjs';
import { frame } from './frame.mjs';

export function dish(item, { textFirst = false, index = 0 } = {}) {
  const s = item.signature;
  const fig = frame({ src: s.image, alt: s.alt, width: s.width || 1200, height: s.height || 800, pos: s.focus });
  const text = `<div class="dish-text">
            <h3>${esc(item.name)}</h3>
            <p class="dish-desc">${esc(s.text)}</p>
            <p class="dish-meta"><span class="price">${money(item.price)}</span>${heat(item.heat)}<span class="tag">${esc((item.tags || []).join(', '))}</span></p>
          </div>`;
  return `
      <article class="dish dish-${index + 1}">
        <div class="wrap dish-in" data-p>
          ${textFirst ? `${text}
          ${fig}` : `${fig}
          ${text}`}
        </div>
      </article>`;
}
