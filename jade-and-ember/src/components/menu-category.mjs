// One menu category: a heading and its items, with leader dots, heat and allergen tags.
import { esc, money, heat } from '../lib/util.mjs';

export function menuCategory(cat) {
  return `
        <section class="cat" id="${esc(cat.id)}" aria-labelledby="${esc(cat.id)}-h">
          <h2 class="cat-title" id="${esc(cat.id)}-h">${esc(cat.name)}</h2>
          <ul class="items">${cat.items.map((it) => `
            <li class="item"><div class="item-head"><span class="item-name">${esc(it.name)}</span>${heat(it.heat)}<span class="leader" aria-hidden="true"></span><span class="price">${money(it.price)}</span></div>
              <p class="item-text">${it.signature ? '<span class="item-fav">House favourite</span>' : ''}${esc(it.text)}${it.tags && it.tags.length ? ` <span class="item-tags">${esc(it.tags.join(', '))}</span>` : ''}</p></li>`).join('')}
          </ul>
        </section>`;
}
