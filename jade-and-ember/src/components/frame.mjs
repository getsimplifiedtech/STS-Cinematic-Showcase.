// An edge-to-edge photograph with no frame or card. Width and height are always set (no layout shift); alt text is required unless decorative.
import { esc } from '../lib/util.mjs';

export function frame({ src, alt = '', width, height, pos = '50% 50%', loading = 'lazy', priority = false, cls = '' }) {
  const attrs = `src="${esc(src)}" alt="${esc(alt)}" width="${width}" height="${height}" ${priority ? 'fetchpriority="high" decoding="async"' : `loading="${loading}" decoding="async"`} style="--pos:${esc(pos)}"`;
  return `<figure class="dish-fig${cls ? ' ' + cls : ''}"><img ${attrs}></figure>`;
}
