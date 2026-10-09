// A holding page for the pages built in the second implementation gate, so the shared navigation never leads to a dead link.
// It uses the real header and footer; its body is deliberately plain and says what it is.
import { esc } from '../lib/util.mjs';

export default function pending(cfg, page) {
  const c = cfg.copy[page.id];
  const main = `  <section class="pending" aria-labelledby="pending-title">
    <div class="wrap pending-grid">
      <h1 id="pending-title">${esc(c.h1)}</h1>
      <p class="pending-note">${esc(cfg.copy.demo.pendingNote)}</p>
      <p><a class="btn btn-ink" href="${esc(cfg.byId.home.file)}">Back to Home</a></p>
    </div>
  </section>`;
  return { main, scripts: [] };
}
