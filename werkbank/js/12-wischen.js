// Werkbank, Teil 12: Wischleisten am Handy. Umschalter, die breiter als der Bildschirm sind, blenden am Rand aus,
// solange es in diese Richtung weitergeht, und schieben die gewählte Option ins Bild.
'use strict';

function wischRaender(el) {
  const rest = el.scrollWidth - el.clientWidth;
  el.classList.toggle('wisch-links', rest > 1 && el.scrollLeft > 1);
  el.classList.toggle('wisch-rechts', rest > 1 && el.scrollLeft < rest - 1);
}
function wischGewaehlte(el) {
  const a = el.querySelector('[aria-checked="true"], [aria-selected="true"]');
  if (!a || el.scrollWidth <= el.clientWidth) return;
  const d = a.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (d.left < r.left) el.scrollLeft += d.left - r.left - 12;
  else if (d.right > r.right) el.scrollLeft += d.right - r.right + 12;
}
for (const el of $$('main .segment')) {
  el.addEventListener('scroll', () => wischRaender(el), { passive: true });
  // Auch beim ersten Sichtbarwerden eines Reiters (Größe 0 -> echte Breite)
  new ResizeObserver(() => { wischGewaehlte(el); wischRaender(el); }).observe(el);
  new MutationObserver(() => { wischGewaehlte(el); wischRaender(el); })
    .observe(el, { attributes: true, subtree: true, attributeFilter: ['aria-checked', 'aria-selected'] });
}
