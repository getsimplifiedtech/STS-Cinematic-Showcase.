// One menu category: a heading and its items, with leader dots, heat and allergen tags. A category that holds a signature dish opens with that dish's photograph
// as a full plate (the item itself stays in the list, so the text is complete without the picture). data-p lets the lacquer panel catch the light as it scrolls.
import { esc, money, heat } from '../lib/util.mjs';

export function menuCategory(cat) {
  const sig = cat.items.find((it) => it.signature && it.signature.image);
  const plate = sig ? `
          <figure class="cat-plate"><img src="${esc(sig.signature.image)}" alt="${esc(sig.signature.alt)}" width="${+sig.signature.width || 1200}" height="${+sig.signature.height || 800}" loading="lazy" decoding="async" style="--pos:${esc(sig.signature.focus || '50% 50%')}"></figure>` : '';
  return `
        <section class="cat" data-p id="${esc(cat.id)}" aria-labelledby="${esc(cat.id)}-h">
          <h2 class="cat-title" id="${esc(cat.id)}-h">${esc(cat.name)}</h2>${plate}
          <ul class="items">${cat.items.map((it) => `
            <li class="item"><div class="item-head"><span class="item-name">${esc(it.name)}</span>${heat(it.heat)}<span class="leader" aria-hidden="true"></span><span class="price">${money(it.price)}</span></div>
              <p class="item-text">${it.signature ? '<span class="item-fav">House favourite</span>' : ''}${esc(it.text)}${it.tags && it.tags.length ? ` <span class="item-tags">${esc(it.tags.join(', '))}</span>` : ''}</p></li>`).join('')}
          </ul>
        </section>`;
}
