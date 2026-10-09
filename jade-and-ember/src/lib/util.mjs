// Small helpers shared by every component. No dependencies.
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const money = (n) => `$${esc(n)}`;

// Heat dots: always paired with a text label for assistive technology.
export const heat = (n) => (n ? `<span class="heat" role="img" aria-label="Heat ${n} of 3">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>` : '');
