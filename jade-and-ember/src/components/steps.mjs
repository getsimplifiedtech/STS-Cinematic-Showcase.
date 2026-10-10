// An ordered process joined by one line. Use only for a real sequence (the wok-hei steps; the ordering steps).
// Items: { name, text, link?: { href, label } }. Text is escaped; links are rendered after it.
import { esc } from '../lib/util.mjs';

export function steps(items, { cls = '' } = {}) {
  return `<ol class="steps${cls ? ' ' + cls : ''}">${items.map((it, i) => `
        <li><h3><span class="step-no" aria-hidden="true">${i + 1}</span>${esc(it.name)}</h3><p>${esc(it.text)}${it.link ? ` <a href="${esc(it.link.href)}">${esc(it.link.label)}</a>` : ''}</p></li>`).join('')}
      </ol>`;
}
