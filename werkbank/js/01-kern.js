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
// ---------- Lade-Anzeige ----------
// Jede Anfrage an Supabase läuft über ladeFetch. Beginnt sie kurz nach einem Klick (oder während der Knopf noch lädt),
// dreht sich im Knopf ein Kreis, er nimmt so lange keine Klicks an und zeigt danach kurz einen Haken. Was der Nutzer
// ausgelöst hat (Klick, Tippen), zeigt zusätzlich der dünne Balken oben. Abfragen im Hintergrund bleiben still.
const LADE = { knopf: null, bis: 0, eingabe: 0, offen: 0, balkenZeit: null };
const ladeKnoepfe = new Map(); // Knopf -> { n, ab, fehler, aus }
document.addEventListener('click', (ev) => {
  const k = ev.target.closest && ev.target.closest('button, a.pill');
  if (!k) return;
  // Läuft schon: zweiten Klick schlucken, damit nichts doppelt abgeschickt wird
  if (ladeKnoepfe.has(k) && k.classList.contains('laedt')) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
  LADE.knopf = k;
  LADE.bis = performance.now() + 700;
  LADE.eingabe = performance.now();
}, true);
document.addEventListener('change', (ev) => {
  if (ev.target.matches('select')) { LADE.knopf = ev.target; LADE.bis = performance.now() + 700; }
  LADE.eingabe = performance.now();
}, true);
document.addEventListener('input', () => { LADE.eingabe = performance.now(); }, true);
document.addEventListener('keydown', () => { LADE.eingabe = performance.now(); }, true);

function ladeBalken(an) {
  let b = document.getElementById('ladebalken');
  if (!b) {
    b = Object.assign(document.createElement('div'), { id: 'ladebalken' });
    b.setAttribute('aria-hidden', 'true');
    document.body.append(b);
  }
  clearTimeout(LADE.balkenZeit);
  // Erst nach 150 ms zeigen, schnelle Antworten sollen nicht flackern
  if (an) LADE.balkenZeit = setTimeout(() => b.classList.add('an'), 150);
  else b.classList.remove('an');
}

function knopfLaedt(k) {
  let z = ladeKnoepfe.get(k);
  if (z) { clearTimeout(z.aus); z.n++; return; }
  z = { n: 1, ab: performance.now(), fehler: false, aus: null };
  ladeKnoepfe.set(k, z);
  k.classList.remove('lade-fertig');
  // Kleine Knöpfe zeigen nur den Kreis, große Zeilen behalten ihren Text und bekommen den Kreis rechts.
  // Reiter, Umschalter und Auswahlfelder werden nur blasser, oben läuft ja der Balken.
  const leise = k.tagName === 'SELECT' || k.matches('[role=radio], [role=tab], .ordner-chip');
  const klein = !leise && k.offsetWidth < 260 && k.offsetHeight < 60;
  const st = getComputedStyle(k);
  k.style.setProperty('--lade-farbe', st.color);
  k.classList.add('laedt', leise ? 'laedt-leise' : klein ? 'laedt-klein' : 'laedt-gross', ...(st.position === 'static' ? ['laedt-rel'] : []));
  k.setAttribute('aria-busy', 'true');
}

function knopfFertig(k, ok) {
  const z = ladeKnoepfe.get(k);
  if (!z) return;
  if (!ok) z.fehler = true;
  if (--z.n > 0) return;
  // Kurz warten: Oft folgt gleich die nächste Abfrage (erst speichern, dann neu laden), dann läuft der Kreis weiter.
  // Mindestens 400 ms sichtbar, damit man den Klick bemerkt.
  const rest = Math.max(120, 400 - (performance.now() - z.ab));
  z.aus = setTimeout(() => {
    ladeKnoepfe.delete(k);
    const haken = !z.fehler && k.isConnected && k.classList.contains('laedt-klein') && k.classList.contains('pill');
    k.classList.remove('laedt', 'laedt-klein', 'laedt-gross', 'laedt-leise');
    k.removeAttribute('aria-busy');
    if (haken) {
      k.classList.add('lade-fertig');
      setTimeout(() => k.classList.remove('lade-fertig', 'laedt-rel'), 900);
    } else k.classList.remove('laedt-rel');
  }, rest);
}

async function ladeFetch(...args) {
  const jetzt = performance.now();
  // Zuständiger Knopf: gerade geklickt oder lädt noch
  let k = null;
  if (LADE.knopf && LADE.knopf.isConnected && (jetzt < LADE.bis || ladeKnoepfe.has(LADE.knopf))) k = LADE.knopf;
  const sichtbar = !!k || jetzt - LADE.eingabe < 1500;
  if (k) knopfLaedt(k);
  if (sichtbar && LADE.offen++ === 0) ladeBalken(true);
  let ok = false;
  try {
    const r = await fetch(...args);
    ok = r.ok;
    return r;
  } finally {
    if (k) knopfFertig(k, ok);
    if (sichtbar && --LADE.offen === 0) ladeBalken(false);
  }
}

// Sitzung nur im Tab: Tab zu heißt abgemeldet.
const sb = supabase.createClient(SERVER.url, SERVER.key, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: { fetch: ladeFetch },
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
// Bevorzugter Authenticator (Konto → Zweiter Faktor → Als Standard), in user_metadata, damit er in jedem Browser gilt
const standardFaktor = (user) => (user && user.user_metadata && user.user_metadata.zwei_faktor_standard) || null;
const standardZuerst = (liste, user) => {
  const id = standardFaktor(user);
  return [...liste].sort((a, b) => (b.id === id) - (a.id === id));
};
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
  // Alles außer reinen Lese-Abfragen kann etwas geändert haben: Reiter dann beim nächsten Öffnen frisch laden
  if (!NUR_LESEN.has(name)) { reiterStand.clear(); LAUFEND.clear(); }
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  return data;
}

// ---------- Sparsam laden ----------
// Fragen zwei Stellen kurz nacheinander dasselbe (etwa die Freigaben für die Glocke und für „Heute zu tun“), bekommt
// die zweite die Antwort der ersten, solange sie läuft oder höchstens 15 Sekunden alt ist. Änderungen leeren das.
const GETEILT_MS = 15000;
const LAUFEND = new Map(); // schluessel -> { p, ab }
function geteilt(schluessel, fn, frisch = false) {
  const x = LAUFEND.get(schluessel);
  if (x && (x.ab === 0 || (!frisch && Date.now() - x.ab < GETEILT_MS))) return x.p;
  const neu = { p: null, ab: 0 };
  neu.p = Promise.resolve().then(fn).then(
    (wert) => { neu.ab = Date.now(); return wert; },
    (e) => { if (LAUFEND.get(schluessel) === neu) LAUFEND.delete(schluessel); throw e; });
  LAUFEND.set(schluessel, neu);
  return neu.p;
}

// Wer zwischen den Reitern hin und her springt, bekommt eine Minute lang den Stand von eben, ohne alles neu zu holen.
// Speichern, Löschen und alle anderen Änderungen (jede Abfrage, die nicht hier steht) machen den Stand sofort ungültig.
const REITER_FRISCH_MS = 60000;
const reiterStand = new Map();
const NUR_LESEN = new Set(['meine_rolle', 'helfer_rolle', 'werkbank_name', 'meine_signatur', 'wiederherstellung_status', 'neu_dabei',
  'werkbank_betrieb', 'feedback_anzahl', 'postfach_anzahl', 'katalog_offen', 'katalog_ergaenzungen_offen', 'app_vorschlaege_offen',
  'katalog_helfer_ueberblick', 'katalog_meine_rueckmeldungen', 'katalog_uebersicht', 'werkbank_fuellrunde', 'katalog_nachfrage_liste',
  'katalog_qualitaet', 'katalog_papierkorb', 'katalog_verlauf', 'katalog_baustellen', 'werkbank_statistik', 'werkbank_klicks',
  'werkbank_web', 'werkbank_system', 'konten_liste', 'helfer_liste', 'crm_schlagwort_karte', 'crm_schlagwort_liste', 'rad_details',
  'katalog_aehnliche', 'feedback_liste', 'postfach_liste', 'crm_kennzahlen', 'crm_kontakte_liste', 'crm_ordner_liste', 'crm_team',
  'crm_bausteine', 'crm_warteliste', 'werkbank_tester', 'app_steuerung_lesen', 'app_partner_liste', 'meine_sitzungen']);
function reiterFrisch(name) {
  const t = reiterStand.get(name);
  if (t && Date.now() - t < REITER_FRISCH_MS) return true;
  reiterStand.set(name, Date.now());
  return false;
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
  $('#km-name').textContent = email;
  $('#km-mail').textContent = '';

  await rolleLaden();
  if (!rechte.size) {
    await sb.auth.signOut({ scope: 'local' });
    return zeige('s-nein');
  }

  const { data: aal, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (aal.currentLevel === 'aal2') return werkbank(true);

  const { data: faktoren, error: e2 } = await sb.auth.mfa.listFactors();
  if (e2) throw e2;
  const bestaetigt = standardZuerst(faktoren.totp.filter((f) => f.status === 'verified'), session && session.user);
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
  try { localStorage.removeItem('werkbank-katalog'); } catch { /* egal */ }
  await sb.auth.signOut({ scope: 'local' });
  rolle = null;
  rechte = new Set();
  radTeile = [];
  $('#wer-bild').replaceWith(Object.assign(document.createElement('span'), { id: 'wer-bild', className: 'ava' }));
  ergaenzenEnde();
  zeige('s-mail');
  hinweiseLaden();
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
  $('#km-name').textContent = meinName || email;
  $('#km-mail').textContent = meinName ? email : '';
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

async function werkbank(rolleFrisch = false) {
  // Nach dem zweiten Faktor neu fragen, erst dann gelten Konten-Rechte (war der Faktor schon bestätigt, ist sie frisch)
  if (!rolleFrisch) try { await rolleLaden(); } catch { /* Stand vom Login behalten */ }
  for (const el of $$('[data-recht]')) el.hidden = !el.dataset.recht.split(' ').some(darf);
  for (const el of $$('[data-nur-rolle]')) el.hidden = el.dataset.nurRolle !== rolle;
  $('#wer-rolle').textContent = ROLLEN[rolle] || '';
  $('#km-rolle').textContent = ROLLEN[rolle] || '';
  $('#hinweis-rolle').textContent = darf('katalog_pflegen')
    ? `Du bist ${ROLLEN[rolle]}: Was du speicherst, ist sofort im Katalog.`
    : 'Was du speicherst, sieht in der App erst jemand, wenn es freigegeben ist.';
  zeichneMeineRolle();
  $('#f-rad').baujahr.max = new Date().getFullYear() + 1;
  $('#f-passwort').email.value = email;
  zeige('s-werkbank');
  reiterStand.clear();
  tabAusAdresse();
  if (darf('konten_betreuen')) ladeSignatur();
  // Lädt auch die Zahlen für Freigaben, Feedback und Postfach
  hinweiseLaden(true);
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
  // Konto steckt im Kontomenü oben rechts, alle anderen Bereiche sind Reiter
  const knopf = name === 'konto' ? $('#konto-auf') : $(`nav.tabs button[data-tab="${name}"]`);
  if (!knopf || knopf.hidden) name = ['uebersicht', 'erfassen', 'konten', 'statistik', 'teile'].find((t) => !$(`nav.tabs button[data-tab="${t}"]`).hidden) || (darf('feedback') ? 'feedback' : 'konto');
  // Jeder Tab hat eine eigene Adresse (#statistik), damit Neuladen und Zurück funktionieren
  if (location.hash.slice(1).split('/')[0] !== name) history.pushState(null, '', `#${name}`);
  for (const b of $$('nav.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  $('#konto-auf').setAttribute('aria-pressed', String(name === 'konto'));
  for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== name;
  if (name === 'freigaben') ladeOffen();
  if (name === 'eigene') ladeEigene();
  if (name === 'erfassen') { entwurfAnbieten(); ladeMarken(); }
  if (name === 'teile' && !$('#tl-liste').children.length) ladeTeileliste(true);
  if (name === 'katalog') katalogLaden();
  if (name === 'uebersicht' && !reiterFrisch('uebersicht')) ladeUebersicht();
  if (name === 'statistik' && !reiterFrisch('statistik')) ladeStatistik();
  if (name === 'steuern') { asReiterSetzen(asTeil); ladeAppSteuern(); }
  if (name === 'feedback') ladeFeedback();
  if (name === 'konten' && !reiterFrisch('konten')) ladeKonten();
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
  if (name === 'statistik') stReiterSetzen(unter);
  if (name === 'steuern' && unter) asReiterSetzen(unter);
}
window.addEventListener('popstate', () => { if (!$('#s-werkbank').hidden) tabAusAdresse(); });
for (const b of $$('[data-neu-laden]')) b.addEventListener('click', () => ladeOffen(true));

// Vorschläge fürs Markenfeld beim Rad erfassen: erst, wenn der Reiter offen ist, und nur einmal
let markenDa = false;
async function ladeMarken() {
  if (markenDa) return;
  markenDa = true;
  const { data, error } = await sb.from('raeder').select('hersteller').limit(5000);
  if (error) { markenDa = false; return; }
  const marken = [...new Set((data || []).map((r) => r.hersteller))].sort((a, b) => a.localeCompare(b, 'de'));
  const dl = $('#marken');
  dl.replaceChildren(...marken.map((m) => Object.assign(document.createElement('option'), { value: m })));
}
