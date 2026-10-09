// An ordered process joined by one line. Use only for a real sequence (the wok-hei steps; the ordering steps).
import { esc } from '../lib/util.mjs';

export function steps(items) {
  return `<ol class="steps">${items.map((it, i) => `
        <li><h3><span class="step-no" aria-hidden="true">${i + 1}</span>${esc(it.name)}</h3><p>${esc(it.text)}</p></li>`).join('')}
      </ol>`;
}
