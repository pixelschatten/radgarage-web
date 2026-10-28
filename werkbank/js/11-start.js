// Werkbank, Teil 11 von 11: CSV-Export, Suche über alles, Start.
'use strict';

// ---------- CSV-Export ----------
// Semikolon und BOM, damit Excel mit deutschen Einstellungen Umlaute und Spalten richtig liest

function csvLaden(name, kopf, zeilen) {
  const feld = (v) => {
    const t = v == null ? '' : Array.isArray(v) ? v.join(' ') : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const text = [kopf, ...zeilen].map((z) => z.map(feld).join(';')).join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })),
    download: `radgarage-${name}-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Ganze Tabelle seitenweise holen (Supabase liefert höchstens 1000 Zeilen am Stück)
async function alleZeilen(tabelle, spalten, sortierung) {
  const out = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await sb.from(tabelle).select(spalten).order(sortierung).range(von, von + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

function csvKnopf(id, fn) {
  $(id).addEventListener('click', async () => {
    const b = $(id);
    const text = b.textContent;
    b.disabled = true;
    b.textContent = 'Lade …';
    try { await fn(); } catch (e) { window.alert(fehlerText(e)); } finally { b.disabled = false; b.textContent = text; }
  });
}
csvKnopf('#csv-raeder', async () => {
  const r = await alleZeilen('raeder', 'id, hersteller, reihe, modell, baujahr, kategorie, uvp_eur, quelle, geprueft, geaendert', 'id');
  csvLaden('raeder', ['ID', 'Marke', 'Reihe', 'Modell', 'Modelljahr', 'Radart', 'UVP', 'Quelle', 'Geprüft', 'Geändert'],
    r.map((x) => [x.id, x.hersteller, x.reihe, x.modell, x.baujahr, x.kategorie, x.uvp_eur, x.quelle, x.geprueft ? 'ja' : 'nein', x.geaendert]));
});
csvKnopf('#csv-teile', async () => {
  const t = await alleZeilen('teile', 'id, marke, name, kategorie, merkmale, richtpreis_eur, ean, geprueft, geaendert', 'id');
  csvLaden('teile', ['ID', 'Marke', 'Name', 'Kategorie', 'Merkmale', 'Richtpreis', 'Barcodes', 'Geprüft', 'Geändert'],
    t.map((x) => [x.id, x.marke, x.name, x.kategorie, x.merkmale, x.richtpreis_eur, x.ean, x.geprueft ? 'ja' : 'nein', x.geaendert]));
});
csvKnopf('#csv-zuordnung', async () => {
  const [r, t, z] = await Promise.all([
    alleZeilen('raeder', 'id, hersteller, modell, baujahr', 'id'),
    alleZeilen('teile', 'id, marke, name, kategorie', 'id'),
    alleZeilen('rad_teile', 'rad_id, teil_id, position', 'rad_id'),
  ]);
  const rad = new Map(r.map((x) => [x.id, x]));
  const teil = new Map(t.map((x) => [x.id, x]));
  z.sort((a, b) => a.rad_id.localeCompare(b.rad_id) || a.position - b.position);
  csvLaden('raeder-teile', ['Rad-ID', 'Rad', 'Modelljahr', 'Kategorie', 'Teil-ID', 'Teil'], z.map((x) => {
    const a = rad.get(x.rad_id) || {};
    const b = teil.get(x.teil_id) || {};
    return [x.rad_id, `${a.hersteller || ''} ${a.modell || ''}`.trim(), a.baujahr, b.kategorie, x.teil_id, `${b.marke || ''} ${b.name || ''}`.trim()];
  }));
});
csvKnopf('#csv-verlauf', async () => {
  if (vlLimit < 500) { vlLimit = 500; await ladeVerlauf(); }
  csvLaden('verlauf', ['Wann', 'Wer', 'Art', 'Text', 'Rad-ID', 'Teil-ID'],
    verlaufGefiltert().map((v) => [v.wann, v.von, VERLAUF_TEXTE[v.art] || v.art, v.text, v.rad_id, v.teil_id]));
});
csvKnopf('#csv-konten', async () => {
  csvLaden('konten', ['E-Mail', 'Anmeldung über', 'Registriert', 'Zuletzt angemeldet', 'Bestätigt', 'Premium', 'Familie', 'Räder', 'Rolle', '2FA', 'Gesperrt bis'],
    kontenGefiltert().map((k) => [k.email, (k.anbieter || []).map((a) => ANBIETER[a] || a), k.registriert, k.letzte_anmeldung, k.bestaetigt ? 'ja' : 'nein',
      k.premium || '', k.familie || '', k.raeder || 0, k.rolle || '', k.zwei_faktor ? 'ja' : 'nein', gesperrt(k) ? k.gesperrt_bis : '']));
});

// ---------- Suche über alles (Strg+K oder /) ----------

let sucheNr = 0;
function sucheOeffnen() {
  if ($('#s-werkbank').hidden) return;
  const admin = darf('konten_sehen');
  const feld = Object.assign(document.createElement('input'), { type: 'search', placeholder: admin ? 'Rad, Teil, Barcode oder E-Mail' : 'Rad, Teil oder Barcode', autocomplete: 'off' });
  const box = document.createElement('div');
  let timer = null;
  feld.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => sucheLos(feld.value, box), 200); });
  feld.addEventListener('keydown', (ev) => {
    const knoepfe = $$('button', box);
    if (!knoepfe.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(ev.key)) return;
    ev.preventDefault();
    let i = knoepfe.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    if (ev.key === 'Enter') { (knoepfe[i] || knoepfe[0]).click(); return; }
    i = ev.key === 'ArrowDown' ? Math.min(knoepfe.length - 1, i + 1) : Math.max(0, i - 1);
    knoepfe.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    knoepfe[i].scrollIntoView({ block: 'nearest' });
  });
  dialog('Suchen', feld, box, Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Pfeiltasten wählen, Enter öffnet, Esc schließt.' }));
}

async function sucheLos(text, box) {
  const nr = ++sucheNr;
  const woerter = woerterAus(text).slice(0, 4);
  if (!woerter.length) { box.replaceChildren(); return; }
  const ziffern = text.replace(/\D/g, '');
  const admin = darf('konten_sehen');
  let qr = sb.from('raeder').select('id, hersteller, modell, baujahr, kategorie').limit(8);
  for (const w of woerter) qr = qr.or(`hersteller.ilike.*${w}*,modell.ilike.*${w}*,id.ilike.*${w}*`);
  let qt = sb.from('teile').select('id, marke, name, kategorie, ean').limit(8);
  if (ziffern.length >= 8 && ziffern.length === text.trim().length) qt = qt.contains('ean', [ziffern]);
  else for (const w of woerter) qt = qt.or(`marke.ilike.*${w}*,name.ilike.*${w}*,id.ilike.*${w}*`);
  const [r, t] = await Promise.all([qr, qt]);
  if (admin && !konten.length) { try { konten = (await rpc('konten_liste')) || []; } catch { /* ohne Konten weiter */ } }
  if (nr !== sucheNr) return;
  const such = text.trim().toLowerCase();
  const k = admin && such.length >= 2 ? konten.filter((x) => (x.email || '').toLowerCase().includes(such)).slice(0, 6) : [];
  const gruppe = (titel, eintraege) => {
    if (!eintraege.length) return null;
    const d = Object.assign(document.createElement('div'), { className: 'suche-gruppe' });
    const ul = Object.assign(document.createElement('ul'), { className: 'treffer' });
    for (const [haupt, neben, fn] of eintraege) {
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { type: 'button' });
      b.append(Object.assign(document.createElement('span'), { textContent: haupt }), Object.assign(document.createElement('small'), { textContent: neben }));
      b.addEventListener('click', () => { dialogZu(); fn(); });
      li.append(b);
      ul.append(li);
    }
    d.append(Object.assign(document.createElement('h4'), { textContent: titel }), ul);
    return d;
  };
  const teile = [...$$('nav.tabs button')].some((b) => b.dataset.tab === 'teile' && !b.hidden);
  const teilen = [
    darf('katalog_erfassen') && gruppe('Räder', (r.data || []).map((x) => [`${x.hersteller} ${x.modell} (${x.baujahr})`, `${x.kategorie} · ergänzen`, async () => {
      tab('erfassen');
      await ergaenzenStart(x);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }])),
    gruppe('Teile', (t.data || []).map((x) => [`${x.marke} ${x.name}`, `${x.kategorie}${x.ean && x.ean.length ? ` · ${x.ean.length} Barcode${x.ean.length > 1 ? 's' : ''}` : ''}`, () => {
      if (darf('katalog_pflegen')) { teilBearbeiten(x); return; }
      if (teile) { tab('teile'); $('#tl-suche').value = `${x.marke} ${x.name}`; ladeTeileliste(true); }
    }])),
    gruppe('Konten', k.map((x) => [x.email, `${datum(x.registriert)} · ${x.raeder || 0} ${x.raeder === 1 ? 'Rad' : 'Räder'}`, () => { tab('konten'); kontoVerwalten(x); }])),
  ].filter(Boolean);
  box.replaceChildren(...teilen);
  if (!teilen.length) box.replaceChildren(Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Nichts gefunden.' }));
  const erstes = $('button', box);
  if (erstes) erstes.setAttribute('aria-selected', 'true');
}
$('#suche-auf').addEventListener('click', sucheOeffnen);
document.addEventListener('keydown', (ev) => {
  const tippt = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !tippt)) {
    ev.preventDefault();
    if ($('#dlg').hidden) sucheOeffnen();
  }
});

// ---------- Start ----------

(async () => {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await weiter();
    else zeige('s-mail');
  } catch (e) {
    zeige('s-mail');
    meldung($('#s-mail .msg'), fehlerText(e), true);
  }
})();
