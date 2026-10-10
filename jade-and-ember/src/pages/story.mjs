// Our story: why this place exists, in short chapters. The page's one bold typographic moment is the seal itself, set very large in the last chapter.
import { esc } from '../lib/util.mjs';
import { ctaBand } from '../components/cta-band.mjs';

export default function story(cfg) {
  const s = cfg.copy.story;
  const img = s.image;
  const chapter = (c) => `
      <section class="chapter" aria-labelledby="${esc(c.id)}-h">
        <div class="chapter-body">
          <h2 id="${esc(c.id)}-h">${esc(c.heading)}</h2>
          ${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n          ')}
        </div>
      </section>`;
  const main = `  <section class="story-head" aria-labelledby="story-title">
    <div class="wrap"><h1 id="story-title">${esc(s.h1)}</h1></div>
  </section>

  <figure class="story-fig">
    <img src="${esc(img.src)}" alt="${esc(img.alt)}" width="${img.width}" height="${img.height}" fetchpriority="high" decoding="async">
    <figcaption class="wrap">${esc(s.caption)}</figcaption>
  </figure>

  <div class="chapters"><div class="wrap">${s.chapters.map(chapter).join('')}
  </div></div>

  <section class="name" aria-labelledby="name-h">
    <div class="wrap name-grid">
      <p class="seal-xl" lang="zh-Hans" aria-hidden="true"><span>${esc(s.name.characters[0])}</span><span>${esc(s.name.characters[1])}</span></p>
      <div class="name-text">
        <h2 id="name-h">${esc(s.name.heading)}</h2>
        <p class="name-line">${esc(s.name.line)}</p>
        <p class="name-note">${esc(s.name.note).replace(/[\u4e00-\u9fff]/g, (ch) => `<span lang="zh-Hans">${ch}</span>`)}</p>
      </div>
    </div>
  </section>

  ${ctaBand(cfg, { ...s.orderBand, tone: 'lacquer', id: 'order-band' })}`;
  return { main, scripts: [] };
}
