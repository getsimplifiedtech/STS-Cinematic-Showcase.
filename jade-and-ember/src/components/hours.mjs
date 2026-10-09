// Opening hours from the one client source. "table" is for the Visit page; "compact" is the Home strip.
import { esc } from '../lib/util.mjs';

export function hours(cfg, { variant = 'table' } = {}) {
  const rows = cfg.client.hours.rows;
  if (variant === 'compact') {
    return `<dl class="hours-compact">${rows.map((r) => `<div><dt>${esc(r.days)}</dt><dd>${esc(r.time)}</dd></div>`).join('')}</dl>`;
  }
  return `<table class="hours"><caption class="vh">Opening hours${cfg.demo ? ' (sample)' : ''}</caption><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.days)}</th><td>${esc(r.time)}</td></tr>`).join('')}</tbody></table>`;
}
