// One menu category: a heading and its items, with leader dots, heat and allergen tags. A category that holds a signature dish opens with that dish's photograph
// as a full plate (the item itself stays in the list, so the text is complete without the picture). data-p lets the lacquer panel catch the light as it scrolls.
import { esc, money, heat } from '../lib/util.mjs';

// variant: how the panel is composed (list: no photograph, the items run full width; left: the photograph leads on the left; std: title left, photograph and items right; banner: the photograph runs across the top).
export function menuCategory(cat, variant = 'std') {
  const sig = cat.items.find((it) => it.signature && it.signature.image);
  // A photograph wider than 1600 px (the Home sequence draws the beef at 2400 px) is served here at 1200 px (`name-1200.webp` beside it) with the full file as the high-density candidate.
  let plate = '';
  if (sig) {
    const s = sig.signature, w = +s.width || 1200, h = +s.height || 800, wide = w > 1600;
    const src = wide ? s.image.replace(/\.webp$/, '-1200.webp') : s.image;
    plate = `
          <figure class="cat-plate"><img src="${esc(src)}"${wide ? ` srcset="${esc(src)} 1200w, ${esc(s.image)} ${w}w" sizes="(min-width: 1024px) 640px, 100vw"` : ''} alt="${esc(s.alt)}" width="${wide ? 1200 : w}" height="${wide ? Math.round(h * 1200 / w) : h}" loading="lazy" decoding="async" style="--pos:${esc(s.focus || '50% 50%')}"></figure>`;
  }
  return `
        <section class="cat cat-${plate ? variant : 'list'}" data-p id="${esc(cat.id)}" aria-labelledby="${esc(cat.id)}-h">
          <h2 class="cat-title" id="${esc(cat.id)}-h">${esc(cat.name)}</h2>${plate}
          <ul class="items">${cat.items.map((it) => `
            <li class="item"><div class="item-head"><span class="item-name">${esc(it.name)}</span>${heat(it.heat)}<span class="leader" aria-hidden="true"></span><span class="price">${money(it.price)}</span></div>
              <p class="item-text">${it.signature ? '<span class="item-fav">House favourite</span>' : ''}${esc(it.text)}${it.tags && it.tags.length ? ` <span class="item-tags">${esc(it.tags.join(', '))}</span>` : ''}</p></li>`).join('')}
          </ul>
        </section>`;
}
