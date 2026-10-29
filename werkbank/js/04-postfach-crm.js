// Werkbank, Teil 4 von 11: Postfach und CRM.
'use strict';

// ----- Postfach: Unterhaltungen mit Nutzern (Recht konten_betreuen, postfach.sql) -----

let pfStatus = 'offen';
let pfListe = [];
let pfUngelesen = 0;
let pfSucheZeit = null;
const zeitDe = (d) => new Date(d).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function postfachZahlSetzen(n) {
  pfUngelesen = n;
  $('#pf-zahl-neu').hidden = !n;
  $('#pf-zahl-neu').textContent = String(n);
  hinweiseZeichnen();
}

async function postfachZahl() {
  try { postfachZahlSetzen((await rpc('postfach_anzahl')) || 0); } catch { /* Zahl ist nur Beiwerk */ }
}

async function ladePostfach() {
  meldung($('#msg-postfach'), '');
  for (const b of $$('#pf-status button')) b.setAttribute('aria-checked', String(b.dataset.status === pfStatus));
  try {
    ladeOrdner();
    pfListe = (await rpc('postfach_liste', { p_status: pfStatus, p_suche: $('#pf-suche').value, p_ordner: pfOrdner })) || [];
    if (pfStatus === 'offen' && !$('#pf-suche').value.trim() && !pfOrdner) {
      $('#pf-zahl-offen').textContent = pfListe.length ? `(${pfListe.length})` : '';
      postfachZahlSetzen(pfListe.filter((u) => u.ungelesen > 0).length);
    }
    // Auswahl auf das Sichtbare beschränken
    for (const id of [...pfGewaehlt]) if (!pfListe.some((u) => u.id === id)) pfGewaehlt.delete(id);
    $('#pf-liste').replaceChildren(...pfListe.map(postfachKarte));
    pfLeiste();
    if (!pfListe.length) {
      $('#pf-liste').innerHTML = `<p class="fine">${{ offen: 'Nichts offen.', erledigt: 'Noch nichts erledigt.', spam: 'Kein Spam.' }[pfStatus] || 'Noch keine Unterhaltungen.'}</p>`;
    }
  } catch (e) {
    meldung($('#msg-postfach'), fehlerText(e), true);
  }
}

// „vor 12 Min.“, „gestern, 14:20“, sonst Datum
function zeitKurz(d) {
  const t = new Date(d);
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const uhr = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  if (t >= heute) return uhr;
  if (t >= heute - 864e5) return `gestern, ${uhr}`;
  return t.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: t.getFullYear() === heute.getFullYear() ? undefined : 'numeric' });
}

function postfachKarte(u) {
  const zeile = Object.assign(document.createElement('button'), { type: 'button', className: `pf-zeile${u.ungelesen > 0 ? ' ungelesen' : ''}` });
  const wer = u.name || u.email;
  const mitte = Object.assign(document.createElement('span'), { className: 'pf-mitte' });
  const kopf = Object.assign(document.createElement('span'), { className: 'pf-kopf' });
  kopf.append(Object.assign(document.createElement('span'), { className: 'pf-wer', textContent: wer }),
    ...(u.anzahl > 1 ? [Object.assign(document.createElement('span'), { className: 'pf-anzahl', textContent: String(u.anzahl) })] : []),
    ...(u.konto ? [Object.assign(document.createElement('span'), { className: 'pf-chip', textContent: 'Konto' })] : []),
    Object.assign(document.createElement('time'), { className: 'pf-zeit', dateTime: u.letzte, textContent: zeitKurz(u.letzte), title: zeitDe(u.letzte) }));
  mitte.append(kopf, Object.assign(document.createElement('span'), { className: 'pf-betreff', textContent: u.betreff || '(ohne Betreff)' }));
  const meta = [];
  if (u.zugewiesen_email) meta.push(Object.assign(document.createElement('span'), { className: 'zu', textContent: `→ ${u.zugewiesen_email.split('@')[0]}` }));
  if (u.wiedervorlage) meta.push(Object.assign(document.createElement('span'), { className: 'wv', textContent: `⏰ ${new Date(u.wiedervorlage).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, title: `Wiedervorlage ${zeitDe(u.wiedervorlage)}` }));
  if (u.ordner_name && pfOrdner !== u.ordner) {
    const or = mk('span', { className: 'or', textContent: u.ordner_name });
    or.style.setProperty('--of', ordnerFarbe(u.ordner));
    or.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" aria-hidden="true">${ORDNER_SVG.ordner}</svg>`);
    meta.push(or);
  }
  for (const w of u.schlagworte || []) meta.push(Object.assign(document.createElement('span'), { textContent: `#${w}` }));
  if (u.zuletzt) {
    mitte.append(Object.assign(document.createElement('span'), {
      className: 'pf-vorschau', textContent: `${u.zuletzt.richtung === 'aus' ? 'Du: ' : ''}${u.zuletzt.text.replace(/\s+/g, ' ')}`,
    }));
  }
  if (meta.length) {
    const m = Object.assign(document.createElement('span'), { className: 'pf-meta' });
    m.append(...meta);
    mitte.append(m);
  }
  zeile.append(ava(u.name || u.email), mitte);
  zeile.setAttribute('aria-label', `${wer}: ${u.betreff || 'ohne Betreff'}${u.ungelesen > 0 ? ', ungelesen' : ''}`);
  zeile.addEventListener('click', () => unterhaltung(u.id));
  // Gelesen/ungelesen umschalten, ohne die Mail zu öffnen
  const ungelesen = u.ungelesen > 0;
  const schalter = Object.assign(document.createElement('button'), {
    type: 'button', className: 'pf-gelesen', textContent: ungelesen ? 'Gelesen' : 'Ungelesen',
    title: ungelesen ? 'Als gelesen markieren' : 'Als ungelesen markieren',
  });
  schalter.addEventListener('click', async () => {
    schalter.disabled = true;
    try {
      await rpc('postfach_gelesen', { p_id: u.id, p_gelesen: ungelesen });
      await ladePostfach();
      postfachZahl();
    } catch (e) { meldung($('#msg-postfach'), fehlerText(e), true); schalter.disabled = false; }
  });
  const eintrag = Object.assign(document.createElement('div'), { className: 'pf-eintrag' });
  eintrag.append(pfHaken(u), zeile, schalter);
  return eintrag;
}

// ----- Mehrere Unterhaltungen ankreuzen und gemeinsam bearbeiten (gelesen, Status, Ordner, löschen) -----

const pfGewaehlt = new Set();
let pfLetzterHaken = null;
function pfHaken(u) {
  const h = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'wahl', checked: pfGewaehlt.has(u.id), value: String(u.id) });
  h.setAttribute('aria-label', `${u.name || u.email} auswählen`);
  h.title = 'Auswählen (mit Umschalttaste alle bis hierher)';
  h.addEventListener('click', (ev) => {
    // Mit Umschalt alles zwischen dem letzten Haken und diesem
    const ids = pfListe.map((x) => x.id);
    const von = ids.indexOf(pfLetzterHaken);
    const bis = ids.indexOf(u.id);
    for (const id of ev.shiftKey && von >= 0 ? ids.slice(Math.min(von, bis), Math.max(von, bis) + 1) : [u.id]) {
      if (h.checked) pfGewaehlt.add(id); else pfGewaehlt.delete(id);
    }
    pfLetzterHaken = u.id;
    pfLeiste();
  });
  return h;
}

// Für alle gewählten nacheinander ausführen, höchstens vier Anfragen gleichzeitig
async function pfSammel(fn, text) {
  const ids = [...pfGewaehlt];
  if (!ids.length) return;
  const warte = [...ids];
  let fehler = 0;
  let letzter = null;
  const arbeiter = async () => {
    while (warte.length) {
      const id = warte.shift();
      try { await fn(id); } catch (e) { fehler++; letzter = e; }
    }
  };
  await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);
  pfGewaehlt.clear();
  await ladePostfach();
  postfachZahl();
  const n = ids.length - fehler;
  meldung($('#msg-postfach'), `${n === 1 ? 'Eine Unterhaltung' : `${zahlDe(n)} Unterhaltungen`} ${text}.${fehler ? ` ${zahlDe(fehler)} hat nicht geklappt: ${fehlerText(letzter)}` : ''}`, !!fehler);
}

function pfLeiste() {
  let leiste = $('#pf-auswahl');
  if (!leiste) {
    leiste = mk('div', { id: 'pf-auswahl', className: 'wort-leiste pf-auswahl', hidden: true });
    leiste.setAttribute('role', 'toolbar');
    leiste.setAttribute('aria-label', 'Ausgewählte Unterhaltungen');
    $('#pf-liste').before(leiste);
  }
  for (const h of $$('#pf-liste input.wahl')) h.checked = pfGewaehlt.has(Number(h.value));
  leiste.hidden = !pfGewaehlt.size;
  if (!pfGewaehlt.size) { leiste.replaceChildren(); return; }
  const knopf = (titel, fn, art = 'pill ghost mini') => mk('button', { type: 'button', className: art, textContent: titel, onclick: fn });
  const setzen = (status, text) => () => pfSammel((id) => rpc('postfach_setzen', { p_id: id, p_status: status }), text);
  const gelesen = (ja) => () => pfSammel((id) => rpc('postfach_gelesen', { p_id: id, p_gelesen: ja }), ja ? 'als gelesen markiert' : 'als ungelesen markiert');
  const teile = [mk('strong', { textContent: `${zahlDe(pfGewaehlt.size)} ausgewählt` })];
  if (pfListe.some((u) => !pfGewaehlt.has(u.id))) {
    teile.push(mk('button', { type: 'button', className: 'link-knopf', textContent: `Alle ${zahlDe(pfListe.length)} wählen`,
      onclick: () => { for (const u of pfListe) pfGewaehlt.add(u.id); pfLeiste(); } }));
  }
  const gewaehlt = pfListe.filter((u) => pfGewaehlt.has(u.id));
  if (gewaehlt.some((u) => u.ungelesen > 0)) teile.push(knopf('Gelesen', gelesen(true), 'pill mini'));
  if (gewaehlt.some((u) => !(u.ungelesen > 0))) teile.push(knopf('Ungelesen', gelesen(false)));
  if (pfStatus !== 'erledigt') teile.push(knopf('✓ Erledigt', setzen('erledigt', 'erledigt')));
  if (['erledigt', 'spam', ''].includes(pfStatus)) teile.push(knopf(pfStatus === 'spam' ? 'Kein Spam' : 'Wieder öffnen', setzen('offen', 'wieder geöffnet')));
  if (pfStatus !== 'spam') teile.push(knopf('Spam', setzen('spam', 'als Spam abgelegt')));
  // Verschieben in einen Ordner oder aus dem Ordner heraus
  const ziel = mk('select', { className: 'pf-verschieben' });
  ziel.setAttribute('aria-label', 'In Ordner verschieben');
  ziel.append(new Option('In Ordner …', ''), ...ordnerListe.map((o) => new Option(o.name, String(o.id))), new Option('Aus dem Ordner nehmen', 'kein'));
  ziel.addEventListener('change', () => {
    if (!ziel.value) return;
    const id = ziel.value === 'kein' ? null : Number(ziel.value);
    const o = ordnerListe.find((x) => x.id === id);
    pfSammel((pid) => rpc('postfach_ablegen', { p_id: pid, p_ordner: id }), id ? `in „${o ? o.name : 'Ordner'}“ abgelegt` : 'aus dem Ordner genommen');
  });
  if (ordnerListe.length) teile.push(ziel);
  // Löschen erst beim zweiten Klick
  const weg = knopf('Löschen', () => {
    if (!weg.dataset.sicher) { weg.dataset.sicher = '1'; weg.textContent = `Wirklich ${zahlDe(pfGewaehlt.size)} löschen?`; weg.classList.add('gefahr'); return; }
    pfSammel((id) => rpc('postfach_loeschen', { p_id: id }), 'gelöscht');
  });
  teile.push(weg, knopf('Auswahl aufheben', () => { pfGewaehlt.clear(); pfLeiste(); }, 'link-knopf'));
  leiste.replaceChildren(...teile);
}

// ----- Mailtext lesbar aufbereiten: Absätze, Listen, Links, eingeklappter Verlauf, leise Signatur -----

const linkA = (url, text) => {
  const a = document.createElement('a');
  Object.assign(a, { href: url, textContent: text, title: url, target: '_blank', rel: 'noopener noreferrer' });
  return a;
};
// „shop.de/fahrrad/kette…“ statt der ganzen Adresse
function kurzUrl(url) {
  try {
    const u = new URL(url);
    const t = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
    return t.length > 42 ? `${t.slice(0, 40)}…` : t;
  } catch { return url; }
}

// Eine Zeile mit **fett**, „Text (https://…)“ und nackten Adressen
function zeileMitLinks(zeile) {
  const raus = [];
  const ganz = zeile.match(/^(.{1,90}?) \((https?:\/\/[^\s)]+)\)$/);
  if (ganz && !/https?:\/\//.test(ganz[1])) return [linkA(ganz[2], ganz[1])];
  let ab = 0;
  for (const m of zeile.matchAll(/\*\*([^*\n]+)\*\*|\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>()"]+/g)) {
    raus.push(zeile.slice(ab, m.index));
    if (m[1]) {
      raus.push(Object.assign(document.createElement('strong'), { textContent: m[1] }));
      ab = m.index + m[0].length;
    } else if (m[2]) {
      // „Text (Adresse)“ mitten im Satz: Text bleibt, dahinter ein kleiner Link
      const vorher = zeile.slice(0, m.index).trimEnd();
      if (!vorher.endsWith(m[2])) raus.push(Object.assign(linkA(m[2], `${kurzUrl(m[2])} ↗`), { className: 'pf-linkchip' }));
      ab = m.index + m[0].length;
    } else {
      const url = m[0].replace(/[.,;:!?]+$/, '');
      raus.push(linkA(url, kurzUrl(url)));
      ab = m.index + url.length;
    }
  }
  raus.push(zeile.slice(ab));
  return raus.filter((x) => x !== '');
}

function absaetze(text) {
  const raus = [];
  for (const block of text.split(/\n[ \t]*\n/)) {
    const zeilen = block.split('\n').filter((z) => z.trim());
    if (!zeilen.length) continue;
    if (zeilen.every((z) => /^\s*([-*•–]|\d{1,2}[.)])\s+/.test(z))) {
      const liste = document.createElement(/^\s*\d/.test(zeilen[0]) ? 'ol' : 'ul');
      for (const z of zeilen) {
        const li = document.createElement('li');
        li.append(...zeileMitLinks(z.replace(/^\s*([-*•–]|\d{1,2}[.)])\s+/, '')));
        liste.append(li);
      }
      raus.push(liste);
      continue;
    }
    const kopf = zeilen.length === 1 && zeilen[0].match(/^#{1,6}\s+(.+)$/);
    const p = document.createElement(kopf ? 'h4' : 'p');
    if (kopf) { p.textContent = kopf[1].replace(/\*\*/g, ''); raus.push(p); continue; }
    zeilen.forEach((z, i) => {
      if (i) p.append(document.createElement('br'));
      p.append(...zeileMitLinks(z.trim()));
    });
    raus.push(p);
  }
  return raus;
}

// Wo beginnt der zitierte Verlauf? „Am … schrieb …:“, „On … wrote:“, „> …“, „-----Ursprüngliche Nachricht-----“, „Von: … Gesendet: …“
function zitatAnfang(zeilen) {
  for (let i = 1; i < zeilen.length; i += 1) {
    const z = zeilen[i].trim();
    const zwei = `${z} ${(zeilen[i + 1] || '').trim()}`;
    if (/^>/.test(z) && zeilen.slice(i).filter((x) => x.trim()).every((x) => /^>/.test(x.trim()) || /^(Am|On) /.test(x.trim()))) return i;
    if (/^(Am|On|Le) .{3,240}(schrieb|geschrieben|wrote|a écrit)[^:]{0,80}:$/i.test(z)) return i;
    if (/^(Am|On) .{3,240}(schrieb|geschrieben|wrote)[^:]{0,80}:$/i.test(zwei)) return i;
    if (/^-{2,}\s*(Original Message|Ursprüngliche Nachricht|Originalnachricht|Forwarded message|Weitergeleitete Nachricht)/i.test(z)) return i;
    if (/^(Von|From):\s.+/.test(z) && zeilen.slice(i + 1, i + 4).some((x) => /^(Gesendet|Sent|Datum|Date):/.test(x.trim()))) return i;
  }
  return -1;
}

// Text einer Mail als ruhige Leseansicht
function mailInhalt(roh) {
  let text = String(roh || '').replace(/\r\n?/g, '\n');
  // Rest von HTML-Quelltext (alte Einträge): ohne Darstellung in reinen Text umwandeln, nichts davon wird ausgeführt
  if (/(<|&lt;)(!doctype|html|meta|body|div|p|br|table|span)\b/i.test(text)) {
    const html = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)\b[^>]*>/gi, '$&\n');
    text = (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  const box = Object.assign(document.createElement('div'), { className: 'pf-inhalt' });
  if (!text.trim()) { box.append(Object.assign(document.createElement('p'), { className: 'leer', textContent: '(kein Text)' })); return box; }

  let links = [];
  const li = text.indexOf('\n\nLinks in der Mail:\n');
  if (li >= 0) {
    links = text.slice(li + 21).split('\n').map((z) => z.trim()).filter((z) => /^https?:\/\//.test(z));
    text = text.slice(0, li);
  }
  let zeilen = text.split('\n');
  const za = zitatAnfang(zeilen);
  const zitat = za > 0 ? zeilen.slice(za) : [];
  if (za > 0) zeilen = zeilen.slice(0, za);
  // Signatur nach „-- “ oder „Von meinem iPhone gesendet“ leiser
  let sig = [];
  const si = zeilen.findIndex((z, i) => i > 0 && (z.trimEnd() === '--' || /^(Von meinem .{2,30} gesendet|Gesendet von meinem .{2,30}|Sent from my .{2,30})$/i.test(z.trim())));
  if (si > 0) { sig = zeilen.slice(si).filter((z) => z.trimEnd() !== '--'); zeilen = zeilen.slice(0, si); }

  box.append(...absaetze(zeilen.join('\n')));
  if (sig.some((z) => z.trim())) {
    const s = Object.assign(document.createElement('div'), { className: 'pf-signatur' });
    s.append(...absaetze(sig.join('\n')));
    box.append(s);
  }
  const klappe = (titel, inhalt, art) => {
    const d = Object.assign(document.createElement('details'), { className: art });
    d.append(Object.assign(document.createElement('summary'), { textContent: titel }), inhalt);
    box.append(d);
  };
  if (zitat.length) {
    const z = Object.assign(document.createElement('div'), { className: 'pf-zitat-text' });
    z.append(...absaetze(zitat.map((x) => x.replace(/^\s*(>\s?)+/, '')).join('\n')));
    klappe('Bisheriger Verlauf', z, 'pf-zitat');
  }
  if (links.length) {
    const ul = Object.assign(document.createElement('ul'), { className: 'pf-linkliste' });
    for (const l of links) { const x = document.createElement('li'); x.append(linkA(l, kurzUrl(l))); ul.append(x); }
    klappe(`Weitere Links aus der Mail (${links.length})`, ul, 'pf-zitat');
  }
  return box;
}

// Original-HTML in einem Rahmen ohne Skripte und ohne Zugriff auf die Werkbank. Bilder aus dem Netz erst auf Knopfdruck,
// sonst erfährt der Absender über Zählpixel, wann die Mail geöffnet wurde.
function htmlRahmen(html, bilder) {
  const f = Object.assign(document.createElement('iframe'), { className: 'pf-original', title: 'Originalansicht der Mail' });
  // Ohne allow-scripts läuft im Rahmen nichts; allow-same-origin nur, damit die Höhe messbar ist
  f.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${bilder ? ' https: http:' : ''}`;
  f.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">`
    + `<style>html,body{margin:0;background:#fff;color:#222}</style>${html}`;
  f.addEventListener('load', () => {
    try { f.style.height = `${Math.min(900, f.contentDocument.documentElement.scrollHeight + 4)}px`; } catch { /* abgeschottet: feste Höhe */ }
  });
  return f;
}

function nachrichtBlase(n) {
  const d = Object.assign(document.createElement('div'), { className: `pf-nachricht ${n.richtung}` });
  const wer = n.richtung === 'aus' ? (n.team ? `${n.team.split('@')[0]} (Team)` : 'Team') : (n.von_name || n.von);
  const kopf = Object.assign(document.createElement('div'), { className: 'pf-blase-kopf' });
  kopf.append(Object.assign(document.createElement('strong'), { textContent: wer }),
    Object.assign(document.createElement('time'), { dateTime: n.erstellt, textContent: zeitKurz(n.erstellt), title: zeitDe(n.erstellt) }));
  d.append(kopf);
  const hinweise = [];
  if (n.richtung === 'aus' && n.status && n.status >= 300) hinweise.push(`Von Brevo abgelehnt (${n.status})`);
  if (n.richtung === 'ein' && n.spam >= 15) hinweise.push('Wahrscheinlich Spam');
  if (hinweise.length) d.append(Object.assign(document.createElement('div'), { className: 'pf-warnung', textContent: hinweise.join(' · ') }));
  const text = mailInhalt(n.text);
  d.append(text);
  if (n.anhaenge && n.anhaenge.length) {
    d.append(Object.assign(document.createElement('div'), { className: 'meta', textContent: `📎 ${n.anhaenge.map((a) => a.name).join(', ')} (Anhänge werden nicht übernommen)` }));
  }
  if (n.hat_html) {
    const leiste = Object.assign(document.createElement('div'), { className: 'pf-leiste' });
    const umschalten = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost mini', textContent: 'Original anzeigen' });
    const bilderKnopf = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost mini', textContent: 'Bilder laden', hidden: true });
    let html = null;
    let rahmen = null;
    umschalten.addEventListener('click', async () => {
      if (rahmen) {
        rahmen.remove(); rahmen = null; text.hidden = false; bilderKnopf.hidden = true;
        umschalten.textContent = 'Original anzeigen';
        return;
      }
      umschalten.disabled = true;
      try { html = html ?? ((await rpc('postfach_html', { p_nachricht: n.id })) || ''); } catch (e) { umschalten.disabled = false; return; }
      umschalten.disabled = false;
      rahmen = htmlRahmen(html, false);
      text.hidden = true;
      leiste.after(rahmen);
      bilderKnopf.hidden = false;
      umschalten.textContent = 'Als Text anzeigen';
    });
    bilderKnopf.addEventListener('click', () => {
      const neu = htmlRahmen(html, true);
      rahmen.replaceWith(neu); rahmen = neu;
      bilderKnopf.hidden = true;
    });
    leiste.append(umschalten, bilderKnopf);
    d.append(leiste);
  }
  return d;
}

// Signatur aus dem Konto-Bereich unter den Text setzen
let signatur = '';
async function ladeSignatur() {
  try { signatur = (await rpc('meine_signatur')) || ''; } catch { signatur = ''; }
  const feld = $('#signatur-text');
  if (feld) feld.value = signatur;
}
const mitSignatur = () => (signatur ? `\n\n${signatur}` : '');

async function unterhaltung(id) {
  let u;
  try { u = await rpc('postfach_unterhaltung', { p_id: id }); } catch (e) { meldung($('#msg-postfach'), fehlerText(e), true); return; }
  postfachZahl();
  const neuLaden = () => { dialogZu(); ladePostfach(); };

  const kopf = Object.assign(document.createElement('div'), { className: 'pf-dlg-kopf' });
  const wer = Object.assign(document.createElement('div'), { className: 'pf-dlg-wer' });
  wer.append(ava(u.name || u.email, null, true));
  const name = document.createElement('div');
  name.append(Object.assign(document.createElement('strong'), { textContent: u.name || u.email }),
    Object.assign(document.createElement('div'), { className: 'fine', textContent: [u.name ? u.email : null, u.konto ? 'hat ein Konto' : 'ohne Konto'].filter(Boolean).join(' · ') }));
  wer.append(name);
  const msg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });
  const statusKnopf = (titel, fn, art = 'pill ghost mini') => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: art, textContent: titel });
    b.addEventListener('click', async () => {
      try { if ((await fn(b)) !== false) neuLaden(); } catch (e) { meldung(msg, fehlerText(e), true); }
    });
    return b;
  };
  const status = Object.assign(document.createElement('div'), { className: 'pf-status' });
  status.append(
    u.status === 'offen' ? statusKnopf('✓ Erledigt', () => rpc('postfach_setzen', { p_id: u.id, p_status: 'erledigt' }))
      : statusKnopf('Wieder öffnen', () => rpc('postfach_setzen', { p_id: u.id, p_status: 'offen' })),
    u.status === 'spam' ? statusKnopf('Kein Spam', () => rpc('postfach_setzen', { p_id: u.id, p_status: 'offen' }))
      : statusKnopf('Spam', () => rpc('postfach_setzen', { p_id: u.id, p_status: 'spam' })),
    statusKnopf('Ungelesen', async () => {
      await rpc('postfach_gelesen', { p_id: u.id, p_gelesen: false });
      postfachZahl();
    }),
    statusKnopf('Löschen', async (b) => {
      if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich löschen?'; b.classList.add('gefahr'); return false; }
      await rpc('postfach_loeschen', { p_id: u.id });
    }));
  kopf.append(wer, status);

  const verlauf = Object.assign(document.createElement('div'), { className: 'pf-verlauf' });
  verlauf.append(...u.nachrichten.map(nachrichtBlase));

  const betreff = /^(re|aw)\s*:/i.test(u.betreff || '') ? u.betreff : `Re: ${u.betreff || 'Deine Nachricht an Radgarage'}`;
  const f = Object.assign(document.createElement('form'), { className: 'pf-antwort', autocomplete: 'off' });
  const text = Object.assign(document.createElement('textarea'), { name: 'text', required: true, rows: 5, maxLength: 10000, value: `Hallo ${u.name ? u.name.split(' ')[0] : ''},\n\n${mitSignatur()}`.replace('Hallo ,', 'Hallo,') });
  text.setAttribute('aria-label', 'Antwort');
  const vorschau = Object.assign(document.createElement('iframe'), { className: 'mail-vorschau', title: 'Vorschau der Mail', hidden: true });
  vorschau.setAttribute('sandbox', '');
  const senden = Object.assign(document.createElement('button'), { type: 'submit', className: 'pill klein', textContent: 'Antworten' });
  const vorschauKnopf = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Vorschau' });
  // Steht die Person auf der Warteliste, kann der Abmeldelink drunter (Vorlagen mit Abmeldelink kreuzen das an)
  const abmelde = mk('input', { type: 'checkbox' });
  const abmeldeFeld = u.warteliste ? mk('label', { className: 'pf-abmelde', title: 'Für Mails zu Testzugang oder Start. Auf eine Frage der Person reicht die Antwort ohne.' },
    abmelde, mk('span', { textContent: 'Abmeldelink anhängen' })) : null;
  // Vorschau ersetzt das Antwortfeld an gleicher Stelle, damit Fenster und Knöpfe bleiben, wo sie sind
  vorschauKnopf.addEventListener('click', async () => {
    if (!vorschau.hidden) {
      vorschau.hidden = true; text.hidden = false; vorschauKnopf.textContent = 'Vorschau';
      text.focus();
      return;
    }
    try {
      vorschau.srcdoc = await rpc('konto_mail_vorschau', { p_betreff: betreff, p_text: text.value + (abmelde.checked ? FUSS_WARTELISTE : '') });
      vorschau.style.height = `${Math.max(220, text.offsetHeight)}px`;
      text.hidden = true;
      vorschau.hidden = false;
      vorschauKnopf.textContent = 'Bearbeiten';
    } catch (e) { meldung(msg, fehlerText(e), true); }
  });
  text.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); f.requestSubmit(); } });
  const akt = Object.assign(document.createElement('div'), { className: 'pf-antwort-leiste' });
  akt.append(senden, vorschauKnopf, bausteinWahl(text, vornameVon(u.name), { abmelde: abmeldeFeld ? abmelde : null }), ...(abmeldeFeld ? [abmeldeFeld] : []), Object.assign(document.createElement('span'), {
    className: 'fine', textContent: `An ${u.email} · „${betreff}“ · Strg+Enter sendet`,
  }));
  f.append(text, vorschau, akt, msg);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    senden.disabled = true;
    meldung(msg, 'Wird gesendet …');
    try {
      const r = await rpc('postfach_antworten', { p_id: u.id, p_text: text.value, p_abmeldelink: !!abmeldeFeld && abmelde.checked });
      let st = null;
      for (let i = 0; i < 6 && !(st && st.status); i += 1) {
        await new Promise((ok) => setTimeout(ok, 1000));
        st = await rpc('postfach_status', { p_nachricht: r.nachricht }).catch(() => null);
      }
      if (st && st.status && st.status >= 300) { meldung(msg, `Brevo hat die Mail abgelehnt (${st.status}). ${st.fehler || ''}`, true); senden.disabled = false; return; }
      dialogZu();
      await ladePostfach();
      meldung($('#msg-postfach'), `Antwort an ${u.email} ist ${st && st.status ? 'raus' : 'unterwegs'}.`);
    } catch (e) {
      meldung(msg, fehlerText(e), true);
      senden.disabled = false;
    }
  });

  const koerper = Object.assign(document.createElement('div'), { className: 'pf-koerper' });
  const haupt = Object.assign(document.createElement('div'), { className: 'pf-haupt' });
  haupt.append(verlauf, f);
  koerper.append(personKarte(u.email, { name: u.name, aktuell: u.id }), haupt);
  dialog(u.betreff || '(ohne Betreff)', kopf, werkzeugLeiste(u, neuLaden), koerper);
  $('#dlg .dlg-box').classList.add('mail', 'mit-person');
  // Zum Anfang der neuesten Nachricht, damit lange Mails oben beginnen
  const neueste = verlauf.lastElementChild;
  if (neueste) verlauf.scrollTop += neueste.getBoundingClientRect().top - verlauf.getBoundingClientRect().top - 4;
  const pos = text.value.indexOf('\n\n') + 2;
  text.focus({ preventScroll: true });
  text.setSelectionRange(pos, pos);
  // Der Browser rollt nach dem Setzen der Schreibmarke noch nach; danach wieder ganz nach oben
  text.scrollTop = 0;
  requestAnimationFrame(() => { text.scrollTop = 0; });
}

for (const b of $$('#pf-status button')) b.addEventListener('click', () => { pfStatus = b.dataset.status; ladePostfach(); });
// Links aus der Morgenmail (#postfach) führen in den Reiter CRM
function zumPostfach() {
  crmAnsicht = 'postfach';
  tab('crm');
}
$('#pf-neu-laden').addEventListener('click', ladePostfach);
$('#f-signatur').addEventListener('submit', (ev) => {
  ev.preventDefault();
  mitKnopf(ev.target, async (msg) => {
    await rpc('signatur_setzen', { p_text: $('#signatur-text').value });
    signatur = $('#signatur-text').value.trim();
    meldung(msg, 'Signatur gespeichert.');
  });
});
$('#pf-suche').addEventListener('input', () => { clearTimeout(pfSucheZeit); pfSucheZeit = setTimeout(ladePostfach, 300); });

// ----- CRM: Bereiche, Personenkarte, Schlagworte, Notizen, Vorlagen, Zuweisen, Kontakte, Sammelmail, Kennzahlen (crm.sql) -----

const mk = (tag, props = {}, ...kinder) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kinder.filter((k) => k != null && k !== false));
  return e;
};
const feldMit = (text, feld) => mk('label', {}, mk('span', { className: 'pflicht', textContent: text }), feld);
const vornameVon = (name) => ((name || '').includes('@') ? '' : (name || '').trim().split(/\s+/)[0] || '');
// „Hallo {vorname},“ wird zu „Hallo Lena,“ oder ohne Namen zu „Hallo,“
const mitVorname = (text, vorname) => text.replace(/ ?\{vorname\}/g, vorname ? ` ${vorname}` : '');
// So sieht der Abmelde-Fuß aus, den der Server unter Mails an die Warteliste setzt (crm_sammelmail_fuss), für die Vorschau
const FUSS_WARTELISTE = '\n\n–\nDu bekommst diese Mail, weil du dich auf radgarage.app für die Warteliste eingetragen hast. Keine Mails mehr? Hier abmelden: https://radgarage.app/abmelden/?e=…';
// Löschen erst beim zweiten Klick
const sicherKnopf = (titel, fn, art = 'pill ghost mini') => {
  const b = mk('button', { type: 'button', className: art, textContent: titel });
  b.addEventListener('click', async () => {
    if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich?'; b.classList.add('gefahr'); return; }
    b.disabled = true;
    try { await fn(); } finally { b.disabled = false; }
  });
  return b;
};

let crmAnsicht = 'postfach';
function crmZeigen(ansicht) {
  crmAnsicht = ['postfach', 'kontakte', 'warteliste', 'bausteine', 'kennzahlen'].includes(ansicht) ? ansicht : 'postfach';
  for (const b of $$('#crm-ansicht button')) b.setAttribute('aria-checked', String(b.dataset.ansicht === crmAnsicht));
  for (const d of $$('[data-crm]')) d.hidden = d.dataset.crm !== crmAnsicht;
  const soll = crmAnsicht === 'postfach' ? '#crm' : `#crm/${crmAnsicht}`;
  if (location.hash !== soll) history.replaceState(null, '', soll);
  if (crmAnsicht === 'postfach') ladePostfach();
  if (crmAnsicht === 'kontakte') { ladeSchlagworte(); ladeKontakte(); }
  if (crmAnsicht === 'warteliste') ladeWarteliste();
  if (crmAnsicht === 'bausteine') ladeBausteine(true);
  if (crmAnsicht === 'kennzahlen') ladeKennzahlen();
}
for (const b of $$('#crm-ansicht button')) b.addEventListener('click', () => crmZeigen(b.dataset.ansicht));

let crmTeam = null;
async function ladeTeam() {
  if (!crmTeam) { try { crmTeam = (await rpc('crm_team')) || []; } catch { return []; } }
  return crmTeam;
}

let schlagworte = [];
async function ladeSchlagworte() {
  try { schlagworte = (await rpc('crm_schlagwort_liste')) || []; } catch { return; }
  $('#crm-schlagworte').replaceChildren(...schlagworte.map((w) => new Option(w.wort)));
  const wahl = $('#ko-wort');
  const vorher = wahl.value;
  wahl.replaceChildren(new Option('Alle', ''), ...schlagworte.map((w) => new Option(`#${w.wort} (${w.anzahl})`, w.wort)));
  wahl.value = schlagworte.some((w) => w.wort === vorher) ? vorher : '';
}

// --- Vorlagen (Textbausteine, crm_bausteine) ---

let bausteine = null;
async function ladeBausteine(zeichnen = false) {
  try {
    bausteine = (await rpc('crm_bausteine')) || [];
    if (zeichnen) meldung($('#msg-bausteine'), '');
  } catch (e) {
    bausteine = bausteine || [];
    if (zeichnen) meldung($('#msg-bausteine'), fehlerText(e), true);
  }
  if (zeichnen) zeichneBausteine();
  return bausteine;
}

function zeichneBausteine() {
  const liste = $('#tb-liste');
  if (!bausteine.length) {
    liste.replaceChildren(mk('li', { className: 'leer', textContent: 'Noch keine Vorlagen. Lege eine für die Antwort an, die du am häufigsten schreibst.' }));
    return;
  }
  liste.replaceChildren(...bausteine.map((b) => mk('li', {},
    mk('div', {}, mk('div', { className: 'name' }, b.titel, b.abmeldelink ? mk('span', { className: 'tb-chip', textContent: 'mit Abmeldelink' }) : null),
      b.betreff ? mk('div', { className: 'neben tb-betreff', textContent: `Betreff: ${b.betreff}` }) : null,
      mk('div', { className: 'neben tb-text', textContent: b.text })),
    mk('button', { type: 'button', className: 'pill ghost mini', textContent: 'Bearbeiten', onclick: () => bausteinEditor(b) }))));
}

function bausteinEditor(b = null) {
  const f = mk('form', { autocomplete: 'off' });
  const titel = mk('input', { name: 'titel', required: true, minLength: 2, maxLength: 80, value: b ? b.titel : '', placeholder: 'z. B. Rad ist jetzt im Katalog' });
  const betreff = mk('input', { name: 'betreff', minLength: 3, maxLength: 150, value: (b && b.betreff) || '', placeholder: 'Optional, z. B. Dein Testzugang zur Radgarage' });
  const text = mk('textarea', { name: 'text', required: true, rows: 8, maxLength: 5000, value: b ? b.text : '',
    placeholder: 'danke für deinen Hinweis, {vorname}! Das Rad ist jetzt im Katalog …' });
  const abmelde = mk('input', { type: 'checkbox', checked: !!(b && b.abmeldelink) });
  const msg = mk('div', { className: 'msg', role: 'status' });
  const akt = mk('div', { className: 'aktionen' }, mk('button', { type: 'submit', className: 'pill', textContent: 'Speichern' }));
  if (b) {
    akt.append(sicherKnopf('Löschen', async () => {
      try { await rpc('crm_baustein_loeschen', { p_id: b.id }); dialogZu(); ladeBausteine(true); } catch (e) { meldung(msg, fehlerText(e), true); }
    }, 'pill ghost'));
  }
  akt.append(mk('button', { type: 'button', className: 'pill ghost', textContent: 'Abbrechen', onclick: dialogZu }));
  f.append(feldMit('Titel', titel), mk('label', {}, mk('span', { textContent: 'Betreff' }), betreff), feldMit('Text', text),
    mk('label', { className: 'sm-ok' }, abmelde, mk('span', { textContent: 'Für Mails an die Warteliste: Abmeldelink anhängen' })),
    mk('p', { className: 'fine', textContent: 'Ohne Anrede und Signatur. {vorname} wird beim Einfügen durch den Vornamen ersetzt, wenn er bekannt ist. Den Betreff übernimmt die Vorlage bei neuen Mails und Sammelmails, wenn er noch leer ist. Neue Mails und Sammelmails an die Warteliste bekommen den Abmeldelink immer, bei Antworten kreuzt die Vorlage „Abmeldelink anhängen“ an.' }), akt, msg);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    mitKnopf(f, async () => {
      await rpc('crm_baustein_speichern', { p_id: b ? b.id : null, p_titel: titel.value, p_text: text.value, p_betreff: betreff.value.trim() || null, p_abmeldelink: abmelde.checked });
      dialogZu();
      ladeBausteine(true);
    });
  });
  dialog(b ? 'Vorlage bearbeiten' : 'Neue Vorlage', f);
  $('#dlg .dlg-box').classList.add('breit');
}
$('#tb-neu').addEventListener('click', () => bausteinEditor());

// Auswahl „Vorlage …“ neben einem Textfeld, fügt an der Cursorstelle ein. Mit betreff füllt sie einen leeren Betreff,
// mit abmelde kreuzt eine Vorlage mit Abmeldelink das Feld „Abmeldelink anhängen“ an.
function bausteinWahl(feld, vorname, { betreff = null, abmelde = null } = {}) {
  const s = mk('select', { className: 'pf-baustein', title: 'Vorlage einfügen' });
  s.setAttribute('aria-label', 'Vorlage einfügen');
  const fuellen = () => {
    s.replaceChildren(new Option('Vorlage …', ''), ...(bausteine || []).map((b) => new Option(b.titel, String(b.id))));
    s.hidden = !(bausteine || []).length;
  };
  fuellen();
  if (!bausteine) ladeBausteine().then(fuellen);
  s.addEventListener('change', () => {
    const b = (bausteine || []).find((x) => String(x.id) === s.value);
    s.value = '';
    if (!b) return;
    const a = feld.selectionStart ?? feld.value.length;
    feld.setRangeText(mitVorname(b.text, vorname), a, feld.selectionEnd ?? a, 'end');
    if (betreff && b.betreff && !betreff.value.trim()) betreff.value = mitVorname(b.betreff, vorname);
    if (abmelde && b.abmeldelink) abmelde.checked = true;
    feld.focus();
  });
  return s;
}

// --- Personenkarte ---

async function kontoOeffnen(id) {
  if (!konten.length) { try { konten = (await rpc('konten_liste')) || []; } catch { /* unten Hinweis */ } }
  const k = konten.find((x) => x.id === id);
  if (k) kontoVerwalten(k);
}

function schlagwortEditor(email, worte, geaendert = null) {
  const box = mk('div', { className: 'pf-worte' });
  const msg = mk('div', { className: 'msg', role: 'status' });
  const eingabe = mk('input', { type: 'text', placeholder: '+ Schlagwort', maxLength: 30, autocomplete: 'off' });
  eingabe.setAttribute('list', 'crm-schlagworte');
  eingabe.setAttribute('aria-label', 'Schlagwort hinzufügen');
  const speichern = async (neu) => {
    meldung(msg, '');
    try {
      worte = (await rpc('crm_schlagworte_setzen', { p_email: email, p_schlagworte: neu })) || [];
      zeichnen();
      ladeSchlagworte();
      if (geaendert) geaendert(worte);
    } catch (e) { meldung(msg, fehlerText(e), true); }
  };
  const zeichnen = () => {
    box.replaceChildren(...worte.map((w) => mk('span', { className: 'chip' }, `#${w}`,
      mk('button', { type: 'button', textContent: '×', title: `${w} entfernen`, onclick: () => speichern(worte.filter((x) => x !== w)) }))), eingabe);
  };
  eingabe.addEventListener('change', () => {
    const w = eingabe.value.trim().replace(/^#/, '');
    eingabe.value = '';
    if (w) speichern([...worte, w]).then(() => eingabe.focus());
  });
  zeichnen();
  return mk('div', {}, box, msg);
}

function notizEditor(email, notizen) {
  const liste = mk('ul', { className: 'pf-notizen' });
  const msg = mk('div', { className: 'msg', role: 'status' });
  const zeichnen = () => liste.replaceChildren(...notizen.map((n) => mk('li', {},
    mk('p', { textContent: n.text }),
    mk('div', { className: 'fine' }, `${n.mein ? 'Du' : (n.team || 'gelöschtes Konto').split('@')[0]} · ${zeitKurz(n.erstellt)} · `,
      mk('button', { type: 'button', className: 'link-knopf', textContent: 'Löschen', onclick: async () => {
        try { await rpc('crm_notiz_loeschen', { p_id: n.id }); notizen = notizen.filter((x) => x.id !== n.id); zeichnen(); } catch (e) { meldung(msg, fehlerText(e), true); }
      } })))));
  const text = mk('textarea', { rows: 2, maxLength: 2000, placeholder: 'Interne Notiz, sieht nur das Team' });
  text.setAttribute('aria-label', 'Neue Notiz');
  const knopf = mk('button', { type: 'button', className: 'pill ghost mini', textContent: 'Notiz speichern' });
  knopf.addEventListener('click', async () => {
    if (!text.value.trim()) return;
    knopf.disabled = true;
    try {
      const id = await rpc('crm_notiz_neu', { p_email: email, p_text: text.value });
      notizen.unshift({ id, text: text.value.trim(), erstellt: new Date().toISOString(), mein: true });
      text.value = '';
      zeichnen();
    } catch (e) { meldung(msg, fehlerText(e), true); }
    knopf.disabled = false;
  });
  zeichnen();
  return mk('div', {}, liste, text, mk('div', { className: 'aktionen', style: 'margin:6px 0 0' }, knopf), msg);
}

const FB_KAT = { verbesserung: 'Verbesserung', funktion: 'Funktion', katalog: 'Katalog', sonstiges: 'Sonstiges' };
const VS_ART = { korrektur: 'Korrektur', rad: 'Neues Rad', ean: 'Barcode', teil: 'Neues Teil' };

// Alles zu einer Adresse. In der Unterhaltung als Seitenleiste (aktuell = deren id), sonst als eigenes Fenster (solo).
function personKarte(email, { name = '', aktuell = null, solo = false } = {}) {
  const box = mk('details', { className: `pf-person${solo ? ' solo' : ''}`, open: solo || window.innerWidth > 900 });
  const kurz = mk('span', { className: 'fine', textContent: '' });
  box.append(mk('summary', {}, 'Person ', kurz));
  const inhalt = mk('div', {}, mk('p', { className: 'fine', textContent: 'Lade …' }));
  box.append(inhalt);
  (async () => {
    let p;
    try { p = await rpc('crm_person', { p_email: email }); } catch (e) { inhalt.replaceChildren(mk('p', { className: 'msg fehler', textContent: fehlerText(e) })); return; }
    const fakt = (titel, wert) => mk('div', { className: 'pf-fakt' }, mk('span', { textContent: titel }), mk('strong', { textContent: wert }));
    const abschnitt = (titel, ...kinder) => mk('section', { className: 'pf-abschnitt' }, mk('h4', { textContent: titel }), ...kinder);
    const teile = [];
    const k = p.konto;
    kurz.textContent = [k ? 'Konto' : 'ohne Konto', p.warteliste ? 'Warteliste' : null, ...(p.schlagworte || []).map((w) => `#${w}`)].filter(Boolean).join(' · ');
    if (k) {
      const fakten = mk('div', { className: 'pf-fakten' },
        fakt('Registriert', datum(k.registriert)),
        fakt('Zuletzt aktiv', k.letzte_anmeldung ? zeitKurz(k.letzte_anmeldung) : '–'),
        fakt('Anmeldung', (k.anbieter || []).map((a) => ANBIETER[a] || a).join(', ') || '–'),
        fakt('Räder', String(k.raeder || 0)),
        fakt('Premium', k.premium ? (k.premium === 'kauf' ? 'gekauft' : 'geschenkt') : 'nein'),
        fakt('Familie', k.familie === 'besitzer' ? 'gegründet' : k.familie === 'mitglied' ? 'Mitglied' : 'nein'),
        k.rolle ? fakt('Rolle', k.rolle) : null,
        k.gesperrt_bis ? fakt('Gesperrt bis', datum(k.gesperrt_bis)) : null,
        k.bestaetigt ? null : fakt('E-Mail', 'nicht bestätigt'));
      const knoepfe = mk('div', { className: 'aktionen', style: 'margin:8px 0 0' },
        darf('konten_sehen') ? mk('button', { type: 'button', className: 'pill ghost mini', textContent: 'Konto öffnen', onclick: () => kontoOeffnen(k.id) }) : null,
        solo ? mk('button', { type: 'button', className: 'pill mini', textContent: 'E-Mail schreiben', onclick: () => mailEditor({ email: p.email }) }) : null);
      teile.push(abschnitt('Konto', fakten, knoepfe));
    } else {
      teile.push(abschnitt('Konto', mk('p', { className: 'fine', textContent: 'Kein Konto mit dieser Adresse.' })));
    }
    if (p.warteliste) {
      const w = p.warteliste;
      teile.push(abschnitt('Warteliste', mk('div', { className: 'pf-fakten' },
        fakt('Eingetragen', datum(w.eingetragen)), fakt('Testzugang', w.testzugang ? 'ja' : 'nein'),
        w.plattform ? fakt('Handy', w.plattform) : null, w.radmarke ? fakt('Rad', w.radmarke) : null),
        solo && !k ? mk('div', { className: 'aktionen', style: 'margin:8px 0 0' },
          mk('button', { type: 'button', className: 'pill mini', textContent: 'E-Mail schreiben', onclick: () => mailEditor({ email: p.email }) })) : null));
    }
    teile.push(abschnitt('Schlagworte', schlagwortEditor(p.email, p.schlagworte || [])));
    teile.push(abschnitt('Notizen', notizEditor(p.email, p.notizen || [])));
    const andere = (p.unterhaltungen || []).filter((x) => x.id !== aktuell);
    if (andere.length) {
      teile.push(abschnitt(aktuell ? 'Weitere Unterhaltungen' : 'Unterhaltungen', mk('ul', { className: 'pf-mini-liste' }, ...andere.map((x) => mk('li', {},
        mk('button', { type: 'button', className: 'link-knopf', textContent: x.betreff || '(ohne Betreff)', onclick: () => { dialogZu(); unterhaltung(x.id); } }),
        mk('span', { className: 'fine', textContent: `${zeitKurz(x.letzte)} · ${{ offen: 'offen', erledigt: 'erledigt', spam: 'Spam' }[x.status] || x.status}${x.ungelesen ? ' · neu' : ''}` }))))));
    }
    if ((p.feedback || []).length) {
      teile.push(abschnitt('Feedback', mk('ul', { className: 'pf-mini-liste' }, ...p.feedback.map((f) => mk('li', {},
        f.text, mk('span', { className: 'fine', textContent: `${FB_KAT[f.kategorie] || f.kategorie} · ${datum(f.erstellt)} · ${f.status === 'erledigt' ? 'erledigt' : 'neu'}` }))))));
    }
    if ((p.vorschlaege || []).length) {
      teile.push(abschnitt('Vorschläge aus der App', mk('ul', { className: 'pf-mini-liste' }, ...p.vorschlaege.map((v) => mk('li', {},
        v.titel || VS_ART[v.art] || v.art, mk('span', { className: 'fine', textContent: `${VS_ART[v.art] || v.art} · ${datum(v.erstellt)}${v.status ? ` · ${v.status}` : ''}` }))))));
    }
    if (darf('konten_betreuen')) teile.push(abschnitt('Datenschutz', auskunftKnoepfe(p.email)));
    inhalt.replaceChildren(...teile);
  })();
  return box;
}

// ----- Datenauskunft (Art. 15 DSGVO, konto_auskunft in datenauskunft.sql) -----

const AUSKUNFT_TITEL = { konto: 'Konto', garage: 'Garage (Räder, Teile, Wartung)', einstellungen: 'Einstellungen in der App', familie: 'Familiengarage',
  premium: 'Premium', dateien: 'Hochgeladene Dateien', vorschlaege_aus_der_app: 'Vorschläge aus der App', katalog_mithilfe: 'Mithilfe am Katalog',
  mails_vom_team: 'Mails vom Team', dankesmails: 'Dankesmails', warteliste: 'Warteliste', premium_geschenk: 'Premium-Geschenk', feedback: 'Feedback',
  schlagworte_im_team: 'Schlagworte im Team', notizen_im_team: 'Notizen im Team', mailverkehr: 'Mailverkehr mit Radgarage' };

// Kurze Zusammenfassung für die Antwort-Mail, die Datei kommt als Anhang dazu
function auskunftZusammenfassung(a) {
  const leer = (v) => v == null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x != null && !(Array.isArray(x) && !x.length)));
  const zeilen = [];
  for (const [k, titel] of Object.entries(AUSKUNFT_TITEL)) {
    const v = a[k];
    if (leer(v)) continue;
    let mehr = '';
    if (Array.isArray(v)) mehr = ` (${v.length} ${v.length === 1 ? 'Eintrag' : 'Einträge'})`;
    if (k === 'garage' && Array.isArray(v.inhalt?.garage)) mehr = ` (${v.inhalt.garage.length} ${v.inhalt.garage.length === 1 ? 'Rad' : 'Räder'}, gesichert ${datum(v.gesichert)})`;
    if (k === 'konto') mehr = ` (seit ${datum(v.registriert)}, Anmeldung über ${(v.anmeldewege || []).map((x) => ANBIETER[x.anbieter] || x.anbieter).join(', ') || 'E-Mail'})`;
    zeilen.push(`- ${titel}${mehr}`);
  }
  return `Zu ${a.email} haben wir Folgendes gespeichert (Stand ${datum(a.erstellt)}):\n\n${zeilen.join('\n') || '- nichts'}\n\n`
    + 'Alle Einzelheiten stehen in der angehängten Datei (JSON, lässt sich mit jedem Texteditor öffnen). '
    + 'Wofür wir die Daten nutzen und wie lange wir sie speichern, steht in der Datenschutzerklärung: https://radgarage.app/datenschutz.html';
}

function auskunftKnoepfe(email) {
  const msg = mk('div', { className: 'msg', role: 'status' });
  let letzte = null;
  const kopieren = mk('button', { type: 'button', className: 'pill ghost mini', textContent: 'Zusammenfassung kopieren', hidden: true, onclick: async () => {
    try { await navigator.clipboard.writeText(auskunftZusammenfassung(letzte)); meldung(msg, 'Kopiert. In die Antwort einfügen und die Datei anhängen.'); }
    catch { meldung(msg, 'Kopieren ging nicht, bitte die Datei öffnen.', true); }
  } });
  const los = mk('button', { type: 'button', className: 'pill mini', textContent: 'Datenauskunft erstellen', onclick: async () => {
    los.disabled = true;
    meldung(msg, 'Sammle …');
    try {
      letzte = await rpc('konto_auskunft', { p_email: email });
      const tag = new Date().toLocaleDateString('sv-SE');
      const a = mk('a', { href: URL.createObjectURL(new Blob([JSON.stringify(letzte, null, 2)], { type: 'application/json' })),
        download: `radgarage-datenauskunft-${email.replace(/[^a-z0-9@._-]/gi, '_')}-${tag}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      kopieren.hidden = false;
      meldung(msg, 'Datei ist heruntergeladen. Schick sie der Person aus deinem Mailprogramm als Anhang, die Zusammenfassung passt als Text dazu. Frist: ein Monat ab Anfrage.');
    } catch (e) {
      meldung(msg, fehlerText(e), true);
    }
    los.disabled = false;
  } });
  return mk('div', {}, mk('p', { className: 'fine', textContent: 'Alles, was zu dieser Adresse gespeichert ist, als eine Datei (Auskunft nach Art. 15 DSGVO). Steht danach im Verlauf.' }),
    mk('div', { className: 'aktionen', style: 'margin:8px 0 0' }, los, kopieren), msg);
}

function personDialog(email) {
  dialog(email, personKarte(email, { solo: true }));
  $('#dlg .dlg-box').classList.add('breit');
}

// --- Zuweisen und Wiedervorlage (im Mail-Fenster) ---

function wiedervorlageZeit(art) {
  const d = new Date();
  if (art === 'morgen') d.setDate(d.getDate() + 1);
  else d.setDate(d.getDate() + Number(art));
  d.setHours(9, 0, 0, 0);
  return d;
}

function werkzeugLeiste(u, neuLaden) {
  const msg = mk('div', { className: 'msg', role: 'status' });
  const zuw = mk('select');
  zuw.setAttribute('aria-label', 'Zuständig');
  zuw.append(new Option('Niemand zuständig', ''));
  ladeTeam().then((t) => {
    zuw.replaceChildren(new Option('Niemand zuständig', ''),
      ...t.map((m) => new Option(`${m.ich ? 'Ich' : m.email.split('@')[0]} zuständig`, m.id)));
    zuw.value = u.zugewiesen || '';
  });
  zuw.addEventListener('change', async () => {
    try {
      await rpc('postfach_zuweisen', { p_id: u.id, p_nutzer: zuw.value || null });
      meldung(msg, zuw.value ? 'Zugewiesen.' : 'Zuweisung aufgehoben.');
    } catch (e) { meldung(msg, fehlerText(e), true); }
  });

  const wv = mk('select');
  wv.setAttribute('aria-label', 'Wiedervorlage');
  wv.append(new Option(u.wiedervorlage ? `Wiedervorlage ${zeitDe(u.wiedervorlage)}` : 'Wiedervorlage …', ''),
    new Option('Morgen, 9 Uhr', 'morgen'), new Option('In 3 Tagen', '3'), new Option('In einer Woche', '7'),
    new Option('In einem Monat', '30'), new Option('Datum wählen …', 'datum'));
  if (u.wiedervorlage) wv.append(new Option('Wiedervorlage aufheben', 'aus'));
  const wann = mk('input', { type: 'datetime-local', hidden: true });
  wann.setAttribute('aria-label', 'Wiedervorlage am');
  const setzen = async (zeit) => {
    try {
      await rpc('postfach_wiedervorlage', { p_id: u.id, p_zeit: zeit ? zeit.toISOString() : null });
      if (!zeit) { meldung(msg, 'Wiedervorlage aufgehoben.'); return; }
      neuLaden();
      meldung($('#msg-postfach'), `Wird erledigt abgelegt und taucht am ${zeitDe(zeit)} wieder als offen auf.`);
    } catch (e) { meldung(msg, fehlerText(e), true); }
  };
  wv.addEventListener('change', () => {
    const a = wv.value;
    wv.value = '';
    if (a === 'datum') { wann.hidden = false; wann.focus(); return; }
    if (a === 'aus') setzen(null);
    else if (a) setzen(wiedervorlageZeit(a));
  });
  wann.addEventListener('change', () => { if (wann.value) setzen(new Date(wann.value)); });
  return mk('div', { className: 'pf-werkzeuge' }, zuw, wv, wann, ordnerWahl(u, msg), msg);
}

// --- Ordner: Unterhaltungen ablegen (crm_ordner_*, postfach_ablegen) ---

let pfOrdner = null;
let ordnerListe = [];
// Jeder Ordner bekommt eine der fünf Kachelfarben, das Symbol ist ein Ordner als Linie wie die übrigen Werkbank-Symbole
const ordnerFarbe = (id) => (id ? `var(--k${((id - 1) % 5) + 1})` : 'var(--surface2)');
const ORDNER_SVG = {
  ordner: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6a1.5 1.5 0 0 1 1.1.45L11.8 7.5h6.7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 10h17"/>',
  alle: '<path d="M3.5 13.5l2.4-6.6a2 2 0 0 1 1.9-1.4h8.4a2 2 0 0 1 1.9 1.4l2.4 6.6v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13.5h4.8l1.4 2.2h4.6l1.4-2.2h4.8"/>',
};
function ordnerSymbol(id, art = id ? 'ordner' : 'alle') {
  const s = mk('span', { className: 'ordner-symbol' });
  s.style.setProperty('--of', ordnerFarbe(id));
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ORDNER_SVG[art]}</svg>`;
  return s;
}
async function ladeOrdner() {
  try { ordnerListe = (await rpc('crm_ordner_liste')) || []; } catch { return; }
  if (pfOrdner && !ordnerListe.some((o) => o.id === pfOrdner)) { pfOrdner = null; ladePostfach(); }
  ordnerLeiste();
}

// Kleines Eingabefeld statt Rückfrage-Fenster: Enter speichert, Esc bricht ab
function ordnerEingabe(ersetzt, start, speichern) {
  const feld = mk('input', { type: 'text', value: start, maxLength: 40, placeholder: 'Ordnername', className: 'ordner-feld' });
  feld.setAttribute('aria-label', 'Ordnername');
  const zurueck = () => feld.replaceWith(ersetzt);
  let fertig = false;
  feld.addEventListener('keydown', async (ev) => {
    // Esc bricht nur die Eingabe ab, nicht das Mail-Fenster
    if (ev.key === 'Escape') { ev.stopPropagation(); fertig = true; zurueck(); return; }
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (!feld.value.trim()) { fertig = true; zurueck(); return; }
    fertig = true;
    try { await speichern(feld.value); zurueck(); } catch (e) { fertig = false; meldung($('#msg-postfach'), fehlerText(e), true); }
  });
  feld.addEventListener('blur', () => { if (!fertig && !feld.value.trim()) zurueck(); });
  ersetzt.replaceWith(feld);
  feld.focus();
  feld.select();
}

function ordnerLeiste() {
  const ort = $('#pf-ordner');
  const chip = (titel, id, o) => {
    const b = mk('button', { type: 'button', className: `ordner-chip${o && o.ungelesen ? ' neu' : ''}` }, ordnerSymbol(id), titel);
    b.setAttribute('aria-pressed', String(pfOrdner === id));
    if (o) b.append(mk('span', { className: 'opt', textContent: String(o.anzahl) }));
    b.addEventListener('click', () => {
      if (pfOrdner === id) return;
      pfOrdner = id;
      // Im Ordner zuerst alles zeigen, der Status schränkt danach weiter ein
      if (id) pfStatus = '';
      ordnerLeiste();
      ladePostfach();
    });
    return b;
  };
  const neu = mk('button', { type: 'button', className: 'ordner-chip plus', textContent: '+ Ordner' });
  neu.addEventListener('click', () => ordnerEingabe(neu, '', async (name) => {
    pfOrdner = await rpc('crm_ordner_speichern', { p_id: null, p_name: name });
    pfStatus = '';
    ladePostfach();
  }));
  const teile = [chip('Alle Mails', null), ...ordnerListe.map((o) => chip(o.name, o.id, o)), neu];
  const akt = ordnerListe.find((o) => o.id === pfOrdner);
  if (akt) {
    const um = mk('button', { type: 'button', className: 'link-knopf', textContent: 'Umbenennen' });
    um.addEventListener('click', () => ordnerEingabe(um, akt.name, async (name) => {
      await rpc('crm_ordner_speichern', { p_id: akt.id, p_name: name });
      ladePostfach();
    }));
    const weg = sicherKnopf('Ordner löschen', async () => {
      await rpc('crm_ordner_loeschen', { p_id: akt.id });
      pfOrdner = null;
      ladePostfach();
      meldung($('#msg-postfach'), `Ordner „${akt.name}“ gelöscht. Die Mails darin sind noch da, nur ohne Ordner.`);
    }, 'link-knopf');
    teile.push(mk('span', { className: 'ordner-aktionen' }, um, weg));
  }
  ort.replaceChildren(...teile);
}

// Auswahl im Mail-Fenster: Ordner wählen, keiner oder gleich einen neuen anlegen
function ordnerWahl(u, msg) {
  const wahl = mk('select');
  wahl.setAttribute('aria-label', 'Ordner');
  const fuellen = () => {
    wahl.replaceChildren(new Option('Kein Ordner', ''), ...ordnerListe.map((o) => new Option(o.name, String(o.id))),
      new Option('Neuer Ordner …', 'neu'));
    wahl.value = u.ordner ? String(u.ordner) : '';
    symbol.style.setProperty('--of', ordnerFarbe(u.ordner));
  };
  const symbol = ordnerSymbol(1);
  fuellen();
  const ablegen = async (id) => {
    await rpc('postfach_ablegen', { p_id: u.id, p_ordner: id });
    u.ordner = id;
    await ladeOrdner();
    ladePostfach();
    const o = ordnerListe.find((x) => x.id === id);
    meldung(msg, id ? `In „${o ? o.name : 'Ordner'}“ abgelegt.` : 'Aus dem Ordner genommen.');
  };
  wahl.addEventListener('change', async () => {
    if (wahl.value === 'neu') {
      fuellen();
      ordnerEingabe(wahl, '', async (name) => {
        const id = await rpc('crm_ordner_speichern', { p_id: null, p_name: name });
        await ablegen(id);
        fuellen();
      });
      return;
    }
    try { await ablegen(wahl.value ? Number(wahl.value) : null); } catch (e) { meldung(msg, fehlerText(e), true); }
    symbol.style.setProperty('--of', ordnerFarbe(u.ordner));
  });
  return mk('span', { className: 'ordner-wahl' }, symbol, wahl);
}

// --- Kontakte und Sammelmail ---

// Mehrere ankreuzen und ihnen ein Schlagwort geben oder wegnehmen (Kontakte und Reiter Konten)
function wortAuswahl(ort, nachher) {
  const gewaehlt = new Set();
  let sichtbar = [];
  const zahl = mk('strong');
  const wort = mk('input', { type: 'text', placeholder: 'Schlagwort', maxLength: 30, autocomplete: 'off' });
  wort.setAttribute('list', 'crm-schlagworte');
  wort.setAttribute('aria-label', 'Schlagwort für die Auswahl');
  const msg = mk('div', { className: 'msg', role: 'status' });
  const alle = mk('button', { type: 'button', className: 'link-knopf' });
  const leiste = mk('div', { className: 'wort-leiste', hidden: true });
  const aktualisieren = () => {
    leiste.hidden = !gewaehlt.size;
    zahl.textContent = `${zahlDe(gewaehlt.size)} ausgewählt`;
    alle.textContent = `Alle ${zahlDe(sichtbar.length)} angezeigten wählen`;
    alle.hidden = sichtbar.every((e) => gewaehlt.has(e));
    for (const h of ort.parentElement.querySelectorAll('input.wahl')) h.checked = gewaehlt.has(h.value);
  };
  const los = async (entfernen) => {
    const w = wort.value.trim().replace(/^#/, '');
    if (!w) { wort.focus(); return; }
    meldung(msg, '');
    try {
      const n = await rpc('crm_schlagwort_viele', { p_emails: [...gewaehlt], p_wort: w, p_entfernen: entfernen });
      const mehr = Math.max(0, gewaehlt.size - n);
      gewaehlt.clear();
      wort.value = '';
      aktualisieren();
      await ladeSchlagworte();
      await nachher();
      meldung(msg, '');
      return { n, mehr, w };
    } catch (e) { meldung(msg, fehlerText(e), true); return null; }
  };
  const melden = (r, entfernen) => {
    if (!r) return;
    const ziel = ort.closest('.t')?.querySelector('.msg') || msg;
    meldung(ziel, `#${r.w} ${entfernen ? 'bei' : 'an'} ${zahlDe(r.n)} ${entfernen ? 'entfernt' : 'vergeben'}${r.mehr ? `, ${zahlDe(r.mehr)} ${entfernen ? 'hatten es nicht' : 'hatten es schon oder haben 12 Schlagworte'}` : ''}.`);
  };
  alle.addEventListener('click', () => { for (const e of sichtbar) gewaehlt.add(e); aktualisieren(); });
  wort.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); los(false).then((r) => melden(r, false)); } });
  leiste.append(zahl, alle, wort,
    mk('button', { type: 'button', className: 'pill mini', textContent: 'Vergeben', onclick: () => los(false).then((r) => melden(r, false)) }),
    mk('button', { type: 'button', className: 'pill ghost mini', textContent: 'Entfernen', onclick: () => los(true).then((r) => melden(r, true)) }),
    mk('button', { type: 'button', className: 'pill ghost mini', textContent: 'Auswahl aufheben', onclick: () => { gewaehlt.clear(); aktualisieren(); } }),
    msg);
  ort.before(leiste);
  return {
    haken(email) {
      const h = mk('input', { type: 'checkbox', className: 'wahl', value: email, checked: gewaehlt.has(email) });
      h.setAttribute('aria-label', `${email} auswählen`);
      h.addEventListener('change', () => { if (h.checked) gewaehlt.add(email); else gewaehlt.delete(email); aktualisieren(); });
      return h;
    },
    // Nach jedem Neuzeichnen: Auswahl auf das Sichtbare beschränken
    anzeigen(emails) {
      sichtbar = emails;
      for (const e of [...gewaehlt]) if (!emails.includes(e)) gewaehlt.delete(e);
      aktualisieren();
    },
  };
}
const koAuswahl = wortAuswahl($('#ko-liste'), () => ladeKontakte());

const SAMMEL_ART = { konten: 'service', premium: 'service', ohne_rad: 'service', inaktiv: 'service', neu: 'service',
  warteliste: 'warteliste', tester: 'warteliste', tester_iphone: 'warteliste', tester_android: 'warteliste', nur_bescheid: 'warteliste' };
// „Alle“ mit Schlagwort: Konten bekommen den Service-Fuß, reine Wartelisten-Einträge den Abmeldelink
const sammelArt = (gruppe, wort) => SAMMEL_ART[gruppe] || (gruppe === 'alle' && wort ? 'gemischt' : null);
let koDaten = { anzahl: 0, kontakte: [] };
let koSucheZeit = null;

async function ladeKontakte() {
  meldung($('#msg-kontakte'), '');
  try {
    koDaten = await rpc('crm_kontakte_liste', { p_gruppe: $('#ko-gruppe').value, p_schlagwort: $('#ko-wort').value || null, p_suche: $('#ko-suche').value || null });
  } catch (e) { meldung($('#msg-kontakte'), fehlerText(e), true); return; }
  $('#ko-zahl').textContent = `(${zahlDe(koDaten.anzahl)})`;
  $('#ko-stand').textContent = `Konten aus der App und die bestätigte Warteliste von radgarage.app${koDaten.stand ? `, Warteliste abgeglichen ${zeitKurz(koDaten.stand).replace(/\.$/, '')}` : ''}.`;
  const art = sammelArt($('#ko-gruppe').value, $('#ko-wort').value);
  $('#ko-sammel').disabled = !art;
  $('#ko-sammel').textContent = $('#ko-wort').value ? `Sammelmail an #${$('#ko-wort').value}` : 'Sammelmail an diese Gruppe';
  $('#ko-sammel').title = art ? '' : 'Erst eine Gruppe aus Konten oder Warteliste oder ein Schlagwort wählen';
  koAuswahl.anzeigen(koDaten.kontakte.map((x) => x.email));
  const liste = $('#ko-liste');
  if (!koDaten.kontakte.length) { liste.innerHTML = '<p class="fine">Niemand in dieser Gruppe.</p>'; return; }
  liste.replaceChildren(...koDaten.kontakte.map((x) => mk('div', { className: 'ko-zeile' }, koAuswahl.haken(x.email), kontaktZeile(x))));
  if (koDaten.anzahl > koDaten.kontakte.length) {
    liste.append(mk('p', { className: 'fine', textContent: `Die ersten ${zahlDe(koDaten.kontakte.length)} von ${zahlDe(koDaten.anzahl)}. Mit Suche oder Gruppe eingrenzen.` }));
  }
}

function kontaktZeile(x) {
  const zeile = mk('button', { type: 'button', className: 'pf-zeile' });
  const marken = mk('span', { className: 'pf-meta' },
    x.konto ? mk('span', { className: 'zu', textContent: 'Konto' }) : null,
    x.premium ? mk('span', { textContent: 'Premium' }) : null,
    x.warteliste ? mk('span', { className: 'wv', textContent: x.testzugang ? `Tester${x.plattform ? `, ${x.plattform}` : ''}` : 'Warteliste' }) : null,
    ...(x.schlagworte || []).map((w) => mk('span', { textContent: `#${w}` })));
  const unter = x.konto
    ? `Seit ${datum(x.registriert)} · ${x.raeder || 0} ${x.raeder === 1 ? 'Rad' : 'Räder'} · zuletzt aktiv ${x.letzte ? zeitKurz(x.letzte) : '–'}`
    : `Warteliste seit ${datum(x.eingetragen)}${x.radmarke ? ` · fährt ${x.radmarke}` : ''}`;
  zeile.append(ava(x.email), mk('span', { className: 'pf-mitte' },
    mk('span', { className: 'pf-kopf' }, mk('span', { className: 'pf-wer', textContent: x.email })),
    mk('span', { className: 'pf-vorschau', textContent: unter }), marken));
  zeile.addEventListener('click', () => personDialog(x.email));
  return zeile;
}

for (const id of ['#ko-gruppe', '#ko-wort']) $(id).addEventListener('change', ladeKontakte);
$('#ko-suche').addEventListener('input', () => { clearTimeout(koSucheZeit); koSucheZeit = setTimeout(ladeKontakte, 300); });
$('#ko-abgleich').addEventListener('click', async (ev) => {
  const b = ev.currentTarget;
  b.disabled = true;
  meldung($('#msg-kontakte'), 'Frage die Warteliste bei Brevo ab …');
  try {
    await rpc('crm_abgleich', { p_einlesen: false });
    let r = null;
    for (let i = 0; i < 5 && !(r && r.eingelesen != null); i += 1) {
      await new Promise((ok) => setTimeout(ok, 2000));
      r = await rpc('crm_abgleich', { p_einlesen: true });
    }
    await ladeKontakte();
    meldung($('#msg-kontakte'), r && r.eingelesen != null ? `Abgeglichen: ${zahlDe(r.kontakte)} auf der Warteliste.` : 'Brevo antwortet gerade nicht, der stündliche Abgleich holt es nach.', !(r && r.eingelesen != null));
  } catch (e) { meldung($('#msg-kontakte'), fehlerText(e), true); }
  b.disabled = false;
});

async function ladeSammelmails() {
  let liste = [];
  try { liste = (await rpc('crm_sammelmails')) || []; } catch { return; }
  $('#sm-zahl').textContent = liste.length ? `${liste.length} verschickt` : 'Noch keine';
  const gruppeText = (g) => ($(`#ko-gruppe option[value="${g}"]`) || {}).textContent || g;
  $('#sm-liste').replaceChildren(...(liste.length ? liste.map((m) => mk('li', {},
    mk('div', {}, mk('div', { className: 'name', textContent: m.betreff }),
      mk('div', { className: 'neben', textContent: `${zeitDe(m.erstellt)} · an ${zahlDe(m.anzahl)} (${gruppeText(m.gruppe)}${m.schlagwort ? `, #${m.schlagwort}` : ''}) · ${(m.team || '').split('@')[0]}` }),
      mk('div', { className: 'neben tb-text', textContent: m.text })),
    mk('span', { className: 'sm-art', textContent: { service: 'Service', warteliste: 'Warteliste', gemischt: `#${m.schlagwort}` }[m.art] || m.art })))
    : [mk('li', { className: 'leer', textContent: 'Noch keine Sammelmail verschickt.' })]));
}
$('#sm-box').addEventListener('toggle', () => { if ($('#sm-box').open) ladeSammelmails(); });

function sammelmailEditor() {
  const gruppe = $('#ko-gruppe').value;
  const wort = $('#ko-wort').value;
  const art = sammelArt(gruppe, wort);
  if (!art) return;
  const anzahl = koDaten.anzahl;
  const gruppeText = art === 'gemischt' ? `#${wort}` : `${$('#ko-gruppe').selectedOptions[0].parentElement.label || ''}: ${$('#ko-gruppe').selectedOptions[0].textContent}${wort ? `, #${wort}` : ''}`;
  const f = mk('form', { autocomplete: 'off' });
  const betreff = mk('input', { name: 'betreff', required: true, minLength: 3, maxLength: 150,
    placeholder: art === 'service' ? 'z. B. Kurze Wartung heute Nacht' : 'z. B. Dein Testzugang zur Radgarage' });
  const text = mk('textarea', { name: 'text', required: true, rows: 10, minLength: 20, maxLength: 10000, value: `Hallo,\n\n${mitSignatur()}` });
  const ok = mk('input', { type: 'checkbox', required: true });
  const msg = mk('div', { className: 'msg', role: 'status' });
  const vorschau = mk('iframe', { className: 'mail-vorschau', title: 'Vorschau der Mail', hidden: true });
  vorschau.setAttribute('sandbox', '');
  const fuss = art !== 'warteliste'
    ? '\n\n–\nDu bekommst diese Mail als Info zu deinem Radgarage-Konto.'
    : FUSS_WARTELISTE;
  const test = mk('button', { type: 'button', className: 'pill ghost', textContent: 'Testmail an mich' });
  const senden = mk('button', { type: 'submit', className: 'pill', textContent: `An ${zahlDe(anzahl)} senden` });
  const vorschauKnopf = mk('button', { type: 'button', className: 'pill ghost', textContent: 'Vorschau' });
  const schicken = async (nurTest) => {
    meldung(msg, nurTest ? 'Testmail wird gesendet …' : `Wird an ${zahlDe(anzahl)} gesendet …`);
    const r = await rpc('crm_sammelmail', { p_gruppe: gruppe, p_schlagwort: wort || null, p_betreff: betreff.value, p_text: text.value, p_nur_test: nurTest });
    return r;
  };
  test.addEventListener('click', async () => {
    if (!f.reportValidity()) return;
    test.disabled = true;
    try { const r = await schicken(true); meldung(msg, `Testmail an ${r.an} ist unterwegs. Sie steht auch im Postfach unter Erledigt.`); } catch (e) { meldung(msg, fehlerText(e), true); }
    test.disabled = false;
  });
  vorschauKnopf.addEventListener('click', async () => {
    try {
      vorschau.srcdoc = await rpc('konto_mail_vorschau', { p_betreff: betreff.value || 'Betreff', p_text: text.value + fuss });
      vorschau.hidden = false;
      vorschau.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { meldung(msg, fehlerText(e), true); }
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!senden.dataset.sicher) { senden.dataset.sicher = '1'; senden.textContent = `Wirklich an ${zahlDe(anzahl)} senden?`; senden.classList.add('gefahr'); return; }
    senden.disabled = true;
    try {
      const r = await schicken(false);
      dialogZu();
      meldung($('#msg-kontakte'), `Sammelmail „${betreff.value.trim()}“ ist an ${zahlDe(r.anzahl)} unterwegs. Antworten landen im Postfach.`);
      if ($('#sm-box').open) ladeSammelmails();
    } catch (e) { meldung(msg, fehlerText(e), true); senden.disabled = false; }
  });
  f.append(
    mk('p', { className: 'sm-hinweis', textContent: art === 'service'
      ? `An ${zahlDe(anzahl)} Konten (${gruppeText}). Nur Infos zum Dienst, zum Beispiel eine Störung, Wartung oder neue Bedingungen. Werbung und Angebote nicht, dafür fehlt die Einwilligung.`
      : art === 'gemischt'
      ? `An alle ${zahlDe(anzahl)} mit ${gruppeText}, Konten und Warteliste zusammen. Nur Infos zum Dienst, zu Testzugang oder Start, keine Werbung. Wer nur auf der Warteliste steht, bekommt automatisch einen Abmeldelink.`
      : `An ${zahlDe(anzahl)} Personen der Warteliste (${gruppeText}). Nur zu dem, wofür sie sich eingetragen haben: Testzugang und Start der App. Ein Abmeldelink kommt automatisch unter die Mail.` }),
    feldMit('Betreff', betreff), feldMit('Text', text),
    mk('div', { className: 'aktionen', style: 'margin:0' }, bausteinWahl(text, '', { betreff })),
    mk('label', { className: 'sm-ok' }, ok, mk('span', { textContent: art === 'service'
      ? 'Die Mail enthält nur Infos zum Dienst, keine Werbung.'
      : art === 'gemischt' ? 'Die Mail enthält nur Infos zum Dienst, zu Testzugang oder Start, keine Werbung.'
      : 'Die Mail passt zu Testzugang oder Start der App.' })),
    mk('p', { className: 'fine', textContent: 'Jede Person bekommt eine eigene Mail von kontakt@radgarage.app, ohne die anderen Adressen zu sehen. Antworten landen als Unterhaltung im Postfach.' }),
    vorschau, mk('div', { className: 'aktionen' }, senden, test, vorschauKnopf, mk('button', { type: 'button', className: 'pill ghost', textContent: 'Abbrechen', onclick: dialogZu })), msg);
  dialog('Sammelmail', f);
  $('#dlg .dlg-box').classList.add('breit');
  // Vorlagen landen zwischen Anrede und Signatur
  const pos = text.value.indexOf('\n\n') + 2;
  text.setSelectionRange(pos, pos);
  betreff.focus();
}
$('#ko-sammel').addEventListener('click', sammelmailEditor);

// --- Kennzahlen ---

let kzTage = 30;
async function ladeKennzahlen() {
  for (const b of $$('#kz-zeitraum button')) b.setAttribute('aria-checked', String(Number(b.dataset.tage) === kzTage));
  meldung($('#msg-kennzahlen'), 'Lade …');
  let z;
  try { z = await rpc('crm_kennzahlen', { p_tage: kzTage }); } catch (e) { meldung($('#msg-kennzahlen'), fehlerText(e), true); return; }
  meldung($('#msg-kennzahlen'), '');
  const a = z.antwortzeit || {};
  const std = a.median_std == null ? '–' : a.median_std < 1 ? `${Math.max(1, Math.round(a.median_std * 60))} Min.` : `${String(a.median_std).replace('.', ',')} Std.`;
  $('#kz-kacheln').replaceChildren(
    kachelSt('k5', 'Offen', zahlDe(z.offen), `${zahlDe(z.ungelesen)} ungelesen, ${zahlDe(z.wiedervorlage)} auf Wiedervorlage`),
    kachelSt('k1', 'Eingang', zahlDe(z.eingang), `Mails von Nutzern in ${z.tage} Tagen, ${zahlDe(z.neue_unterhaltungen)} neue Unterhaltungen`),
    kachelSt('k4', 'Antworten', zahlDe(z.ausgang), `vom Team in ${z.tage} Tagen, Sammelmails mitgezählt`),
    kachelSt('k3', 'Antwortzeit', std, a.anzahl ? `Median, ${a.binnen_24h} % binnen 24 Stunden` : 'noch keine beantwortete Mail im Zeitraum'),
    kachelSt('k2', 'Kontakte', zahlDe(z.kontakte.konten + z.kontakte.warteliste), `${zahlDe(z.kontakte.konten)} Konten, ${zahlDe(z.kontakte.warteliste)} Warteliste, davon ${zahlDe(z.kontakte.tester)} Tester`));
  const gitter = $('#kz-gitter');
  gitter.replaceChildren();
  const punkte = (z.wochen || []).map((w) => ({ tag: w.woche, text: `Woche ab ${tagText(w.woche, true)}`, ein: w.ein, aus: w.aus }));
  let c = karte(gitter, 'Mails pro Woche', 'Eingang von Nutzern und Antworten vom Team, letzte 8 Wochen', true);
  zeitDiagramm(c.plot, punkte, [{ name: 'Eingang', feld: 'ein', farbe: SERIE[0] }, { name: 'Antworten', feld: 'aus', farbe: SERIE[1] }]);
  tabelle(c.det, ['Woche ab', 'Eingang', 'Antworten'], punkte.map((p) => [tagText(p.tag, true), zahlDe(p.ein), zahlDe(p.aus)]));
  c = karte(gitter, 'Team', `Antworten in ${z.tage} Tagen, dahinter offene zugewiesene Unterhaltungen`);
  balken(c.plot, (z.team || []).map((t) => ({ label: t.email.split('@')[0], wert: t.antworten, text: `${zahlDe(t.antworten)} · ${zahlDe(t.zugewiesen)} offen`, tippName: 'Antworten' })), SERIE[3]);
  c.det.remove();
  c = karte(gitter, 'Themen nach Schlagwort', 'Personen mit Unterhaltung im Zeitraum');
  balken(c.plot, (z.schlagworte || []).map((w) => ({ label: `#${w.wort}`, wert: w.anzahl, tippName: 'Personen' })), SERIE[2]);
  c.det.remove();
  c = karte(gitter, 'Häufige Wörter im Betreff', 'Neue Unterhaltungen im Zeitraum, ohne Spam');
  balken(c.plot, (z.betreffwoerter || []).map((w) => ({ label: w.wort, wert: w.anzahl, tippName: 'Unterhaltungen' })), SERIE[0]);
  c.det.remove();
}
for (const b of $$('#kz-zeitraum button')) b.addEventListener('click', () => { kzTage = Number(b.dataset.tage); ladeKennzahlen(); });

// --- Warteliste: Tester und reine Warteliste ansehen und verwalten (crm_warteliste_*) ---

let wlArt = 'alle';
let wlSucheZeit = null;
const WL_STATUS = [['tester:iPhone', 'Tester · iPhone'], ['tester:Android', 'Tester · Android'], ['tester:', 'Tester · Handy offen'], ['bescheid:', 'Nur Bescheid sagen']];
const wlStatusWert = (x) => (x.testzugang ? `tester:${x.plattform || ''}` : 'bescheid:');

// Antwort von Brevo abwarten (pg_net schickt erst nach dem Speichern)
async function brevoAntwort(anfrage) {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((ok) => setTimeout(ok, 900));
    const r = await rpc('crm_brevo_antwort', { p_anfrage: anfrage }).catch(() => null);
    if (r && r.status) return r;
  }
  return null;
}
const brevoText = (r, gut) => (!r ? `${gut} Brevo bestätigt es gleich.` : r.status < 300 ? gut : `Brevo hat abgelehnt (${r.status}). ${r.fehler || ''}`);

async function ladeWarteliste() {
  for (const b of $$('#wl-art button')) b.setAttribute('aria-checked', String(b.dataset.art === wlArt));
  let d;
  try { d = await rpc('crm_warteliste', { p_art: wlArt, p_suche: $('#wl-suche').value || null }); } catch (e) { meldung($('#msg-warteliste'), fehlerText(e), true); return; }
  const z = d.zahlen;
  $('#wl-zahl').textContent = `(${zahlDe(z.alle)})`;
  $('#wl-stand').textContent = `Bestätigte Einträge von radgarage.app${d.stand ? `, mit Brevo abgeglichen ${zeitKurz(d.stand).replace(/\.$/, '')}` : ''}.`;
  const voll = z.tester >= d.plaetze;
  $('#wl-kacheln').replaceChildren(
    kachelSt(voll ? 'k2' : 'k4', 'Testplätze', `${zahlDe(z.tester)} / ${zahlDe(d.plaetze)}`, voll ? 'Alle Plätze vergeben' : `${zahlDe(d.plaetze - z.tester)} frei`),
    kachelSt('k5', 'iPhone', zahlDe(z.iphone), 'Tester über TestFlight'),
    kachelSt('k2', 'Android', zahlDe(z.android), `Tester über die Testversion${z.ohne_plattform ? `, ${zahlDe(z.ohne_plattform)} ohne Angabe` : ''}`),
    kachelSt('k1', 'Nur Bescheid', zahlDe(z.nur_bescheid), 'Mail, wenn die App im Store ist'));
  const liste = $('#wl-liste');
  liste.replaceChildren(...d.kontakte.map(wartelisteZeile));
  if (!d.kontakte.length) liste.innerHTML = `<p class="fine">${$('#wl-suche').value ? 'Nichts gefunden.' : 'Niemand in dieser Gruppe.'}</p>`;
  const aus = d.ausstehend || [];
  $('#wl-ausstehend').hidden = !aus.length;
  $('#wl-ausstehend-liste').replaceChildren(...aus.map((a) => mk('li', {},
    mk('span', { textContent: a.email }),
    mk('span', { className: 'fine', textContent: `eingeladen ${zeitKurz(a.erstellt)} · ${a.testzugang ? `Tester${a.plattform ? `, ${a.plattform}` : ''}` : 'Nur Bescheid'}` }))));
  $('#wl-ausstehend-zahl').textContent = `(${aus.length})`;
}

function wartelisteZeile(x) {
  const wahl = mk('select', { className: 'wl-status' }, ...WL_STATUS.map(([w, t]) => new Option(t, w)));
  wahl.value = wlStatusWert(x);
  wahl.setAttribute('aria-label', `Status von ${x.email}`);
  wahl.addEventListener('change', async () => {
    const [art, plattform] = wahl.value.split(':');
    wahl.disabled = true;
    try {
      const anfrage = await rpc('crm_warteliste_setzen', { p_email: x.email, p_testzugang: art === 'tester', p_plattform: plattform });
      const r = await brevoAntwort(anfrage);
      meldung($('#msg-warteliste'), brevoText(r, `${x.email}: jetzt „${WL_STATUS.find(([w]) => w === wahl.value)[1]}“.`), r && r.status >= 300);
      ladeWarteliste();
    } catch (e) { meldung($('#msg-warteliste'), fehlerText(e), true); wahl.value = wlStatusWert(x); }
    wahl.disabled = false;
  });
  const weg = sicherKnopf('Löschen', async () => {
    const anfrage = await rpc('crm_warteliste_loeschen', { p_email: x.email });
    const r = await brevoAntwort(anfrage);
    meldung($('#msg-warteliste'), brevoText(r, `${x.email} ist von der Warteliste gelöscht, auch bei Brevo.`), r && r.status >= 300 && r.status !== 404);
    ladeWarteliste();
  });
  weg.title = 'Löscht den Kontakt ganz aus Brevo, wie der Abmeldelink';
  const person = mk('button', { type: 'button', className: 'wl-person' }, ava(x.email), mk('span', { className: 'pf-mitte' },
    mk('span', { className: 'pf-wer', textContent: x.email }),
    mk('span', { className: 'pf-vorschau', textContent: `Seit ${datum(x.eingetragen)}${x.radmarke ? ` · fährt ${x.radmarke}` : ''}` }),
    mk('span', { className: 'pf-meta' },
      x.konto ? mk('span', { className: 'zu', textContent: 'Konto' }) : null,
      x.manuell ? mk('span', { className: 'wv', textContent: 'von Hand', title: `Zustimmung: ${x.manuell}` }) : null,
      ...(x.schlagworte || []).map((w) => mk('span', { textContent: `#${w}` })))));
  person.addEventListener('click', () => personDialog(x.email));
  return mk('div', { className: 'wl-zeile' }, person, mk('div', { className: 'wl-aktionen' }, wahl, weg));
}

function wartelisteHinzufuegen() {
  const msg = mk('div', { className: 'msg', role: 'status' });
  const email = mk('input', { type: 'email', name: 'email', required: true, autocomplete: 'off', placeholder: 'name@beispiel.de' });
  const art = mk('select', {}, new Option('Testzugang', 'tester'), new Option('Nur Bescheid sagen', 'bescheid'));
  const plattform = mk('select', {}, new Option('iPhone', 'iPhone'), new Option('Android', 'Android'));
  const plattformFeld = mk('label', {}, 'Handy', plattform);
  art.addEventListener('change', () => { plattformFeld.hidden = art.value !== 'tester'; });
  const marke = mk('input', { type: 'text', maxLength: 60, placeholder: 'freiwillig' });
  const wegDoi = mk('input', { type: 'radio', name: 'weg', value: 'doi', checked: true });
  const wegDirekt = mk('input', { type: 'radio', name: 'weg', value: 'direkt' });
  const beleg = mk('textarea', { rows: 2, maxLength: 500, placeholder: 'z. B. „Hat mich am 28.10. beim Radtreff gebeten, ihn einzutragen.“' });
  const belegFeld = feldMit('Wann und wie hat die Person zugestimmt?', beleg);
  belegFeld.hidden = true;
  for (const r of [wegDoi, wegDirekt]) r.addEventListener('change', () => { belegFeld.hidden = !wegDirekt.checked; beleg.required = wegDirekt.checked; });
  const senden = mk('button', { type: 'submit', className: 'pill', textContent: 'Hinzufügen' });
  const f = mk('form', { autocomplete: 'off', className: 'wl-neu' },
    feldMit('E-Mail-Adresse', email),
    mk('div', { className: 'zeile' }, mk('label', {}, 'Was möchte die Person?', art), plattformFeld, mk('label', {}, 'Radmarke', marke)),
    mk('fieldset', { className: 'wl-weg' }, mk('legend', { textContent: 'Wie eintragen?' }),
      mk('label', { className: 'wl-option' }, wegDoi, mk('span', {}, mk('strong', { textContent: 'Bestätigungsmail schicken (empfohlen)' }),
        mk('small', { textContent: 'Dieselbe Mail wie bei der Anmeldung auf radgarage.app. Erst nach dem Klick auf den Link steht die Person auf der Liste.' }))),
      mk('label', { className: 'wl-option' }, wegDirekt, mk('span', {}, mk('strong', { textContent: 'Direkt eintragen' }),
        mk('small', { textContent: 'Nur, wenn die Person dich ausdrücklich darum gebeten hat. Die Zustimmung wird als Notiz gespeichert.' })))),
    belegFeld,
    mk('div', { className: 'aktionen' }, senden), msg);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    senden.disabled = true;
    try {
      const r = await rpc('crm_warteliste_hinzufuegen', {
        p_email: email.value, p_testzugang: art.value === 'tester', p_plattform: art.value === 'tester' ? plattform.value : null,
        p_radmarke: marke.value || null, p_beleg: wegDirekt.checked ? beleg.value : null,
      });
      meldung(msg, 'Wird an Brevo geschickt …');
      const b = await brevoAntwort(r.anfrage);
      if (b && b.status >= 300) { meldung(msg, brevoText(b, ''), true); senden.disabled = false; return; }
      dialogZu();
      meldung($('#msg-warteliste'), r.art === 'eingeladen'
        ? `Bestätigungsmail an ${email.value} ist raus. Nach dem Klick steht die Person auf der Liste (unten unter „Eingeladen“).`
        : `${email.value} steht jetzt auf der Warteliste.`);
      ladeWarteliste();
    } catch (e) { meldung(msg, fehlerText(e), true); senden.disabled = false; }
  });
  dialog('Auf die Warteliste setzen', f);
}

for (const b of $$('#wl-art button')) b.addEventListener('click', () => { wlArt = b.dataset.art; ladeWarteliste(); });
$('#wl-suche').addEventListener('input', () => { clearTimeout(wlSucheZeit); wlSucheZeit = setTimeout(ladeWarteliste, 300); });
$('#wl-neu').addEventListener('click', wartelisteHinzufuegen);
$('#wl-abgleich').addEventListener('click', async (ev) => {
  const b = ev.currentTarget;
  b.disabled = true;
  meldung($('#msg-warteliste'), 'Frage die Warteliste bei Brevo ab …');
  try {
    await rpc('crm_abgleich', { p_einlesen: false });
    let r = null;
    for (let i = 0; i < 5 && !(r && r.eingelesen != null); i += 1) {
      await new Promise((ok) => setTimeout(ok, 2000));
      r = await rpc('crm_abgleich', { p_einlesen: true });
    }
    await ladeWarteliste();
    meldung($('#msg-warteliste'), r && r.eingelesen != null ? `Abgeglichen: ${zahlDe(r.kontakte)} auf der Warteliste.` : 'Brevo antwortet gerade nicht, der stündliche Abgleich holt es nach.', !(r && r.eingelesen != null));
  } catch (e) { meldung($('#msg-warteliste'), fehlerText(e), true); }
  b.disabled = false;
});

// ----- Neu dabei: Kachel im CRM (neu-dabei.sql) -----
// Neue Einträge auf der Warteliste und neue Konten seit dem eigenen letzten Blick. Der Stand liegt je Person auf dem Server,
// gilt also auf jedem Gerät. Die Glocke oben (Teil 11) zählt sie mit allen anderen Hinweisen.

let neuDaten = null;

function neuZeile(email, zeile, chips) {
  const person = mk('button', { type: 'button', className: 'wl-person' }, ava(email), mk('span', { className: 'pf-mitte' },
    mk('span', { className: 'pf-wer', textContent: email }),
    mk('span', { className: 'pf-vorschau', textContent: zeile }),
    chips.length ? mk('span', { className: 'pf-meta' }, ...chips.map(([t, art]) => mk('span', { className: art || '', textContent: t }))) : null));
  person.addEventListener('click', () => personDialog(email));
  return mk('div', { className: 'wl-zeile' }, person);
}

function neuGruppe(titel, teil, art, ziel, zeile) {
  const kopf = mk('div', { className: 'neu-gruppe-kopf' }, mk('h4', { textContent: `${titel} · ${zahlDe(teil.anzahl)} neu` }),
    mk('div', { className: 'aktionen', style: 'margin:0' }, ziel,
      teil.anzahl ? Object.assign(mk('button', { type: 'button', className: 'pill ghost mini', textContent: 'Gesehen' }), { onclick: () => neuGesehen(art) }) : null));
  const mehr = teil.anzahl - teil.eintraege.length;
  return mk('div', { className: 'neu-gruppe' }, kopf, ...teil.eintraege.map(zeile),
    !teil.anzahl ? mk('p', { className: 'fine', textContent: 'Nichts Neues.' }) : null,
    mehr > 0 ? mk('p', { className: 'fine', textContent: `und ${zahlDe(mehr)} weitere` }) : null);
}

function zeichneNeu(zeigen = false) {
  hinweiseZeichnen();
  const d = neuDaten;
  const w = d && d.warteliste;
  const k = d && d.konten;
  const n = (w ? w.anzahl : 0) + (k ? k.anzahl : 0);
  const kachel = $('#neu-kachel');
  if (!d) { kachel.hidden = true; return; }
  if (zeigen || n) kachel.hidden = false;
  if (kachel.hidden) return;
  $('#neu-kachel-zahl').hidden = !n;
  $('#neu-kachel-zahl').textContent = String(n);
  const seit = [w, k].filter(Boolean).map((x) => new Date(x.seit)).sort((a, b) => a - b)[0];
  $('#neu-seit').textContent = n ? `Seit deinem letzten Blick (${zeitKurz(seit)}). Ein Klick öffnet die Personenkarte.` : 'Alles gesehen. Neue Einträge erscheinen hier und an der Glocke oben.';
  $('#neu-gesehen').hidden = !n;
  const zurListe = (text, fn) => Object.assign(mk('button', { type: 'button', className: 'pill ghost mini', textContent: text }), { onclick: fn });
  $('#neu-spalten').replaceChildren(...[
    w && neuGruppe('Warteliste', w, 'warteliste', zurListe('Zur Warteliste', () => crmZeigen('warteliste')), (x) => neuZeile(x.email,
      `eingetragen ${zeitKurz(x.eingetragen)}${x.radmarke ? ` · fährt ${x.radmarke}` : ''}`,
      [[x.testzugang ? `Tester${x.plattform ? `, ${x.plattform}` : ''}` : 'Nur Bescheid', 'wv'], ...(x.konto ? [['Konto', 'zu']] : [])])),
    k && neuGruppe('Neue Konten', k, 'konten', darf('konten_sehen') ? zurListe('Zu den Konten', () => tab('konten')) : null, (x) => neuZeile(x.email,
      `registriert ${zeitKurz(x.registriert)} · über ${(x.anbieter || []).map((a) => ANBIETER[a] || a).join(', ') || 'E-Mail'}`,
      [[`${x.raeder || 0} ${x.raeder === 1 ? 'Rad' : 'Räder'}`], ...(x.bestaetigt ? [] : [['nicht bestätigt', 'wv']]), ...(x.warteliste ? [['Warteliste', 'zu']] : [])])),
  ].filter(Boolean));
}

async function neuDabei(zeigen = false) {
  if (!darf('konten_betreuen') || $('#s-werkbank').hidden) { neuDaten = null; zeichneNeu(); return; }
  try {
    neuDaten = await rpc('neu_dabei');
  } catch (e) {
    if (zeigen) meldung($('#msg-neu'), fehlerText(e), true);
    return;
  }
  zeichneNeu(zeigen);
}

async function neuGesehen(art = null) {
  if (!neuDaten) return;
  meldung($('#msg-neu'), '');
  try {
    await rpc('neu_dabei_gesehen', { p_art: art, p_bis: neuDaten.stand });
    await neuDabei(true);
  } catch (e) { meldung($('#msg-neu'), fehlerText(e), true); }
}

// Sprung aus der Glocke: CRM öffnen, Kachel zeigen
async function neuKachelZeigen() {
  tab('crm');
  await neuDabei(true);
  $('#neu-kachel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#neu-gesehen').addEventListener('click', () => neuGesehen());
$('#neu-laden').addEventListener('click', () => neuDabei(true));
