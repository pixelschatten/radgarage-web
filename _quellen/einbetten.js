// Rechner zum Einbetten (/einbetten/…): meldet der einbettenden Seite die eigene Höhe, damit das iframe mitwächst.
// Auf /einbetten/ selbst passt es die Vorschau-iframes an und kopiert den Code. Quelle: _quellen/einbetten.js.
(() => {
  'use strict';
  if (document.body.classList.contains('eingebettet')) {
    if (window.parent === window) return;
    let zuletzt = 0;
    const melden = () => {
      const hoehe = Math.ceil(document.body.offsetHeight);
      if (hoehe === zuletzt) return;
      zuletzt = hoehe;
      window.parent.postMessage({ radgarageHoehe: hoehe }, '*');
    };
    new ResizeObserver(melden).observe(document.body);
    addEventListener('load', melden);
    return;
  }
  addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || !ev.data || !ev.data.radgarageHoehe) return;
    for (const f of document.querySelectorAll('iframe.einbett-vorschau')) {
      if (f.contentWindow === ev.source) f.style.height = `${ev.data.radgarageHoehe}px`;
    }
  });
  for (const knopf of document.querySelectorAll('[data-kopieren]')) {
    knopf.addEventListener('click', async () => {
      const feld = document.getElementById(knopf.dataset.kopieren);
      try {
        await navigator.clipboard.writeText(feld.value);
      } catch (e) {
        feld.select();
        document.execCommand('copy');
      }
      const text = knopf.textContent;
      knopf.textContent = 'Kopiert';
      setTimeout(() => { knopf.textContent = text; }, 1800);
    });
  }
})();
