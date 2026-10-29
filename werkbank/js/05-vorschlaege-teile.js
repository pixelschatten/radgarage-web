// Werkbank, Teil 5 von 11: Vorschläge aus App und Website, Teile und Barcodes, Dialog.
'use strict';

// ----- Vorschläge aus der App und von der Website (Admin) -----
// Gleiche Meldungen werden zu einer Karte zusammengefasst, die Zahl der Geräte zeigt, wie oft etwas gemeldet wurde.
// Hinweise von den Radseiten auf radgarage.app tragen daten.herkunft = 'website' und stehen im eigenen Reiter.

const GRUND_TEXT = { falsch: 'Teil stimmt nicht', fehlt: 'Teil fehlt', zuviel: 'Teil nicht verbaut', rad: 'Name oder Baujahr', sonst: 'Etwas anderes' };
const ART_TEXT = { korrektur: 'Korrektur', rad: 'Neues Rad', ean: 'Barcode', teil: 'Neues Teil' };
const ART_REIHE = ['korrektur', 'rad', 'ean', 'teil'];
let appGruppen = [];
let appNamen = new Map();
let appFilter = '';
let fgAnsicht = 'helfer';
let appUebernahme = null; // { ids, titel } solange ein App-Rad im Erfassen-Formular steht
const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();

const vonWebsite = (v) => (v.daten || {}).herkunft === 'website';

function appSchluessel(v) {
  const d = v.daten || {};
  if (vonWebsite(v)) return `web|${d.rad_id || ''}|${d.teil_id || ''}|${d.grund || ''}`;
  if (v.art === 'rad') return `rad|${norm(d.hersteller)}|${norm(d.modell)}|${d.baujahr || ''}`;
  if (v.art === 'korrektur') return `korrektur|${d.rad_id || ''}|${d.teil_id || ''}|${d.grund || ''}`;
  if (v.art === 'ean') return `ean|${v.ean || ''}|${d.teil_id || ''}`;
  return `teil|${norm(d.name)}|${d.kategorie || ''}`;
}

function appGruppieren(liste) {
  const map = new Map();
  for (const v of liste) {
    const k = appSchluessel(v);
    let g = map.get(k);
    if (!g) { g = { art: v.art, web: vonWebsite(v), schluessel: k, eintraege: [], geraete: new Set() }; map.set(k, g); }
    g.eintraege.push(v);
    g.geraete.add(v.geraet || `id${v.id}`);
  }
  for (const g of map.values()) {
    g.eintraege.sort((a, b) => String(b.erstellt).localeCompare(String(a.erstellt)));
    g.neu = g.eintraege[0];
    g.ids = g.eintraege.map((v) => v.id);
  }
  // Häufig gemeldetes zuerst, dann das Neueste
  return [...map.values()].sort((a, b) => b.geraete.size - a.geraete.size || String(b.neu.erstellt).localeCompare(String(a.neu.erstellt)));
}

async function appNamenLaden(gruppen) {
  const ids = new Set();
  const ref = (x) => { if (x && x.katalog_id) ids.add(x.katalog_id); };
  for (const g of gruppen) {
    for (const v of g.eintraege) {
      const d = v.daten || {};
      if (d.teil_id) ids.add(d.teil_id);
      (d.teile || []).forEach(ref);
      const a = d.aenderungen || {};
      (a.getauscht || []).forEach((x) => { ids.add(x.alt); ref(x.neu); });
      (a.entfernt || []).forEach((x) => ids.add(x));
      (a.ergaenzt || []).forEach(ref);
    }
  }
  const fehlt = [...ids].filter((id) => id && !appNamen.has(id));
  for (let i = 0; i < fehlt.length; i += 150) {
    const { data, error } = await sb.from('teile').select('id, marke, name, kategorie').in('id', fehlt.slice(i, i + 150));
    if (error) throw error;
    for (const t of data || []) appNamen.set(t.id, t);
  }
}
const teilName = (id) => { const t = appNamen.get(id); return t ? `${t.marke} ${t.name}` : `unbekanntes Teil (${id})`; };
const refName = (x) => (x && x.katalog_id ? teilName(x.katalog_id) : `${(x && x.name) || '?'} (eigenes Teil)`);

function ladeApp(frisch = false) {
  return geteilt('app', async () => {
    const liste = (await rpc('app_vorschlaege_offen')) || [];
    appGruppen = appGruppieren(liste);
    await appNamenLaden(appGruppen);
    return appGruppen.length;
  }, frisch);
}

function zeichneApp() {
  const box = $('#app-liste');
  const web = fgAnsicht === 'web';
  const quelle = appGruppen.filter((g) => g.web === web);
  const zeigen = quelle.filter((g) => !appFilter || g.art === appFilter);
  $('#app-filter').hidden = web;
  $('#app-info').textContent = web
    ? 'Was Besucher auf den Radseiten von radgarage.app melden, ohne Anmeldung. Gleiche Meldungen (gleiches Rad, Teil und Grund) stehen zusammen.'
    : 'Was Nutzer in der App melden. Gleiche Meldungen von mehreren Geräten stehen zusammen, die Zahl zeigt, wie viele Geräte es gemeldet haben.';
  for (const b of $$('#app-filter button')) {
    const n = quelle.filter((g) => !b.dataset.art || g.art === b.dataset.art).length;
    b.textContent = `${b.textContent.replace(/\s*\(\d+\)$/, '')}${n ? ` (${n})` : ''}`;
  }
  zeigen.sort((a, b) => ART_REIHE.indexOf(a.art) - ART_REIHE.indexOf(b.art));
  box.replaceChildren(...zeigen.map(appKarte));
  if (!zeigen.length) box.innerHTML = `<p class="fine">Nichts offen ${web ? 'von der Website' : 'aus der App'}.</p>`;
}

async function appErledigen(g, status, karte, text) {
  const n = await rpc('app_vorschlaege_erledigen', { p_ids: g.ids, p_status: status });
  appGruppen = appGruppen.filter((x) => x !== g);
  karte.replaceWith(Object.assign(document.createElement('p'), { className: 'msg', textContent: text || (status === 'abgelehnt' ? `Abgelehnt (${n} Meldungen).` : `Erledigt (${n} Meldungen).`) }));
  zahlenSetzen();
}

function knopf(text, klasse, fn) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: `pill klein ${klasse || ''}`.trim(), textContent: text });
  b.addEventListener('click', async () => {
    const msg = b.closest('.karte').querySelector('.msg');
    b.disabled = true;
    meldung(msg, '');
    try { await fn(b); } catch (e) { meldung(msg, fehlerText(e), true); } finally { b.disabled = false; }
  });
  return b;
}

function appKarte(g) {
  const d = g.neu.daten || {};
  const div = document.createElement('div');
  div.className = 't karte';
  const kopf = document.createElement('div');
  kopf.className = 'app-kopf';
  const links = document.createElement('div');
  links.append(Object.assign(document.createElement('div'), { className: 'app-art', textContent: ART_TEXT[g.art] || g.art }));
  const h = document.createElement('h3');
  const rechts = document.createElement('div');
  rechts.className = 'aktionen';
  const n = g.geraete.size;
  const wer = g.web ? ['Meldung', 'Meldungen'] : ['Gerät', 'Geräte'];
  rechts.append(Object.assign(document.createElement('span'), { className: `chip${n > 1 ? ' gut' : ''}`, textContent: `${n} ${n === 1 ? wer[0] : wer[1]}` }));
  const von = [...new Set(g.eintraege.map((v) => v.von).filter(Boolean))];
  if (von.length) rechts.append(Object.assign(document.createElement('span'), { className: 'chip', textContent: `Helfer: ${von.join(', ')}` }));
  links.append(h);
  kopf.append(links, rechts);
  const meta = Object.assign(document.createElement('div'), { className: 'meta' });
  const erst = g.eintraege[g.eintraege.length - 1].erstellt;
  const zeit = (x) => new Date(x).toLocaleDateString('de-DE');
  meta.textContent = g.eintraege.length > 1 ? `${g.eintraege.length} Meldungen, ${zeit(erst)} bis ${zeit(g.neu.erstellt)}` : `Gemeldet am ${zeit(g.neu.erstellt)}`;
  div.append(kopf, meta);
  const akt = document.createElement('div');
  akt.className = 'aktionen';
  const msg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });

  if (g.art === 'korrektur') {
    h.textContent = d.titel || d.rad_id;
    const grund = Object.assign(document.createElement('p'), { textContent: GRUND_TEXT[d.grund] || d.grund || '' });
    grund.style.fontWeight = '700';
    if (d.teil_id) grund.textContent += `: ${appNamen.has(d.teil_id) ? teilName(d.teil_id) : d.teil_name || d.teil_id}`;
    div.append(grund);
    for (const t of [...new Set(g.eintraege.map((v) => (v.daten && v.daten.text) || '').filter(Boolean))].slice(0, 5)) {
      div.append(Object.assign(document.createElement('div'), { className: 'zitat', textContent: t }));
    }
    // Belege von der Website nur als Text, nie als klickbarer Link (kommt ungeprüft von Besuchern)
    for (const q of [...new Set(g.eintraege.map((v) => (v.daten && v.daten.beleg) || '').filter(Boolean))].slice(0, 3)) {
      div.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: `Beleg: ${q}` }));
    }
    // Die Garage-Änderungen hängen nur an manchen Meldungen, die neueste davon zeigen
    const a = ((g.eintraege.find((v) => v.daten && v.daten.aenderungen) || {}).daten || {}).aenderungen;
    if (a) {
      const ul = document.createElement('ul');
      ul.className = 'kurz';
      for (const x of a.getauscht || []) ul.append(Object.assign(document.createElement('li'), { textContent: `getauscht: ${teilName(x.alt)} → ${refName(x.neu)}` }));
      for (const x of a.entfernt || []) ul.append(Object.assign(document.createElement('li'), { textContent: `entfernt: ${teilName(x)}` }));
      for (const x of a.ergaenzt || []) ul.append(Object.assign(document.createElement('li'), { textContent: `dazu: ${refName(x)}` }));
      if (ul.children.length) {
        div.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: 'So hat der Nutzer das Rad in seiner Garage geändert:' }), ul);
      }
    }
    if (d.rad_id) {
      akt.append(knopf('Rad öffnen', '', async () => {
        const { data } = await sb.from('raeder').select('id, hersteller, modell, baujahr').eq('id', d.rad_id).maybeSingle();
        if (!data) throw new Error('Dieses Rad gibt es im Katalog nicht mehr.');
        tab('erfassen');
        await ergaenzenStart(data);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }));
      akt.append(knopf('Rad-Daten', 'ghost', () => radBearbeiten(d.rad_id, () => meldung(msg, 'Rad-Daten gespeichert.'))));
    }
    akt.append(knopf('Erledigt', 'gruen', () => appErledigen(g, 'uebernommen', div)));
  }

  if (g.art === 'rad') {
    h.textContent = `${d.hersteller || ''} ${d.modell || ''}${d.baujahr ? ` (${d.baujahr})` : ''}`.trim();
    if (d.kategorie) meta.textContent += ` · ${d.kategorie}`;
    const ol = document.createElement('ol');
    for (const t of d.teile || []) ol.append(Object.assign(document.createElement('li'), { textContent: `${refName(t)} · ${t.kategorie || '?'}` }));
    if (!ol.children.length) ol.innerHTML = '<li>Keine Teile</li>';
    div.append(ol);
    akt.append(knopf('Übernehmen', 'gruen', () => appRadUebernehmen(g)));
  }

  if (g.art === 'ean') {
    h.textContent = g.neu.ean || '';
    const p = document.createElement('p');
    if (d.teil_id) {
      p.textContent = `Gehört laut Nutzer zu ${appNamen.has(d.teil_id) ? teilName(d.teil_id) : d.teil_name || d.teil_id}`;
      akt.append(knopf('Barcode zuordnen', 'gruen', async () => {
        await rpc('katalog_teil_ean', { p_teil_id: d.teil_id, p_ean: g.neu.ean });
        await appErledigen(g, 'uebernommen', div, `Barcode ${g.neu.ean} hängt jetzt an ${teilName(d.teil_id)}.`);
      }));
      akt.append(knopf('Anderes Teil', 'ghost', () => appTeilWaehlen(g, div)));
    } else {
      p.textContent = `Nutzer nennt: ${d.name || '?'}${d.kategorie ? ` · ${d.kategorie}` : ''}${d.preis != null ? ` · ${euro(d.preis)}` : ''}`;
      akt.append(knopf('Teil suchen', 'gruen', () => appTeilWaehlen(g, div)));
      akt.append(knopf('Neu anlegen', 'ghost', () => appTeilAnlegen(g, div)));
    }
    const bike = Object.assign(document.createElement('a'), { className: 'knopf-weich', textContent: 'Bei Bike24 suchen', target: '_blank', rel: 'noopener noreferrer',
      href: `https://www.bike24.de/suche?searchTerm=${encodeURIComponent(g.neu.ean || '')}` });
    div.append(p);
    akt.append(bike);
  }

  if (g.art === 'teil') {
    h.textContent = d.name || '?';
    div.append(Object.assign(document.createElement('p'), { textContent: [d.kategorie, d.preis != null ? euro(d.preis) : null, d.rad ? `am ${d.rad}` : null].filter(Boolean).join(' · ') }));
    akt.append(knopf('Anlegen', 'gruen', () => appTeilAnlegen(g, div)));
    akt.append(knopf('Gibt es schon', 'ghost', () => appErledigen(g, 'uebernommen', div, 'Als erledigt markiert, das Teil steht schon im Katalog.')));
  }

  akt.append(knopf('Ablehnen', 'rot', () => appErledigen(g, 'abgelehnt', div)));
  div.append(akt, msg);
  return div;
}

// Neues Rad aus der App: Erfassen-Formular ausfüllen, nach dem Speichern die Meldungen als übernommen markieren
async function appRadUebernehmen(g) {
  const d = g.neu.daten || {};
  tab('erfassen');
  ergaenzenEnde();
  const f = $('#f-rad');
  f.reset();
  f.hersteller.value = d.hersteller || '';
  f.reihe.value = d.modell || '';
  f.ausstattung.value = '';
  f.baujahr.value = d.baujahr || '';
  if (d.kategorie && [...f.kategorie.options].some((o) => o.value === d.kategorie)) f.kategorie.value = d.kategorie;
  radTeile = (d.teile || []).filter((t) => t.katalog_id && appNamen.has(t.katalog_id)).map((t) => {
    const x = appNamen.get(t.katalog_id);
    return { teil_id: x.id, name: `${x.marke} ${x.name}`, kategorie: x.kategorie, ean: '' };
  });
  const eigene = (d.teile || []).filter((t) => !t.katalog_id && t.name);
  if (eigene.length) {
    $('#einfuegen').value = eigene.map((t) => `${t.kategorie ? `${t.kategorie}: ` : ''}${t.name}`).join('\n');
    $('#einfuegen-box').open = true;
  }
  zeichneTeile();
  appUebernahme = { ids: g.ids, titel: `${d.hersteller} ${d.modell}` };
  meldung($('#f-rad .msg'), `Aus der App übernommen: ${radTeile.length} Katalogteile${eigene.length ? `, ${eigene.length} eigene Teile stehen unter „Teileliste einfügen“ zum Zuordnen` : ''}. Bitte Reihe und Ausstattung trennen, prüfen und speichern.`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  f.reihe.focus();
}

async function appUebernahmeFertig() {
  if (!appUebernahme) return;
  const { ids } = appUebernahme;
  appUebernahme = null;
  try { await rpc('app_vorschlaege_erledigen', { p_ids: ids, p_status: 'uebernommen' }); } catch { /* bleibt offen, lässt sich später erledigen */ }
}

// Barcode einem vorhandenen Katalogteil zuordnen
function appTeilWaehlen(g, karte) {
  const d = g.neu.daten || {};
  const such = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Marke, Name oder Nummer', value: d.name || '' });
  const ul = Object.assign(document.createElement('ul'), { className: 'wahl-liste treffer' });
  const info = Object.assign(document.createElement('p'), { className: 'fine' });
  let nr = 0;
  const los = async () => {
    const mein = ++nr;
    const woerter = woerterAus(such.value).slice(0, 4);
    if (!woerter.length) { ul.replaceChildren(); return; }
    let q = sb.from('teile').select('id, marke, name, kategorie').limit(20);
    for (const w of woerter) q = q.or(`marke.ilike.*${w}*,name.ilike.*${w}*`);
    const { data, error } = await q;
    if (mein !== nr) return;
    info.textContent = error ? fehlerText(error) : data.length ? '' : 'Nichts gefunden. Weniger Wörter versuchen.';
    ul.replaceChildren(...(data || []).map((t) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.append(Object.assign(document.createElement('span'), { textContent: `${t.marke} ${t.name}` }), Object.assign(document.createElement('small'), { textContent: t.kategorie }));
      b.addEventListener('click', async () => {
        try {
          await rpc('katalog_teil_ean', { p_teil_id: t.id, p_ean: g.neu.ean });
          dialogZu();
          await appErledigen(g, 'uebernommen', karte, `Barcode ${g.neu.ean} hängt jetzt an ${t.marke} ${t.name}.`);
        } catch (e) { info.textContent = fehlerText(e); }
      });
      li.append(b);
      return li;
    }));
  };
  let timer = null;
  such.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(los, 250); });
  dialog(`Barcode ${g.neu.ean} zuordnen`, such, info, ul);
  los();
}

// Neues Katalogteil aus einer Meldung anlegen, bei Barcode-Meldungen gleich mit Barcode
function appTeilAnlegen(g, karte) {
  const d = g.neu.daten || {};
  const name = String(d.name || '').trim();
  const leer = name.indexOf(' ');
  const werte = { marke: leer > 0 ? name.slice(0, leer) : '', name: leer > 0 ? name.slice(leer + 1) : name, kategorie: TEIL_KATEGORIEN.includes(d.kategorie) ? d.kategorie : 'Sonstiges', preis: d.preis };
  const felder = [['marke', 'Marke'], ['name', 'Name'], ['kategorie', 'Kategorie', 'select', TEIL_KATEGORIEN], ['preis', 'Richtpreis in €', 'number']];
  const f = formular(felder, werte, 'Anlegen');
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    mitKnopf(f, async () => {
      const p = { marke: f.marke.value.trim(), name: f.name.value.trim(), kategorie: f.kategorie.value };
      if (f.preis.value) p.preis = Number(f.preis.value);
      if (g.art === 'ean' && g.neu.ean) p.ean = g.neu.ean;
      await rpc('katalog_teil_anlegen', { p });
      dialogZu();
      await appErledigen(g, 'uebernommen', karte, `${p.marke} ${p.name} ist jetzt im Katalog${p.ean ? `, mit Barcode ${p.ean}` : ''}.`);
    });
  });
  dialog('Teil anlegen', Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Marke und Name bitte prüfen, die App liefert nur den Text des Nutzers.' }), f);
}

function fgAnsichtSetzen(wahl) {
  fgAnsicht = wahl;
  if (!$('[data-panel="freigaben"]').hidden) history.replaceState(null, '', wahl === 'helfer' ? '#freigaben' : `#freigaben/${wahl}`);
  for (const b of $$('#fg-ansicht button')) b.setAttribute('aria-checked', String(b.dataset.ansicht === wahl));
  $('#offen').hidden = wahl !== 'helfer';
  $('#app-box').hidden = wahl === 'helfer';
  if (wahl !== 'helfer') {
    // Die Art-Filter gelten nur für die App, die Website meldet nur Korrekturen
    if (wahl === 'web') appFilter = '';
    for (const x of $$('#app-filter button')) x.setAttribute('aria-checked', String(x.dataset.art === appFilter));
    zeichneApp();
  }
}
for (const b of $$('#fg-ansicht button')) b.addEventListener('click', () => fgAnsichtSetzen(b.dataset.ansicht));
for (const b of $$('#app-filter button')) {
  b.addEventListener('click', () => {
    appFilter = b.dataset.art;
    for (const x of $$('#app-filter button')) x.setAttribute('aria-checked', String(x === b));
    zeichneApp();
  });
}

// ----- Teile und Barcodes -----

// Liste nur nach Suche oder Filter, der ganze Teilekatalog steht im Reiter Katalog
const SEITE = 12;
let tlSeite = 0;
let tlZaehler = 0;
let tlTimer = null;
$('#tl-suche').addEventListener('input', () => { clearTimeout(tlTimer); tlTimer = setTimeout(() => ladeTeileliste(true), 300); });
$('#tl-kategorie').addEventListener('change', () => ladeTeileliste(true));
$('#tl-ohne').addEventListener('change', () => ladeTeileliste(true));
$('#tl-mehr').addEventListener('click', () => ladeTeileliste(false));
$('#tl-zum-katalog').addEventListener('click', () => { tab('katalog'); katAnsichtSetzen('teile'); });

async function ladeTeileliste(neu) {
  const nr = ++tlZaehler;
  if (neu) tlSeite = 0;
  const woerter = $('#tl-suche').value.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}.\-/+]/gu, '')).filter((w) => w.length >= 2);
  if (neu) {
    sb.from('teile').select('id', { count: 'exact', head: true }).eq('ean', '{}').then(({ count }) => {
      $('#tl-ohne-zahl').textContent = count != null ? `(${count.toLocaleString('de-DE')})` : '';
    });
  }
  if (!woerter.length && !$('#tl-kategorie').value && !$('#tl-ohne').checked) {
    $('#tl-liste').replaceChildren();
    $('#tl-mehr').hidden = true;
    $('#tl-hinweis').textContent = '';
    return;
  }
  let q = sb.from('teile').select('id, marke, name, kategorie, ean', { count: 'exact' })
    .order('marke').order('name').range(tlSeite * SEITE, tlSeite * SEITE + SEITE - 1);
  for (const w of woerter) q = q.or(`marke.ilike.*${w}*,name.ilike.*${w}*`);
  if ($('#tl-kategorie').value) q = q.eq('kategorie', $('#tl-kategorie').value);
  if ($('#tl-ohne').checked) q = q.eq('ean', '{}');
  const { data, error, count } = await q;
  if (nr !== tlZaehler) return;
  if (error) { $('#tl-hinweis').textContent = fehlerText(error); return; }
  $('#tl-hinweis').textContent = count != null ? `${count.toLocaleString('de-DE')} Treffer` : '';
  const zeilen = data.map(teilZeile);
  if (neu) $('#tl-liste').replaceChildren(...zeilen); else $('#tl-liste').append(...zeilen);
  if (neu && !data.length) $('#tl-liste').innerHTML = '<li class="leer">Keine Teile gefunden.</li>';
  tlSeite += 1;
  $('#tl-mehr').hidden = count == null || tlSeite * SEITE >= count;
}

function teilZeile(t) {
  const li = document.createElement('li');
  const links = document.createElement('div');
  const name = Object.assign(document.createElement('div'), { className: 'name', textContent: `${t.marke} ${t.name}` });
  const neben = document.createElement('div');
  neben.className = 'neben';
  neben.append(Object.assign(document.createElement('span'), { className: 'marke', textContent: t.kategorie }));
  links.append(name, neben);
  // Suche beim Shop, z. B. um Barcode oder Preis nachzuschlagen (Adresse wie in der Tabelle shops)
  const shop = Object.assign(document.createElement('a'), {
    className: 'knopf-weich', target: '_blank', rel: 'noopener noreferrer', title: 'Bei Bike24 suchen',
    href: 'https://www.bike24.de/suche?searchTerm=' + encodeURIComponent(`${t.marke} ${t.name}`),
  });
  shop.innerHTML = `<span>Bike24</span>${ICON.raus}`;
  shop.setAttribute('aria-label', `${t.marke} ${t.name} bei Bike24 suchen`);
  const knoepfe = document.createElement('div');
  knoepfe.className = 'karten-knoepfe';
  if (darf('katalog_pflegen')) {
    const bearb = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', title: 'Teil bearbeiten' });
    bearb.innerHTML = `${ICON.stift}<span>Bearbeiten</span>`;
    bearb.addEventListener('click', () => teilBearbeiten(t));
    knoepfe.append(bearb);
  }
  knoepfe.append(shop);
  li.append(links, knoepfe);

  const eans = document.createElement('div');
  eans.className = 'eans';
  const msg = Object.assign(document.createElement('span'), { className: 'ean-msg' });
  const chips = document.createElement('span');
  chips.style.display = 'contents';
  const zeichneChips = () => {
    chips.replaceChildren(...(t.ean || []).map((code) => {
      const c = Object.assign(document.createElement('span'), { className: 'chip', textContent: code });
      if (darf('katalog_pflegen')) {
        const x = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', title: 'Barcode entfernen' });
        x.setAttribute('aria-label', `Barcode ${code} entfernen`);
        x.addEventListener('click', async () => {
          if (!window.confirm(`Barcode ${code} von ${t.marke} ${t.name} entfernen?`)) return;
          try {
            await rpc('katalog_teil_ean_weg', { p_teil_id: t.id, p_ean: code });
            t.ean = t.ean.filter((e) => e !== code);
            zeichneChips();
            meldung(msg, 'Entfernt.');
          } catch (e) {
            meldung(msg, fehlerText(e), true);
          }
        });
        c.append(x);
      }
      return c;
    }));
  };
  zeichneChips();
  const f = document.createElement('form');
  f.className = 'ean-form';
  const inp = Object.assign(document.createElement('input'), { inputMode: 'numeric', maxLength: 14, placeholder: 'Barcode ergänzen', required: true, pattern: '[0-9]{8,14}' });
  inp.setAttribute('aria-label', `Barcode zu ${t.marke} ${t.name}`);
  const feld = document.createElement('span');
  feld.className = 'feld-mit-icon';
  feld.append(inp);
  scanKnopf(feld, inp, () => f.requestSubmit(), true);
  const b = Object.assign(document.createElement('button'), { type: 'submit', className: 'pill klein', textContent: 'Speichern' });
  const pruefe = () => { b.disabled = !/^\d{8,14}$/.test(inp.value.replace(/\s/g, '')); };
  inp.addEventListener('input', pruefe);
  pruefe();
  f.append(feld, b);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    b.disabled = true;
    meldung(msg, '');
    try {
      const code = inp.value.replace(/\D/g, '');
      const r = await rpc('katalog_teil_ean', { p_teil_id: t.id, p_ean: code });
      if (r && r.live) {
        const gespeichert = code.length === 12 ? '0' + code : code;
        if (!(t.ean || []).includes(gespeichert)) t.ean = [...(t.ean || []), gespeichert];
        zeichneChips();
        meldung(msg, 'Gespeichert.');
        if ($('#tl-ohne').checked) li.classList.add('weg');
      } else {
        meldung(msg, 'Vorgeschlagen, wartet auf Prüfung.');
      }
      inp.value = '';
    } catch (e) {
      meldung(msg, fehlerText(e), true);
    } finally {
      pruefe();
    }
  });
  eans.append(chips, f, msg);
  li.append(eans);
  return li;
}

// ----- Barcode-Serie: viele Barcodes hintereinander zuordnen -----

let serieCode = null;
let serieTimer = null;
let serieZaehler = 0;
scanKnopf($('#serie-feld'), $('#serie-ean'), () => $('#f-serie').requestSubmit(), true);
const serieLog = (text, fehler) => {
  const li = Object.assign(document.createElement('li'), { textContent: text });
  if (fehler) li.classList.add('fehler');
  $('#serie-log').prepend(li);
};
const serieWeiter = (info) => {
  serieCode = null;
  $('#serie-wahl').hidden = true;
  $('#serie-suche').value = '';
  $('#serie-treffer').replaceChildren();
  $('#serie-ean').value = '';
  $('#serie-info').textContent = info || '';
  $('#serie-ean').focus();
};
$('#f-serie').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  let code = $('#serie-ean').value.replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) { $('#serie-info').textContent = 'Ein Barcode hat 8 bis 14 Ziffern.'; return; }
  // UPC-A (12 Stellen) steht im Katalog als EAN-13 mit führender 0
  if (code.length === 12) code = '0' + code;
  const { data, error } = await sb.from('teile').select('marke, name').contains('ean', [code]).limit(1);
  if (error) { $('#serie-info').textContent = fehlerText(error); return; }
  if (data && data[0]) {
    serieLog(`${code}: schon bei ${data[0].marke} ${data[0].name}`);
    serieWeiter('Kennt der Katalog schon. Nächster Barcode.');
    return;
  }
  serieCode = code;
  $('#serie-info').textContent = `${code} ist neu.`;
  $('#serie-wahl').hidden = false;
  $('#serie-suche').focus();
});
$('#serie-ueberspringen').addEventListener('click', () => { serieLog(`${serieCode}: übersprungen`); serieWeiter(); });
$('#serie-suche').addEventListener('input', () => {
  clearTimeout(serieTimer);
  serieTimer = setTimeout(async () => {
    const nr = ++serieZaehler;
    const woerter = woerterAus($('#serie-suche').value);
    if (!woerter.length) { $('#serie-treffer').replaceChildren(); return; }
    let q = sb.from('teile').select('id, marke, name, kategorie, ean').limit(15);
    for (const w of woerter) q = q.or(`marke.ilike.*${w}*,name.ilike.*${w}*`);
    const { data } = await q;
    if (nr !== serieZaehler) return;
    $('#serie-treffer').replaceChildren(...(data || []).map((t) => {
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { type: 'button' });
      b.append(Object.assign(document.createElement('span'), { textContent: `${t.marke} ${t.name}` }),
        Object.assign(document.createElement('small'), { textContent: t.kategorie + ((t.ean || []).length ? ` · ${t.ean.length} Barcode${t.ean.length > 1 ? 's' : ''}` : '') }));
      b.addEventListener('click', async () => {
        const code = serieCode;
        try {
          const r = await rpc('katalog_teil_ean', { p_teil_id: t.id, p_ean: code });
          serieLog(`${code} → ${t.marke} ${t.name}${r && r.live ? '' : ' (wartet auf Prüfung)'}`);
          serieWeiter('Gespeichert. Nächster Barcode.');
        } catch (e) {
          serieLog(`${code}: ${fehlerText(e)}`, true);
          $('#serie-info').textContent = fehlerText(e);
        }
      });
      li.append(b);
      return li;
    }));
  }, 300);
});
$('#serie').addEventListener('toggle', () => { if ($('#serie').open) $('#serie-ean').focus(); });

// ----- Doppelte Teile vermeiden: beim Neuanlegen ähnliche Katalogteile zeigen -----

function aehnlicheTeile(form, beiKlick) {
  const box = form.querySelector('[data-aehnlich]');
  let timer = null;
  let nr = 0;
  const pruefen = async () => {
    const mein = ++nr;
    const woerter = `${form.marke.value} ${form.name.value}`.toLowerCase().split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}.\-/+]/gu, '')).filter((w) => w.length >= 2);
    if (woerter.length < 2 || form.name.value.trim().length < 3) { box.hidden = true; return; }
    // Marke muss passen, vom Namen reicht ein Wort, damit auch andere Schreibweisen auffallen
    const [marke, ...rest] = woerter;
    let q = sb.from('teile').select('id, marke, name, kategorie, ean').ilike('marke', `*${marke}*`).limit(8);
    q = q.or(rest.map((w) => `name.ilike.*${w}*`).join(','));
    const { data } = await q;
    if (mein !== nr) return;
    box.hidden = !data || !data.length;
    box.querySelector('ul').replaceChildren(...(data || []).map((t) => {
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { type: 'button' });
      b.append(Object.assign(document.createElement('span'), { textContent: `${t.marke} ${t.name}` }),
        Object.assign(document.createElement('small'), { textContent: t.kategorie + ((t.ean || []).length ? ' · mit Barcode' : '') }));
      b.addEventListener('click', () => beiKlick(t));
      li.append(b);
      return li;
    }));
  };
  for (const n of ['marke', 'name']) form[n].addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(pruefen, 350); });
  form.addEventListener('reset', () => { box.hidden = true; });
}

aehnlicheTeile($('#f-teil'), (t) => {
  if (ergaenzen && ergaenzen.vorhanden.some((x) => x.id === t.id)) {
    $('#such-info').textContent = 'Dieses Teil ist schon am Rad.';
  } else if (!radTeile.some((x) => x.teil_id === t.id)) {
    radTeile.push({ teil_id: t.id, name: `${t.marke} ${t.name}`, kategorie: t.kategorie, ean: '' });
    zeichneTeile();
  }
  $('#f-teil').reset();
});

aehnlicheTeile($('#f-neues-teil'), (t) => {
  $('#f-neues-teil').reset();
  $('#tl-ohne').checked = false;
  $('#tl-kategorie').value = '';
  $('#tl-suche').value = `${t.marke} ${t.name}`;
  ladeTeileliste(true);
});

// ----- Dialog -----

function dialog(titel, ...inhalt) {
  $('#dlg-titel').textContent = titel;
  $('#dlg-inhalt').replaceChildren(...inhalt);
  $('#dlg').hidden = false;
  const erstes = $('#dlg-inhalt input, #dlg-inhalt select');
  if (erstes) setTimeout(() => erstes.focus(), 0);
}
$('#dlg-zu').addEventListener('click', () => dialogZu());
function dialogZu() { $('#dlg').hidden = true; $('#dlg-inhalt').replaceChildren(); $('#dlg .dlg-box').classList.remove('breit', 'mail', 'mit-person'); }
$('#dlg').addEventListener('click', (ev) => { if (ev.target === $('#dlg')) dialogZu(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#dlg').hidden) dialogZu(); });

// Kleines Formular aus Feldbeschreibungen: [name, Beschriftung, Typ, Optionen]
function formular(felder, werte, knopfText) {
  const f = document.createElement('form');
  f.autocomplete = 'off';
  for (const [name, text, typ, optionen] of felder) {
    const label = document.createElement('label');
    label.append(Object.assign(document.createElement('span'), { textContent: text }));
    let feld;
    if (typ === 'select') {
      feld = document.createElement('select');
      const wert = werte[name] == null ? '' : String(werte[name]);
      for (const o of (wert && !optionen.includes(wert) ? [wert, ...optionen] : optionen)) feld.append(new Option(o, o));
    } else {
      feld = Object.assign(document.createElement('input'), { type: typ || 'text' });
      if (typ === 'number') feld.step = '0.01';
    }
    feld.name = name;
    feld.value = werte[name] == null ? '' : String(werte[name]);
    label.append(feld);
    f.append(label);
  }
  const akt = document.createElement('div');
  akt.className = 'aktionen';
  akt.append(Object.assign(document.createElement('button'), { type: 'submit', className: 'pill', textContent: knopfText }),
    Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost', textContent: 'Abbrechen', onclick: dialogZu }));
  f.append(akt, Object.assign(document.createElement('div'), { className: 'msg', role: 'status' }));
  return f;
}

// Nur geänderte Felder schicken; leere Zahl/Quelle heißt leeren
function aenderungen(f, alt, felder) {
  const p = {};
  for (const [name, , typ] of felder) {
    const roh = f[name].value.trim();
    const neu = typ === 'number' ? (roh === '' ? null : Number(roh)) : (roh === '' && (name === 'quelle' || name === 'merkmale') ? null : roh);
    const vorher = alt[name] == null ? null : (typ === 'number' ? Number(alt[name]) : String(alt[name]));
    if (neu !== vorher && !(neu === null && vorher === '')) p[name] = neu;
  }
  return p;
}
