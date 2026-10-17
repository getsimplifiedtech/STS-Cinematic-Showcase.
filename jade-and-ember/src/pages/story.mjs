// Our story: the name is the building. The page opens on 玉火 set monumentally, lit from below as the visitor scrolls (the fire climbs into the strokes), then the
// headline rises out of it and the short chapters follow. The characters are decorative here (aria-hidden); the last section says in words what they mean.
import { esc } from '../lib/util.mjs';
import { ctaBand } from '../components/cta-band.mjs';

// The pictures of the question and the wok chapters: two stills the site already ships (the steam plate and the hero still, cropped differently, with their phone crops).
// They are art direction, not client copy, so they live with the page renderer (the shared copy schema has no field for them); the room chapter uses copy.story.image.
const ART = {
  question: { src: 'media/steam-plate.webp', width: 1920, height: 1080, pos: '58% 44%', alt: 'A black carbon-steel wok of beef and broccoli over a gas flame, steam rising from the food.', mobile: { src: 'media/steam-plate-m.webp', width: 810, height: 1440, pos: '71% 62%' } },
  wok: { src: 'media/hero-wok-v2.webp', width: 1928, height: 1072, pos: '42% 72%', alt: 'Flame curls up the side of a seasoned carbon-steel wok on a cast-iron burner, the food mid-toss.', mobile: { src: 'media/hero-wok-v2-m.webp', width: 810, height: 1440, pos: '71% 70%' } },
};

export default function story(cfg) {
  const s = cfg.copy.story;
  const img = s.image;
  // Every chapter is a pair: its words and one picture, alternating sides down the page. The question and the wok use stills the site already ships (the steam plate and the
  // hero still, cropped differently, with their phone crops); the room keeps the jade-bowls photograph. The pictures are lazy: only the opening and the words load first.
  const pic = (i, extra = '') => `<figure class="chapter-fig">
          <picture>${i.mobile ? `<source media="(max-width: 759px)" srcset="${esc(i.mobile.src)}" width="${i.mobile.width}" height="${i.mobile.height}">` : ''}<img src="${esc(i.src)}" alt="${esc(i.alt)}" width="${i.width}" height="${i.height}" loading="lazy" decoding="async" style="--pos:${esc(i.pos || '50% 50%')}${i.mobile?.pos ? `;--focus-m:${esc(i.mobile.pos)}` : ''}"></picture>${extra}
        </figure>`;
  const chapter = (c) => {
    const fig = ART[c.id] ? pic(ART[c.id]) : c.id === 'room' ? pic({ ...img, pos: '50% 50%' }, `<figcaption>${esc(s.caption)}</figcaption>`) : '';
    return `
      <section class="chapter chapter-${esc(c.id)}${fig ? ' has-fig' : ''}" aria-labelledby="${esc(c.id)}-h" data-p>
        <div class="chapter-body">
          <h2 id="${esc(c.id)}-h">${esc(c.heading)}</h2>
          ${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n          ')}
        </div>
        ${fig}
      </section>`;
  };

  const main = `  <section class="story-open" data-p="pin" aria-labelledby="story-title">
    <div class="story-pin">
      <p class="name-glyph" lang="zh-Hans" aria-hidden="true"><span class="g-jade">${esc(s.name.characters[0])}</span><span class="g-fire">${esc(s.name.characters[1])}</span></p>
      <canvas class="embers" aria-hidden="true"></canvas>
      <div class="story-intro"><h1 id="story-title">${esc(s.h1)}</h1></div>
      <button class="pause" type="button" aria-pressed="false" hidden><span class="pause-ico" aria-hidden="true"></span><span class="pause-txt">Pause motion</span></button>
    </div>
  </section>

  <div class="chapters">
    <div class="wrap">${s.chapters.map(chapter).join('')}
    </div>
  </div>

  <section class="name" aria-labelledby="name-h">
    <div class="wrap"><div class="name-grid lq">
      <h2 id="name-h">${esc(s.name.heading)}</h2>
      <p class="name-line">${esc(s.name.line)}</p>
      <p class="name-note">${esc(s.name.note).replace(/[一-鿿]/g, (ch) => `<span lang="zh-Hans">${ch}</span>`)}</p>
    </div></div>
  </section>

  ${ctaBand(cfg, { ...s.orderBand, tone: 'pine', id: 'order-band', art: { ...ART.wok, pos: '40% 86%' } })}`;
  return { main, scripts: ['story.js'], styles: ['story.css'] };
}
