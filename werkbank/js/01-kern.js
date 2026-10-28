// Werkbank, Teil 1 von 11: Grundlagen: Verbindung, Hilfsfunktionen, Anmeldung, Reiter, Profilbilder.
// Werkbank: Katalogpflege im Browser für freigeschaltete Konten (Tabelle katalog_helfer).
// Anmeldung mit E-Mail-Code, danach zweiter Faktor (TOTP). Die Server-Funktionen prüfen Rolle und zweiten Faktor selbst,
// diese Seite blendet nur aus, was man ohnehin nicht darf.
// Die Teile laufen nacheinander als normale Skripte (index.html) und teilen sich ihre Namen. Was ein Teil beim
// Laden sofort aufruft, muss in diesem oder einem früheren Teil stehen.
'use strict';

const SERVER = {
  url: 'https://axiirnfgtbmmjlfwlyfe.supabase.co',
  key: 'sb_publishable_dBz5uK-7wYwKKL3O8Qd0MA_pYzxTP_2',
};
// Sitzung nur im Tab: Tab zu heißt abgemeldet.
const sb = supabase.createClient(SERVER.url, SERVER.key, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// Wie supabase/schema.sql (teile_kategorie_check)
const TEIL_KATEGORIEN = ['Kette', 'Kassette', 'Riemen', 'Schaltwerk', 'Umwerfer', 'Schalthebel', 'Kurbel', 'Motor', 'Akku',
  'Bremsbelag', 'Bremsscheibe', 'Bremssattel', 'Reifen', 'Schlauch', 'Laufradsatz',
  'Innenlager', 'Steckachse', 'Steuersatz', 'Gabel', 'Lenker', 'Lenkerband', 'Sattel', 'Sattelstütze', 'Pedale', 'Sonstiges'];

const euro = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const SCHRITTE = ['s-mail', 's-code', 's-einrichten', 's-faktor', 's-nein', 's-werkbank'];

// Design wie in der App: Bright (Standard) oder Dark
const DESIGN_FARBE = { light: '#F2EDE2', dark: '#1F2226' };
function designSetzen(wahl) {
  document.documentElement.dataset.theme = wahl;
  try { localStorage.setItem('werkbank-design', wahl); } catch { /* ohne Speicher nur für jetzt */ }
  for (const b of $$('.design button')) b.setAttribute('aria-checked', String(b.dataset.design === wahl));
  $('meta[name="theme-color"]').content = DESIGN_FARBE[wahl];
}
for (const b of $$('.design button')) b.addEventListener('click', () => designSetzen(b.dataset.design));
designSetzen(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

let email = '';
let rolle = null; // 'superadmin' | 'admin' | 'support' | 'helfer'
let rechte = new Set();
const darf = (r) => rechte.has(r);
const ROLLEN = { superadmin: 'Super-Admin', admin: 'Admin', support: 'Support', helfer: 'Helfer' };
// Spiegel der Rechte-Matrix auf dem Server (meine_rolle liefert sie mit, das hier ist nur der Rückfall)
const RECHTE_JE_ROLLE = {
  superadmin: ['katalog_erfassen', 'katalog_pflegen', 'statistik', 'konten_sehen', 'konten_betreuen', 'konten_verwalten', 'rollen', 'system', 'feedback'],
  admin: ['katalog_erfassen', 'katalog_pflegen', 'statistik', 'konten_sehen', 'konten_betreuen', 'rollen', 'feedback'],
  support: ['statistik', 'konten_sehen', 'konten_betreuen', 'feedback'],
  helfer: ['katalog_erfassen'],
};
const RECHTE_TEXT = [
  ['katalog_erfassen', 'Räder und Teile erfassen', 'Bei Helfern wartet alles auf Freigabe.'],
  ['katalog_pflegen', 'Katalog pflegen', 'Sofort live, Freigaben, App-Vorschläge, Bearbeiten und Löschen, Shops, Übersicht.'],
  ['statistik', 'Statistik', 'Zusammengefasste Zahlen, keine einzelnen Personen.'],
  ['feedback', 'Feedback', 'Nachrichten von radgarage.app/feedback lesen, abhaken, beantworten.'],
  ['konten_sehen', 'Konten sehen', 'Liste der Konten mit Profilbild. Nur mit zweitem Faktor.'],
  ['konten_betreuen', 'Konten betreuen', 'E-Mail-CRM, Mail-Signatur, sperren, zweiten Faktor zurücksetzen.'],
  ['konten_verwalten', 'Konten verwalten', 'Konten löschen, Premium schenken, Sammelmails.'],
  ['rollen', 'Rollen vergeben', 'Super-Admin: alle Rollen. Admin: nur Helfer.'],
  ['system', 'Systemstatus', 'Speicher und Grenzen von Supabase.'],
];
// Welche Rollen jemand vergeben darf
const vergebbar = () => (rolle === 'superadmin' ? ['helfer', 'support', 'admin'] : darf('rollen') ? ['helfer'] : []);
let faktorId = null;
let radTeile = []; // { teil_id, name, kategorie, ean } oder { neu: {...}, name, kategorie, ean }
// Beim Ergänzen eines vorhandenen Rads: { rad, vorhanden: [{ id, name, kategorie }], weg: Set }. radTeile sind dann die neuen Teile.
let ergaenzen = null;

function zeige(id) {
  for (const s of SCHRITTE) $('#' + s).hidden = s !== id;
  const drin = id === 's-werkbank' || id === 's-einrichten' || id === 's-faktor';
  $('#wer').hidden = !drin;
  const f = $('#' + id + ' input:not([type=hidden])');
  if (f && id !== 's-werkbank') setTimeout(() => f.focus(), 0);
}

function meldung(el, text, fehler = false) {
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('fehler', !!fehler);
}

function fehlerText(e) {
  const m = (e && (e.message || e.msg || e.error_description)) || String(e);
  if (/Kein Katalog-Helfer/i.test(m)) return 'Dieses Konto ist nicht freigeschaltet.';
  if (/bestätigtem Code|aal2|mfa/i.test(m)) return 'Bitte zuerst mit dem zweiten Faktor anmelden.';
  if (/expired|invalid/i.test(m) && /otp|token|code/i.test(m)) return 'Der Code stimmt nicht oder ist abgelaufen.';
  if (/Signups not allowed|not found/i.test(m)) return 'Zu dieser Adresse gibt es kein Konto mit Zugang.';
  if (/rate limit|security purposes/i.test(m)) return 'Zu viele Versuche. Bitte eine Minute warten.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Keine Verbindung zum Server.';
  return m;
}

async function mitKnopf(form, fn) {
  const knopf = form.querySelector('button[type=submit]');
  const msg = form.querySelector('.msg');
  if (knopf) knopf.disabled = true;
  meldung(msg, '');
  try {
    await fn(msg);
  } catch (e) {
    meldung(msg, fehlerText(e), true);
  } finally {
    if (knopf) knopf.disabled = false;
  }
}

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  return data;
}

// ---------- Anmeldung ----------

let mitPasswort = false;
$('#pw-umschalten').addEventListener('click', () => {
  mitPasswort = !mitPasswort;
  $('#pw-feld').hidden = !mitPasswort;
  $('#f-mail').passwort.required = mitPasswort;
  $('#mail-knopf').textContent = mitPasswort ? 'Anmelden' : 'Code schicken';
  $('#pw-umschalten').textContent = mitPasswort ? 'Mit Code per E-Mail' : 'Mit Passwort';
  if (mitPasswort) $('#f-mail').passwort.focus();
});

// Anmelden mit Benutzername: Die Edge Function werkbank-anmelden sucht die Adresse auf dem Server heraus und gibt sie nie
// heraus. Sie liefert nach Code oder Passwort eine Sitzung (noch ohne zweiten Faktor), weiter geht es wie mit E-Mail.
let anmeldeName = null;
async function nameAnmeldung(daten) {
  let r;
  try {
    r = await fetch(`${SERVER.url}/functions/v1/werkbank-anmelden`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVER.key },
      body: JSON.stringify(daten),
    });
  } catch {
    throw new Error('Anmeldung gerade nicht erreichbar, bitte gleich noch einmal oder mit E-Mail-Adresse.');
  }
  const antwort = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(antwort.fehler || 'Anmeldung gerade nicht möglich.');
  if (antwort.access_token) {
    const { error } = await sb.auth.setSession({ access_token: antwort.access_token, refresh_token: antwort.refresh_token });
    if (error) throw error;
  }
  return antwort;
}

$('#f-mail').addEventListener('submit', (ev) => {
  ev.preventDefault();
  mitKnopf(ev.target, async () => {
    const eingabe = ev.target.email.value.trim();
    anmeldeName = eingabe.includes('@') ? null : eingabe;
    if (anmeldeName) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$/.test(anmeldeName)) throw new Error('Bitte deine E-Mail-Adresse oder deinen Benutzernamen eintragen.');
      if (mitPasswort) {
        const passwort = ev.target.passwort.value;
        ev.target.passwort.value = '';
        await nameAnmeldung({ aktion: 'passwort', name: anmeldeName, passwort });
        await weiter();
        return;
      }
      await nameAnmeldung({ aktion: 'code', name: anmeldeName });
      // Gleiche Meldung, ob es den Namen gibt oder nicht
      $('#code-text').textContent = `Gibt es den Namen ${anmeldeName}, kommt jetzt ein 6-stelliger Code an die E-Mail-Adresse des Kontos. Nach mehreren Fehlversuchen ist der Name 15 Minuten gesperrt, die Adresse geht dann weiter.`;
      $('#f-code').reset();
      zeige('s-code');
      return;
    }
    email = eingabe.toLowerCase();
    if (mitPasswort) {
      const { error } = await sb.auth.signInWithPassword({ email, password: ev.target.passwort.value });
      ev.target.passwort.value = '';
      if (error) throw /Invalid login credentials/i.test(error.message) ? new Error('E-Mail oder Passwort stimmt nicht. Noch kein Passwort gesetzt? Dann mit Code per E-Mail anmelden.') : error;
      await weiter();
      return;
    }
    // Keine neuen Konten über die Werkbank: nur wer schon ein App-Konto hat
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
    $('#code-text').replaceChildren('Wir haben einen 6-stelligen Code an ', Object.assign(document.createElement('strong'), { id: 'code-mail', textContent: email }), ' geschickt.');
    $('#f-code').reset();
    zeige('s-code');
  });
});

$('#zurueck').addEventListener('click', () => zeige('s-mail'));
$('#nochmal').addEventListener('click', () => zeige('s-mail'));

$('#f-code').addEventListener('submit', (ev) => {
  ev.preventDefault();
  mitKnopf(ev.target, async () => {
    if (anmeldeName) {
      await nameAnmeldung({ aktion: 'pruefen', name: anmeldeName, code: ev.target.code.value.trim() });
      await weiter();
      return;
    }
    const { error } = await sb.auth.verifyOtp({ email, token: ev.target.code.value.trim(), type: 'email' });
    if (error) throw error;
    await weiter();
  });
});

// Nach dem E-Mail-Code: Rolle prüfen, dann zweiten Faktor einrichten oder abfragen
async function weiter() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return zeige('s-mail');
  email = session.user.email || email;
  $('#wer-mail').textContent = email;
  $('#wer-mail').title = '';

  await rolleLaden();
  if (!rechte.size) {
    await sb.auth.signOut({ scope: 'local' });
    return zeige('s-nein');
  }

  const { data: aal, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (aal.currentLevel === 'aal2') return werkbank();

  const { data: faktoren, error: e2 } = await sb.auth.mfa.listFactors();
  if (e2) throw e2;
  const bestaetigt = faktoren.totp.filter((f) => f.status === 'verified');
  if (bestaetigt.length) {
    faktorId = bestaetigt[0].id;
    $('#f-faktor').reset();
    $('#faktor-wahl').replaceChildren(...bestaetigt.map((f) => new Option(f.friendly_name || 'Authenticator', f.id)));
    $('#faktor-wahl-feld').hidden = bestaetigt.length < 2;
    $('#notfall').open = false;
    $('#f-notfall').reset();
    return zeige('s-faktor');
  }
  await einrichten(faktoren.all);
}

async function einrichten(alle) {
  // Abgebrochene Einrichtungen aufräumen, sonst stapeln sie sich
  for (const f of alle.filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator-App', issuer: 'Radgarage' });
  if (error) throw error;
  faktorId = data.id;
  $('#qr').src = qrBild(data.totp.qr_code);
  $('#geheim').textContent = data.totp.secret;
  $('#f-einrichten').reset();
  zeige('s-einrichten');
}

// Supabase liefert das SVG unkodiert im data:-Link, das mögen nicht alle Browser
function qrBild(link) {
  const i = link.indexOf('<svg');
  return i < 0 ? link : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(link.slice(i));
}

async function faktorPruefen(form) {
  if (form.faktor && form.faktor.value) faktorId = form.faktor.value;
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: faktorId, code: form.code.value.trim() });
  if (error) throw error;
  await werkbank();
}
$('#f-einrichten').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  mitKnopf(f, async () => {
    const id = faktorId;
    const name = f.name.value.trim();
    await faktorPruefen(f);
    // Name erst nach dem Bestätigen setzen, vorher darf der Faktor nicht umbenannt werden
    if (name && name !== 'Authenticator-App') await rpc('faktor_umbenennen', { p_faktor: id, p_name: name }).catch(() => {});
  });
});
$('#f-faktor').addEventListener('submit', (ev) => { ev.preventDefault(); mitKnopf(ev.target, () => faktorPruefen(ev.target)); });

// Notfall: Wiederherstellungscode löscht die Faktoren, danach neu einrichten
$('#f-notfall').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  mitKnopf(f, async () => {
    const code = f.code.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 8) throw new Error('Ein Code hat 8 Zeichen, zum Beispiel ABCD-EFGH.');
    const ok = await rpc('wiederherstellung_einloesen', { p_code: `${code.slice(0, 4)}-${code.slice(4)}` });
    if (!ok) throw new Error('Dieser Code passt nicht oder wurde schon benutzt.');
    await sb.auth.refreshSession();
    const { data: faktoren, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    await einrichten(faktoren.all);
    meldung($('#f-einrichten .msg'), 'Code angenommen. Richte jetzt deine Authenticator-App neu ein und erzeuge danach neue Wiederherstellungscodes.');
  });
});

$('#abmelden').addEventListener('click', async () => {
  await sb.auth.signOut({ scope: 'local' });
  rolle = null;
  rechte = new Set();
  radTeile = [];
  $('#wer-bild').replaceWith(Object.assign(document.createElement('span'), { id: 'wer-bild', className: 'ava' }));
  ergaenzenEnde();
  zeige('s-mail');
});

// ---------- Werkbank ----------

async function rolleLaden() {
  let info;
  try {
    info = await rpc('meine_rolle');
  } catch {
    // Ältere Server-Seite ohne meine_rolle: Rolle wie bisher, Rechte aus der Matrix
    const alt = await rpc('helfer_rolle');
    info = { rolle: alt, rechte: RECHTE_JE_ROLLE[alt] || [] };
  }
  rolle = info && RECHTE_JE_ROLLE[info.rolle] ? info.rolle : null;
  rechte = new Set(rolle ? info.rechte || RECHTE_JE_ROLLE[rolle] : []);
  $('#erinnerung-an').checked = info?.erinnerung !== false;
  if (rolle) await nameLaden();
}

// ----- Benutzername (supabase/werkbank-name.sql) -----

let meinName = null;
function nameZeigen() {
  $('#wer-mail').textContent = meinName || email;
  $('#wer-mail').title = meinName ? email : '';
  $('#f-name').name.value = meinName || '';
}
async function nameLaden() {
  try { meinName = await rpc('werkbank_name'); } catch { meinName = null; /* Server noch ohne Namen */ }
  nameZeigen();
}
$('#f-name').addEventListener('submit', (ev) => {
  ev.preventDefault();
  mitKnopf(ev.target, async (msg) => {
    const neu = ev.target.name.value.trim();
    meinName = await rpc('werkbank_name_setzen', { p_name: neu });
    nameZeigen();
    meldung(msg, meinName ? `Gespeichert. Ab jetzt kannst du dich auch mit „${meinName}“ anmelden.` : 'Name entfernt, angemeldet wird wieder mit der E-Mail-Adresse.');
  });
});

// Tägliche Mail „neu zur Freigabe“ für sich selbst an- und ausschalten
$('#erinnerung-an').addEventListener('change', async (ev) => {
  const an = ev.target.checked;
  ev.target.disabled = true;
  meldung($('#msg-erinnerung'), '');
  try {
    await rpc('erinnerung_setzen', { p_email: null, p_an: an });
    meldung($('#msg-erinnerung'), an ? 'Erinnerung ist an.' : 'Erinnerung ist aus.');
  } catch (e) {
    ev.target.checked = !an;
    meldung($('#msg-erinnerung'), fehlerText(e), true);
  } finally {
    ev.target.disabled = false;
  }
});

async function werkbank() {
  // Nach dem zweiten Faktor neu fragen, erst dann gelten Konten-Rechte
  try { await rolleLaden(); } catch { /* Stand vom Login behalten */ }
  for (const el of $$('[data-recht]')) el.hidden = !el.dataset.recht.split(' ').some(darf);
  for (const el of $$('[data-nur-rolle]')) el.hidden = el.dataset.nurRolle !== rolle;
  $('#wer-rolle').textContent = ROLLEN[rolle] || '';
  $('#hinweis-rolle').textContent = darf('katalog_pflegen')
    ? `Du bist ${ROLLEN[rolle]}: Was du speicherst, ist sofort im Katalog.`
    : 'Was du speicherst, sieht in der App erst jemand, wenn es freigegeben ist.';
  zeichneMeineRolle();
  $('#f-rad').baujahr.max = new Date().getFullYear() + 1;
  $('#f-passwort').email.value = email;
  zeige('s-werkbank');
  tabAusAdresse();
  ladeMarken();
  if (darf('katalog_pflegen')) ladeOffen();
  if (darf('feedback')) feedbackZahl();
  if (darf('konten_betreuen')) { postfachZahl(); ladeSignatur(); }
  letzteAktivitaet = Date.now();
  pruefeCodes();
  ladeEigenesBild();
}

// ----- Profilbilder (legen die Nutzer in der App fest, Speicher „profilbilder“, privat) -----

// Rundes Bild, ohne Profilbild der erste Buchstabe der E-Mail-Adresse
function ava(mail, url, gross) {
  const el = url ? Object.assign(document.createElement('img'), { src: url, alt: '', loading: 'lazy' }) : document.createElement('span');
  el.className = 'ava' + (gross ? ' gross' : '');
  if (!url) el.textContent = ((mail || '?').trim()[0] || '?').toUpperCase();
  el.setAttribute('aria-hidden', 'true');
  return el;
}

async function profilbildPfad(id) {
  const { data, error } = await sb.storage.from('profilbilder').list(id, { limit: 1, sortBy: { column: 'name', order: 'desc' } });
  if (error) throw error;
  const f = (data || []).find((x) => x.id);
  return f ? `${id}/${f.name}` : null;
}

async function ladeEigenesBild() {
  let url = null;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const pfad = session && await profilbildPfad(session.user.id);
    if (pfad) {
      const { data } = await sb.storage.from('profilbilder').createSignedUrl(pfad, 3600);
      url = data?.signedUrl || null;
    }
  } catch { /* ohne Bild geht es auch */ }
  const el = ava(email, url);
  el.id = 'wer-bild';
  $('#wer-bild').replaceWith(el);
}

function tab(name) {
  // Konto steckt im Zahnrad oben rechts, alle anderen Bereiche sind Reiter
  const knopf = name === 'konto' ? $('#konto-auf') : $(`nav.tabs button[data-tab="${name}"]`);
  if (!knopf || knopf.hidden) name = ['uebersicht', 'erfassen', 'konten', 'statistik', 'teile'].find((t) => !$(`nav.tabs button[data-tab="${t}"]`).hidden) || (darf('feedback') ? 'feedback' : 'konto');
  // Jeder Tab hat eine eigene Adresse (#statistik), damit Neuladen und Zurück funktionieren
  if (location.hash.slice(1).split('/')[0] !== name) history.pushState(null, '', `#${name}`);
  for (const b of $$('nav.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  $('#konto-auf').setAttribute('aria-pressed', String(name === 'konto'));
  for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== name;
  if (name === 'freigaben') ladeOffen();
  if (name === 'eigene') ladeEigene();
  if (name === 'erfassen') entwurfAnbieten();
  if (name === 'teile' && !$('#tl-liste').children.length) ladeTeileliste(true);
  if (name === 'katalog') katalogLaden();
  if (name === 'uebersicht') ladeUebersicht();
  if (name === 'statistik') ladeStatistik();
  if (name === 'feedback') ladeFeedback();
  if (name === 'konten') ladeKonten();
  if (name === 'crm') crmZeigen(crmAnsicht);
  if (name === 'konto') ladeSicherheit();
}
for (const b of $$('nav.tabs button')) b.addEventListener('click', () => tab(b.dataset.tab));
$('#konto-auf').addEventListener('click', () => tab('konto'));
function tabAusAdresse() {
  const [name, unter] = location.hash.slice(1).split('/');
  if (name === 'postfach') { zumPostfach(); return; }
  if (name === 'crm') crmAnsicht = unter || 'postfach';
  tab(name || '');
  if (name === 'freigaben') fgAnsichtSetzen(['app', 'web'].includes(unter) ? unter : 'helfer');
  if (name === 'katalog') katAnsichtSetzen(unter);
}
window.addEventListener('popstate', () => { if (!$('#s-werkbank').hidden) tabAusAdresse(); });
for (const b of $$('[data-neu-laden]')) b.addEventListener('click', () => ladeOffen());

async function ladeMarken() {
  const { data } = await sb.from('raeder').select('hersteller').limit(5000);
  const marken = [...new Set((data || []).map((r) => r.hersteller))].sort((a, b) => a.localeCompare(b, 'de'));
  const dl = $('#marken');
  dl.replaceChildren(...marken.map((m) => Object.assign(document.createElement('option'), { value: m })));
}
