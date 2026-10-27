// Feedback ohne Anmeldung. Landet in der Tabelle feedback und geht zusätzlich als Mail an feedback@radgarage.app;
// gelesen und abgehakt wird es in der Werkbank unter „Feedback“.
// Gegen Massen-Einsendungen bremst der Server (Trigger feedback_bremse, zählt je Anschluss), hier nur eine Falle für Bots.
(() => {
  'use strict';
  const SERVER = { url: 'https://axiirnfgtbmmjlfwlyfe.supabase.co', key: 'sb_publishable_dBz5uK-7wYwKKL3O8Qd0MA_pYzxTP_2' };
  const FRAGEN = {
    verbesserung: ['Was kann besser werden?', 'z. B. Die Kilometer möchte ich auch in Meilen sehen'],
    funktion: ['Welche Funktion fehlt dir?', 'z. B. Fahrten automatisch aus Strava übernehmen'],
    katalog: ['Welches Rad oder Teil fehlt?', 'z. B. Rose Backroad AL 2025, oder: Bremsbeläge für Magura MT5'],
    sonstiges: ['Was möchtest du uns sagen?', 'Lob, Kritik, Ideen: alles willkommen'],
  };
  // Zufällige Kennung nur für diesen Seitenaufruf, nichts wird im Browser gespeichert
  const kennung = 'web-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const geladen = Date.now();
  const f = document.querySelector('.fb-form');
  if (!f) return;
  const msg = f.querySelector('.msg');
  const zaehler = f.querySelector('.zaehler');
  const zeigen = (text, fehler) => { msg.hidden = !text; msg.textContent = text; msg.classList.toggle('fehler', !!fehler); };

  f.addEventListener('change', (ev) => {
    if (ev.target.name !== 'kategorie') return;
    const [frage, beispiel] = FRAGEN[ev.target.value];
    f.querySelector('.fb-frage').textContent = frage;
    f.elements.text.placeholder = beispiel;
    zeigen('');
  });
  f.elements.text.addEventListener('input', () => { zaehler.textContent = `${f.elements.text.value.length} / 3000`; });

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const kategorie = (f.querySelector('input[name=kategorie]:checked') || {}).value;
    const text = f.elements.text.value.trim();
    const email = f.elements.email.value.trim();
    const fehlt = !kategorie ? 'Wähl aus, worum es geht.'
      : text.length < 3 ? 'Schreib bitte kurz, was du uns sagen möchtest.'
      : email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'Die E-Mail-Adresse sieht nicht ganz richtig aus.' : '';
    if (fehlt) { zeigen(fehlt, true); return; }
    // Bots füllen das versteckte Feld oder schicken sofort ab: so tun, als hätte es geklappt
    if (f.elements.webseite.value || Date.now() - geladen < 3000) { fertig(!!email); return; }
    const knopf = f.querySelector('button[type=submit]');
    knopf.disabled = true;
    zeigen('Wird gesendet …');
    const daten = { kategorie, text: text.slice(0, 3000), geraet: kennung, herkunft: 'website' };
    if (email) daten.email = email.slice(0, 200);
    if (f.elements.wer.value) daten.wer = f.elements.wer.value;
    try {
      const res = await fetch(`${SERVER.url}/rest/v1/feedback`, {
        method: 'POST',
        headers: { apikey: SERVER.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(daten),
      });
      if (!res.ok) throw new Error(String(res.status));
      fertig(!!email);
    } catch {
      zeigen('Das hat leider nicht geklappt. Versuch es bitte später noch einmal oder schreib uns an feedback@radgarage.app.', true);
      knopf.disabled = false;
    }
  });

  function fertig(mitMail) {
    f.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'msg',
      textContent: mitMail
        ? 'Danke für dein Feedback! Wir lesen jede Nachricht und melden uns, wenn wir Fragen haben oder es umgesetzt ist.'
        : 'Danke für dein Feedback! Wir lesen jede Nachricht und sammeln, was oft gewünscht wird.',
    }));
  }
})();
