// Werkbank, Teil 6 von 11: Rad und Teil bearbeiten, zusammenführen.
'use strict';

// ----- Rad bearbeiten -----

const RADARTEN = ['Rennrad', 'Gravel', 'MTB', 'E-MTB', 'Trekking', 'E-Trekking', 'E-City', 'Fitness'];

async function radBearbeiten(id, nachher) {
  const { data, error } = await sb.from('raeder').select('id, hersteller, reihe, modell, baujahr, kategorie, uvp_eur, quelle').eq('id', id).maybeSingle();
  if (error || !data) { window.alert(error ? fehlerText(error) : 'Rad nicht gefunden.'); return; }
  const alt = { ...data, uvp: data.uvp_eur };
  const felder = [['hersteller', 'Marke'], ['modell', 'Voller Modellname (Reihe + Ausstattung)'], ['reihe', 'Modellreihe'],
    ['baujahr', 'Modelljahr', 'number'], ['kategorie', 'Radart', 'select', RADARTEN], ['uvp', 'UVP in €', 'number'], ['quelle', 'Quelle', 'url']];
  const f = formular(felder, alt, 'Speichern');
  f.baujahr.step = '1';
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    mitKnopf(f, async () => {
      const p = aenderungen(f, alt, felder);
      if (!Object.keys(p).length) { dialogZu(); return; }
      if (p.baujahr != null) p.baujahr = Math.round(p.baujahr);
      const neu = await rpc('katalog_rad_aendern', { p: { id, ...p } });
      dialogZu();
      if (nachher) nachher(neu);
    });
  });
  const weg = loeschBlock('Rad löschen', 'Nur für Fehlerfassungen oder doppelte Räder. Die Teile bleiben im Katalog.',
    `${data.hersteller} ${data.modell} (${data.baujahr}) endgültig aus dem Katalog löschen?`, 'katalog_rad_loeschen', id, async () => {
      if (ergaenzen && ergaenzen.rad.id === id) { ergaenzenEnde(); radTeile = []; zeichneTeile(); meldung($('#f-rad .msg'), 'Rad gelöscht.'); }
      if (!$('[data-panel="uebersicht"]').hidden) ladeUebersicht();
    });
  dialog(`${data.hersteller} ${data.modell} (${data.baujahr}) ändern`,
    Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Die Kennung des Rads bleibt gleich, Garagen auf den Handys stimmen also weiter.' }), f, weg);
}

$('#rad-bearbeiten').addEventListener('click', () => {
  if (!ergaenzen) return;
  radBearbeiten(ergaenzen.rad.id, (r) => {
    ergaenzen.rad.name = `${r.hersteller} ${r.modell} (${r.baujahr})`;
    $('#ergaenzen-name').textContent = ergaenzen.rad.name;
    meldung($('#f-rad .msg'), 'Rad-Daten gespeichert.');
  });
});

// ----- Teil bearbeiten und zusammenführen -----

// nachher: wird nach Speichern, Zusammenführen oder Löschen aufgerufen (etwa um die Katalog-Qualität neu zu laden)
async function teilBearbeiten(t, nachher = null) {
  const { data, error } = await sb.from('teile').select('id, marke, name, kategorie, richtpreis_eur, merkmale, ean').eq('id', t.id).maybeSingle();
  if (error || !data) { window.alert(error ? fehlerText(error) : 'Teil nicht gefunden.'); return; }
  const alt = { ...data, preis: data.richtpreis_eur };
  const felder = [['marke', 'Marke'], ['name', 'Name'], ['kategorie', 'Kategorie', 'select', TEIL_KATEGORIEN],
    ['preis', 'Richtpreis in €', 'number'], ['merkmale', 'Merkmale (z. B. 12-fach, 40-622)']];
  const f = formular(felder, alt, 'Speichern');
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    mitKnopf(f, async () => {
      const p = aenderungen(f, alt, felder);
      if (!Object.keys(p).length) { dialogZu(); return; }
      await rpc('katalog_teil_aendern', { p: { id: t.id, ...p } });
      dialogZu();
      ladeTeileliste(true);
      if (nachher) nachher();
    });
  });

  // Zusammenführen: dieses Teil ist doppelt und geht in einem anderen auf
  const zus = document.createElement('div');
  zus.className = 'trenner';
  zus.append(Object.assign(document.createElement('strong'), { textContent: 'Doppelt im Katalog?' }),
    Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Wähle das Teil, das bleiben soll. Räder und Barcodes wandern dorthin, dieser Eintrag wird gelöscht.' }));
  const such = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Anderes Teil suchen' });
  such.setAttribute('aria-label', 'Teil suchen, das bleiben soll');
  const ul = Object.assign(document.createElement('ul'), { className: 'treffer' });
  const zmsg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });
  let timer = null;
  such.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const woerter = woerterAus(such.value);
      if (!woerter.length) { ul.replaceChildren(); return; }
      let q = sb.from('teile').select('id, marke, name, kategorie').neq('id', t.id).limit(10);
      for (const w of woerter) q = q.or(`marke.ilike.*${w}*,name.ilike.*${w}*`);
      const { data: treffer } = await q;
      ul.replaceChildren(...(treffer || []).map((x) => {
        const li = document.createElement('li');
        const b = Object.assign(document.createElement('button'), { type: 'button' });
        b.append(Object.assign(document.createElement('span'), { textContent: `${x.marke} ${x.name}` }),
          Object.assign(document.createElement('small'), { textContent: x.kategorie }));
        b.addEventListener('click', async () => {
          if (!window.confirm(`„${data.marke} ${data.name}“ in „${x.marke} ${x.name}“ aufgehen lassen?\n\nRäder und Barcodes wandern dorthin, „${data.marke} ${data.name}“ wird gelöscht.`)) return;
          try {
            const r = await rpc('katalog_teile_zusammenfuehren', { p_behalten: x.id, p_weg: t.id });
            dialogZu();
            await ladeTeileliste(true);
            meldung($('#tl-hinweis'), `Zusammengeführt. ${r && r.raeder != null ? r.raeder + ' Räder hängen jetzt an ' + x.marke + ' ' + x.name + '.' : ''}`);
          } catch (e) {
            meldung(zmsg, fehlerText(e), true);
          }
        });
        li.append(b);
        return li;
      }));
    }, 300);
  });
  zus.append(such, ul, zmsg);
  const weg = loeschBlock('Teil löschen', 'Nur für Fehleinträge. Geht nur, wenn das Teil an keinem Rad hängt. Sonst lieber zusammenführen.',
    `„${data.marke} ${data.name}“ endgültig aus dem Katalog löschen?`, 'katalog_teil_loeschen', t.id, async () => {
      await ladeTeileliste(true);
      if (nachher) nachher();
      meldung($('#tl-hinweis'), `${data.marke} ${data.name} ist gelöscht.`);
    });
  dialog(`${data.marke} ${data.name}`, f, zus, weg);
}

// Löschen mit zweiter Rückfrage, wenn der Eintrag in gesicherten Garagen steht
function loeschBlock(titel, text, frage, funktion, id, danach) {
  const d = Object.assign(document.createElement('div'), { className: 'trenner' });
  const lmsg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill gefahr klein', textContent: titel });
  b.addEventListener('click', async () => {
    if (!window.confirm(frage)) return;
    b.disabled = true;
    meldung(lmsg, '');
    try {
      try {
        await rpc(funktion, { p_id: id });
      } catch (e) {
        const m = fehlerText(e);
        if (!/gesicherten Garagen/.test(m)) throw e;
        if (!window.confirm(`${m}.\n\nDort verschwindet es aus der Katalog-Liste, eigene Angaben der Nutzer bleiben. Trotzdem löschen?`)) return;
        await rpc(funktion, { p_id: id, p_trotzdem: true });
      }
      dialogZu();
      await danach();
    } catch (e) {
      meldung(lmsg, fehlerText(e), true);
    } finally {
      b.disabled = false;
    }
  });
  d.append(Object.assign(document.createElement('strong'), { textContent: titel }), Object.assign(document.createElement('p'), { className: 'fine', textContent: text }), b, lmsg);
  return d;
}
