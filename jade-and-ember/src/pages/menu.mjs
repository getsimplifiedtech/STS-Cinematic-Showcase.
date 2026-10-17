// Menu: the whole menu on one page. All categories are visible (nothing hidden behind a control, printable, same without JavaScript);
// sticky jump links move between them.
import { esc } from '../lib/util.mjs';
import { menuCategory } from '../components/menu-category.mjs';
import { ctaBand } from '../components/cta-band.mjs';

export default function menu(cfg) {
  // The list region is named "Menu" unless the page heading already is "Menu" (a client's own copy): landmark names must be unique on a page.
  const bodyLabel = String(cfg.copy.menu.h1).trim().toLowerCase() === 'menu' ? 'Menu items' : 'Menu';
  const m = cfg.copy.menu;
  const band = m.band;
  const jump = cfg.menu.categories.map((k) => `<li><a href="#${esc(k.id)}">${esc(k.name)}</a></li>`).join('');
  const dots = (n) => `<span class="legend-dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;

  const bowl = cfg.signature[cfg.signature.length - 1].signature;   // the closing band shows the last signature plate: the Menu already carries it, so the page adds no file
  let photos = 0;   // the panels that carry a photograph take turns: the photograph leads on the left, then the usual layout, then a banner across the top
  const main = `  <section class="menu-head" aria-labelledby="menu-title">
    <div class="wrap menu-head-grid">
      <p class="print-brand">${esc(cfg.client.brand.name)}. ${esc(cfg.client.brand.descriptor)}. ${cfg.client.address.lines.map(esc).join(', ')}.</p>
      <h1 id="menu-title">${esc(m.h1)}</h1>
      <div class="menu-legend">
        <p class="legend-title">${esc(m.legend.heading)}</p>
        <ul class="legend">${m.legend.levels.map((w, i) => `<li>${dots(i + 1)}<span>${esc(w)}</span></li>`).join('')}</ul>
        <p class="menu-note">${esc(m.note)}${cfg.demo ? ` ${esc(cfg.copy.demo.menuSample)}` : ''}</p>
      </div>
    </div>
    <button class="pause" type="button" aria-pressed="false" data-lq hidden><span class="pause-ico" aria-hidden="true"></span><span class="pause-txt">Pause motion</span></button>
  </section>

  <figure class="menu-band"><img src="${esc(band.src)}" alt="${esc(band.alt)}" width="${band.width}" height="${band.height}" fetchpriority="high" decoding="async" style="--pos:${esc(band.pos)}"></figure>

  <nav class="jump" aria-label="Menu categories"><div class="wrap"><ul>${jump}</ul></div></nav>

  <section class="menu-body" aria-label="${bodyLabel}">
    <div class="wrap cats">${cfg.menu.categories.map((k) => menuCategory(k, k.items.some((it) => it.signature && it.signature.image) ? ['left', 'std', 'banner'][photos++ % 3] : 'list')).join('')}
    </div>
  </section>

  ${ctaBand(cfg, { ...m.orderBand, tone: 'pine', id: 'order-band', art: { src: bowl.image, width: bowl.width, height: bowl.height, pos: '50% 62%' } })}`;

  return { main, scripts: ['menu.js'], styles: ['menu.css'] };
}
