// Werkbank, Teil 9 von 11: Katalog durchstöbern, Mail an ein Konto, Rollen und Rechte.
'use strict';

// ---------- Katalog zum Durchstöbern (Räder: Marke → Reihe → Ausstattung, Teile: Kategorie → Teile) ----------

const kat = { ansicht: 'raeder', marke: null, reihe: null, kategorie: null, teileMarke: '', zeige: 60, raeder: null, teile: null };
const KAT_FARBEN = ['k5', 'k2', 'k4', 'k3', 'k1'];
const reiheVon = (r) => (r.reihe || r.modell.split(' ')[0] || '').trim();
const jahre = (liste) => {
  const j = liste.map((r) => r.baujahr).filter(Boolean);
  if (!j.length) return '';
  const a = Math.min(...j), b = Math.max(...j);
  return a === b ? String(a) : `${a}–${b}`;
};
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});

async function katalogLaden(neu = false) {
  const box = $('#kat-inhalt');
  if (neu) { kat.raeder = null; kat.teile = null; }
  try {
    if (!kat.raeder) {
      box.replaceChildren(el('p', 'fine', 'Lade den Katalog …'));
      [kat.raeder, kat.teile] = await Promise.all([
        alleZeilen('raeder', 'id, hersteller, reihe, modell, baujahr, kategorie, uvp_eur, geprueft', 'id'),
        alleZeilen('teile', 'id, marke, name, kategorie, richtpreis_eur, ean, merkmale', 'id'),
      ]);
      const arten = [...new Set(kat.raeder.map((r) => r.kategorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
      $('#kat-art').replaceChildren(new Option('Alle Radarten', ''), ...arten.map((a) => new Option(a, a)));
      const js = [...new Set(kat.raeder.map((r) => r.baujahr).filter(Boolean))].sort((a, b) => b - a);
      $('#kat-jahr').replaceChildren(new Option('Alle Jahre', ''), ...js.map((j) => new Option(String(j), String(j))));
    }
  } catch (e) {
    box.replaceChildren(el('p', 'fine', fehlerText(e)));
    return;
  }
  katalogZeichnen();
}

function katRaederGefiltert() {
  const art = $('#kat-art').value;
  const jahr = Number($('#kat-jahr').value) || 0;
  return kat.raeder.filter((r) => (!art || r.kategorie === art) && (!jahr || r.baujahr === jahr));
}

function katPfad() {
  const teile = [['Katalog', () => { kat.marke = null; kat.reihe = null; kat.kategorie = null; katalogZeichnen(); }]];
  if (kat.ansicht === 'raeder') {
    teile[0][0] = 'Alle Marken';
    if (kat.marke) teile.push([kat.marke, () => { kat.reihe = null; katalogZeichnen(); }]);
    if (kat.reihe) teile.push([kat.reihe, null]);
  } else {
    teile[0][0] = 'Alle Kategorien';
    if (kat.kategorie) teile.push([kat.kategorie, null]);
  }
  $('#kat-pfad').replaceChildren(...teile.flatMap(([text, fn], i) => {
    const b = el(fn && i < teile.length - 1 ? 'button' : 'span', i < teile.length - 1 ? 'pfad-link' : 'pfad-hier', text);
    if (b.tagName === 'BUTTON') { b.type = 'button'; b.addEventListener('click', fn); }
    return i ? [el('span', 'pfad-trenner', '›'), b] : [b];
  }));
}

function katKachel(farbe, titel, zahlText, unter, fn, chips = []) {
  const b = el('button', `kat-kachel ${farbe}`);
  b.type = 'button';
  b.append(el('span', 'kat-titel', titel), el('span', 'kat-zahl', zahlText));
  if (unter) b.append(el('span', 'kat-unter', unter));
  if (chips.length) {
    const c = el('span', 'kat-chips');
    c.append(...chips.map((x) => el('span', 'kat-chip', x)));
    b.append(c);
  }
  b.addEventListener('click', fn);
  return b;
}

function katalogZeichnen() {
  if (!kat.raeder) return;
  for (const b of $$('#kat-ansicht button')) b.setAttribute('aria-checked', String(b.dataset.ansicht === kat.ansicht));
  $('#kat-filter-raeder').hidden = kat.ansicht !== 'raeder';
  $('#kat-suche').placeholder = kat.ansicht === 'raeder' ? 'Rad suchen, z. B. Canyon Grail' : 'Teil suchen, z. B. Shimano CN-M8100';
  katPfad();
  const such = woerterAus($('#kat-suche').value);
  if (kat.ansicht === 'raeder') katRaeder(such); else katTeile(such);
}

function katRaeder(such) {
  const box = $('#kat-inhalt');
  const liste = katRaederGefiltert();
  const zahl = (n, eins, mehr) => `${n.toLocaleString('de-DE')} ${n === 1 ? eins : mehr}`;
  $('#kat-stand').textContent = `${zahl(liste.length, 'Rad', 'Räder')} von ${new Set(liste.map((r) => r.hersteller)).size} Marken`;
  if (such.length) {
    const treffer = liste.filter((r) => { const h = `${r.hersteller} ${r.modell} ${r.baujahr} ${r.kategorie}`.toLowerCase(); return such.every((w) => h.includes(w)); });
    katRadListe(box, treffer.slice(0, 120), treffer.length > 120 ? `Die ersten 120 von ${treffer.length} Treffern. Genauer suchen.` : (treffer.length ? '' : 'Kein Rad gefunden.'));
    return;
  }
  if (!kat.marke) {
    const gruppen = new Map();
    for (const r of liste) { if (!gruppen.has(r.hersteller)) gruppen.set(r.hersteller, []); gruppen.get(r.hersteller).push(r); }
    const sortiert = [...gruppen].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'de'));
    const gitter = el('div', 'kat-gitter');
    gitter.append(...sortiert.map(([marke, rs], i) => {
      const arten = [...rs.reduce((m, r) => m.set(r.kategorie, (m.get(r.kategorie) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a);
      return katKachel(KAT_FARBEN[i % 5], marke, zahl(rs.length, 'Rad', 'Räder'), `${new Set(rs.map(reiheVon)).size} Reihen · ${jahre(rs)}`, () => { kat.marke = marke; katalogZeichnen(); window.scrollTo({ top: 0 }); }, arten);
    }));
    box.replaceChildren(sortiert.length ? gitter : el('p', 'fine', 'Keine Räder für diesen Filter.'));
    return;
  }
  const vonMarke = liste.filter((r) => r.hersteller === kat.marke);
  if (!kat.reihe) {
    const gruppen = new Map();
    for (const r of vonMarke) { const k = reiheVon(r); if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(r); }
    const sortiert = [...gruppen].sort((a, b) => a[0].localeCompare(b[0], 'de'));
    const gitter = el('div', 'kat-gitter');
    gitter.append(...sortiert.map(([reihe, rs], i) => katKachel(KAT_FARBEN[i % 5], reihe, zahl(rs.length, 'Ausstattung', 'Ausstattungen'), jahre(rs),
      () => { kat.reihe = reihe; katalogZeichnen(); window.scrollTo({ top: 0 }); }, [...new Set(rs.map((r) => r.kategorie))].slice(0, 3))));
    box.replaceChildren(sortiert.length ? gitter : el('p', 'fine', 'Keine Räder für diesen Filter.'));
    return;
  }
  const rs = vonMarke.filter((r) => reiheVon(r) === kat.reihe).sort((a, b) => b.baujahr - a.baujahr || a.modell.localeCompare(b.modell, 'de'));
  katRadListe(box, rs, rs.length ? '' : 'Keine Räder für diesen Filter.', true);
}

// Räder als Karten, nach Jahr gruppiert; die Zahl der Teile kommt nach
async function katRadListe(box, rs, hinweis, nachJahr = false) {
  const karten = new Map();
  const karte = (r) => {
    const b = el('button', 'kat-rad');
    b.type = 'button';
    const kopf = el('span', 'kat-rad-name', nachJahr ? r.modell : `${r.hersteller} ${r.modell}`);
    const chips = el('span', 'kat-chips');
    chips.append(el('span', 'kat-chip', String(r.baujahr)), el('span', 'kat-chip', r.kategorie));
    if (r.uvp_eur) chips.append(el('span', 'kat-chip', euro(r.uvp_eur)));
    if (r.geprueft === false) chips.append(el('span', 'kat-chip warn', 'wartet auf Freigabe'));
    const teile = el('span', 'kat-rad-teile', '');
    b.append(kopf, chips, teile);
    b.addEventListener('click', () => katRadDetail(r));
    karten.set(r.id, teile);
    return b;
  };
  const teile = [];
  if (hinweis) teile.push(el('p', 'fine', hinweis));
  if (nachJahr) {
    for (const j of [...new Set(rs.map((r) => r.baujahr))]) {
      const g = el('div', 'kat-gitter klein');
      g.append(...rs.filter((r) => r.baujahr === j).map(karte));
      teile.push(el('p', 'st-abschnitt', String(j)), g);
    }
  } else {
    const g = el('div', 'kat-gitter klein');
    g.append(...rs.map(karte));
    teile.push(g);
  }
  box.replaceChildren(...teile);
  if (!rs.length) return;
  try {
    const zaehler = new Map();
    for (let i = 0; i < rs.length; i += 100) {
      const { data } = await sb.from('rad_teile').select('rad_id').in('rad_id', rs.slice(i, i + 100).map((r) => r.id)).limit(5000);
      for (const x of data || []) zaehler.set(x.rad_id, (zaehler.get(x.rad_id) || 0) + 1);
    }
    for (const [id, span] of karten) { const n = zaehler.get(id) || 0; span.textContent = `${n} ${n === 1 ? 'Teil' : 'Teile'}`; span.classList.toggle('wenig', n < 8); }
  } catch { /* ohne Zahl weiter */ }
}

async function katRadDetail(r) {
  const inhalt = el('div', 'kat-detail');
  const chips = el('div', 'kat-chips');
  chips.append(el('span', 'kat-chip', String(r.baujahr)), el('span', 'kat-chip', r.kategorie));
  if (r.uvp_eur) chips.append(el('span', 'kat-chip', `UVP ${euro(r.uvp_eur)}`));
  if (r.geprueft === false) chips.append(el('span', 'kat-chip warn', 'wartet auf Freigabe'));
  const liste = el('div', 'kat-teilgruppen', null);
  liste.append(el('p', 'fine', 'Lade die Teile …'));
  const akt = el('div', 'aktionen');
  if (darf('katalog_erfassen')) {
    akt.append(Object.assign(el('button', 'pill klein', 'Ergänzen'), { type: 'button', onclick: async () => { dialogZu(); tab('erfassen'); await ergaenzenStart(r); window.scrollTo({ top: 0, behavior: 'smooth' }); } }));
  }
  if (darf('katalog_pflegen')) {
    akt.append(Object.assign(el('button', 'pill ghost klein', 'Daten ändern'), { type: 'button', onclick: () => radBearbeiten(r.id, () => katalogLaden(true)) }));
  }
  inhalt.append(chips, liste, akt);
  dialog(`${r.hersteller} ${r.modell}`, inhalt);
  $('#dlg .dlg-box').classList.add('breit');
  try {
    const details = (await rpc('rad_details', { ids: [r.id] })) || [];
    const ids = ((details[0] && details[0].teile) || []).map((t) => t.teil_id);
    const nachId = new Map((kat.teile || []).map((t) => [t.id, t]));
    const teile = ids.map((id) => nachId.get(id)).filter(Boolean);
    if (!teile.length) { liste.replaceChildren(el('p', 'fine', 'Noch keine Teile eingetragen.')); return; }
    const gruppen = new Map();
    for (const t of teile) { if (!gruppen.has(t.kategorie)) gruppen.set(t.kategorie, []); gruppen.get(t.kategorie).push(t); }
    const reihenfolge = (k) => { const i = TEIL_KATEGORIEN.indexOf(k); return i < 0 ? 99 : i; };
    liste.replaceChildren(el('p', 'fine', `${teile.length} ${teile.length === 1 ? 'Teil' : 'Teile'}. Antippen zeigt, wo das Teil noch verbaut ist.`),
      ...[...gruppen].sort((a, b) => reihenfolge(a[0]) - reihenfolge(b[0])).map(([k, ts]) => {
        const g = el('div', 'kat-teilgruppe');
        g.append(el('span', 'kat-teilkat', k));
        const u = el('div', 'kat-teilnamen');
        u.append(...ts.map((t) => Object.assign(el('button', 'kat-teilname', `${t.marke} ${t.name}`), { type: 'button', onclick: () => katTeilDetail(t) })));
        g.append(u);
        return g;
      }));
  } catch (e) {
    liste.replaceChildren(el('p', 'fine', fehlerText(e)));
  }
}

function katTeile(such) {
  const box = $('#kat-inhalt');
  const alle = kat.teile;
  $('#kat-stand').textContent = `${alle.length.toLocaleString('de-DE')} Teile in ${new Set(alle.map((t) => t.kategorie)).size} Kategorien`;
  let liste = null;
  if (such.length) {
    const ziffern = $('#kat-suche').value.replace(/\D/g, '');
    liste = alle.filter((t) => (ziffern.length >= 8 && (t.ean || []).includes(ziffern))
      || such.every((w) => `${t.marke} ${t.name} ${t.kategorie} ${t.merkmale || ''}`.toLowerCase().includes(w)));
  } else if (kat.kategorie) {
    liste = alle.filter((t) => t.kategorie === kat.kategorie);
  }
  if (!liste) {
    const gruppen = new Map();
    for (const t of alle) { if (!gruppen.has(t.kategorie)) gruppen.set(t.kategorie, []); gruppen.get(t.kategorie).push(t); }
    const reihenfolge = (k) => { const i = TEIL_KATEGORIEN.indexOf(k); return i < 0 ? 99 : i; };
    const gitter = el('div', 'kat-gitter');
    gitter.append(...[...gruppen].sort((a, b) => reihenfolge(a[0]) - reihenfolge(b[0])).map(([k, ts], i) => {
      const marken = [...ts.reduce((m, t) => m.set(t.marke, (m.get(t.marke) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
      const mitEan = ts.filter((t) => (t.ean || []).length).length;
      return katKachel(KAT_FARBEN[i % 5], k, `${ts.length.toLocaleString('de-DE')} Teile`, `${marken.length} Marken · ${Math.round((mitEan / ts.length) * 100)} % mit Barcode`,
        () => { kat.kategorie = k; kat.teileMarke = ''; kat.zeige = 60; katalogZeichnen(); window.scrollTo({ top: 0 }); }, marken.slice(0, 3).map(([m]) => m));
    }));
    box.replaceChildren(gitter);
    return;
  }
  // Marken der Auswahl als Filter-Chips
  const marken = [...liste.reduce((m, t) => m.set(t.marke, (m.get(t.marke) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
  const leiste = el('div', 'kat-marken');
  const chip = (wert, text) => {
    const b = Object.assign(el('button', 'kat-filterchip', text), { type: 'button' });
    b.setAttribute('aria-pressed', String(kat.teileMarke === wert));
    b.addEventListener('click', () => { kat.teileMarke = wert; kat.zeige = 60; katalogZeichnen(); });
    return b;
  };
  if (marken.length > 1) leiste.append(chip('', `Alle (${liste.length})`), ...marken.slice(0, 20).map(([m, n]) => chip(m, `${m} (${n})`)));
  const gezeigt = liste.filter((t) => !kat.teileMarke || t.marke === kat.teileMarke)
    .sort((a, b) => a.marke.localeCompare(b.marke, 'de') || a.name.localeCompare(b.name, 'de'));
  const gitter = el('div', 'kat-gitter klein');
  gitter.append(...gezeigt.slice(0, kat.zeige).map((t) => {
    const b = Object.assign(el('button', 'kat-rad'), { type: 'button' });
    const chips = el('span', 'kat-chips');
    if (such.length || !kat.kategorie) chips.append(el('span', 'kat-chip', t.kategorie));
    if (t.richtpreis_eur != null) chips.append(el('span', 'kat-chip', euro(t.richtpreis_eur)));
    if ((t.ean || []).length) chips.append(el('span', 'kat-chip', `${t.ean.length} Barcode${t.ean.length > 1 ? 's' : ''}`));
    if (t.merkmale) chips.append(el('span', 'kat-chip', t.merkmale));
    b.append(el('span', 'kat-marke', t.marke), el('span', 'kat-rad-name', t.name), chips);
    b.addEventListener('click', () => katTeilDetail(t));
    return b;
  }));
  const teile = [];
  if (leiste.children.length) teile.push(leiste);
  teile.push(gezeigt.length ? gitter : el('p', 'fine', 'Kein Teil gefunden.'));
  if (gezeigt.length > kat.zeige) {
    const mehr = Object.assign(el('button', 'pill ghost klein', `Weitere ${Math.min(60, gezeigt.length - kat.zeige)} von ${gezeigt.length - kat.zeige}`), { type: 'button' });
    mehr.addEventListener('click', () => { kat.zeige += 60; katalogZeichnen(); });
    const a = el('div', 'aktionen');
    a.style.marginTop = '12px';
    a.append(mehr);
    teile.push(a);
  }
  box.replaceChildren(...teile);
}

async function katTeilDetail(t) {
  const inhalt = el('div', 'kat-detail');
  const chips = el('div', 'kat-chips');
  chips.append(el('span', 'kat-chip', t.kategorie));
  if (t.richtpreis_eur != null) chips.append(el('span', 'kat-chip', `Richtpreis ${euro(t.richtpreis_eur)}`));
  if (t.merkmale) chips.append(el('span', 'kat-chip', t.merkmale));
  for (const e of t.ean || []) chips.append(el('span', 'kat-chip', `EAN ${e}`));
  const raeder = el('div', 'kat-teilgruppen');
  raeder.append(el('p', 'fine', 'Suche Räder mit diesem Teil …'));
  const akt = el('div', 'aktionen');
  if (darf('katalog_pflegen')) akt.append(Object.assign(el('button', 'pill klein', 'Bearbeiten'), { type: 'button', onclick: () => teilBearbeiten(t) }));
  const shop = Object.assign(el('a', 'knopf-weich', 'Bei Bike24 suchen'), { target: '_blank', rel: 'noopener noreferrer', href: 'https://www.bike24.de/suche?searchTerm=' + encodeURIComponent(`${t.marke} ${t.name}`) });
  akt.append(shop);
  inhalt.append(chips, raeder, akt);
  dialog(`${t.marke} ${t.name}`, inhalt);
  $('#dlg .dlg-box').classList.add('breit');
  try {
    const { data, error } = await sb.from('rad_teile').select('rad_id').eq('teil_id', t.id).limit(2000);
    if (error) throw error;
    const nachId = new Map((kat.raeder || []).map((r) => [r.id, r]));
    const rs = [...new Set((data || []).map((x) => x.rad_id))].map((id) => nachId.get(id)).filter(Boolean)
      .sort((a, b) => a.hersteller.localeCompare(b.hersteller, 'de') || b.baujahr - a.baujahr);
    if (!rs.length) { raeder.replaceChildren(el('p', 'fine', 'An keinem Katalograd verbaut.')); return; }
    const u = el('div', 'kat-teilnamen');
    u.append(...rs.slice(0, 80).map((r) => Object.assign(el('button', 'kat-teilname', `${r.hersteller} ${r.modell} (${r.baujahr})`), { type: 'button', onclick: () => katRadDetail(r) })));
    raeder.replaceChildren(el('p', 'fine', `Verbaut an ${rs.length} ${rs.length === 1 ? 'Rad' : 'Rädern'}${rs.length > 80 ? ', die ersten 80' : ''}:`), u);
  } catch (e) {
    raeder.replaceChildren(el('p', 'fine', fehlerText(e)));
  }
}

function katAnsichtSetzen(a) {
  kat.ansicht = a === 'teile' ? 'teile' : 'raeder';
  const soll = kat.ansicht === 'teile' ? '#katalog/teile' : '#katalog';
  if (location.hash !== soll) history.replaceState(null, '', soll);
  katalogZeichnen();
}
for (const b of $$('#kat-ansicht button')) b.addEventListener('click', () => { $('#kat-suche').value = ''; katAnsichtSetzen(b.dataset.ansicht); });
let katTimer = null;
$('#kat-suche').addEventListener('input', () => { clearTimeout(katTimer); katTimer = setTimeout(() => { kat.zeige = 60; katalogZeichnen(); }, 200); });
for (const id of ['#kat-art', '#kat-jahr']) $(id).addEventListener('change', katalogZeichnen);
$('#kat-neu').addEventListener('click', () => katalogLaden(true));

// ----- E-Mail an ein Konto (Bento-Vorlage auf dem Server, konto_mail_senden) -----

async function mailEditor(vorher = null) {
  if (!konten.length) { try { konten = (await rpc('konten_liste')) || []; } catch { /* ohne Vorschläge weiter */ } }
  let absender = ['kontakt@radgarage.app'];
  try { absender = (await rpc('konto_mail_absender')) || absender; } catch { /* Standard */ }
  const f = document.createElement('form');
  f.autocomplete = 'off';
  const liste = Object.assign(document.createElement('datalist'), { id: 'mail-konten' });
  liste.append(...konten.filter((k) => k.email).map((k) => new Option(k.email)));
  const feld = (text, el) => { const l = document.createElement('label'); l.append(Object.assign(document.createElement('span'), { className: 'pflicht', textContent: text }), el); return l; };
  const an = Object.assign(document.createElement('input'), { name: 'an', type: 'email', required: true, value: vorher ? vorher.email : '', placeholder: 'E-Mail-Adresse eines Kontos' });
  an.setAttribute('list', 'mail-konten');
  const von = document.createElement('select');
  von.name = 'von';
  von.append(...absender.map((a) => new Option(a, a)));
  const betreff = Object.assign(document.createElement('input'), { name: 'betreff', required: true, minLength: 3, maxLength: 150, placeholder: 'z. B. Deine Frage zur Familiengarage' });
  const text = Object.assign(document.createElement('textarea'), { name: 'text', required: true, rows: 9, maxLength: 10000, value: `Hallo,\n\n${mitSignatur()}` });
  const vorschau = Object.assign(document.createElement('iframe'), { className: 'mail-vorschau', title: 'Vorschau der Mail', hidden: true });
  vorschau.setAttribute('sandbox', '');
  const msg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });
  const vorschauKnopf = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost', textContent: 'Vorschau' });
  const senden = Object.assign(document.createElement('button'), { type: 'submit', className: 'pill', textContent: 'Senden' });
  const akt = document.createElement('div');
  akt.className = 'aktionen';
  akt.append(senden, vorschauKnopf, Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost', textContent: 'Abbrechen', onclick: dialogZu }));
  const tb = bausteinWahl(text, '');
  tb.style.marginTop = '-4px';
  f.append(liste, feld('An', an), feld('Von', von), feld('Betreff', betreff), feld('Text', text), tb,
    Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Kommt im Radgarage-Design mit Logo, Impressum und Datenschutz. Die Mail und die Antworten darauf stehen im E-Mail-CRM.' }),
    vorschau, akt, msg);

  const konto = () => konten.find((k) => (k.email || '').toLowerCase() === an.value.trim().toLowerCase());
  vorschauKnopf.addEventListener('click', async () => {
    try {
      vorschau.srcdoc = await rpc('konto_mail_vorschau', { p_betreff: betreff.value, p_text: text.value });
      vorschau.hidden = false;
      vorschau.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { meldung(msg, fehlerText(e), true); }
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const k = konto();
    if (!k) { meldung(msg, 'Zu dieser Adresse gibt es kein Konto.', true); return; }
    if (!window.confirm(`Mail „${betreff.value.trim()}“ jetzt an ${k.email} schicken?`)) return;
    senden.disabled = true;
    meldung(msg, 'Wird gesendet …');
    try {
      const r = await rpc('konto_mail_senden', { p_nutzer: k.id, p_betreff: betreff.value, p_text: text.value, p_absender: von.value });
      // Brevo antwortet asynchron: kurz nachsehen, ob die Mail angenommen wurde
      let st = null;
      for (let i = 0; i < 6 && !(st && st.status); i += 1) {
        await new Promise((ok) => setTimeout(ok, 1000));
        st = await rpc('konto_mail_status', { p_id: r.id }).catch(() => null);
      }
      if (st && st.status && st.status >= 300) { meldung(msg, `Brevo hat die Mail abgelehnt (${st.status}). ${st.fehler || ''}`, true); senden.disabled = false; return; }
      dialogZu();
      const fertig = st && st.status ? `Mail an ${r.an} ist raus.` : `Mail an ${r.an} ist unterwegs.`;
      meldung($('#msg-konten'), fertig);
      if (darf('konten_betreuen')) ladePostfach();
    } catch (e) {
      meldung(msg, fehlerText(e), true);
      senden.disabled = false;
    }
  });
  dialog(vorher ? `E-Mail an ${vorher.email}` : 'E-Mail schreiben', f);
  $('#dlg .dlg-box').classList.add('breit');
  (vorher ? betreff : an).focus();
}
$('#mail-neu').addEventListener('click', () => mailEditor());

// ----- Rollen und Rechte -----

const ROLLEN_TEXT = {
  helfer: 'Helfer: Einträge warten auf Freigabe',
  support: 'Support: Konten sehen und betreuen',
  admin: 'Admin: Katalog sofort live, Freigaben, Helfer vergeben',
};
function zeichneMeineRolle() {
  const sel = $('#f-helfer').rolle;
  sel.replaceChildren(...vergebbar().map((r) => new Option(ROLLEN_TEXT[r], r)));
  $('#helfer-titel').textContent = rolle === 'superadmin' ? 'Rollen vergeben' : 'Katalog-Helfer freischalten';
  // Rechte-Tabelle: Zeilen = Rechte, Spalten = Rollen
  const reihen = ['superadmin', 'admin', 'support', 'helfer'];
  const kopf = document.createElement('tr');
  kopf.append(Object.assign(document.createElement('th'), { textContent: 'Recht' }), ...reihen.map((r) => Object.assign(document.createElement('th'), { textContent: ROLLEN[r] })));
  $('#rechte-kopf').replaceChildren(kopf);
  $('#rechte-tabelle').replaceChildren(...RECHTE_TEXT.map(([recht, titel, text]) => {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.append(Object.assign(document.createElement('strong'), { textContent: titel }), Object.assign(document.createElement('div'), { className: 'fine', textContent: text }));
    tr.append(td, ...reihen.map((r) => {
      const hat = RECHTE_JE_ROLLE[r].includes(recht);
      const z = Object.assign(document.createElement('td'), { className: hat ? 'ja' : 'nein', textContent: hat ? '✓' : '–' });
      z.setAttribute('aria-label', hat ? 'ja' : 'nein');
      return z;
    }));
    return tr;
  }));
  // Konto-Tab: deine Rolle
  $('#meine-rolle-name').textContent = ROLLEN[rolle] || '–';
  $('#meine-rechte').replaceChildren(...RECHTE_TEXT.filter(([r]) => darf(r)).map(([, titel, text]) => {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('strong'), { textContent: titel }), ` – ${text}`);
    return li;
  }));
}

// Statistik als PDF: Druckdialog nur mit dem Statistik-Tab, immer hell
$('#st-pdf').addEventListener('click', () => {
  const vorher = document.documentElement.getAttribute('data-theme');
  const titel = document.title;
  const heute = new Date().toISOString().slice(0, 10);
  $('#st-druck-kopf').textContent = `Radgarage · letzte ${stTage === 365 ? '12 Monate' : stTage + ' Tage'} · erstellt ${new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`;
  document.documentElement.setAttribute('data-theme', 'light');
  document.body.classList.add('druck-statistik');
  document.title = `Radgarage-Statistik-${heute}`;
  const zurueck = () => {
    document.body.classList.remove('druck-statistik');
    if (vorher) document.documentElement.setAttribute('data-theme', vorher); else document.documentElement.removeAttribute('data-theme');
    document.title = titel;
    window.removeEventListener('afterprint', zurueck);
  };
  window.addEventListener('afterprint', zurueck);
  // Diagramme kurz neu zeichnen, damit sie die helle Palette übernehmen
  if (stDaten) zeichneStatistik();
  setTimeout(() => window.print(), 50);
});
