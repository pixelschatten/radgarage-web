// Werkbank, Teil 11 von 11: CSV-Export, Suche über alles, Hinweise (Glocke), Start.
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

// ---------- Suche über alles (Strg+K oder /), direkt im Feld oben in der Leiste ----------

let sucheNr = 0;
let sucheTimer = null;
const sucheFeld = $('#suche-feld');
const sucheBox = $('#suche-ergebnis');
const handySuche = matchMedia('(max-width: 760px)');
function sucheZeigen() {
  if (!sucheBox.children.length) { sucheZu(); return; }
  // Am Handy liegen die Treffer fest unter der Leiste
  if (handySuche.matches) document.documentElement.style.setProperty('--suche-oben', `${$('header.leiste').getBoundingClientRect().bottom + 8}px`);
  sucheBox.hidden = false;
  sucheFeld.setAttribute('aria-expanded', 'true');
}
function sucheZu(ganz) {
  sucheBox.hidden = true;
  sucheFeld.setAttribute('aria-expanded', 'false');
  if (ganz) { $('header.leiste').classList.remove('sucht'); sucheFeld.blur(); }
}
function sucheOeffnen() {
  if ($('#s-werkbank').hidden) return;
  $('header.leiste').classList.add('sucht');
  sucheFeld.focus();
  sucheFeld.select();
}
sucheFeld.addEventListener('focus', () => {
  sucheFeld.placeholder = darf('konten_sehen') ? 'Rad, Teil, Barcode oder E-Mail' : 'Rad, Teil oder Barcode';
  sucheZeigen();
});
sucheFeld.addEventListener('blur', () => { sucheFeld.placeholder = 'Suchen'; });
sucheFeld.addEventListener('input', () => {
  $('#suche-box').classList.toggle('hat-text', !!sucheFeld.value);
  clearTimeout(sucheTimer);
  sucheTimer = setTimeout(async () => {
    await sucheLos(sucheFeld.value, sucheBox);
    if (document.activeElement === sucheFeld) sucheZeigen();
  }, 200);
});
sucheFeld.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    ev.preventDefault();
    if (!sucheBox.hidden) { sucheZu(); return; }
    sucheFeld.value = '';
    $('#suche-box').classList.remove('hat-text');
    sucheBox.replaceChildren();
    sucheZu(true);
    return;
  }
  const knoepfe = sucheBox.hidden ? [] : $$('button', sucheBox);
  if (!knoepfe.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(ev.key)) return;
  ev.preventDefault();
  let i = knoepfe.findIndex((b) => b.getAttribute('aria-selected') === 'true');
  if (ev.key === 'Enter') { (knoepfe[i] || knoepfe[0]).click(); return; }
  i = ev.key === 'ArrowDown' ? Math.min(knoepfe.length - 1, i + 1) : Math.max(0, i - 1);
  knoepfe.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
  knoepfe[i].scrollIntoView({ block: 'nearest' });
});
$('#suche-zu').addEventListener('click', () => {
  sucheFeld.value = '';
  $('#suche-box').classList.remove('hat-text');
  sucheBox.replaceChildren();
  sucheZu(true);
});
$('#suche-auf').addEventListener('click', sucheOeffnen);
document.addEventListener('click', (ev) => {
  const offen = !sucheBox.hidden || $('header.leiste').classList.contains('sucht');
  if (offen && !ev.target.closest('#suche-box, #suche-auf')) sucheZu(handySuche.matches);
});
handySuche.addEventListener('change', () => sucheZu(true));

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
      b.addEventListener('click', () => { sucheZu(true); fn(); });
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
  else if (!handySuche.matches) box.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Pfeiltasten wählen, Enter öffnet, Esc schließt.' }));
  const erstes = $('button', box);
  if (erstes) erstes.setAttribute('aria-selected', 'true');
}
document.addEventListener('keydown', (ev) => {
  const tippt = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !tippt)) {
    ev.preventDefault();
    if ($('#dlg').hidden) sucheOeffnen();
  }
});

// ---------- Hinweise: Glocke oben rechts ----------
// Sammelt alles, was ansteht (neue Warteliste und Konten, Freigaben, App-Vorschläge, Website-Hinweise, Feedback, Mails,
// Betrieb, abgelehnte eigene Einträge), je nach Recht. Klick auf die Glocke klappt die Liste auf, Klick auf einen Hinweis
// führt an die Stelle. Alle zwei Minuten neu gefragt, solange der Tab sichtbar ist.

const TITEL_WERKBANK = document.title;
const HW_SYMBOL = {
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  liste: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  rad: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h5l3 8M10 8l4 8"/>',
  stift: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  welt: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  handy: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  blase: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  ampel: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  zurueck: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};
let hwBetrieb = null;
let hwRueck = [];
let hwToastZeit = null;

function rueckGesehen() {
  try { return localStorage.getItem('werkbank-rueck-gesehen') || ''; } catch { return ''; }
}

// Alle Hinweise als [schluessel, anzahl, titel, unter, farbe, symbol, ziel]; zählt nur, was die Rolle sehen darf
function hinweisListe() {
  const w = neuDaten && neuDaten.warteliste;
  const k = neuDaten && neuDaten.konten;
  const namen = (liste) => (liste || []).slice(0, 2).map((x) => x.email).join(', ') + ((liste || []).length > 2 ? ' …' : '');
  const pflegen = darf('katalog_pflegen');
  const web = appGruppen.filter((g) => g.web).length;
  const korr = appGruppen.filter((g) => !g.web && g.art === 'korrektur').length;
  const probleme = (hwBetrieb && hwBetrieb.probleme) || [];
  const rot = probleme.filter((p) => p.stufe === 'rot');
  const seit = rueckGesehen();
  const rueck = hwRueck.filter((x) => String(x.wann) > seit);
  return [
    ['warteliste', w ? w.anzahl : 0, 'Neu auf der Warteliste', namen(w && w.eintraege), 'k4', 'liste', neuKachelZeigen],
    ['konten', k ? k.anzahl : 0, k && k.anzahl === 1 ? 'Neues Konto' : 'Neue Konten', namen(k && k.eintraege), 'k5', 'person', neuKachelZeigen],
    ['helfer', pflegen ? helferOffen : 0, 'Räder von Helfern freigeben', 'Neue Räder und Ergänzungen', 'k3', 'rad', () => { tab('freigaben'); fgAnsichtSetzen('helfer'); }],
    ['korrektur', pflegen ? korr : 0, 'Korrekturen aus der App', 'Nutzer melden Fehler an Rädern', 'k1', 'stift', () => { tab('freigaben'); appFilter = 'korrektur'; fgAnsichtSetzen('app'); }],
    ['app', pflegen ? appGruppen.length - web - korr : 0, 'Vorschläge aus der App', 'Räder, Teile, Barcodes', 'k2', 'handy', () => { tab('freigaben'); appFilter = ''; fgAnsichtSetzen('app'); }],
    ['web', pflegen ? web : 0, 'Hinweise von der Website', 'Besucher der Radseiten', 'k5', 'welt', () => { tab('freigaben'); fgAnsichtSetzen('web'); }],
    ['feedback', darf('feedback') ? fbNeu : 0, 'Neues Feedback', 'von radgarage.app/feedback', 'k3', 'blase', () => tab('feedback')],
    ['mails', darf('konten_betreuen') ? pfUngelesen : 0, 'Ungelesene Mails', 'im Postfach des CRM', 'k2', 'mail', () => zumPostfach()],
    ['betrieb', rot.length, 'Läuft nicht alles', (rot[0] || {}).text || '', 'k1', 'ampel', () => { tab('uebersicht'); $('#betrieb').scrollIntoView({ behavior: 'smooth', block: 'center' }); }],
    ['rueck', rueck.length, rueck.length === 1 ? 'Ein Eintrag wurde abgelehnt' : 'Einträge wurden abgelehnt', rueck[0] ? `${rueck[0].titel}${rueck[0].grund ? `: „${rueck[0].grund}“` : ''}` : '', 'k1', 'zurueck', () => {
      try { localStorage.setItem('werkbank-rueck-gesehen', String(hwRueck[0] ? hwRueck[0].wann : '')); } catch { /* dann bleibt er stehen */ }
      tab('eigene');
      hinweiseZeichnen();
    }],
  ];
}

function hinweiseZeichnen() {
  const glocke = $('#neu-glocke');
  if (!glocke) return;
  const angemeldet = !$('#s-werkbank').hidden;
  const alle = angemeldet ? hinweisListe() : [];
  const offen = alle.filter(([, n]) => n > 0);
  const n = offen.reduce((s, [, x]) => s + x, 0);
  // Gelbe Betriebspunkte zeigen, aber nicht mitzählen (manches bleibt länger gelb)
  const gelb = angemeldet ? ((hwBetrieb && hwBetrieb.probleme) || []).filter((p) => p.stufe === 'gelb') : [];
  glocke.classList.toggle('neu', n > 0);
  $('#neu-zahl').hidden = !n;
  $('#neu-zahl').textContent = n > 99 ? '99+' : String(n);
  glocke.title = n ? `${n} ${n === 1 ? 'Hinweis' : 'Hinweise'}` : 'Keine neuen Hinweise';
  glocke.setAttribute('aria-label', `Hinweise: ${glocke.title}`);
  document.title = n ? `(${n}) ${TITEL_WERKBANK}` : TITEL_WERKBANK;
  const zeile = (schluessel, anzahl, titel, unter, farbe, symbol, ziel) => {
    const b = mk('button', { type: 'button', className: 'hw-zeile' });
    b.innerHTML = `<span class="hw-symbol ${farbe}"><svg viewBox="0 0 24 24" aria-hidden="true">${HW_SYMBOL[symbol]}</svg></span>`;
    b.append(mk('span', { className: 'hw-text' }, mk('b', { textContent: titel }), unter ? mk('small', { textContent: unter }) : null),
      ...(anzahl ? [mk('span', { className: 'hw-anzahl', textContent: zahlDe(anzahl) })] : []));
    b.dataset.hinweis = schluessel;
    b.addEventListener('click', () => { glockeZu(); ziel(); });
    return b;
  };
  const liste = $('#hw-liste');
  liste.replaceChildren(...offen.map((h) => zeile(...h)),
    ...(gelb.length ? [zeile('betrieb-gelb', 0, gelb.length === 1 ? 'Bitte ansehen' : `${gelb.length} Punkte bitte ansehen`, gelb[0].text, 'k3', 'ampel',
      () => { tab('uebersicht'); $('#betrieb').scrollIntoView({ behavior: 'smooth', block: 'center' }); })] : []));
  if (!liste.children.length) liste.append(mk('p', { className: 'hw-leer', textContent: 'Alles erledigt. Neue Hinweise erscheinen hier.' }));
  const neu = alle.filter(([s, x]) => (s === 'warteliste' || s === 'konten') && x > 0).length;
  $('#hw-gesehen').hidden = !neu;
  return alle;
}

// Kurzer Hinweis oben, wenn beim regelmäßigen Nachfragen etwas dazugekommen ist
function hinweisToast(vorher, alle) {
  const mehr = alle.filter(([s, n]) => n > (vorher[s] || 0));
  if (!mehr.length) return;
  $('#neu-toast-text').textContent = `Neu: ${mehr.map(([s, n, titel]) => `${titel}${n > 1 ? ` (${n})` : ''}`).join(', ')}.`;
  $('#neu-toast').hidden = false;
  clearTimeout(hwToastZeit);
  hwToastZeit = setTimeout(() => { $('#neu-toast').hidden = true; }, 15000);
}

// alles: auch die Zahlen, die die Reiter sonst selbst laden (Freigaben, Feedback, Postfach)
// melden: Zuwachs gegenüber dem bisherigen Stand oben anzeigen (nur beim regelmäßigen Nachfragen)
async function hinweiseLaden(alles = false, melden = false) {
  if ($('#s-werkbank').hidden) {
    neuDaten = null;
    hwBetrieb = null;
    hwRueck = [];
    glockeZu();
    hinweiseZeichnen();
    return;
  }
  const vorher = Object.fromEntries(hinweisListe().map(([s, n]) => [s, n]));
  const auftraege = [
    neuDabei(),
    (darf('katalog_pflegen') || darf('system')) ? rpc('werkbank_betrieb').then((b) => { hwBetrieb = b; }, () => {}) : null,
    darf('katalog_erfassen') && !darf('katalog_pflegen') ? rpc('katalog_meine_rueckmeldungen').then((r) => {
      hwRueck = (r || []).slice().sort((a, b) => String(b.wann).localeCompare(String(a.wann)));
    }, () => {}) : null,
  ];
  if (alles) {
    if (darf('feedback')) auftraege.push(feedbackZahl());
    if (darf('konten_betreuen')) auftraege.push(postfachZahl());
    // Die offene Freigaben-Liste nicht unter den Händen neu zeichnen
    if (darf('katalog_pflegen') && $('[data-panel="freigaben"]').hidden) auftraege.push(ladeOffen());
  }
  await Promise.all(auftraege.filter(Boolean));
  const alle = hinweiseZeichnen() || [];
  if (melden) hinweisToast(vorher, alle);
}

function glockeZu() {
  $('#glocke-feld').hidden = true;
  $('#neu-glocke').setAttribute('aria-expanded', 'false');
}
$('#neu-glocke').addEventListener('click', () => {
  const feld = $('#glocke-feld');
  if (!feld.hidden) { glockeZu(); return; }
  hinweiseZeichnen();
  feld.hidden = false;
  // Auf dem Handy liegt das Feld fest über der Seite, direkt unter der Glocke
  if (getComputedStyle(feld).position === 'fixed') {
    const unten = $('#neu-glocke').getBoundingClientRect().bottom + 10;
    feld.style.top = `${unten}px`;
    feld.style.maxHeight = `${window.innerHeight - unten - 16}px`;
  } else { feld.style.top = ''; feld.style.maxHeight = ''; }
  $('#neu-glocke').setAttribute('aria-expanded', 'true');
  $('#neu-toast').hidden = true;
  const erste = $('.hw-zeile', feld);
  if (erste) erste.focus();
  hinweiseLaden(true);
});
document.addEventListener('click', (ev) => {
  if (!$('#glocke-feld').hidden && !ev.target.closest('#glocke-feld, #neu-glocke, #neu-toast')) glockeZu();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !$('#glocke-feld').hidden) { glockeZu(); $('#neu-glocke').focus(); }
});
$('#hw-gesehen').addEventListener('click', async () => {
  await neuGesehen();
  hinweiseZeichnen();
});
$('#neu-toast-auf').addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); $('#neu-glocke').click(); });
$('#neu-toast-zu').addEventListener('click', () => { $('#neu-toast').hidden = true; });
setInterval(() => { if (document.visibilityState === 'visible') hinweiseLaden(true, true); }, 120000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#s-werkbank').hidden) hinweiseLaden(true, true); });

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

// ----- Kopfleiste: Kontomenü (Konto, Design, Abmelden) und Burger-Menü für die Reiter am Handy -----
function kontoMenueZu() {
  $('#konto-menue').hidden = true;
  $('#konto-knopf').setAttribute('aria-expanded', 'false');
}
function reiterZu() {
  $('#reiter').classList.remove('offen');
  $('#burger').setAttribute('aria-expanded', 'false');
}
$('#konto-knopf').addEventListener('click', () => {
  if (!$('#konto-menue').hidden) { kontoMenueZu(); return; }
  reiterZu();
  $('#konto-menue').hidden = false;
  $('#konto-knopf').setAttribute('aria-expanded', 'true');
  $('#konto-auf').focus();
});
$('#konto-auf').addEventListener('click', kontoMenueZu);
$('#abmelden').addEventListener('click', kontoMenueZu);
$('#burger').addEventListener('click', () => {
  const reiter = $('#reiter');
  if (reiter.classList.contains('offen')) { reiterZu(); return; }
  kontoMenueZu();
  // Das Menü liegt fest direkt unter der Leiste, auch wenn weiter unten gescrollt ist
  document.documentElement.style.setProperty('--reiter-oben', `${$('header.leiste').getBoundingClientRect().bottom + 8}px`);
  reiter.classList.add('offen');
  $('#burger').setAttribute('aria-expanded', 'true');
  const aktiv = $('button[aria-selected="true"]', reiter) || $('button:not([hidden])', reiter);
  if (aktiv) aktiv.focus();
});
for (const b of $$('#reiter button')) b.addEventListener('click', reiterZu);
document.addEventListener('click', (ev) => {
  if (!$('#konto-menue').hidden && !ev.target.closest('#konto-menue, #konto-knopf')) kontoMenueZu();
  if ($('#reiter').classList.contains('offen') && !ev.target.closest('#reiter, #burger')) reiterZu();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('#konto-menue').hidden) { kontoMenueZu(); $('#konto-knopf').focus(); }
  if ($('#reiter').classList.contains('offen')) { reiterZu(); $('#burger').focus(); }
});
matchMedia('(max-width: 760px)').addEventListener('change', reiterZu);
