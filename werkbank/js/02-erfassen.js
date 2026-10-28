// Werkbank, Teil 2 von 11: Rad erfassen, Vorlage, Teileliste einfügen, Kamera, vorhandenes Rad ergänzen.
'use strict';

// ----- Rad erfassen -----

for (const k of TEIL_KATEGORIEN) {
  $('#teil-kategorie').append(new Option(k, k));
  $('#nt-kategorie').append(new Option(k, k));
  $('#tl-kategorie').append(new Option(k, k));
}

function zeichneTeile() {
  pflichtCheck();
  if (radTeile.length) entwurfMerken();
  const ul = $('#rad-teile');
  $('#teile-zahl').textContent = radTeile.length ? `(${radTeile.length})` : '';
  if (!radTeile.length) {
    ul.innerHTML = ergaenzen
      ? '<li class="leer">Noch keine neuen Teile. Unter „Teil hinzufügen“ suchen oder neu anlegen.</li>'
      : '<li class="leer">Noch keine Teile. Unter „Teil hinzufügen“ suchen oder neu anlegen. Barcode ist immer freiwillig.</li>';
    return;
  }
  // Nach Kategorie gruppiert in der Reihenfolge der Pflichtteile, darunter die fehlenden Pflichtteile zum Antippen
  const { wichtig, vielleicht } = fehlendePflichtteile();
  const reihenfolge = [...PFLICHTTEILE, 'Motor', 'Akku', ...TEIL_KATEGORIEN];
  const rang = (k) => { const r = reihenfolge.indexOf(k); return r < 0 ? reihenfolge.length : r; };
  const gruppen = new Map();
  radTeile.forEach((t, i) => { if (!gruppen.has(t.kategorie)) gruppen.set(t.kategorie, []); gruppen.get(t.kategorie).push(i); });
  const zeilen = [];
  for (const k of [...gruppen.keys()].sort((a, b) => rang(a) - rang(b))) {
    zeilen.push(Object.assign(document.createElement('li'), { className: 'gruppe-kopf', textContent: k }));
    for (const i of gruppen.get(k)) zeilen.push(teilAmRadZeile(radTeile[i], i));
  }
  if (wichtig.length || vielleicht.length) zeilen.push(fehltZeile(wichtig, vielleicht));
  ul.replaceChildren(...zeilen);
}

// Fehlende Pflichtteile als Knöpfe: Antippen sucht im Katalog nach der Kategorie
function fehltZeile(wichtig, vielleicht) {
  const li = document.createElement('li');
  li.className = 'platz';
  li.append(Object.assign(document.createElement('div'), { className: 'name', textContent: wichtig.length ? 'Fehlt noch' : 'Fehlt oft zu Recht' }));
  const chips = document.createElement('div');
  chips.className = 'platz-chips';
  for (const k of [...wichtig, ...vielleicht]) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'platz-chip' + (vielleicht.includes(k) ? ' vielleicht' : ''), textContent: `＋ ${k}` });
    if (vielleicht.includes(k)) b.title = 'Fehlt oft zu Recht';
    b.addEventListener('click', () => {
      $('#suche').value = `${k} `;
      $('#suche').focus();
      suche($('#suche').value);
    });
    chips.append(b);
  }
  li.append(chips);
  return li;
}

function teilAmRadZeile(t, i) {
  const li = document.createElement('li');
  const links = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = t.name;
  const neben = document.createElement('div');
  neben.className = 'neben';
  const marke = document.createElement('span');
  marke.className = 'marke neu';
  marke.textContent = 'neu im Katalog';
  if (t.neu) neben.append(marke);
  links.append(name, neben);
  const weg = document.createElement('button');
  weg.type = 'button';
  weg.className = 'pill ghost klein';
  weg.textContent = 'Entfernen';
  weg.addEventListener('click', () => { radTeile.splice(i, 1); zeichneTeile(); });
  li.append(links, weg);
  if (!t.neu) {
    const ean = document.createElement('div');
    ean.className = 'ean';
    const inp = document.createElement('input');
    inp.inputMode = 'numeric';
    inp.maxLength = 14;
    inp.placeholder = 'Barcode (freiwillig)';
    inp.value = t.ean || '';
    inp.setAttribute('aria-label', 'Barcode zu ' + t.name);
    inp.addEventListener('input', () => { t.ean = inp.value.replace(/\D/g, ''); });
    ean.append(inp);
    scanKnopf(ean, inp, (code) => { t.ean = code; });
    li.append(ean);
  }
  return li;
}

let suchZaehler = 0;
let suchTimer = null;
$('#suche').addEventListener('input', (ev) => {
  clearTimeout(suchTimer);
  suchTimer = setTimeout(() => suche(ev.target.value), 250);
});

// Eingefügte Zeilen wie „Kette: Shimano CN-M8100“ funktionieren auch: gesucht wird nach dem Teil hinter dem Doppelpunkt
async function suche(roh) {
  const nr = ++suchZaehler;
  const { text, kategorie } = zeileZerlegen(roh);
  const woerter = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}.\-/+]/gu, '')).filter((w) => w.length >= 2);
  const ul = $('#treffer');
  if (!woerter.length) { ul.replaceChildren(); $('#such-info').textContent = ''; return; }
  let q = sb.from('teile').select('id, marke, name, kategorie, richtpreis_eur').limit(30);
  for (const w of woerter) q = q.or(`marke.ilike.*${w}*,name.ilike.*${w}*,kategorie.ilike.*${w}*`);
  const { data, error } = await q;
  if (nr !== suchZaehler) return;
  if (error) { $('#such-info').textContent = fehlerText(error); return; }
  $('#such-info').textContent = data.length ? (data.length === 30 ? 'Mehr als 30 Treffer, genauer suchen.' : '') : 'Nichts im Katalog. Enter legt es neu an.';
  // Passende Kategorie nach oben
  if (kategorie) data.sort((a, b) => (b.kategorie === kategorie) - (a.kategorie === kategorie));
  suchStand = { text, kategorie, data };
  const neuKnopf = document.createElement('li');
  const nb = Object.assign(document.createElement('button'), { type: 'button', className: 'neu-anlegen' });
  nb.append(Object.assign(document.createElement('span'), { textContent: `＋ Neu anlegen: „${text.trim()}“` }), Object.assign(document.createElement('small'), { textContent: 'nicht im Katalog' }));
  nb.addEventListener('click', () => neuAusSuche());
  neuKnopf.append(nb);
  ul.replaceChildren(...data.map((t) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const n = document.createElement('span');
    n.textContent = `${t.marke} ${t.name}`;
    const k = document.createElement('small');
    k.textContent = t.kategorie + (t.richtpreis_eur != null ? ` · ${euro(t.richtpreis_eur)}` : '');
    b.append(n, k);
    b.addEventListener('click', () => {
      if (radTeile.some((x) => x.teil_id === t.id)) return;
      if (ergaenzen && ergaenzen.vorhanden.some((x) => x.id === t.id)) {
        $('#such-info').textContent = 'Dieses Teil ist schon am Rad.';
        return;
      }
      radTeile.push({ teil_id: t.id, name: `${t.marke} ${t.name}`, kategorie: t.kategorie, ean: '' });
      zeichneTeile();
      sucheLeeren(`${t.marke} ${t.name} ist am Rad.`);
    });
    li.append(b);
    return li;
  }), neuKnopf);
}

let suchStand = null;
function sucheLeeren(info) {
  suchZaehler += 1;
  $('#suche').value = '';
  $('#treffer').replaceChildren();
  $('#such-info').textContent = info || '';
  $('#suche').focus();
}

// Maske „Neu anlegen“ mit dem Suchtext vorbelegen: erstes Wort = Marke (Schreibweise aus dem Katalog, wenn bekannt)
function neuAusSuche() {
  const { text, kategorie, data } = suchStand || { text: $('#suche').value, kategorie: null, data: [] };
  const t = text.trim();
  if (!t) return;
  const f = $('#f-teil');
  f.reset();
  const klein = t.toLowerCase();
  const bekannt = [...new Set(data.map((x) => x.marke))].sort((a, b) => b.length - a.length).find((m) => klein.startsWith(`${m.toLowerCase()} `));
  const leer = t.indexOf(' ');
  f.marke.value = bekannt || (leer > 0 ? t.slice(0, leer) : '');
  f.name.value = bekannt ? t.slice(bekannt.length + 1).trim() : leer > 0 ? t.slice(leer + 1) : t;
  let kat = kategorie;
  if (!kat) for (const [wort, k] of KATEGORIE_WOERTER) if (klein.includes(wort)) { kat = k; break; }
  if (kat && TEIL_KATEGORIEN.includes(kat)) f.kategorie.value = kat;
  $('#neu-teil').open = true;
  $('#treffer').replaceChildren();
  $('#such-info').textContent = 'Bitte prüfen und „Zum Rad hinzufügen“.';
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const leerFeld = [f.marke, f.name, f.kategorie].find((x) => !x.value);
  (leerFeld || f.name).focus();
  f.marke.dispatchEvent(new Event('input'));
}

// Enter: genau ein Treffer → nehmen, kein Treffer → neu anlegen
$('#suche').addEventListener('keydown', async (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  clearTimeout(suchTimer);
  await suche(ev.target.value);
  const knoepfe = $$('#treffer button');
  if (knoepfe.length === 2) knoepfe[0].click();
  else if (knoepfe.length === 1) neuAusSuche();
});

$('#f-teil').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const ean = f.ean.value.replace(/\D/g, '');
  const neu = { marke: f.marke.value.trim(), name: f.name.value.trim(), kategorie: f.kategorie.value };
  if (f.preis.value) neu.preis = Number(f.preis.value);
  radTeile.push({ neu, name: `${neu.marke} ${neu.name}`, kategorie: neu.kategorie, ean });
  zeichneTeile();
  f.reset();
  $('#neu-teil').open = false;
  sucheLeeren(`${neu.marke} ${neu.name} kommt neu in den Katalog.`);
});

$('#leeren').addEventListener('click', () => {
  appUebernahme = null;
  $('#f-rad').reset();
  radTeile = [];
  entwurfWeg();
  $('#naechste').hidden = true;
  ergaenzenEnde();
  zeichneTeile();
  meldung($('#f-rad .msg'), '');
});

$('#f-rad').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  mitKnopf(f, async (msg) => {
    const teile = radTeile.map((t) => {
      const x = t.neu ? { neu: t.neu } : { teil_id: t.teil_id };
      if (t.ean && /^[0-9]{8,14}$/.test(t.ean)) x.ean = t.ean;
      return x;
    });
    // Doppelter Boden: Einträge mit Recht katalog_pflegen gehen sofort live
    const neuZahl = radTeile.filter((t) => t.neu).length;
    const teileText = `${teile.length} ${teile.length === 1 ? 'Teil' : 'Teile'}${neuZahl ? `, davon ${neuZahl} neu im Katalog` : ''}`;
    if (ergaenzen) {
      const name = ergaenzen.rad.name;
      if (darf('katalog_pflegen') && !window.confirm(`Ergänzung zu ${name} wirklich in die Datenbank übernehmen?\n\n${teileText} dazu${ergaenzen.weg.size ? `, ${ergaenzen.weg.size} entfernt` : ''}. Sie ist sofort in der App sichtbar.`)) return;
      const ergebnis = await rpc('katalog_rad_ergaenzen', {
        p: { rad_id: ergaenzen.rad.id, dazu: teile, weg: [...ergaenzen.weg], notiz: f.notiz.value.trim(), quelle: f.quelle.value.trim() },
      });
      f.reset();
      radTeile = [];
      ergaenzenEnde();
      await appUebernahmeFertig();
      meldung(msg, ergebnis && ergebnis.live
        ? `Die Ergänzung zu ${name} ist jetzt im Katalog.`
        : `Die Ergänzung zu ${name} ist gespeichert und wartet auf die Freigabe.`);
      if (darf('katalog_pflegen')) ladeOffen();
      return;
    }
    const fehlt = fehlendePflichtteile();
    if (teile.length < MIN_TEILE) throw new Error(`Bitte mindestens ${MIN_TEILE} Teile eintragen, sonst hilft der Eintrag beim Teilekauf kaum.`);
    if (fehlt.wichtig.length && !window.confirm(`Es fehlen noch: ${fehlt.wichtig.join(', ')}.\n\nTrotzdem speichern?`)) return;
    const radName = `${f.hersteller.value.trim()} ${f.reihe.value.trim()} ${f.ausstattung.value.trim()}`.trim();
    if (darf('katalog_pflegen') && !window.confirm(`${radName} (${f.baujahr.value}) wirklich in die Datenbank aufnehmen?\n\n${teileText}. Das Rad ist sofort in der App sichtbar.`)) return;
    let ergebnis;
    try {
      ergebnis = await rpc('katalog_rad_erfassen', {
      p_rad: {
        hersteller: f.hersteller.value.trim(),
        reihe: f.reihe.value.trim(),
        ausstattung: f.ausstattung.value.trim(),
        baujahr: Number(f.baujahr.value),
        kategorie: f.kategorie.value,
        uvp: f.uvp.value || '',
        quelle: f.quelle.value.trim(),
        teile,
      },
    });
    } catch (e) {
      // Gleiches Rad gibt es schon: Ergänzen anbieten
      if (/schon im Katalog/.test(fehlerText(e))) await aehnlichePruefen(true);
      throw e;
    }
    const name = `${f.hersteller.value.trim()} ${f.reihe.value.trim()} ${f.ausstattung.value.trim()}`.trim();
    letztesRad = {
      hersteller: f.hersteller.value.trim(), reihe: f.reihe.value.trim(), baujahr: f.baujahr.value, kategorie: f.kategorie.value,
      uvp: f.uvp.value, quelle: f.quelle.value.trim(), live: !!(ergebnis && ergebnis.live), teile: radTeile.map((t) => ({ ...t, ean: '' })),
    };
    f.reset();
    radTeile = [];
    zeichneTeile();
    entwurfWeg();
    $('#naechste-text').textContent = `${letztesRad.hersteller} ${letztesRad.reihe} ${letztesRad.baujahr} mit denselben ${letztesRad.teile.length} Teilen`;
    $('#naechste').hidden = false;
    await appUebernahmeFertig();
    meldung(msg, ergebnis && ergebnis.live
      ? `${name} ist jetzt im Katalog.`
      : `${name} ist gespeichert und wartet auf die Freigabe.`);
    if (darf('katalog_pflegen')) ladeOffen();
  });
});

// ----- Nächste Ausstattung: Marke, Reihe, Jahr und Teile vom gerade gespeicherten Rad übernehmen -----

let letztesRad = null;
$('#naechste-nein').addEventListener('click', () => { $('#naechste').hidden = true; letztesRad = null; });
$('#naechste-los').addEventListener('click', async () => {
  const r = letztesRad;
  if (!r) return;
  $('#naechste').hidden = true;
  const f = $('#f-rad');
  // Neu angelegte Teile stehen jetzt im Katalog: über Marke und Name wiederfinden, damit sie nicht doppelt angelegt werden
  if (r.live) {
    for (const t of r.teile.filter((x) => x.neu)) {
      const { data } = await sb.from('teile').select('id, marke, name, kategorie').eq('marke', t.neu.marke).eq('name', t.neu.name).limit(1);
      if (data && data[0]) Object.assign(t, { teil_id: data[0].id, neu: undefined, name: `${data[0].marke} ${data[0].name}`, kategorie: data[0].kategorie });
    }
  }
  f.hersteller.value = r.hersteller;
  f.reihe.value = r.reihe;
  f.baujahr.value = r.baujahr;
  f.kategorie.value = r.kategorie;
  f.uvp.value = '';
  f.quelle.value = r.quelle;
  radTeile = r.teile.map((t) => { const x = { ...t }; if (!x.neu) delete x.neu; return x; });
  letztesRad = null;
  zeichneTeile();
  entwurfMerken();
  meldung($('#f-rad .msg'), 'Übernommen. Jetzt Ausstattung und UVP eintragen und die Teile tauschen, die anders sind.');
  f.ausstattung.focus();
});

// ----- Entwurf: ein angefangenes neues Rad bleibt im Browser, auch nach dem Abmelden -----

const ENTWURF = 'werkbank-entwurf';
const ENTWURF_FELDER = ['hersteller', 'baujahr', 'reihe', 'ausstattung', 'kategorie', 'uvp', 'quelle'];
let entwurfTimer = null;
function entwurfMerken(ev) {
  // Wer selbst weitertippt, braucht das Angebot „Nächste Ausstattung“ nicht mehr
  if (ev && ev.type) $('#naechste').hidden = true;
  clearTimeout(entwurfTimer);
  entwurfTimer = setTimeout(() => {
    // Ergänzungen und App-Übernahmen hängen an Daten vom Server, gemerkt wird nur ein neues Rad
    if (ergaenzen || appUebernahme) return;
    const f = $('#f-rad');
    const felder = Object.fromEntries(ENTWURF_FELDER.map((n) => [n, f[n].value]));
    if (!radTeile.length && !felder.hersteller.trim() && !felder.reihe.trim()) return;
    $('#entwurf-box').hidden = true;
    try { localStorage.setItem(ENTWURF, JSON.stringify({ felder, teile: radTeile, zeit: Date.now() })); } catch { /* ohne Speicher kein Entwurf */ }
  }, 400);
}
function entwurfWeg() {
  clearTimeout(entwurfTimer);
  $('#entwurf-box').hidden = true;
  try { localStorage.removeItem(ENTWURF); } catch { /* egal */ }
}
function entwurfLesen() {
  try { const e = JSON.parse(localStorage.getItem(ENTWURF) || 'null'); return e && e.felder ? e : null; } catch { return null; }
}
function entwurfAnbieten() {
  const e = entwurfLesen();
  const f = $('#f-rad');
  const leer = !radTeile.length && !ergaenzen && !f.hersteller.value && !f.reihe.value;
  $('#entwurf-box').hidden = !e || !leer;
  if (!e || !leer) return;
  const name = `${e.felder.hersteller} ${e.felder.reihe} ${e.felder.ausstattung}`.trim() || 'Ohne Namen';
  const wann = new Date(e.zeit).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  $('#entwurf-text').textContent = `${name}${e.felder.baujahr ? ` (${e.felder.baujahr})` : ''}, ${e.teile.length} ${e.teile.length === 1 ? 'Teil' : 'Teile'}, zuletzt ${wann} Uhr`;
}
$('#entwurf-weiter').addEventListener('click', () => {
  const e = entwurfLesen();
  if (!e) return;
  const f = $('#f-rad');
  for (const n of ENTWURF_FELDER) if (e.felder[n] != null) f[n].value = e.felder[n];
  radTeile = Array.isArray(e.teile) ? e.teile : [];
  $('#entwurf-box').hidden = true;
  zeichneTeile();
  f.hersteller.dispatchEvent(new Event('input', { bubbles: true }));
  meldung($('#f-rad .msg'), 'Entwurf geladen.');
});
$('#entwurf-weg').addEventListener('click', () => { if (window.confirm('Angefangenes Rad verwerfen?')) entwurfWeg(); });
$('#f-rad').addEventListener('input', entwurfMerken);
$('#f-rad').addEventListener('change', entwurfMerken);

// ----- Pflichtteile (wie src/data/helfer.ts in der App) -----

const PFLICHTTEILE = ['Schaltwerk', 'Umwerfer', 'Schalthebel', 'Kurbel', 'Kassette', 'Kette',
  'Bremssattel', 'Bremsbelag', 'Bremsscheibe', 'Laufradsatz', 'Reifen', 'Schlauch', 'Innenlager', 'Steckachse'];
// Fehlen oft zu Recht: kein Umwerfer bei 1-fach, kein Akku ohne elektrische Schaltung, Schlauch bei Tubeless
const OFT_NICHT_VERBAUT = ['Umwerfer', 'Akku', 'Schlauch'];
const MIN_TEILE = 3;

function fehlendePflichtteile() {
  const eBike = ($('#f-rad').kategorie.value || '').startsWith('E-');
  const soll = [...PFLICHTTEILE];
  soll.splice(6, 0, ...(eBike ? ['Motor', 'Akku'] : ['Akku']));
  const da = new Set([...radTeile.map((t) => t.kategorie), ...(ergaenzen ? ergaenzen.vorhanden.filter((t) => !ergaenzen.weg.has(t.id)).map((t) => t.kategorie) : [])]);
  // Riemen ersetzt Kette und Kassette
  if (da.has('Riemen')) { da.add('Kette'); da.add('Kassette'); }
  const fehlt = soll.filter((k) => !da.has(k));
  return { wichtig: fehlt.filter((k) => !OFT_NICHT_VERBAUT.includes(k)), vielleicht: fehlt.filter((k) => OFT_NICHT_VERBAUT.includes(k)) };
}

function pflichtCheck() {
  const box = $('#pflicht-check');
  if (!radTeile.length && !ergaenzen) { box.hidden = true; return; }
  const { wichtig } = fehlendePflichtteile();
  // Was fehlt, steht als Knöpfe in der Liste, hier nur die Erfolgsmeldung
  box.hidden = wichtig.length > 0;
  box.classList.toggle('ok', !wichtig.length);
  box.replaceChildren();
  const kopf = document.createElement('strong');
  kopf.textContent = 'Alle wichtigen Teile sind drin.';
  box.append(kopf);
}
$('#f-rad').kategorie.addEventListener('change', pflichtCheck);

// ----- Rad als Vorlage -----

let vorlageTimer = null;
let vorlageZaehler = 0;
$('#vorlage-suche').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
$('#vorlage-suche').addEventListener('input', (ev) => {
  clearTimeout(vorlageTimer);
  vorlageTimer = setTimeout(() => vorlageSuchen(ev.target.value), 300);
});

async function vorlageSuchen(text) {
  const nr = ++vorlageZaehler;
  const woerter = woerterAus(text);
  const ul = $('#vorlage-liste');
  if (!woerter.length) { ul.replaceChildren(); return; }
  let q = sb.from('raeder').select('id, hersteller, modell, reihe, baujahr, kategorie').order('baujahr', { ascending: false }).limit(20);
  for (const w of woerter) {
    q = /^(19|20)\d\d$/.test(w) ? q.eq('baujahr', Number(w)) : q.or(`hersteller.ilike.*${w}*,modell.ilike.*${w}*`);
  }
  const { data, error } = await q;
  if (nr !== vorlageZaehler) return;
  if (error) { ul.textContent = fehlerText(error); return; }
  if (!data.length) { ul.innerHTML = '<li class="fine">Kein Rad gefunden.</li>'; return; }
  ul.replaceChildren(...data.map((r) => {
    const li = document.createElement('li');
    const b = Object.assign(document.createElement('button'), { type: 'button' });
    b.append(Object.assign(document.createElement('span'), { textContent: `${r.hersteller} ${r.modell}` }),
      Object.assign(document.createElement('small'), { textContent: `${r.baujahr} · ${r.kategorie}` }));
    b.addEventListener('click', () => vorlageNehmen(r));
    li.append(b);
    return li;
  }));
}

async function vorlageNehmen(r) {
  const f = $('#f-rad');
  const msg = $('#f-rad .msg');
  meldung(msg, '');
  try {
    const details = (await rpc('rad_details', { ids: [r.id] })) || [];
    const ids = ((details[0] && details[0].teile) || []).map((t) => t.teil_id);
    let infos = [];
    if (ids.length) {
      const { data, error } = await sb.from('teile').select('id, marke, name, kategorie').in('id', ids);
      if (error) throw error;
      infos = data;
    }
    const nachId = new Map(infos.map((t) => [t.id, t]));
    f.hersteller.value = r.hersteller;
    // Reihe übernehmen, die Ausstattung ändert sich bei der Vorlage meist
    const reihe = r.reihe && r.modell.startsWith(r.reihe) ? r.reihe : r.modell;
    f.reihe.value = reihe;
    f.ausstattung.value = reihe === r.modell ? '' : r.modell.slice(reihe.length).trim();
    f.kategorie.value = r.kategorie;
    f.baujahr.value = '';
    radTeile = ids.filter((id) => nachId.has(id)).map((id) => {
      const t = nachId.get(id);
      return { teil_id: id, name: `${t.marke} ${t.name}`, kategorie: t.kategorie, ean: '' };
    });
    zeichneTeile();
    $('#vorlage').open = false;
    $('#vorlage-suche').value = '';
    $('#vorlage-liste').replaceChildren();
    meldung(msg, `Vorlage ${r.hersteller} ${r.modell} (${r.baujahr}) übernommen: ${radTeile.length} Teile. Jetzt Modelljahr eintragen und Unterschiede anpassen.`);
    f.baujahr.focus();
  } catch (e) {
    meldung(msg, fehlerText(e), true);
  }
}

// ----- Teileliste einfügen -----

// Überschriften aus Datenblättern, die auf eine Kategorie zeigen
const KATEGORIE_WOERTER = [
  ['schaltwerk', 'Schaltwerk'], ['umwerfer', 'Umwerfer'], ['schalthebel', 'Schalthebel'], ['schalt-/bremshebel', 'Schalthebel'],
  ['schaltbremshebel', 'Schalthebel'], ['shifter', 'Schalthebel'], ['kurbel', 'Kurbel'], ['kettenblatt', 'Kurbel'], ['crank', 'Kurbel'],
  ['kassette', 'Kassette'], ['zahnkranz', 'Kassette'], ['cassette', 'Kassette'], ['kette', 'Kette'], ['chain', 'Kette'],
  ['riemen', 'Riemen'], ['motor', 'Motor'], ['akku', 'Akku'], ['batterie', 'Akku'], ['bremsbel', 'Bremsbelag'],
  ['bremsscheibe', 'Bremsscheibe'], ['rotor', 'Bremsscheibe'], ['bremse', 'Bremssattel'], ['brake', 'Bremssattel'],
  ['reifen', 'Reifen'], ['mantel', 'Reifen'], ['tire', 'Reifen'], ['tyre', 'Reifen'], ['schlauch', 'Schlauch'],
  ['laufr', 'Laufradsatz'], ['wheel', 'Laufradsatz'], ['felge', 'Laufradsatz'], ['innenlager', 'Innenlager'],
  ['tretlager', 'Innenlager'], ['bottom bracket', 'Innenlager'], ['steckachse', 'Steckachse'], ['achse', 'Steckachse'],
  ['steuersatz', 'Steuersatz'], ['gabel', 'Gabel'], ['fork', 'Gabel'], ['lenkerband', 'Lenkerband'], ['lenker', 'Lenker'],
  ['sattelstütze', 'Sattelstütze'], ['sattelstuetze', 'Sattelstütze'], ['seatpost', 'Sattelstütze'], ['sattel', 'Sattel'],
  ['saddle', 'Sattel'], ['pedal', 'Pedale'],
];

function woerterAus(text) {
  return text.toLowerCase().split(/[\s,;()]+/).map((w) => w.replace(/[^\p{L}\p{N}.\-/+]/gu, '')).filter((w) => w.length >= 2);
}

function zeileZerlegen(zeile) {
  let text = zeile.replace(/\t+/g, ': ').trim();
  let kategorie = null;
  const m = text.match(/^([^:]{2,40}):\s*(.+)$/);
  const kopf = (m ? m[1] : text).toLowerCase();
  for (const [wort, kat] of KATEGORIE_WOERTER) if (kopf.includes(wort)) { kategorie = kat; break; }
  if (m) text = m[2];
  return { text, kategorie };
}

async function zeileZuordnen(zeile) {
  const { text, kategorie } = zeileZerlegen(zeile);
  const woerter = woerterAus(text).filter((w) => !/^(mit|und|für|fuer|the|and|x)$/.test(w)).slice(0, 8);
  if (!woerter.length) return { zeile, text, kategorie, kandidaten: [] };
  const { data } = await sb.from('teile').select('id, marke, name, kategorie')
    .or(woerter.map((w) => `name.ilike.*${w}*,marke.ilike.*${w}*`).join(',')).limit(200);
  const kandidaten = (data || []).map((t) => {
    const hay = `${t.marke} ${t.name}`.toLowerCase();
    const treffer = woerter.filter((w) => hay.includes(w));
    let punkte = treffer.length;
    // Modellnummern (mit Ziffern) zählen doppelt
    const nummer = woerter.some((w) => /\d/.test(w) && w.length >= 3 && hay.includes(w));
    if (nummer) punkte += 1;
    if (kategorie && t.kategorie === kategorie) punkte += 1.5;
    // Sicher nur, wenn mehr als die Marke passt: Modellnummer oder die meisten Wörter der Zeile
    const marke = t.marke.toLowerCase();
    const ohneMarke = treffer.filter((w) => !marke.includes(w)).length;
    const sicher = (kategorie ? !t.kategorie || t.kategorie === kategorie : true)
      && ohneMarke >= 1 && (nummer || treffer.length >= Math.max(2, Math.ceil(woerter.length * 0.6)));
    return { ...t, punkte, sicher };
  }).sort((a, b) => b.punkte - a.punkte || a.name.length - b.name.length).slice(0, 6);
  return { zeile, text, kategorie, kandidaten };
}

let einfuegenErgebnis = [];
const NEU = '__neu';
$('#einfuegen-los').addEventListener('click', async () => {
  const zeilen = $('#einfuegen').value.split(/\n/).map((z) => z.trim()).filter((z) => z.length >= 3).slice(0, 40);
  const info = $('#einfuegen-info');
  const knopf = $('#einfuegen-los');
  if (!zeilen.length) { info.textContent = 'Bitte zuerst die Teileliste einfügen.'; return; }
  knopf.disabled = true;
  info.textContent = `Suche ${zeilen.length} Teile …`;
  try {
    einfuegenErgebnis = await Promise.all(zeilen.map(zeileZuordnen));
  } finally {
    knopf.disabled = false;
  }
  const sicher = einfuegenErgebnis.filter((e) => e.kandidaten.some((k) => k.sicher)).length;
  info.textContent = `${sicher} von ${zeilen.length} Zeilen im Katalog gefunden${sicher < zeilen.length ? `, ${zeilen.length - sicher} als neue Teile vorbereitet` : ''}. Bitte kurz prüfen.`;
  $('#einfuegen-ergebnis').replaceChildren(...einfuegenErgebnis.map((e, i) => {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('div'), { className: 'zeilentext', textContent: e.zeile }));
    const sel = document.createElement('select');
    sel.dataset.i = String(i);
    sel.setAttribute('aria-label', `Katalogteil für ${e.text}`);
    sel.append(new Option('Nicht übernehmen', ''));
    for (const k of e.kandidaten) sel.append(new Option(`${k.marke} ${k.name} · ${k.kategorie}`, k.id));
    sel.append(new Option('＋ Neu im Katalog anlegen', NEU));
    const beste = e.kandidaten[0];
    const sicherer = e.kandidaten.find((k) => k.sicher);
    sel.value = sicherer ? sicherer.id : NEU;
    // Felder für ein neues Teil, vorbelegt aus der Zeile (erstes Wort = Marke)
    const neu = Object.assign(document.createElement('div'), { className: 'neu-zeile' });
    const leer = e.text.indexOf(' ');
    const feld = (name, wert, platz) => {
      const inp = Object.assign(document.createElement('input'), { name, value: wert, placeholder: platz, maxLength: name === 'marke' ? 40 : 80 });
      inp.setAttribute('aria-label', `${platz} für ${e.text}`);
      return inp;
    };
    const kat = document.createElement('select');
    kat.name = 'kategorie';
    kat.setAttribute('aria-label', `Kategorie für ${e.text}`);
    kat.append(new Option('Kategorie wählen', ''), ...TEIL_KATEGORIEN.map((k) => new Option(k, k)));
    kat.value = e.kategorie && TEIL_KATEGORIEN.includes(e.kategorie) ? e.kategorie : '';
    neu.append(feld('marke', leer > 0 ? e.text.slice(0, leer) : '', 'Marke'), feld('name', leer > 0 ? e.text.slice(leer + 1) : e.text, 'Name'), kat);
    const zeigeNeu = () => { neu.hidden = sel.value !== NEU; };
    sel.addEventListener('change', zeigeNeu);
    zeigeNeu();
    li.append(sel, neu);
    return li;
  }));
  $('#einfuegen-fertig').hidden = !einfuegenErgebnis.length;
});

$('#einfuegen-uebernehmen').addEventListener('click', () => {
  let n = 0;
  const fehlt = [];
  for (const sel of $$('#einfuegen-ergebnis select[data-i]')) {
    const e = einfuegenErgebnis[Number(sel.dataset.i)];
    if (sel.value === NEU) {
      const z = sel.closest('li');
      const neu = { marke: $('[name=marke]', z).value.trim(), name: $('[name=name]', z).value.trim(), kategorie: $('[name=kategorie]', z).value };
      if (!neu.marke || !neu.name || !neu.kategorie) { fehlt.push(e.text); continue; }
      if (radTeile.some((x) => x.neu && `${x.neu.marke} ${x.neu.name}`.toLowerCase() === `${neu.marke} ${neu.name}`.toLowerCase())) continue;
      radTeile.push({ neu, name: `${neu.marke} ${neu.name}`, kategorie: neu.kategorie, ean: '' });
      n += 1;
      continue;
    }
    const t = e && e.kandidaten.find((k) => k.id === sel.value);
    if (!t || radTeile.some((x) => x.teil_id === t.id)) continue;
    if (ergaenzen && ergaenzen.vorhanden.some((x) => x.id === t.id)) continue;
    radTeile.push({ teil_id: t.id, name: `${t.marke} ${t.name}`, kategorie: t.kategorie, ean: '' });
    n += 1;
  }
  zeichneTeile();
  if (fehlt.length) {
    $('#einfuegen-info').textContent = `${n} Teile übernommen. Bei ${fehlt.length} neuen Teilen fehlen noch Marke, Name oder Kategorie, sie stehen noch unten.`;
    // Nur die unvollständigen Zeilen stehen lassen
    for (const sel of $$('#einfuegen-ergebnis select[data-i]')) if (!(sel.value === NEU && fehlt.includes(einfuegenErgebnis[Number(sel.dataset.i)].text))) sel.closest('li').remove();
    return;
  }
  $('#einfuegen-info').textContent = `${n} Teile übernommen.`;
  $('#einfuegen-ergebnis').replaceChildren();
  $('#einfuegen-fertig').hidden = true;
  $('#einfuegen').value = '';
});

// ----- Barcode mit der Kamera -----

let scanLeser = null;
let scanAbbruch = null;

function kameraMoeglich() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
}

const ICON = {
  scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9v6M11 9v6M14 9v6M17 9v6"/></svg>',
  stift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  raus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/></svg>',
};

function scanKnopf(wo, inp, danach, alsIcon) {
  if (!kameraMoeglich()) return;
  const b = Object.assign(document.createElement('button'), { type: 'button', className: alsIcon ? 'feld-icon scan-knopf' : 'pill ghost klein scan-knopf' });
  if (alsIcon) { b.innerHTML = ICON.scan; b.title = 'Mit der Kamera scannen'; } else b.textContent = 'Scannen';
  b.setAttribute('aria-label', 'Barcode mit der Kamera scannen');
  b.addEventListener('click', async () => {
    const code = await scannen();
    if (!code) return;
    inp.value = code;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    if (danach) danach(code);
  });
  wo.append(b);
}

function scannen() {
  return new Promise((fertig) => {
    if (!window.ZXing) { window.alert('Der Scanner lädt noch, bitte gleich noch einmal.'); fertig(null); return; }
    const box = $('#scanner');
    const video = $('#scanner-video');
    $('#scanner-text').textContent = 'Barcode in den Rahmen halten …';
    box.hidden = false;
    const hinweise = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128]]]);
    scanLeser = new ZXing.BrowserMultiFormatReader(hinweise);
    let erledigt = false;
    const ende = (code) => {
      if (erledigt) return;
      erledigt = true;
      try { scanLeser.reset(); } catch { /* schon gestoppt */ }
      box.hidden = true;
      fertig(code);
    };
    scanAbbruch = () => ende(null);
    scanLeser.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (ergebnis) => {
      if (!ergebnis) return;
      const code = String(ergebnis.getText()).replace(/\D/g, '');
      if (code.length >= 8 && code.length <= 14) ende(code);
    }).catch(() => {
      $('#scanner-text').textContent = 'Kamera nicht verfügbar. Bitte den Zugriff erlauben oder den Code abtippen.';
    });
  });
}
$('#scanner-zu').addEventListener('click', () => scanAbbruch && scanAbbruch());
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#scanner').hidden && scanAbbruch) scanAbbruch(); });

// Scan-Knöpfe an den festen Barcode-Feldern
for (const f of [$('#f-teil'), $('#f-neues-teil')]) {
  const inp = f.ean;
  const zeile = document.createElement('div');
  zeile.style.display = 'flex';
  zeile.style.gap = '8px';
  inp.replaceWith(zeile);
  zeile.append(inp);
  scanKnopf(zeile, inp);
}

// ----- Vorhandenes Rad ergänzen -----

let aehnlichZaehler = 0;
let aehnlichTimer = null;
for (const n of ['hersteller', 'baujahr', 'reihe', 'ausstattung']) {
  $('#f-rad')[n].addEventListener('input', () => {
    clearTimeout(aehnlichTimer);
    aehnlichTimer = setTimeout(() => aehnlichePruefen(false), 500);
  });
}

async function aehnlichePruefen(auchLeer) {
  if (ergaenzen) return;
  const f = $('#f-rad');
  const hersteller = f.hersteller.value.trim();
  const jahr = Number(f.baujahr.value);
  const modell = `${f.reihe.value.trim()} ${f.ausstattung.value.trim()}`.trim();
  const box = $('#aehnlich');
  const nr = ++aehnlichZaehler;
  if (!hersteller || !jahr || jahr < 1990 || modell.length < 2) { box.hidden = true; return; }
  let liste = [];
  try {
    liste = (await rpc('katalog_aehnliche', { p_hersteller: hersteller, p_baujahr: jahr, p_modell: modell })) || [];
  } catch {
    liste = [];
  }
  if (nr !== aehnlichZaehler) return;
  box.hidden = !liste.length && !auchLeer;
  if (!liste.length) { box.hidden = true; return; }
  $('#aehnlich-liste').replaceChildren(...liste.slice(0, 8).map((r) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const n = document.createElement('span');
    n.textContent = `${r.hersteller} ${r.modell} (${r.baujahr})`;
    const k = document.createElement('small');
    k.textContent = (r.gleich ? 'gleicher Name · ' : '') + 'Dieses Rad ergänzen';
    b.append(n, k);
    b.addEventListener('click', () => ergaenzenStart(r));
    li.append(b);
    return li;
  }));
}

async function ergaenzenStart(r) {
  const msg = $('#f-rad .msg');
  meldung(msg, '');
  try {
    const details = (await rpc('rad_details', { ids: [r.id] })) || [];
    const ids = ((details[0] && details[0].teile) || []).map((t) => t.teil_id);
    let infos = [];
    if (ids.length) {
      const { data, error } = await sb.from('teile').select('id, marke, name, kategorie').in('id', ids);
      if (error) throw error;
      infos = data;
    }
    const nachId = new Map(infos.map((t) => [t.id, t]));
    ergaenzen = {
      rad: { id: r.id, name: `${r.hersteller} ${r.modell} (${r.baujahr})` },
      vorhanden: ids.filter((id) => nachId.has(id)).map((id) => {
        const t = nachId.get(id);
        return { id, name: `${t.marke} ${t.name}`, kategorie: t.kategorie };
      }),
      weg: new Set(),
    };
    // Schon gewählte Teile, die das Rad bereits hat, fallen raus
    radTeile = radTeile.filter((t) => !t.teil_id || !nachId.has(t.teil_id));
    ergaenzenZeigen();
  } catch (e) {
    meldung(msg, fehlerText(e), true);
  }
}

function ergaenzenZeigen() {
  const an = !!ergaenzen;
  $('#rad-felder').disabled = an;
  $('#rad-felder').hidden = an;
  $('#aehnlich').hidden = true;
  $('#ergaenzen-kopf').hidden = !an;
  $('#vorhanden-box').hidden = !an;
  $('#notiz-feld').hidden = !an;
  $('#rad-titel').textContent = an ? 'Rad ergänzen' : 'Rad';
  $('#teile-titel').textContent = an ? 'Neue Teile' : 'Teile am Rad';
  $('#rad-speichern').textContent = an ? 'Ergänzung speichern' : 'Rad speichern';
  if (an) {
    $('#ergaenzen-name').textContent = ergaenzen.rad.name;
    zeichneVorhanden();
  }
  zeichneTeile();
}

function zeichneVorhanden() {
  const ul = $('#vorhanden');
  $('#vorhanden-zahl').textContent = `(${ergaenzen.vorhanden.length})`;
  if (!ergaenzen.vorhanden.length) {
    ul.innerHTML = '<li class="leer">Zu diesem Rad sind noch keine Teile eingetragen.</li>';
    return;
  }
  ul.replaceChildren(...ergaenzen.vorhanden.map((t) => {
    const li = document.createElement('li');
    const weg = ergaenzen.weg.has(t.id);
    li.classList.toggle('weg', weg);
    const links = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = t.name;
    const neben = document.createElement('div');
    neben.className = 'neben';
    const marke = document.createElement('span');
    marke.className = 'marke' + (weg ? ' minus' : '');
    marke.textContent = weg ? 'wird entfernt' : t.kategorie;
    neben.append(marke);
    links.append(name, neben);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill ghost klein';
    b.textContent = weg ? 'Behalten' : 'Entfernen';
    b.addEventListener('click', () => {
      if (weg) ergaenzen.weg.delete(t.id); else ergaenzen.weg.add(t.id);
      zeichneVorhanden();
    });
    li.append(zeile, b);
    return li;
  }));
}

function ergaenzenEnde() {
  ergaenzen = null;
  ergaenzenZeigen();
}
$('#ergaenzen-ende').addEventListener('click', () => {
  ergaenzenEnde();
  meldung($('#f-rad .msg'), '');
});
