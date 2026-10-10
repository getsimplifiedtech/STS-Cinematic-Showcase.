// The note for restaurant owners (the commercial audience of this STS demonstration). Demo flag only, and only while the order button is the
// nonfunctional example: a client build, or a demo with a live ordering URL, never renders it.
import { esc } from '../lib/util.mjs';

export function ownerNote(cfg) {
  if (!cfg.demo || cfg.live) return '';   // only the nonfunctional example state needs explaining
  const d = cfg.copy.demo;
  return `<section class="owner" aria-labelledby="owner-title">
    <div class="wrap owner-grid">
      <h2 id="owner-title" class="note-title">${esc(d.ownerNoteTitle)}</h2>
      <div class="owner-body"><p>${esc(d.demoNote)}</p><p>${esc(d.platformNote)}</p></div>
    </div>
  </section>`;
}
