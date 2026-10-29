// Hinweise zu einem Katalograd ohne Anmeldung. Landen wie die Korrekturen aus der App in der Tabelle vorschlaege
// (art 'korrektur', daten.herkunft 'website') und werden in der Werkbank unter Freigaben, „Von der Website“, geprüft.
// Gegen Massen-Einsendungen bremst der Server (Trigger vorschlag_bremse, zählt je Anschluss), hier nur eine Falle für Bots.
(() => {
  'use strict';
  const SERVER = { url: 'https://axiirnfgtbmmjlfwlyfe.supabase.co', key: 'sb_publishable_dBz5uK-7wYwKKL3O8Qd0MA_pYzxTP_2' };
  const GRUENDE = {
    falsch: { frage: 'Was ist an deinem Rad verbaut?', beispiel: 'z. B. Shimano CN-M8100 statt CN-M7100', mitTeil: true },
    fehlt: { frage: 'Welches Teil fehlt?', beispiel: 'z. B. Sattelstütze Fox Transfer 150 mm' },
    zuviel: { frage: 'Magst du kurz sagen, warum?', beispiel: 'z. B. Rad hat keinen Umwerfer', mitTeil: true, frei: true },
    rad: { frage: 'Was stimmt am Rad nicht?', beispiel: 'z. B. Modelljahr ist 2025, nicht 2024' },
    sonst: { frage: 'Was sollen wir verbessern?', beispiel: 'Beschreib es in ein, zwei Sätzen' },
  };
  // Zufällige Kennung nur für diesen Seitenaufruf, nichts wird im Browser gespeichert
  const kennung = 'web-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const geladen = Date.now();

  // Das Formular ist eingeklappt: Links auf #verbessern (Inhaltsspalte, Unterhalt) klappen es auf
  const oeffnen = () => {
    const d = document.getElementById('verbessern');
    if (d && location.hash === '#verbessern' && d.tagName === 'DETAILS') { d.open = true; d.scrollIntoView(); }
  };
  window.addEventListener('hashchange', oeffnen);
  for (const a of document.querySelectorAll('a[href="#verbessern"]')) {
    a.addEventListener('click', () => { const d = document.getElementById('verbessern'); if (d) d.open = true; });
  }
  oeffnen();

  for (const f of document.querySelectorAll('.vs-form')) {
    const msg = f.querySelector('.msg');
    const teilFeld = f.querySelector('.vs-teil');
    const textLabel = f.elements.text.closest('label');
    const zeigen = (text, fehler) => { msg.hidden = !text; msg.textContent = text; msg.classList.toggle('fehler', !!fehler); };
    const grund = () => GRUENDE[(f.querySelector('input[name=grund]:checked') || {}).value];

    f.addEventListener('change', (ev) => {
      if (ev.target.name !== 'grund') return;
      const g = grund();
      teilFeld.hidden = !g.mitTeil;
      textLabel.firstChild.textContent = g.frage + ' ';
      f.querySelector('.vs-frei').hidden = !g.frei;
      f.elements.text.placeholder = g.beispiel;
      zeigen('');
    });

    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const wahl = f.querySelector('input[name=grund]:checked');
      const g = grund();
      const text = f.elements.text.value.trim();
      const teil = f.elements.teil.value;
      const fehlt = !g ? 'Wähl aus, was nicht stimmt.' : g.mitTeil && !teil ? 'Wähl das Teil aus.' : !g.frei && !text ? 'Schreib kurz, was richtig ist.' : '';
      if (fehlt) { zeigen(fehlt, true); return; }
      const knopf = f.querySelector('button[type=submit]');
      // Bots füllen das versteckte Feld oder schicken sofort ab: so tun, als hätte es geklappt
      if (f.elements.webseite.value || Date.now() - geladen < 3000) { fertig(); return; }
      const daten = { herkunft: 'website', rad_id: f.dataset.rad, titel: f.dataset.titel.slice(0, 100), grund: wahl.value, text: text.slice(0, 1000) };
      if (g.mitTeil && teil) {
        daten.teil_id = teil;
        daten.teil_name = f.elements.teil.selectedOptions[0].textContent.replace(/^[^:]*:\s*/, '').slice(0, 80);
      }
      const beleg = f.elements.beleg.value.trim();
      if (beleg) daten.beleg = beleg.slice(0, 300);
      knopf.disabled = true;
      zeigen('Wird gesendet …');
      try {
        const res = await fetch(`${SERVER.url}/rest/v1/vorschlaege`, {
          method: 'POST',
          headers: { apikey: SERVER.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ art: 'korrektur', daten, geraet: kennung }),
        });
        if (!res.ok) throw new Error(String(res.status));
        fertig();
      } catch {
        zeigen('Das hat leider nicht geklappt. Versuch es bitte später noch einmal oder schreib uns an kontakt@radgarage.app.', true);
        knopf.disabled = false;
      }
    });

    function fertig() {
      f.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'msg',
        textContent: 'Danke für deinen Hinweis! Wir prüfen ihn und korrigieren den Katalog, wenn er stimmt. Die Korrektur kommt dann in die App und auf diese Seite.',
      }));
    }
  }
})();
