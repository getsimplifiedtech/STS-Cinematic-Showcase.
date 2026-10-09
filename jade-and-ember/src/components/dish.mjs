// A signature dish: a full-width frame and the text set around it. textFirst puts the text above the frame.
import { esc, money, heat } from '../lib/util.mjs';
import { frame } from './frame.mjs';

export function dish(item, { textFirst = false, index = 0 } = {}) {
  const s = item.signature;
  const fig = frame({ src: s.image, alt: s.alt, width: 1200, height: 800, pos: s.focus });
  const text = `<div class="wrap dish-text">
          <h3>${esc(item.name)}</h3>
          <p class="dish-desc">${esc(s.text)}</p>
          <p class="dish-meta"><span class="price">${money(item.price)}</span>${heat(item.heat)}<span class="tag">${esc((item.tags || []).join(', '))}</span></p>
        </div>`;
  return `
      <article class="dish dish-${index + 1}">
        ${textFirst ? `${text}
        ${fig}` : `${fig}
        ${text}`}
      </article>`;
}
