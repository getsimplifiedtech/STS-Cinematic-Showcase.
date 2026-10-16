// Our story: the name is the building. The page opens on 玉火 set monumentally, lit from below as the visitor scrolls (the fire climbs into the strokes), then the
// headline rises out of it and the short chapters follow. The characters are decorative here (aria-hidden); the last section says in words what they mean.
import { esc } from '../lib/util.mjs';
import { ctaBand } from '../components/cta-band.mjs';

export default function story(cfg) {
  const s = cfg.copy.story;
  const img = s.image;
  // The room chapter carries the jade-bowls photograph as a quiet plate behind its text (the same image the v0.9 page led with).
  const plate = `
        <figure class="story-plate"><img src="${esc(img.src)}" alt="${esc(img.alt)}" width="${img.width}" height="${img.height}" loading="lazy" decoding="async"><figcaption>${esc(s.caption)}</figcaption></figure>`;
  const chapter = (c) => `
      <section class="chapter chapter-${esc(c.id)}" aria-labelledby="${esc(c.id)}-h">${c.id === 'room' ? plate : ''}
        <div class="chapter-body" data-p>
          <h2 id="${esc(c.id)}-h">${esc(c.heading)}</h2>
          ${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n          ')}
        </div>
      </section>`;
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
    <div class="wrap name-grid">
      <h2 id="name-h">${esc(s.name.heading)}</h2>
      <p class="name-line">${esc(s.name.line)}</p>
      <p class="name-note">${esc(s.name.note).replace(/[一-鿿]/g, (ch) => `<span lang="zh-Hans">${ch}</span>`)}</p>
    </div>
  </section>

  ${ctaBand(cfg, { ...s.orderBand, tone: 'pine', id: 'order-band' })}`;
  return { main, scripts: ['story.js'], styles: ['story.css'] };
}
