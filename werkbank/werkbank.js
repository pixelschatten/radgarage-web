// Werkbank: Katalogpflege im Browser für freigeschaltete Konten (Tabelle katalog_helfer).
// Anmeldung mit E-Mail-Code, danach zweiter Faktor (TOTP). Die Server-Funktionen prüfen Rolle und zweiten Faktor selbst,
// diese Seite blendet nur aus, was man ohnehin nicht darf.
(() => {
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
    admin: ['katalog_erfassen', 'katalog_pflegen', 'statistik', 'rollen', 'feedback'],
    support: ['statistik', 'konten_sehen', 'konten_betreuen', 'feedback'],
    helfer: ['katalog_erfassen'],
  };
  const RECHTE_TEXT = [
    ['katalog_erfassen', 'Räder und Teile erfassen', 'Bei Helfern wartet alles auf Freigabe.'],
    ['katalog_pflegen', 'Katalog pflegen', 'Sofort live, Freigaben, App-Vorschläge, Bearbeiten und Löschen, Shops, Übersicht.'],
    ['statistik', 'Statistik', 'Zusammengefasste Zahlen, keine einzelnen Personen.'],
    ['feedback', 'Feedback', 'Nachrichten von radgarage.app/feedback lesen, abhaken, beantworten.'],
    ['konten_sehen', 'Konten sehen', 'Liste der Konten mit Profilbild. Nur mit zweitem Faktor.'],
    ['konten_betreuen', 'Konten betreuen', 'Sperren, zweiten Faktor zurücksetzen.'],
    ['konten_verwalten', 'Konten verwalten', 'Konten löschen, Premium schenken.'],
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

  $('#f-mail').addEventListener('submit', (ev) => {
    ev.preventDefault();
    mitKnopf(ev.target, async () => {
      email = ev.target.email.value.trim().toLowerCase();
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
      $('#code-mail').textContent = email;
      $('#f-code').reset();
      zeige('s-code');
    });
  });

  $('#zurueck').addEventListener('click', () => zeige('s-mail'));
  $('#nochmal').addEventListener('click', () => zeige('s-mail'));

  $('#f-code').addEventListener('submit', (ev) => {
    ev.preventDefault();
    mitKnopf(ev.target, async () => {
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
  }

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
    if (darf('konten_betreuen')) postfachZahl();
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
    const knopf = $(`nav.tabs button[data-tab="${name}"]`);
    if (!knopf || knopf.hidden) name = ['uebersicht', 'erfassen', 'konten', 'statistik', 'teile'].find((t) => !$(`nav.tabs button[data-tab="${t}"]`).hidden) || (darf('feedback') ? 'feedback' : 'konto');
    // Jeder Tab hat eine eigene Adresse (#statistik), damit Neuladen und Zurück funktionieren
    if (location.hash.slice(1).split('/')[0] !== name) history.pushState(null, '', `#${name}`);
    for (const b of $$('nav.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== name;
    if (name === 'freigaben') ladeOffen();
    if (name === 'eigene') ladeEigene();
    if (name === 'teile' && !$('#tl-liste').children.length) ladeTeileliste(true);
    if (name === 'katalog') katalogLaden();
    if (name === 'uebersicht') ladeUebersicht();
    if (name === 'statistik') ladeStatistik();
    if (name === 'feedback') ladeFeedback();
    if (name === 'konten') { ladeKonten(); if (darf('konten_betreuen')) ladePostfach(); }
    if (name === 'konto') ladeSicherheit();
  }
  for (const b of $$('nav.tabs button')) b.addEventListener('click', () => tab(b.dataset.tab));
  function tabAusAdresse() {
    const [name, unter] = location.hash.slice(1).split('/');
    if (name === 'postfach') { zumPostfach(); return; }
    tab(name || '');
    if (name === 'freigaben') fgAnsichtSetzen(['app', 'web'].includes(unter) ? unter : 'helfer');
    if (name === 'katalog') katAnsichtSetzen(unter);
  }
  window.addEventListener('popstate', () => { if (!$('#s-werkbank').hidden) tabAusAdresse(); });
  for (const b of $$('[data-neu-laden]')) b.addEventListener('click', ladeOffen);

  async function ladeMarken() {
    const { data } = await sb.from('raeder').select('hersteller').limit(5000);
    const marken = [...new Set((data || []).map((r) => r.hersteller))].sort((a, b) => a.localeCompare(b, 'de'));
    const dl = $('#marken');
    dl.replaceChildren(...marken.map((m) => Object.assign(document.createElement('option'), { value: m })));
  }

  // ----- Rad erfassen -----

  for (const k of TEIL_KATEGORIEN) {
    $('#teil-kategorie').append(new Option(k, k));
    $('#nt-kategorie').append(new Option(k, k));
    $('#tl-kategorie').append(new Option(k, k));
  }

  function zeichneTeile() {
    pflichtCheck();
    const ul = $('#rad-teile');
    $('#teile-zahl').textContent = radTeile.length ? `(${radTeile.length})` : '';
    if (!radTeile.length) {
      ul.innerHTML = ergaenzen
        ? '<li class="leer">Noch keine neuen Teile. Unter „Teil hinzufügen“ suchen oder neu anlegen.</li>'
        : '<li class="leer">Noch keine Teile. Unter „Teil hinzufügen“ suchen oder neu anlegen. Barcode ist immer freiwillig.</li>';
      return;
    }
    ul.replaceChildren(...radTeile.map((t, i) => {
      const li = document.createElement('li');
      const links = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = t.name;
      const neben = document.createElement('div');
      neben.className = 'neben';
      const marke = document.createElement('span');
      marke.className = 'marke' + (t.neu ? ' neu' : '');
      marke.textContent = t.neu ? 'neu' : t.kategorie;
      neben.append(marke, t.neu ? ' ' + t.kategorie : '');
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
    }));
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
      f.reset();
      radTeile = [];
      zeichneTeile();
      await appUebernahmeFertig();
      meldung(msg, ergebnis && ergebnis.live
        ? `${name} ist jetzt im Katalog.`
        : `${name} ist gespeichert und wartet auf die Freigabe.`);
      if (darf('katalog_pflegen')) ladeOffen();
    });
  });

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
    const { wichtig, vielleicht } = fehlendePflichtteile();
    box.hidden = false;
    box.classList.toggle('ok', !wichtig.length);
    box.replaceChildren();
    const kopf = document.createElement('strong');
    kopf.textContent = wichtig.length ? `Noch offen: ${wichtig.join(', ')}` : 'Alle wichtigen Teile sind drin.';
    box.append(kopf);
    if (vielleicht.length) box.append(`Fehlen oft zu Recht: ${vielleicht.join(', ')}`);
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

  // ----- Freigaben und eigene offene Räder -----

  function radKarte(r, admin) {
    const div = document.createElement('div');
    div.className = 't karte';
    const h = document.createElement('h3');
    h.textContent = `${r.hersteller} ${r.modell} (${r.baujahr})`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const teile = [r.kategorie, r.uvp != null ? `UVP ${euro(r.uvp)}` : null,
      r.von ? `von ${r.von}` : null, r.erfasst ? new Date(r.erfasst).toLocaleDateString('de-DE') : null].filter(Boolean);
    meta.textContent = teile.join(' · ');
    div.append(h, meta);
    if (r.quelle) {
      const p = document.createElement('p');
      const a = document.createElement('a');
      a.href = /^https?:\/\//.test(r.quelle) ? r.quelle : '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Quelle öffnen';
      p.className = 'fine';
      p.append(a);
      div.append(p);
    }
    const ol = document.createElement('ol');
    for (const t of r.teile || []) {
      const li = document.createElement('li');
      li.textContent = `${t.name} · ${t.kategorie}` + (t.preis != null ? ` · ${euro(t.preis)}` : '');
      if (t.neu) {
        const m = document.createElement('span');
        m.className = 'marke neu';
        m.textContent = 'neu';
        li.append(' ', m);
      }
      ol.append(li);
    }
    if (!ol.children.length) ol.innerHTML = '<li>Keine Teile</li>';
    div.append(ol);
    if (admin) {
      const akt = document.createElement('div');
      akt.className = 'aktionen';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'pill gruen';
      ok.textContent = 'Freigeben';
      const nein = document.createElement('button');
      nein.type = 'button';
      nein.className = 'pill rot';
      nein.textContent = 'Ablehnen';
      const entscheiden = async (gut) => {
        if (!gut && !window.confirm(`${r.hersteller} ${r.modell} ablehnen? Rad und seine neuen Teile werden gelöscht.`)) return;
        ok.disabled = nein.disabled = true;
        try {
          await rpc('katalog_freigeben', { p_rad_id: r.id, p_ok: gut });
          meldung($('#msg-freigaben'), gut ? `${r.hersteller} ${r.modell} ist freigegeben.` : `${r.hersteller} ${r.modell} wurde abgelehnt.`);
          ladeOffen();
        } catch (e) {
          meldung($('#msg-freigaben'), fehlerText(e), true);
          ok.disabled = nein.disabled = false;
        }
      };
      ok.addEventListener('click', () => entscheiden(true));
      nein.addEventListener('click', () => entscheiden(false));
      akt.append(ok, nein);
      div.append(akt);
    }
    return div;
  }

  function ergaenzungKarte(g, admin) {
    const div = document.createElement('div');
    div.className = 't karte k2';
    const eb = document.createElement('div');
    eb.className = 'eyebrow';
    eb.textContent = 'Ergänzung zu';
    const h = document.createElement('h3');
    h.textContent = `${g.hersteller} ${g.modell} (${g.baujahr})`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = [g.von ? `von ${g.von}` : null, g.erfasst ? new Date(g.erfasst).toLocaleDateString('de-DE') : null].filter(Boolean).join(' · ');
    div.append(eb, h, meta);
    if (g.notiz) {
      const p = document.createElement('p');
      p.textContent = `„${g.notiz}“`;
      div.append(p);
    }
    if (g.quelle && /^https?:\/\//.test(g.quelle)) {
      const p = document.createElement('p');
      p.className = 'fine';
      const a = Object.assign(document.createElement('a'), { href: g.quelle, target: '_blank', rel: 'noopener noreferrer', textContent: 'Quelle öffnen' });
      p.append(a);
      div.append(p);
    }
    const ol = document.createElement('ul');
    ol.style.listStyle = 'none';
    ol.style.paddingLeft = '0';
    const zeile = (t, plus) => {
      const li = document.createElement('li');
      const m = document.createElement('span');
      m.className = 'marke ' + (plus ? 'plus' : 'minus');
      m.textContent = plus ? 'dazu' : 'weg';
      li.append(m, ` ${t.name} · ${t.kategorie}` + (t.preis != null ? ` · ${euro(t.preis)}` : ''));
      if (plus && t.neu) {
        const n = document.createElement('span');
        n.className = 'marke neu';
        n.textContent = 'neues Teil';
        li.append(' ', n);
      }
      return li;
    };
    for (const t of g.dazu || []) ol.append(zeile(t, true));
    for (const t of g.weg || []) ol.append(zeile(t, false));
    div.append(ol);
    if (admin) {
      const akt = document.createElement('div');
      akt.className = 'aktionen';
      const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'pill gruen', textContent: 'Übernehmen' });
      const nein = Object.assign(document.createElement('button'), { type: 'button', className: 'pill rot', textContent: 'Ablehnen' });
      const entscheiden = async (gut) => {
        if (!gut && !window.confirm(`Ergänzung zu ${g.hersteller} ${g.modell} ablehnen?`)) return;
        ok.disabled = nein.disabled = true;
        try {
          await rpc('katalog_ergaenzung_freigeben', { p_id: g.id, p_ok: gut });
          meldung($('#msg-freigaben'), gut ? `Ergänzung zu ${g.hersteller} ${g.modell} ist übernommen.` : `Ergänzung zu ${g.hersteller} ${g.modell} wurde abgelehnt.`);
          ladeOffen();
        } catch (e) {
          meldung($('#msg-freigaben'), fehlerText(e), true);
          ok.disabled = nein.disabled = false;
        }
      };
      ok.addEventListener('click', () => entscheiden(true));
      nein.addEventListener('click', () => entscheiden(false));
      akt.append(ok, nein);
      div.append(akt);
    }
    return div;
  }

  async function ladeAlleOffenen() {
    const [raeder, ergaenzungen] = await Promise.all([
      rpc('katalog_offen'),
      rpc('katalog_ergaenzungen_offen').catch(() => []),
    ]);
    return { raeder: raeder || [], ergaenzungen: ergaenzungen || [] };
  }

  let helferOffen = 0;
  function zahlenSetzen() {
    const web = appGruppen.filter((g) => g.web).length;
    const app = appGruppen.length - web;
    const n = helferOffen + app + web;
    const zahl = $('#zahl-offen');
    zahl.hidden = !n;
    zahl.textContent = String(n);
    $('#fg-zahl-helfer').textContent = helferOffen ? `(${helferOffen})` : '';
    $('#fg-zahl-app').textContent = app ? `(${app})` : '';
    $('#fg-zahl-web').textContent = web ? `(${web})` : '';
  }

  async function ladeOffen() {
    meldung($('#msg-freigaben'), '');
    try {
      const { raeder, ergaenzungen } = await ladeAlleOffenen();
      helferOffen = raeder.length + ergaenzungen.length;
      const box = $('#offen');
      box.replaceChildren(...raeder.map((r) => radKarte(r, true)), ...ergaenzungen.map((g) => ergaenzungKarte(g, true)));
      if (!helferOffen) box.innerHTML = '<p class="fine">Nichts offen. Alles freigegeben.</p>';
    } catch (e) {
      meldung($('#msg-freigaben'), fehlerText(e), true);
    }
    try {
      await ladeApp();
      if (fgAnsicht === 'app') zeichneApp();
    } catch (e) {
      appGruppen = [];
      $('#app-liste').replaceChildren(Object.assign(document.createElement('p'), { className: 'msg fehler', textContent: fehlerText(e) }));
    }
    zahlenSetzen();
  }

  async function ladeEigene() {
    const box = $('#eigene');
    try {
      const { raeder, ergaenzungen } = await ladeAlleOffenen();
      box.replaceChildren(...raeder.map((r) => radKarte(r, false)), ...ergaenzungen.map((g) => ergaenzungKarte(g, false)));
      if (!raeder.length && !ergaenzungen.length) box.innerHTML = '<p class="fine">Nichts offen.</p>';
    } catch (e) {
      box.textContent = fehlerText(e);
    }
  }

  // ----- Feedback von radgarage.app/feedback (Recht „feedback“) -----

  const FB_KATEGORIE = { verbesserung: 'Verbesserung', funktion: 'Fehlende Funktion', katalog: 'Katalog-Lücke', sonstiges: 'Sonstiges' };
  const FB_WER = { interessent: 'Interessiert sich', nutzer: 'Nutzt die App', tester: 'Testet die App', sonstige: 'Sonstige' };
  let fbStatus = 'neu';
  let fbFilter = '';
  let fbListe = [];
  let fbNeu = 0;

  function feedbackZahlSetzen(n) {
    fbNeu = n;
    $('#zahl-feedback').hidden = !n;
    $('#zahl-feedback').textContent = String(n);
    $('#fb-zahl-neu').textContent = n ? `(${n})` : '';
  }

  async function feedbackZahl() {
    try { feedbackZahlSetzen((await rpc('feedback_anzahl')) || 0); } catch { /* Zahl ist nur Beiwerk */ }
  }

  async function ladeFeedback() {
    meldung($('#msg-feedback'), '');
    try {
      fbListe = (await rpc('feedback_liste', { p_status: fbStatus })) || [];
      if (fbStatus === 'neu') feedbackZahlSetzen(fbListe.length);
      zeichneFeedback();
    } catch (e) {
      meldung($('#msg-feedback'), fehlerText(e), true);
    }
  }

  function zeichneFeedback() {
    for (const b of $$('#fb-status button')) b.setAttribute('aria-checked', String(b.dataset.status === fbStatus));
    for (const b of $$('#fb-filter button')) {
      const n = fbListe.filter((f) => !b.dataset.kat || f.kategorie === b.dataset.kat).length;
      b.textContent = `${b.textContent.replace(/\s*\(\d+\)$/, '')}${n ? ` (${n})` : ''}`;
      b.setAttribute('aria-checked', String(b.dataset.kat === fbFilter));
    }
    const zeigen = fbListe.filter((f) => !fbFilter || f.kategorie === fbFilter);
    $('#fb-liste').replaceChildren(...zeigen.map(feedbackKarte));
    if (!zeigen.length) $('#fb-liste').innerHTML = `<p class="fine">${fbStatus === 'neu' ? 'Kein neues Feedback.' : 'Noch nichts erledigt.'}</p>`;
  }

  function feedbackKarte(f) {
    const div = document.createElement('div');
    div.className = 't karte s1';
    const kopf = document.createElement('div');
    kopf.className = 'app-kopf';
    const links = document.createElement('div');
    links.append(Object.assign(document.createElement('div'), { className: 'app-art', textContent: FB_KATEGORIE[f.kategorie] || f.kategorie }));
    const zeit = new Date(f.erstellt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
    const meta = [zeit, FB_WER[f.wer], f.herkunft === 'app' ? 'aus der App' : null].filter(Boolean).join(' · ');
    links.append(Object.assign(document.createElement('div'), { className: 'meta', textContent: meta }));
    kopf.append(links);
    div.append(kopf, Object.assign(document.createElement('p'), { className: 'fb-text', textContent: f.text }));
    if (f.email) {
      const p = document.createElement('p');
      p.className = 'meta';
      const a = Object.assign(document.createElement('a'), {
        href: `mailto:${f.email}?subject=${encodeURIComponent('Dein Feedback zur Radgarage')}`, textContent: f.email,
      });
      p.append('Antwort an ', a);
      div.append(p);
    } else {
      div.append(Object.assign(document.createElement('p'), { className: 'meta', textContent: 'Ohne E-Mail-Adresse' }));
    }
    if (f.status === 'erledigt') {
      div.append(Object.assign(document.createElement('p'), {
        className: 'meta',
        textContent: `Erledigt ${datum(f.erledigt_am)}${f.erledigt_von ? ` von ${f.erledigt_von}` : ''}`,
      }));
    }
    const notiz = Object.assign(document.createElement('textarea'), {
      className: 'fb-notiz', rows: 1, maxLength: 2000, placeholder: 'Notiz (nur intern), z. B. „kommt mit Version 1.2“', value: f.notiz || '',
    });
    notiz.setAttribute('aria-label', 'Interne Notiz');
    const aktionen = document.createElement('div');
    aktionen.className = 'aktionen';
    const ziel = f.status === 'neu' ? 'erledigt' : 'neu';
    aktionen.append(
      knopf(f.status === 'neu' ? 'Erledigt' : 'Wieder öffnen', '', async () => {
        await rpc('feedback_setzen', { p_id: f.id, p_status: ziel, p_notiz: notiz.value });
        fbListe = fbListe.filter((x) => x !== f);
        feedbackZahlSetzen(Math.max(0, fbNeu + (ziel === 'erledigt' ? -1 : 1)));
        zeichneFeedback();
      }),
      knopf('Notiz speichern', 'ghost', async (b) => {
        await rpc('feedback_setzen', { p_id: f.id, p_status: f.status, p_notiz: notiz.value });
        f.notiz = notiz.value.trim();
        meldung(b.closest('.karte').querySelector('.msg'), 'Notiz gespeichert.');
      }),
      knopf('Löschen', 'ghost', async (b) => {
        if (!b.dataset.sicher) {
          b.dataset.sicher = '1';
          b.textContent = 'Wirklich löschen?';
          return;
        }
        await rpc('feedback_loeschen', { p_id: f.id });
        fbListe = fbListe.filter((x) => x !== f);
        if (f.status === 'neu') feedbackZahlSetzen(Math.max(0, fbNeu - 1));
        zeichneFeedback();
      }),
    );
    div.append(notiz, aktionen, Object.assign(document.createElement('div'), { className: 'msg', role: 'status' }));
    return div;
  }

  for (const b of $$('#fb-status button')) b.addEventListener('click', () => { fbStatus = b.dataset.status; ladeFeedback(); });
  for (const b of $$('#fb-filter button')) b.addEventListener('click', () => { fbFilter = b.dataset.kat; zeichneFeedback(); });
  $('#fb-neu-laden').addEventListener('click', ladeFeedback);

  // ----- Postfach: Unterhaltungen mit Nutzern (Recht konten_betreuen, postfach.sql) -----

  let pfStatus = 'offen';
  let pfListe = [];
  let pfUngelesen = 0;
  let pfSucheZeit = null;
  const zeitDe = (d) => new Date(d).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

  function postfachZahlSetzen(n) {
    pfUngelesen = n;
    for (const el of [$('#zahl-postfach'), $('#pf-zahl-neu')]) {
      el.hidden = !n;
      el.textContent = String(n);
    }
  }

  async function postfachZahl() {
    try { postfachZahlSetzen((await rpc('postfach_anzahl')) || 0); } catch { /* Zahl ist nur Beiwerk */ }
  }

  async function ladePostfach() {
    meldung($('#msg-postfach'), '');
    for (const b of $$('#pf-status button')) b.setAttribute('aria-checked', String(b.dataset.status === pfStatus));
    try {
      pfListe = (await rpc('postfach_liste', { p_status: pfStatus, p_suche: $('#pf-suche').value })) || [];
      if (pfStatus === 'offen' && !$('#pf-suche').value.trim()) {
        $('#pf-zahl-offen').textContent = pfListe.length ? `(${pfListe.length})` : '';
        postfachZahlSetzen(pfListe.filter((u) => u.ungelesen > 0).length);
      }
      $('#pf-liste').replaceChildren(...pfListe.map(postfachKarte));
      if (!pfListe.length) {
        $('#pf-liste').innerHTML = `<p class="fine">${{ offen: 'Nichts offen.', erledigt: 'Noch nichts erledigt.', spam: 'Kein Spam.' }[pfStatus] || 'Noch keine Unterhaltungen.'}</p>`;
      }
    } catch (e) {
      meldung($('#msg-postfach'), fehlerText(e), true);
    }
  }

  function postfachKarte(u) {
    const div = document.createElement('div');
    div.className = `t karte s1 pf-karte${u.ungelesen > 0 ? ' ungelesen' : ''}`;
    div.tabIndex = 0;
    div.setAttribute('role', 'button');
    const kopf = document.createElement('div');
    kopf.className = 'app-kopf';
    const links = document.createElement('div');
    links.append(
      Object.assign(document.createElement('div'), { className: 'app-art', textContent: u.name ? `${u.name} · ${u.email}` : u.email }),
      Object.assign(document.createElement('h3'), { textContent: u.betreff || '(ohne Betreff)' }),
    );
    kopf.append(links, Object.assign(document.createElement('div'), { className: 'meta', textContent: zeitDe(u.letzte) }));
    div.append(kopf);
    if (u.zuletzt) {
      div.append(Object.assign(document.createElement('p'), {
        className: 'meta', textContent: `${u.zuletzt.richtung === 'aus' ? 'Du: ' : ''}${u.zuletzt.text.replace(/\s+/g, ' ')}`,
      }));
    }
    const infos = [`${u.anzahl} ${u.anzahl === 1 ? 'Nachricht' : 'Nachrichten'}`, u.ungelesen > 0 ? `${u.ungelesen} neu` : null, u.konto ? 'hat ein Konto' : 'ohne Konto'];
    div.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: infos.filter(Boolean).join(' · ') }));
    const auf = () => unterhaltung(u.id);
    div.addEventListener('click', auf);
    div.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); auf(); } });
    return div;
  }

  async function unterhaltung(id) {
    let u;
    try { u = await rpc('postfach_unterhaltung', { p_id: id }); } catch (e) { meldung($('#msg-postfach'), fehlerText(e), true); return; }
    postfachZahl();
    const verlauf = Object.assign(document.createElement('div'), { className: 'pf-verlauf' });
    for (const n of u.nachrichten) {
      const d = Object.assign(document.createElement('div'), { className: `pf-nachricht ${n.richtung}` });
      const wer = n.richtung === 'aus' ? `${n.team || 'Team'} an ${n.an}` : (n.von_name ? `${n.von_name} <${n.von}>` : n.von);
      const zusatz = [];
      if (n.richtung === 'aus' && n.status && n.status >= 300) zusatz.push(`von Brevo abgelehnt (${n.status})`);
      if (n.richtung === 'ein' && n.spam >= 6) zusatz.push('wahrscheinlich Spam');
      d.append(Object.assign(document.createElement('div'), { className: 'meta', textContent: `${zeitDe(n.erstellt)} · ${wer}${zusatz.length ? ` · ${zusatz.join(', ')}` : ''}` }));
      if (n.betreff && n.betreff !== u.betreff) d.append(Object.assign(document.createElement('strong'), { textContent: n.betreff }));
      d.append(Object.assign(document.createElement('p'), { className: 'fb-text', textContent: n.text || '(kein Text)' }));
      if (n.anhaenge && n.anhaenge.length) {
        d.append(Object.assign(document.createElement('p'), {
          className: 'meta', textContent: `Anhänge (nicht übernommen): ${n.anhaenge.map((a) => a.name).join(', ')}`,
        }));
      }
      verlauf.append(d);
    }

    const f = document.createElement('form');
    f.className = 'karte';
    f.autocomplete = 'off';
    const text = Object.assign(document.createElement('textarea'), { name: 'text', required: true, rows: 7, maxLength: 10000, placeholder: 'Hallo …\n\nViele Grüße\nMarino von Radgarage' });
    text.setAttribute('aria-label', 'Antwort');
    const msg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });
    const senden = Object.assign(document.createElement('button'), { type: 'submit', className: 'pill', textContent: 'Antworten' });
    const vorschau = Object.assign(document.createElement('iframe'), { className: 'mail-vorschau', title: 'Vorschau der Mail', hidden: true });
    vorschau.setAttribute('sandbox', '');
    const betreff = /^(re|aw)\s*:/i.test(u.betreff || '') ? u.betreff : `Re: ${u.betreff || 'Deine Nachricht an Radgarage'}`;
    const vorschauKnopf = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost', textContent: 'Vorschau' });
    vorschauKnopf.addEventListener('click', async () => {
      try {
        vorschau.srcdoc = await rpc('konto_mail_vorschau', { p_betreff: betreff, p_text: text.value });
        vorschau.hidden = false;
      } catch (e) { meldung(msg, fehlerText(e), true); }
    });
    const statusKnopf = (titel, ziel, art = 'pill ghost') => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: art, textContent: titel });
      b.addEventListener('click', async () => {
        if (ziel === 'loeschen') {
          if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich löschen?'; return; }
          try { await rpc('postfach_loeschen', { p_id: u.id }); } catch (e) { meldung(msg, fehlerText(e), true); return; }
        } else {
          try { await rpc('postfach_setzen', { p_id: u.id, p_status: ziel }); } catch (e) { meldung(msg, fehlerText(e), true); return; }
        }
        dialogZu();
        ladePostfach();
      });
      return b;
    };
    const akt = document.createElement('div');
    akt.className = 'aktionen';
    akt.append(senden, vorschauKnopf,
      u.status === 'offen' ? statusKnopf('Erledigt', 'erledigt') : statusKnopf('Wieder öffnen', 'offen'),
      u.status === 'spam' ? statusKnopf('Kein Spam', 'offen') : statusKnopf('Spam', 'spam'),
      statusKnopf('Löschen', 'loeschen'));
    f.append(text, Object.assign(document.createElement('p'), {
      className: 'fine', textContent: `Geht an ${u.email} von kontakt@radgarage.app, Betreff „${betreff}“, im Radgarage-Design mit Zitat der letzten Nachricht.`,
    }), vorschau, akt, msg);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      senden.disabled = true;
      meldung(msg, 'Wird gesendet …');
      try {
        const r = await rpc('postfach_antworten', { p_id: u.id, p_text: text.value });
        let st = null;
        for (let i = 0; i < 6 && !(st && st.status); i += 1) {
          await new Promise((ok) => setTimeout(ok, 1000));
          st = await rpc('postfach_status', { p_nachricht: r.nachricht }).catch(() => null);
        }
        if (st && st.status && st.status >= 300) { meldung(msg, `Brevo hat die Mail abgelehnt (${st.status}). ${st.fehler || ''}`, true); senden.disabled = false; return; }
        dialogZu();
        meldung($('#msg-postfach'), `Antwort an ${u.email} ist ${st && st.status ? 'raus' : 'unterwegs'}.`);
        ladePostfach();
      } catch (e) {
        meldung(msg, fehlerText(e), true);
        senden.disabled = false;
      }
    });
    const status = { offen: 'Offen', erledigt: 'Erledigt', spam: 'Spam' }[u.status];
    dialog(u.betreff || '(ohne Betreff)', Object.assign(document.createElement('p'), {
      className: 'fine', textContent: `${u.name ? `${u.name} · ` : ''}${u.email} · ${status}${u.konto ? ' · hat ein Konto' : ''}`,
    }), verlauf, f);
    $('#dlg .dlg-box').classList.add('breit');
    verlauf.scrollTop = verlauf.scrollHeight;
  }

  for (const b of $$('#pf-status button')) b.addEventListener('click', () => { pfStatus = b.dataset.status; ladePostfach(); });
  // Links aus der Morgenmail (#postfach) führen in den Reiter Konten zur Kachel
  function zumPostfach() {
    tab('konten');
    $('#postfach').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#pf-neu-laden').addEventListener('click', ladePostfach);
  $('#pf-suche').addEventListener('input', () => { clearTimeout(pfSucheZeit); pfSucheZeit = setTimeout(ladePostfach, 300); });

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

  async function ladeApp() {
    const liste = (await rpc('app_vorschlaege_offen')) || [];
    appGruppen = appGruppieren(liste);
    await appNamenLaden(appGruppen);
    return appGruppen.length;
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

  const SEITE = 50;
  let tlSeite = 0;
  let tlZaehler = 0;
  let tlTimer = null;
  $('#tl-suche').addEventListener('input', () => { clearTimeout(tlTimer); tlTimer = setTimeout(() => ladeTeileliste(true), 300); });
  $('#tl-kategorie').addEventListener('change', () => ladeTeileliste(true));
  $('#tl-ohne').addEventListener('change', () => ladeTeileliste(true));
  $('#tl-mehr').addEventListener('click', () => ladeTeileliste(false));

  async function ladeTeileliste(neu) {
    const nr = ++tlZaehler;
    if (neu) tlSeite = 0;
    const woerter = $('#tl-suche').value.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}.\-/+]/gu, '')).filter((w) => w.length >= 2);
    let q = sb.from('teile').select('id, marke, name, kategorie, ean', { count: 'exact' })
      .order('marke').order('name').range(tlSeite * SEITE, tlSeite * SEITE + SEITE - 1);
    for (const w of woerter) q = q.or(`marke.ilike.*${w}*,name.ilike.*${w}*`);
    if ($('#tl-kategorie').value) q = q.eq('kategorie', $('#tl-kategorie').value);
    if ($('#tl-ohne').checked) q = q.eq('ean', '{}');
    const { data, error, count } = await q;
    if (nr !== tlZaehler) return;
    if (error) { $('#tl-hinweis').textContent = fehlerText(error); return; }
    $('#tl-hinweis').textContent = '';
    $('#tl-zahl').textContent = count != null ? `(${count.toLocaleString('de-DE')})` : '';
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
  function dialogZu() { $('#dlg').hidden = true; $('#dlg-inhalt').replaceChildren(); $('#dlg .dlg-box').classList.remove('breit'); }
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

  async function teilBearbeiten(t) {
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

  // ----- Übersicht, Baustellen, Verlauf -----

  const VERLAUF_TEXTE = {
    teil_geloescht: 'Teil gelöscht', shop_geaendert: 'Shop geändert', shop_geloescht: 'Shop gelöscht',
    vorschlag_uebernommen: 'App-Vorschlag übernommen', vorschlag_abgelehnt: 'App-Vorschlag abgelehnt',
    rad_erfasst: 'Rad erfasst', rad_freigegeben: 'Rad freigegeben', rad_abgelehnt: 'Rad abgelehnt', rad_geloescht: 'Rad gelöscht',
    rad_geaendert: 'Rad geändert', ergaenzung_erfasst: 'Ergänzung erfasst', ergaenzung_uebernommen: 'Ergänzung übernommen',
    ergaenzung_abgelehnt: 'Ergänzung abgelehnt', teil_angelegt: 'Teil angelegt', teil_geaendert: 'Teil geändert',
    teile_zusammengefuehrt: 'Teile zusammengeführt', ean_dazu: 'Barcode ergänzt', ean_weg: 'Barcode entfernt',
    rolle: 'Rolle gesetzt', rolle_gesetzt: 'Rolle gesetzt', rolle_weg: 'Rolle entfernt',
    konto_mail: 'Mail an Konto', postfach_antwort: 'Antwort aus dem Postfach', postfach_geloescht: 'Unterhaltung gelöscht', konto_premium: 'Premium geändert', konto_gesperrt: 'Sperre geändert', konto_geloescht: 'Konto gelöscht',
    wiederherstellung_benutzt: 'Wiederherstellungscode benutzt', zwei_faktor_zurueckgesetzt: 'Zweiter Faktor zurückgesetzt',
  };
  let baustellen = [];
  let bsZeige = 30;
  let bsOffen = false;
  let mkOffen = false;
  const KURZ_BS = 5;
  const KURZ_MK = 6;
  let vlLimit = 50;
  let markenGeladen = false;

  async function ladeUebersicht() {
    meldung($('#msg-uebersicht'), '');
    try {
      const u = await rpc('katalog_uebersicht');
      const zahl = (n) => Number(n || 0).toLocaleString('de-DE');
      const anteil = u.teile ? Math.round((u.teile_mit_ean / u.teile) * 100) : 0;
      const kachel = (farbe, titel, wert, unter) => {
        const d = document.createElement('div');
        d.className = `kachel ${farbe}`;
        d.append(Object.assign(document.createElement('div'), { className: 'eyebrow', textContent: titel }),
          Object.assign(document.createElement('div'), { className: 'zahl-gross', textContent: wert }),
          Object.assign(document.createElement('p'), { className: 'fine', textContent: unter }));
        return d;
      };
      $('#ue-kacheln').replaceChildren(
        kachel('k1', 'Räder', zahl(u.raeder), `${(u.marken || []).length} Marken`),
        kachel('k5', 'Teile', zahl(u.teile), 'im Katalog'),
        kachel('k4', 'Mit Barcode', `${anteil} %`, `${zahl(u.teile_mit_ean)} Teile`),
        kachel('k3', 'Offen', zahl((u.offen_raeder || 0) + (u.offen_ergaenzungen || 0)), `${zahl(u.offen_raeder)} Räder, ${zahl(u.offen_ergaenzungen)} Ergänzungen`));
      const marken = (u.marken || []).slice().sort((a, b) => b.raeder - a.raeder);
      $('#ue-marken').replaceChildren(...marken.map((m, i) => {
        const tr = document.createElement('tr');
        for (const v of [m.hersteller, zahl(m.raeder), Number(m.teile_schnitt || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })]) {
          tr.append(Object.assign(document.createElement('td'), { textContent: v }));
        }
        tr.dataset.extra = i >= KURZ_MK ? '1' : '';
        return tr;
      }));
      markenZeigen();
      if (!markenGeladen) {
        for (const m of marken.map((x) => x.hersteller).sort((a, b) => a.localeCompare(b, 'de'))) $('#bs-marke').append(new Option(m, m));
        markenGeladen = true;
      }
    } catch (e) {
      meldung($('#msg-uebersicht'), fehlerText(e), true);
    }
    ladeVerlauf();
    ladeShops();
    await ladeBaustellen();
    ladeAufgaben();
  }

  // Was gerade ansteht, mit Sprung an die richtige Stelle
  async function ladeAufgaben() {
    const box = $('#ue-aufgaben');
    const [offen, app, stat] = await Promise.all([
      ladeAlleOffenen().catch(() => null),
      ladeApp().catch(() => null),
      rpc('werkbank_statistik', { p_tage: 7 }).catch(() => null),
    ]);
    if (offen) helferOffen = offen.raeder.length + offen.ergaenzungen.length;
    zahlenSetzen();
    const wenig = baustellen.filter((r) => r.teile < 8).length;
    const k = (stat && stat.konten) || {};
    const appArten = (art) => appGruppen.filter((g) => !g.web && g.art === art).length;
    const webAnzahl = appGruppen.filter((g) => g.web).length;
    const punkte = [
      [helferOffen, 'Von Helfern freigeben', 'Räder und Ergänzungen', () => { tab('freigaben'); fgAnsichtSetzen('helfer'); }],
      [appArten('korrektur'), 'Korrekturen aus der App', 'Nutzer melden Fehler', () => { tab('freigaben'); appFilter = 'korrektur'; fgAnsichtSetzen('app'); }],
      [webAnzahl, 'Hinweise von der Website', 'Besucher der Radseiten', () => { tab('freigaben'); fgAnsichtSetzen('web'); }],
      [appGruppen.length - webAnzahl - appArten('korrektur'), 'Weitere App-Vorschläge', 'Räder, Teile, Barcodes', () => { tab('freigaben'); appFilter = ''; fgAnsichtSetzen('app'); }],
      [wenig, 'Räder mit wenig Teilen', 'weniger als 8 Teile', () => { $('#bs-filter').value = 'wenig'; bsOffen = true; zeichneBaustellen(); $('#bs-liste').scrollIntoView({ behavior: 'smooth', block: 'center' }); }],
      [darf('konten_sehen') && k.neu_7, 'Neue Konten', 'in den letzten 7 Tagen', () => tab('konten')],
      [darf('feedback') && fbNeu, 'Neues Feedback', 'von radgarage.app/feedback', () => tab('feedback')],
      [darf('konten_betreuen') && pfUngelesen, 'Neue Mails', 'im E-Mail-CRM', () => zumPostfach()],
    ].filter(([n]) => n);
    for (const b of $$('#app-filter button')) b.setAttribute('aria-checked', String(b.dataset.art === appFilter));
    box.replaceChildren(...punkte.map(([n, titel, unter, fn]) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'aufgabe' });
      const text = document.createElement('span');
      text.append(titel, Object.assign(document.createElement('small'), { textContent: unter }));
      b.append(Object.assign(document.createElement('b'), { textContent: zahlDe(n) }), text);
      b.addEventListener('click', fn);
      return b;
    }));
    if (!punkte.length) box.innerHTML = '<p class="fine">Nichts offen. Zeit für neue Räder.</p>';
  }

  async function ladeBaustellen() {
    try {
      baustellen = (await rpc('katalog_baustellen', { p_marke: $('#bs-marke').value || null })) || [];
    } catch (e) {
      baustellen = [];
      meldung($('#msg-uebersicht'), fehlerText(e), true);
    }
    bsZeige = 30;
    zeichneBaustellen();
  }

  // Marken-Tabelle: erst die größten, Rest zum Ausklappen
  function markenZeigen() {
    const zeilen = $$('#ue-marken tr');
    for (const tr of zeilen) tr.hidden = !mkOffen && tr.dataset.extra === '1';
    const b = $('#mk-auf');
    b.hidden = zeilen.length <= KURZ_MK;
    b.textContent = mkOffen ? 'Einklappen' : `Alle ${zeilen.length} Marken zeigen`;
    b.setAttribute('aria-expanded', String(mkOffen));
  }
  $('#mk-auf').addEventListener('click', () => { mkOffen = !mkOffen; markenZeigen(); });

  function zeichneBaustellen() {
    const filter = $('#bs-filter').value;
    const liste = baustellen.filter((r) => (filter === 'wenig' ? r.teile < 8 : filter === 'quelle' ? !r.quelle : filter === 'uvp' ? !r.uvp : true));
    $('#bs-zahl').textContent = `(${liste.length.toLocaleString('de-DE')})`;
    const ul = $('#bs-liste');
    ul.replaceChildren(...liste.slice(0, bsOffen ? bsZeige : KURZ_BS).map((r) => {
      const li = document.createElement('li');
      const links = document.createElement('div');
      const neben = Object.assign(document.createElement('div'), { className: 'name' });
      neben.append(Object.assign(document.createElement('span'), { textContent: `${r.hersteller} ${r.modell} (${r.baujahr})` }));
      neben.append(Object.assign(document.createElement('span'), { className: 'chip' + (r.teile < 8 ? ' warn' : ''), textContent: `${r.teile} Teile` }));
      if (!r.quelle) neben.append(Object.assign(document.createElement('span'), { className: 'chip warn', textContent: 'ohne Quelle' }));
      if (!r.uvp) neben.append(Object.assign(document.createElement('span'), { className: 'chip', textContent: 'ohne UVP' }));
      links.append(neben);
      const akt = document.createElement('div');
      akt.className = 'aktionen';
      const erg = Object.assign(document.createElement('button'), { type: 'button', className: 'pill klein', textContent: 'Ergänzen' });
      erg.addEventListener('click', async () => {
        tab('erfassen');
        await ergaenzenStart(r);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      const dat = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Daten' });
      dat.addEventListener('click', () => radBearbeiten(r.id, () => ladeBaustellen()));
      akt.append(erg, dat);
      li.append(links, akt);
      return li;
    }));
    if (!liste.length) ul.innerHTML = '<li class="leer">Keine Baustellen. Sehr gut.</li>';
    ul.classList.toggle('offen', bsOffen);
    $('#bs-mehr').hidden = !bsOffen || liste.length <= bsZeige;
    const auf = $('#bs-auf');
    auf.hidden = liste.length <= KURZ_BS;
    auf.textContent = bsOffen ? 'Einklappen' : `Alle ${liste.length.toLocaleString('de-DE')} zeigen`;
    auf.setAttribute('aria-expanded', String(bsOffen));
  }
  $('#bs-auf').addEventListener('click', () => {
    bsOffen = !bsOffen;
    bsZeige = 30;
    zeichneBaustellen();
    if (!bsOffen) $('#bs-liste').closest('.t').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#bs-marke').addEventListener('change', ladeBaustellen);
  $('#bs-filter').addEventListener('change', () => { bsZeige = 30; zeichneBaustellen(); });
  $('#bs-mehr').addEventListener('click', () => { bsZeige += 30; zeichneBaustellen(); });

  let verlauf = [];
  for (const [art, text] of Object.entries(VERLAUF_TEXTE).sort((a, b) => a[1].localeCompare(b[1], 'de'))) $('#vl-art').append(new Option(text, art));
  $('#vl-art').addEventListener('change', zeichneVerlauf);
  $('#vl-suche').addEventListener('input', zeichneVerlauf);
  const verlaufGefiltert = () => {
    const art = $('#vl-art').value;
    const such = $('#vl-suche').value.trim().toLowerCase();
    return verlauf.filter((v) => (!art || v.art === art) && (!such || `${v.von || ''} ${v.text || ''}`.toLowerCase().includes(such)));
  };

  async function ladeVerlauf() {
    try {
      verlauf = (await rpc('katalog_verlauf', { p_limit: vlLimit })) || [];
      $('#vl-mehr').hidden = verlauf.length < vlLimit || vlLimit >= 500;
      zeichneVerlauf();
    } catch (e) {
      $('#ue-verlauf').innerHTML = '';
      meldung($('#msg-uebersicht'), fehlerText(e), true);
    }
  }

  function zeichneVerlauf() {
    const tb = $('#ue-verlauf');
    {
      const liste = verlaufGefiltert();
      tb.replaceChildren(...liste.map((v) => {
        const tr = document.createElement('tr');
        const wann = new Date(v.wann);
        tr.append(Object.assign(document.createElement('td'), { className: 'wann', textContent: `${wann.toLocaleDateString('de-DE')} ${wann.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` }),
          Object.assign(document.createElement('td'), { textContent: v.von || '–' }),
          Object.assign(document.createElement('td'), { textContent: `${VERLAUF_TEXTE[v.art] || v.art}${v.text ? ': ' + v.text : ''}` }));
        return tr;
      }));
      if (!liste.length) tb.innerHTML = `<tr><td colspan="3" class="fine">${verlauf.length ? 'Keine passenden Einträge, „Mehr zeigen“ lädt ältere.' : 'Noch keine Einträge.'}</td></tr>`;
    }
  }
  $('#vl-mehr').addEventListener('click', () => { vlLimit = Math.min(500, vlLimit + 100); ladeVerlauf(); });

  // ----- Registrierte Konten -----

  const ANBIETER = { apple: 'Apple', google: 'Google', email: 'E-Mail' };
  let konten = [];
  let bilder = {};
  let ktZeige = 50;
  const datum = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
  const gesperrt = (k) => k.gesperrt_bis && new Date(k.gesperrt_bis) > new Date();

  async function ladeKonten() {
    meldung($('#msg-konten'), '');
    try {
      [konten, helfer] = await Promise.all([darf('konten_sehen') ? rpc('konten_liste') : [], darf('rollen') ? rpc('helfer_liste') : []]);
      konten = konten || [];
      helfer = helfer || [];
      bilder = {};
      const pfade = konten.map((k) => k.profilbild).filter(Boolean);
      for (let i = 0; i < pfade.length; i += 100) {
        const { data } = await sb.storage.from('profilbilder').createSignedUrls(pfade.slice(i, i + 100), 3600);
        for (const b of data || []) if (b.signedUrl) bilder[b.path] = b.signedUrl;
      }
    } catch (e) {
      konten = [];
      meldung($('#msg-konten'), fehlerText(e), true);
    }
    zeichneHelferOhneKonto();
    const woche = Date.now() - 7 * 864e5;
    const zahl = (n) => n.toLocaleString('de-DE');
    const kachel = (farbe, titel, wert, unter) => {
      const d = document.createElement('div');
      d.className = `kachel ${farbe}`;
      d.append(Object.assign(document.createElement('div'), { className: 'eyebrow', textContent: titel }),
        Object.assign(document.createElement('div'), { className: 'zahl-gross', textContent: wert }),
        Object.assign(document.createElement('p'), { className: 'fine', textContent: unter }));
      return d;
    };
    $('#kt-kacheln').replaceChildren(
      kachel('k1', 'Konten', zahl(konten.length), `${zahl(konten.filter((k) => k.raeder > 0).length)} mit Rädern`),
      kachel('k5', 'Aktiv', zahl(konten.filter((k) => k.letzte_anmeldung && new Date(k.letzte_anmeldung) > woche).length), 'in den letzten 7 Tagen'),
      kachel('k4', 'Premium', zahl(konten.filter((k) => k.premium).length), 'Konten'),
      kachel('k3', 'Familien', zahl(konten.filter((k) => k.familie === 'besitzer').length), ((n) => `${zahl(n)} ${n === 1 ? 'Mitglied' : 'Mitglieder'}`)(konten.filter((k) => k.familie === 'mitglied').length)));
    ktZeige = 50;
    zeichneKonten();
  }

  function helferText(k) {
    const h = k.rolle && helfer.find((x) => x.email.toLowerCase() === (k.email || '').toLowerCase());
    if (!h) return '';
    return ` · ${h.raeder || 0} im Katalog erfasst` + (h.offen ? `, ${h.offen} offen` : '');
  }

  function zeichneKonten() {
    const liste = kontenGefiltert();
    $('#kt-zahl').textContent = `(${liste.length.toLocaleString('de-DE')})`;
    zeichneKontenListe(liste);
  }
  function kontenGefiltert() {
    const such = $('#kt-suche').value.trim().toLowerCase();
    const filter = $('#kt-filter').value;
    return konten.filter((k) => (!such || (k.email || '').toLowerCase().includes(such) || String(k.id).startsWith(such))
      && (filter === 'premium' ? k.premium : filter === 'familie' ? k.familie : filter === 'rolle' ? k.rolle
        : filter === 'gesperrt' ? gesperrt(k) : filter === 'unbestaetigt' ? !k.bestaetigt : true));
  }
  function zeichneKontenListe(liste) {
    const ul = $('#kt-liste');
    ul.replaceChildren(...liste.slice(0, ktZeige).map((k) => {
      const li = document.createElement('li');
      const zeile = document.createElement('div');
      zeile.className = 'mit-bild';
      const links = document.createElement('div');
      zeile.append(ava(k.email, bilder[k.profilbild], true), links);
      links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: k.email || `Konto ${String(k.id).slice(0, 8)}` }),
        Object.assign(document.createElement('div'), { className: 'fine', textContent: `Seit ${datum(k.registriert)} · zuletzt ${datum(k.letzte_anmeldung)} · ${k.raeder || 0} ${k.raeder === 1 ? 'Rad' : 'Räder'}` + helferText(k) }));
      const chips = document.createElement('div');
      chips.className = 'eans';
      const chip = (text, art) => chips.append(Object.assign(document.createElement('span'), { className: 'chip' + (art ? ' ' + art : ''), textContent: text }));
      for (const a of k.anbieter || []) chip(ANBIETER[a] || a);
      if (k.premium) chip('Premium', 'gut');
      if (k.familie) chip(k.familie === 'besitzer' ? 'Familie gegründet' : 'In Familie');
      if (k.rolle) chip(ROLLEN[k.rolle] || k.rolle);
      if (k.zwei_faktor) chip('2FA', 'gut');
      else if (k.rolle) chip('ohne 2FA', 'warn');
      if (!k.bestaetigt) chip('nicht bestätigt', 'warn');
      if (gesperrt(k)) chip('gesperrt', 'warn');
      links.append(chips);
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Verwalten' });
      b.addEventListener('click', () => kontoVerwalten(k));
      li.append(zeile, b);
      return li;
    }));
    if (!liste.length) ul.innerHTML = '<li class="leer">Keine Konten gefunden.</li>';
    $('#kt-mehr').hidden = liste.length <= ktZeige;
  }
  $('#kt-suche').addEventListener('input', () => { ktZeige = 50; zeichneKonten(); });
  $('#kt-filter').addEventListener('change', () => { ktZeige = 50; zeichneKonten(); });
  $('#kt-mehr').addEventListener('click', () => { ktZeige += 50; zeichneKonten(); });

  function kontoVerwalten(k) {
    const ich = !!k.ich;
    const msg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });
    const block = (titel, text, ...inhalt) => {
      const d = document.createElement('div');
      d.className = 'aktion';
      d.append(Object.assign(document.createElement('strong'), { textContent: titel }));
      if (text) d.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: text }));
      const akt = document.createElement('div');
      akt.className = 'aktionen';
      akt.append(...inhalt);
      d.append(akt);
      return d;
    };
    const knopf = (text, fn, art = 'pill ghost klein') => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: art, textContent: text });
      b.addEventListener('click', async () => {
        b.disabled = true;
        meldung(msg, '');
        try {
          if ((await fn()) !== false) { dialogZu(); await ladeKonten(); meldung($('#msg-konten'), `${k.email || 'Konto'}: gespeichert.`); }
        } catch (e) {
          meldung(msg, fehlerText(e), true);
        }
        b.disabled = false;
      });
      return b;
    };

    const info = Object.assign(document.createElement('p'), { className: 'fine' });
    info.textContent = `Anmeldung über ${(k.anbieter || []).map((a) => ANBIETER[a] || a).join(', ') || '–'}. Registriert ${datum(k.registriert)}, zuletzt angemeldet ${datum(k.letzte_anmeldung)}. `
      + `${k.raeder || 0} ${k.raeder === 1 ? 'Rad' : 'Räder'} in der Garage.`
      + (k.familie === 'besitzer' ? ` Hat die Familiengarage „${k.familie_name || ''}“ gegründet${k.familie_mitglieder ? ` (${k.familie_mitglieder} ${k.familie_mitglieder === 1 ? 'Mitglied' : 'Mitglieder'})` : ''}.` : k.familie ? ` Mitglied der Familiengarage „${k.familie_name || ''}“.` : '')
      + ` Kennung ${k.id}.`;

    const premium = block('Premium', k.premium ? `Aktiv (${k.premium === 'geschenk' ? 'geschenkt' : k.premium === 'kauf' ? 'gekauft' : k.premium}).` : 'Nicht aktiv.',
      k.premium === 'kauf'
        ? Object.assign(document.createElement('span'), { className: 'fine', textContent: 'Gekauftes Premium lässt sich hier nicht zurücknehmen.' })
        : k.premium
        ? knopf('Premium entziehen', async () => { if (!window.confirm(`Premium für ${k.email} entziehen?`)) return false; await rpc('konto_premium', { p_nutzer: k.id, p_an: false }); })
        : knopf('Premium schenken', () => rpc('konto_premium', { p_nutzer: k.id, p_an: true }), 'pill klein'));

    const dauer = document.createElement('select');
    dauer.setAttribute('aria-label', 'Dauer der Sperre');
    for (const [w, t] of [['7', '7 Tage'], ['30', '30 Tage'], ['0', 'Bis auf Weiteres']]) dauer.append(new Option(t, w));
    dauer.style.width = 'auto';
    const sperre = gesperrt(k)
      ? block('Sperre', `Gesperrt bis ${new Date(k.gesperrt_bis).getFullYear() > 2100 ? 'auf Weiteres' : datum(k.gesperrt_bis)}.`,
        knopf('Sperre aufheben', () => rpc('konto_sperren', { p_nutzer: k.id, p_bis: null }), 'pill klein'))
      : block('Sperren', 'Ein gesperrtes Konto kann sich nicht mehr anmelden, seine Daten bleiben erhalten. Laufende Sitzungen enden spätestens nach einer Stunde.',
        dauer, knopf('Sperren', async () => {
          const tage = Number(dauer.value);
          if (!window.confirm(`${k.email} ${tage ? 'für ' + tage + ' Tage' : 'bis auf Weiteres'} sperren?`)) return false;
          const bis = tage ? new Date(Date.now() + tage * 864e5) : new Date('2999-12-31T00:00:00Z');
          await rpc('konto_sperren', { p_nutzer: k.id, p_bis: bis.toISOString() });
        }));

    // Admins vergeben nur Helfer, der Super-Admin alles außer Super-Admin
    const wahl = vergebbar();
    const rolleAenderbar = k.email && wahl.length && k.rolle !== 'superadmin' && (!k.rolle || wahl.includes(k.rolle));
    const rolleWahl = document.createElement('select');
    rolleWahl.setAttribute('aria-label', 'Rolle in der Werkbank');
    rolleWahl.style.width = 'auto';
    for (const w of ['', ...wahl]) rolleWahl.append(new Option(w ? ROLLEN[w] : 'Keine', w));
    rolleWahl.value = k.rolle || '';
    const rolleBlock = rolleAenderbar
      ? block('Rolle in der Werkbank', 'Was jede Rolle darf, steht unter „Rollen und Rechte“.', rolleWahl, knopf('Übernehmen', async () => {
        const neu = rolleWahl.value || null;
        if (neu === (k.rolle || null)) return false;
        if (neu === 'admin' && !window.confirm(`${k.email} zum Admin machen? Admins stellen Einträge sofort live, geben frei und löschen im Katalog.`)) return false;
        if (neu === 'support' && !window.confirm(`${k.email} zum Support machen? Support sieht alle Konten, kann sperren und den zweiten Faktor zurücksetzen.`)) return false;
        await rpc('helfer_setzen', { p_email: k.email, p_rolle: neu });
      }))
      : null;

    const bestaetigen = Object.assign(document.createElement('input'), { type: 'text', placeholder: k.email || 'LÖSCHEN', autocomplete: 'off' });
    bestaetigen.setAttribute('aria-label', 'Zur Bestätigung E-Mail-Adresse eintippen');
    const loeschen = block('Konto löschen', 'Löscht das Konto mit Garage, Einstellungen, Profilbild und hochgeladenen Dokumenten. Das lässt sich nicht rückgängig machen. '
      + (k.familie === 'besitzer' ? 'Die Familiengarage geht an das am längsten beigetretene Mitglied. ' : '')
      + 'Zur Bestätigung die E-Mail-Adresse eintippen.',
      bestaetigen, knopf('Endgültig löschen', async () => {
        const soll = (k.email || 'LÖSCHEN').toLowerCase();
        if (bestaetigen.value.trim().toLowerCase() !== soll) { meldung(msg, 'Die eingetippte Adresse stimmt nicht.', true); return false; }
        await dokumenteLoeschen(k);
        await rpc('konto_loeschen_admin', { p_nutzer: k.id });
      }, 'pill gefahr klein'));

    const zweiFaktor = k.zwei_faktor
      ? block('Zweiter Faktor', `${k.zwei_faktor} ${k.zwei_faktor === 1 ? 'Authenticator-App' : 'Authenticator-Apps'} eingetragen. Zurücksetzen hilft, wenn das Handy weg ist und keine Wiederherstellungscodes mehr da sind. Das Konto wird überall abgemeldet und richtet beim nächsten Werkbank-Login neu ein.`,
        knopf('Zweiten Faktor zurücksetzen', async () => {
          if (!window.confirm(`Zweiten Faktor von ${k.email} zurücksetzen? Hast du vorher geprüft, dass die Anfrage wirklich von dieser Person kommt?`)) return false;
          await rpc('konto_2fa_zuruecksetzen', { p_nutzer: k.id });
        }))
      : null;

    // Das Super-Admin-Konto und das eigene sind vor Änderungen durch die Werkbank geschützt
    const geschuetzt = ich || k.rolle === 'superadmin';
    const teile = [info];
    if (darf('konten_verwalten')) teile.push(premium);
    else teile.push(Object.assign(document.createElement('p'), { className: 'fine', textContent: `Premium: ${k.premium ? 'aktiv' : 'nicht aktiv'}.` }));
    if (!geschuetzt && darf('konten_betreuen')) {
      if (zweiFaktor) teile.push(zweiFaktor);
      teile.push(sperre);
    }
    if (rolleBlock && !geschuetzt) teile.push(rolleBlock);
    if (k.email && darf('konten_betreuen')) {
      const verlauf = Object.assign(document.createElement('ul'), { className: 'mail-verlauf' });
      teile.push(block('E-Mail', 'Persönliche Mail im Radgarage-Design an diese Adresse. Unterhaltungen im E-Mail-CRM:', verlauf,
        Object.assign(document.createElement('button'), { type: 'button', className: 'pill klein', textContent: 'E-Mail schreiben', onclick: () => mailEditor(k) })));
      rpc('postfach_von_konto', { p_nutzer: k.id }).then((liste) => {
        verlauf.replaceChildren(...(liste || []).slice(0, 8).map((m) => {
          const li = document.createElement('li');
          li.append(Object.assign(document.createElement('a'), {
            href: '#postfach', className: 'fine', textContent: `${datum(m.letzte)}: „${m.betreff || '(ohne Betreff)'}“${m.ungelesen ? ' · neu' : ''}`,
            onclick: (ev) => { ev.preventDefault(); dialogZu(); unterhaltung(m.id); },
          }));
          return li;
        }));
      }).catch(() => {});
    }
    // Tägliche Erinnerung: Der Super-Admin schaltet sie für Admins an und aus, jeder selbst unter „Konto“
    const hEintrag = helfer.find((x) => x.email.toLowerCase() === (k.email || '').toLowerCase());
    if (!ich && rolle === 'superadmin' && hEintrag && (RECHTE_JE_ROLLE[hEintrag.rolle] || []).some((r) => r === 'katalog_pflegen' || r === 'konten_betreuen')) {
      const an = hEintrag.erinnerung !== false;
      teile.push(block('Tägliche Erinnerung', `Mail an diese Adresse, wenn Neues in Freigaben, Feedback oder Postfach wartet. Gerade ${an ? 'an' : 'aus'}.`,
        knopf(an ? 'Ausschalten' : 'Einschalten', () => rpc('erinnerung_setzen', { p_email: k.email, p_an: !an }))));
    }
    if (!geschuetzt && darf('konten_verwalten')) teile.push(loeschen);
    if (geschuetzt) teile.push(Object.assign(document.createElement('p'), { className: 'fine', textContent: ich ? 'Das ist dein eigenes Konto. Sperren, Rolle und Löschen gehen hier nicht.' : 'Das ist das Konto des Super-Admins. Sperren, Rolle und Löschen gehen hier nicht.' }));
    const zu = document.createElement('div');
    zu.className = 'aktionen';
    zu.append(Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost', textContent: 'Schließen', onclick: dialogZu }));
    teile.push(msg, zu);
    dialog(k.email || `Konto ${String(k.id).slice(0, 8)}`, ...teile);
  }

  // Wie die App: Dokumente zuerst, sonst blieben Dateien ohne Konto liegen.
  // Der Server gibt den Ordner nur auf Anfrage für 10 Minuten frei. Rad-Dokumente
  // bleiben, wenn die Familiengarage weitergeerbt wird.
  async function dokumenteLoeschen(k) {
    const id = k.id;
    await rpc('konto_dokumente_freigeben', { p_nutzer: id });
    const pfade = [];
    for (const ordner of k.raeder_dokumente_behalten ? ['fitting'] : ['fitting', 'rad']) {
      let ab = 0;
      for (;;) {
        const { data, error } = await sb.storage.from('dokumente').list(`${id}/${ordner}`, { limit: 100, offset: ab });
        if (error) throw error;
        pfade.push(...(data || []).filter((f) => f.id).map((f) => `${id}/${ordner}/${f.name}`));
        if (!data || data.length < 100) break;
        ab += 100;
      }
    }
    for (let i = 0; i < pfade.length; i += 100) {
      const { error } = await sb.storage.from('dokumente').remove(pfade.slice(i, i + 100));
      if (error) throw error;
    }
    // Profilbilder darf ein bestätigter Admin ohne Freigabe sehen und löschen
    const { data: bild, error: e1 } = await sb.storage.from('profilbilder').list(id, { limit: 100 });
    if (e1) throw e1;
    const bp = (bild || []).filter((f) => f.id).map((f) => `${id}/${f.name}`);
    if (bp.length) {
      const { error } = await sb.storage.from('profilbilder').remove(bp);
      if (error) throw error;
    }
  }

  // ----- Konto: Passwort -----

  // ----- Konto: Sicherheit -----

  let codesOffen = null;
  let neuerFaktor = null;

  async function ladeSicherheit() {
    meldung($('#msg-codes'), '');
    meldung($('#msg-sitzungen'), '');
    const [faktoren, codes] = await Promise.all([
      sb.auth.mfa.listFactors().then((r) => r.data ? r.data.totp.filter((f) => f.status === 'verified') : []),
      rpc('wiederherstellung_status').catch(() => null),
    ]);
    codesOffen = codes ? codes.offen : null;
    zeichneFaktoren(faktoren);
    zeichneCodesStatus(codes);
    zeichneStatus(faktoren, codes);
    ladeSitzungen();
  }

  function zeichneStatus(faktoren, codes) {
    const punkt = (ok, titel, text) => {
      const li = document.createElement('li');
      li.className = ok ? '' : 'offen';
      const b = Object.assign(document.createElement('b'), { textContent: ok ? '✓' : '!' });
      b.setAttribute('aria-label', ok ? 'erledigt' : 'offen');
      const d = document.createElement('div');
      d.append(Object.assign(document.createElement('strong'), { textContent: titel }), Object.assign(document.createElement('small'), { textContent: text }));
      li.append(b, d);
      return li;
    };
    const offen = codes ? codes.offen : 0;
    $('#sicher-status').replaceChildren(
      punkt(faktoren.length > 0, 'Zweiter Faktor', faktoren.length === 1 ? '1 Authenticator-App eingetragen' : `${faktoren.length} Authenticator-Apps eingetragen`),
      punkt(offen >= 3 || faktoren.length > 1, 'Notfall-Zugang', offen ? `${offen} Wiederherstellungscodes übrig` + (faktoren.length > 1 ? ', dazu ein Ersatzgerät' : '') : (faktoren.length > 1 ? 'Ersatzgerät eingetragen, Codes fehlen noch' : 'Noch keine Wiederherstellungscodes')),
      punkt(true, 'Automatisch abmelden', `nach ${$('#auto-ab').selectedOptions[0].textContent}`),
      punkt(true, 'Sitzung nur in diesem Tab', 'Schließen des Tabs meldet dich ab'));
  }

  function zeichneFaktoren(faktoren) {
    const ul = $('#faktoren');
    ul.replaceChildren(...faktoren.map((f) => {
      const li = document.createElement('li');
      const links = document.createElement('div');
      links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: f.friendly_name || 'Authenticator' }),
        Object.assign(document.createElement('div'), { className: 'neben', textContent: `Eingetragen am ${new Date(f.created_at).toLocaleDateString('de-DE')}` }));
      const umb = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Umbenennen' });
      umb.addEventListener('click', () => {
        const form = formular([['name', 'Name der App oder des Geräts']], { name: f.friendly_name || '' }, 'Speichern');
        form.name.maxLength = 40;
        form.name.setAttribute('list', 'app-namen');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          mitKnopf(form, async () => {
            const name = form.name.value.trim();
            if (!name) throw new Error('Bitte einen Namen eingeben.');
            if (name !== f.friendly_name) await rpc('faktor_umbenennen', { p_faktor: f.id, p_name: name });
            dialogZu();
            ladeSicherheit();
          });
        });
        dialog('Authenticator umbenennen', form);
      });
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Entfernen' });
      b.disabled = faktoren.length < 2;
      b.title = faktoren.length < 2 ? 'Das letzte Gerät lässt sich nicht entfernen. Füge zuerst ein anderes hinzu.' : '';
      b.addEventListener('click', async () => {
        if (!window.confirm(`„${f.friendly_name}“ entfernen? Codes von diesem Gerät gelten dann nicht mehr.`)) return;
        b.disabled = true;
        const { error } = await sb.auth.mfa.unenroll({ factorId: f.id });
        if (error) { window.alert(fehlerText(error)); b.disabled = false; return; }
        ladeSicherheit();
      });
      const akt = document.createElement('div');
      akt.className = 'aktionen';
      akt.append(umb, b);
      li.append(links, akt);
      return li;
    }));
  }

  $('#f-faktor-neu').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    mitKnopf(f, async () => {
      const { data: alle } = await sb.auth.mfa.listFactors();
      for (const x of (alle ? alle.all : []).filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: x.id });
      const name = f.name.value.trim();
      if ((alle ? alle.totp : []).some((x) => x.friendly_name === name)) throw new Error('Diesen Namen gibt es schon. Bitte einen anderen wählen.');
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: name, issuer: 'Radgarage' });
      if (error) throw error;
      neuerFaktor = data.id;
      const box = $('#faktor-neu-qr');
      $('img', box).src = qrBild(data.totp.qr_code);
      $('code', box).textContent = data.totp.secret;
      box.hidden = false;
      f.hidden = true;
      $('#f-faktor-neu-code').reset();
      $('#f-faktor-neu-code').code.focus();
    });
  });
  $('#f-faktor-neu-code').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    mitKnopf(f, async () => {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: neuerFaktor, code: f.code.value.trim() });
      if (error) throw error;
      neuerFaktorZu(false);
      ladeSicherheit();
    });
  });
  async function neuerFaktorZu(aufraeumen) {
    if (aufraeumen && neuerFaktor) await sb.auth.mfa.unenroll({ factorId: neuerFaktor });
    neuerFaktor = null;
    $('#faktor-neu-qr').hidden = true;
    $('#f-faktor-neu').hidden = false;
    $('#f-faktor-neu').reset();
    $('#faktor-neu-box').open = false;
  }
  $('#faktor-neu-abbrechen').addEventListener('click', () => neuerFaktorZu(true));

  // Wiederherstellungscodes
  function zeichneCodesStatus(c) {
    const t = $('#codes-status');
    if (!c) { t.textContent = 'Status nicht abrufbar.'; return; }
    if (!c.gesamt) {
      t.textContent = 'Du hast noch keine Codes erzeugt.';
      $('#codes-neu').textContent = 'Codes erzeugen';
    } else {
      t.textContent = `${c.offen} von ${c.gesamt} Codes übrig, erzeugt am ${new Date(c.erzeugt).toLocaleDateString('de-DE')}.` + (c.offen < 3 ? ' Erzeuge bald neue.' : '');
      $('#codes-neu').textContent = 'Neue Codes erzeugen';
    }
  }
  let letzteCodes = [];
  $('#codes-neu').addEventListener('click', async () => {
    if (codesOffen && !window.confirm('Neue Codes erzeugen? Die bisherigen gelten dann nicht mehr.')) return;
    const b = $('#codes-neu');
    b.disabled = true;
    try {
      letzteCodes = (await rpc('wiederherstellung_erzeugen')) || [];
      $('#codes-liste').replaceChildren(...letzteCodes.map((c) => Object.assign(document.createElement('span'), { textContent: c })));
      $('#codes-anzeige').hidden = false;
      b.hidden = true;
      const st = await rpc('wiederherstellung_status').catch(() => null);
      codesOffen = st ? st.offen : null;
      zeichneCodesStatus(st);
      const { data } = await sb.auth.mfa.listFactors();
      zeichneStatus(data ? data.totp.filter((f) => f.status === 'verified') : [], st);
    } catch (e) {
      meldung($('#msg-codes'), fehlerText(e), true);
    }
    b.disabled = false;
  });
  const codesText = () => `Radgarage Werkbank – Wiederherstellungscodes\n${email}\nErzeugt am ${new Date().toLocaleString('de-DE')}\nJeder Code gilt einmal.\n\n${letzteCodes.join('\n')}\n`;
  $('#codes-kopieren').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(codesText()); meldung($('#msg-codes'), 'Kopiert.'); } catch { meldung($('#msg-codes'), 'Kopieren ging nicht, bitte markieren und von Hand kopieren.', true); }
  });
  $('#codes-laden').addEventListener('click', () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([codesText()], { type: 'text/plain' })), download: 'radgarage-wiederherstellungscodes.txt' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#codes-drucken').addEventListener('click', () => window.print());
  $('#codes-fertig').addEventListener('click', () => {
    letzteCodes = [];
    $('#codes-liste').replaceChildren();
    $('#codes-anzeige').hidden = true;
    $('#codes-neu').hidden = false;
    meldung($('#msg-codes'), '');
  });

  // Ohne Codes nach der Anmeldung einmal darauf hinweisen
  async function pruefeCodes() {
    const st = await rpc('wiederherstellung_status').catch(() => null);
    if (st && st.offen === 0) {
      meldung($('#hinweis-rolle'), `${$('#hinweis-rolle').textContent} Tipp: Lege unter „Konto“ Wiederherstellungscodes an, falls dein Handy einmal weg ist.`);
    }
  }

  // Passwort
  function pwStaerke(pw) {
    if (!pw) return [0, ''];
    let punkte = Math.min(pw.length, 24) / 24 * 50;
    const arten = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
    punkte += arten * 10;
    if (/(.)\1{2,}/.test(pw)) punkte -= 15;
    if (/^(?:passwort|password|radgarage|123456|qwertz|qwerty)/i.test(pw) || (email && pw.toLowerCase().includes(email.split('@')[0].toLowerCase()))) punkte -= 30;
    punkte = Math.max(0, Math.min(100, punkte));
    const text = pw.length < 12 ? `Noch ${12 - pw.length} ${12 - pw.length === 1 ? 'Zeichen' : 'Zeichen'}` : punkte >= 80 ? 'Stark' : punkte >= 60 ? 'Gut' : 'Zu schwach';
    return [punkte, text];
  }
  function pwAnzeigen() {
    const f = $('#f-passwort');
    const [p, t] = pwStaerke(f.pw1.value);
    const lang = f.pw1.value.length >= 12;
    $('#pw-balken').style.width = (f.pw1.value ? Math.max(p, 6) : 0) + '%';
    $('#pw-balken').className = lang && p >= 80 ? 'gut' : lang && p >= 60 ? 'mittel' : '';
    $('#pw-staerke').textContent = f.pw1.value ? t : 'Noch 12 Zeichen';
    const g = $('#pw-gleich');
    const gleich = f.pw2.value && f.pw2.value === f.pw1.value;
    g.textContent = !f.pw2.value ? '' : gleich ? 'passt' : 'anders';
    g.className = 'pw-gleich' + (!f.pw2.value ? '' : gleich ? ' ok' : ' nein');
  }
  $('#f-passwort').pw1.addEventListener('input', pwAnzeigen);
  $('#f-passwort').pw2.addEventListener('input', pwAnzeigen);
  $('.pw-auge').addEventListener('click', (ev) => {
    const f = $('#f-passwort');
    const b = ev.currentTarget;
    const zeigen = f.pw1.type === 'password';
    f.pw1.type = f.pw2.type = zeigen ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(zeigen));
    b.setAttribute('aria-label', zeigen ? 'Passwörter verbergen' : 'Passwörter zeigen');
  });
  $('#f-passwort').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    mitKnopf(f, async (msg) => {
      if (f.pw1.value !== f.pw2.value) throw new Error('Die beiden Passwörter sind nicht gleich.');
      if (f.pw1.value.length < 12) throw new Error('Bitte mindestens 12 Zeichen.');
      if (pwStaerke(f.pw1.value)[0] < 60) throw new Error('Das Passwort ist zu leicht zu erraten. Nimm ein längeres oder einen Satz aus mehreren Wörtern.');
      const { error } = await sb.auth.updateUser({ password: f.pw1.value });
      if (error) throw /different from the old/i.test(error.message) ? new Error('Das ist schon dein Passwort.') : error;
      f.reset();
      pwAnzeigen();
      meldung(msg, 'Passwort gespeichert. Ab jetzt kannst du dich auch damit anmelden.');
    });
  });

  // Sitzungen
  function geraetAus(ua) {
    if (!ua) return 'Unbekanntes Gerät';
    if (/okhttp|Expo|CFNetwork|Darwin|ReactNative/i.test(ua) && !/Mozilla/.test(ua)) return /okhttp|Android/i.test(ua) ? 'Radgarage-App (Android)' : 'Radgarage-App (iPhone)';
    const sys = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return sys ? `${br} auf ${sys}` : br;
  }
  const zeitpunkt = (d) => (d ? `${new Date(d).toLocaleDateString('de-DE')} ${new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : '–');
  async function ladeSitzungen() {
    const tb = $('#sitzungen');
    try {
      const liste = ((await rpc('meine_sitzungen')) || []).sort((a, b) => (b.diese - a.diese) || String(b.zuletzt).localeCompare(String(a.zuletzt)));
      tb.replaceChildren(...liste.map((x) => {
        const tr = document.createElement('tr');
        const td = (t, k) => Object.assign(document.createElement('td'), { textContent: t, className: k || '' });
        const knopf = document.createElement('td');
        knopf.className = 'knopf';
        if (x.diese) knopf.textContent = 'Dieser Tab';
        else {
          const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Beenden' });
          b.addEventListener('click', async () => {
            b.disabled = true;
            try { await rpc('meine_sitzung_beenden', { p_id: x.id }); ladeSitzungen(); } catch (e) { meldung($('#msg-sitzungen'), fehlerText(e), true); b.disabled = false; }
          });
          knopf.append(b);
        }
        tr.append(td(geraetAus(x.user_agent) + (x.aal === 'aal2' ? '' : ' (ohne 2. Faktor)')), td(zeitpunkt(x.erstellt), 'wann'), td(zeitpunkt(x.zuletzt), 'wann'), td(x.ip || '–', 'wann'), knopf);
        return tr;
      }));
      $('#andere-ab').hidden = liste.filter((x) => !x.diese).length === 0;
    } catch (e) {
      tb.replaceChildren();
      meldung($('#msg-sitzungen'), fehlerText(e), true);
    }
  }
  $('#andere-ab').addEventListener('click', async () => {
    if (!window.confirm('Alle anderen Geräte abmelden, auch die App auf deinem Handy?')) return;
    const { error } = await sb.auth.signOut({ scope: 'others' });
    if (error) meldung($('#msg-sitzungen'), fehlerText(error), true);
    else { meldung($('#msg-sitzungen'), 'Alle anderen Geräte sind abgemeldet.'); ladeSitzungen(); }
  });

  // Automatisch abmelden nach Inaktivität (Einstellung pro Browser)
  let letzteAktivitaet = Date.now();
  try { const v = localStorage.getItem('werkbank-auto-ab'); if (v && $(`#auto-ab option[value="${v}"]`)) $('#auto-ab').value = v; } catch { /* ohne Speicher Standard */ }
  $('#auto-ab').addEventListener('change', () => {
    try { localStorage.setItem('werkbank-auto-ab', $('#auto-ab').value); } catch { /* egal */ }
    ladeSicherheit();
  });
  for (const ev of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']) {
    window.addEventListener(ev, () => { letzteAktivitaet = Date.now(); }, { passive: true });
  }
  $('#ab-bleiben').addEventListener('click', () => { letzteAktivitaet = Date.now(); $('#ab-warnung').hidden = true; });
  setInterval(async () => {
    const warnung = $('#ab-warnung');
    if ($('#s-werkbank').hidden) { warnung.hidden = true; return; }
    const rest = Number($('#auto-ab').value) * 60000 - (Date.now() - letzteAktivitaet);
    // Eine Minute vorher warnen, damit nichts Halbfertiges verloren geht
    warnung.hidden = rest > 60000 || rest <= 0;
    if (!warnung.hidden) $('#ab-text').textContent = `In ${Math.ceil(rest / 1000)} Sekunden wirst du automatisch abgemeldet.`;
    if (rest > 0) return;
    warnung.hidden = true;
    await sb.auth.signOut({ scope: 'local' });
    rolle = null;
    rechte = new Set();
    radTeile = [];
    $('#wer-bild').replaceWith(Object.assign(document.createElement('span'), { id: 'wer-bild', className: 'ava' }));
    ergaenzenEnde();
    dialogZu();
    zeige('s-mail');
    meldung($('#f-mail .msg'), 'Du wurdest nach längerer Pause automatisch abgemeldet.');
  }, 5000);

  $('#f-neues-teil').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    mitKnopf(f, async (msg) => {
      const p = { marke: f.marke.value.trim(), name: f.name.value.trim(), kategorie: f.kategorie.value };
      if (f.preis.value) p.preis = Number(f.preis.value);
      const ean = f.ean.value.replace(/\D/g, '');
      if (ean) p.ean = ean;
      if (f.quelle.value.trim()) p.quelle = f.quelle.value.trim();
      await rpc('katalog_teil_anlegen', { p });
      meldung(msg, `${p.marke} ${p.name} ist jetzt im Katalog.`);
      f.reset();
      ladeTeileliste(true);
    });
  });

  // ----- Helfer verwalten -----

  // Helfer-Rollen: Zahlen für die Kontenliste und Einladungen ohne Konto
  let helfer = [];
  function zeichneHelferOhneKonto() {
    const mitKonto = new Set(konten.map((k) => (k.email || '').toLowerCase()));
    // Ohne Kontenliste (Admin) zeigen wir alle vergebenen Rollen
    const alle = !darf('konten_sehen');
    const ohne = alle ? helfer : helfer.filter((h) => !mitKonto.has(h.email.toLowerCase()));
    $('#helfer-ohne-titel').textContent = alle ? 'Vergebene Rollen' : 'Freigeschaltet, aber noch ohne Konto';
    const zahl = helfer.length;
    $('#helfer-zusammenfassung').textContent = `${zahl} ${zahl === 1 ? 'Rolle' : 'Rollen'} vergeben` + (ohne.length ? `, ${ohne.length} noch ohne Konto` : '');
    const ul = $('#helfer-ohne');
    ul.replaceChildren(...ohne.map((h) => {
      const li = document.createElement('li');
      const links = document.createElement('div');
      links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: h.email }),
        Object.assign(document.createElement('div'), { className: 'neben', textContent: `${ROLLEN[h.rolle] || h.rolle} seit ${datum(h.seit)}` }));
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: 'Zurückziehen' });
      b.addEventListener('click', async () => {
        if (!window.confirm(`Freischaltung für ${h.email} zurückziehen?`)) return;
        b.disabled = true;
        try { await rpc('helfer_setzen', { p_email: h.email, p_rolle: null }); ladeKonten(); } catch (e) { meldung($('#msg-helfer'), fehlerText(e), true); b.disabled = false; }
      });
      if (h.aenderbar !== false && vergebbar().includes(h.rolle)) li.append(links, b);
      else li.append(links);
      return li;
    }));
    if (!ohne.length) ul.innerHTML = alle ? '<li class="leer">Noch keine Rollen vergeben.</li>' : '<li class="leer">Keine offenen Einladungen.</li>';
  }

  $('#f-helfer').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const mail = f.email.value.trim().toLowerCase();
    const r = f.rolle.value;
    (async () => {
      const knopf = f.querySelector('button[type=submit]');
      knopf.disabled = true;
      try {
        await rpc('helfer_setzen', { p_email: mail, p_rolle: r });
        meldung($('#msg-helfer'), `${mail} ist jetzt ${ROLLEN[r]}. Gilt ab der nächsten Anmeldung.`);
        f.reset();
        ladeKonten();
      } catch (e) {
        meldung($('#msg-helfer'), fehlerText(e), true);
      } finally {
        knopf.disabled = false;
      }
    })();
  });

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
    const text = Object.assign(document.createElement('textarea'), { name: 'text', required: true, rows: 9, maxLength: 10000, placeholder: 'Hallo …\n\nViele Grüße\nMarino von Radgarage' });
    const vorschau = Object.assign(document.createElement('iframe'), { className: 'mail-vorschau', title: 'Vorschau der Mail', hidden: true });
    vorschau.setAttribute('sandbox', '');
    const msg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });
    const vorschauKnopf = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost', textContent: 'Vorschau' });
    const senden = Object.assign(document.createElement('button'), { type: 'submit', className: 'pill', textContent: 'Senden' });
    const akt = document.createElement('div');
    akt.className = 'aktionen';
    akt.append(senden, vorschauKnopf, Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost', textContent: 'Abbrechen', onclick: dialogZu }));
    f.append(liste, feld('An', an), feld('Von', von), feld('Betreff', betreff), feld('Text', text),
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

  // ---------- Statistik (Admin) ----------
  // Nur Summen vom Server (werkbank_statistik). Diagramme als eigenes SVG, ohne Bibliothek.

  let stTage = 90;
  let stDaten = null;
  const SERIE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
  const zahlDe = (n) => Number(n || 0).toLocaleString('de-DE');
  const prozent = (teil, ganz) => (ganz ? Math.round((teil / ganz) * 100) : 0);
  const THEMES = { bright: 'Bright', dark: 'Dark', standard: 'Standard', grandtour: 'Grand Tour', alpenpass: 'Alpenpass',
    nachtfahrt: 'Nachtfahrt', asphalt: 'Asphalt', wald: 'Wald', sand: 'Sand', pave: 'Pavé' };
  const VORSCHLAG_ARTEN = { ean: 'Barcode', teil: 'Teil', rad: 'Rad', korrektur: 'Korrektur' };
  const EREIGNISSE = { rad: 'Rad angelegt', wechsel: 'Teil gewechselt', region: 'Region gesetzt' };
  const LAENDER = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };

  function svgEl(name, attrs = {}) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }
  const tagText = (iso, lang) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE',
    lang ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });

  // Ab vier Monaten nach Wochen bündeln, sonst werden die Säulen zu dünn
  function buendeln(verlauf, summen, letzte = []) {
    if (!verlauf || !verlauf.length) return { punkte: [], woche: false };
    if (stTage <= 120) return { punkte: verlauf.map((v) => ({ ...v, text: tagText(v.tag, true) })), woche: false };
    const out = [];
    for (const v of verlauf) {
      const d = new Date(`${v.tag}T12:00:00`);
      const montag = new Date(d);
      montag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = montag.toISOString().slice(0, 10);
      let w = out[out.length - 1];
      if (!w || w.tag !== key) {
        w = { tag: key, text: `Woche ab ${tagText(key, true)}` };
        for (const f of summen) w[f] = 0;
        out.push(w);
      }
      for (const f of summen) w[f] += Number(v[f] || 0);
      for (const f of letzte) w[f] = v[f];
    }
    return { punkte: out, woche: true };
  }

  // Runde Achsenschritte (1, 2, 5 × 10^n)
  function skala(max) {
    if (max <= 4) { const top = Math.max(1, Math.ceil(max)); return { top, ticks: [...Array(top + 1).keys()] }; }
    const roh = max / 4;
    const p = 10 ** Math.floor(Math.log10(roh));
    const schritt = [1, 2, 5, 10].map((f) => f * p).find((s) => s >= roh);
    const top = Math.ceil(max / schritt) * schritt;
    const ticks = [];
    for (let t = 0; t <= top + 1e-9; t += schritt) ticks.push(t);
    return { top, ticks };
  }
  const achsenZahl = (n) => (n >= 1000 ? `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tsd.` : zahlDe(n));

  function karte(ziel, titel, unter, breit = false) {
    const box = document.createElement('div');
    box.className = `t diagramm${breit ? ' breit' : ''}`;
    const h = Object.assign(document.createElement('h3'), { textContent: titel });
    const p = Object.assign(document.createElement('p'), { className: 'fine', textContent: unter || '' });
    const plot = Object.assign(document.createElement('div'), { className: 'plot' });
    const det = Object.assign(document.createElement('details'), { className: 'als-tabelle' });
    det.append(Object.assign(document.createElement('summary'), { textContent: 'Als Tabelle' }));
    box.append(h, p, plot, det);
    ziel.append(box);
    return { plot, det };
  }

  function tabelle(det, kopf, zeilen) {
    const box = Object.assign(document.createElement('div'), { className: 'tabelle-box' });
    const t = document.createElement('table');
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (const k of kopf) tr.append(Object.assign(document.createElement('th'), { textContent: k }));
    thead.append(tr);
    const tbody = document.createElement('tbody');
    for (const z of zeilen) {
      const r = document.createElement('tr');
      for (const v of z) r.append(Object.assign(document.createElement('td'), { textContent: v }));
      tbody.append(r);
    }
    t.append(thead, tbody);
    box.append(t);
    det.append(box);
  }

  function tipp(plot) {
    let t = plot.querySelector('.tipp');
    if (!t) { t = Object.assign(document.createElement('div'), { className: 'tipp', hidden: true }); plot.append(t); }
    return t;
  }
  function tippZeigen(plot, x, y, titel, zeilen) {
    const t = tipp(plot);
    t.replaceChildren(Object.assign(document.createElement('b'), { textContent: titel }));
    for (const z of zeilen) {
      const d = document.createElement('div');
      const i = document.createElement('i');
      i.style.background = z.farbe;
      d.append(i, document.createTextNode(z.name), Object.assign(document.createElement('span'), { textContent: z.wert }));
      t.append(d);
    }
    t.hidden = false;
    const w = plot.clientWidth;
    const links = x + 14 + t.offsetWidth > w ? x - 14 - t.offsetWidth : x + 14;
    t.style.left = `${Math.max(0, links)}px`;
    t.style.top = `${Math.max(0, y - t.offsetHeight / 2)}px`;
  }

  // Zeitverlauf: Linie (eine oder mehrere Serien, gleiche Einheit) oder Säulen (eine Serie)
  function zeitDiagramm(plot, punkte, serien, { art = 'linie', flaeche = false, endwert = false } = {}) {
    plot.querySelector('svg')?.remove();
    plot.querySelector('.legende')?.remove();
    const n = punkte.length;
    if (!n) { plot.replaceChildren(Object.assign(document.createElement('p'), { className: 'leer-plot', textContent: 'Noch keine Daten.' })); return; }
    const W = Math.max(280, plot.clientWidth || 600);
    const H = 190;
    const max = Math.max(0, ...serien.flatMap((s) => punkte.map((p) => Number(p[s.feld] || 0))));
    const { top, ticks } = skala(max);
    const L = 8 + Math.max(...ticks.map((t) => achsenZahl(t).length)) * 7;
    const R = endwert ? 44 : 10;
    const T = 10;
    const B = 24;
    const iw = W - L - R;
    const ih = H - T - B;
    const band = iw / n;
    const xLinie = (i) => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const xSaeule = (i) => L + band * i + band / 2;
    const xPos = art === 'saeulen' ? xSaeule : xLinie;
    const y = (v) => T + ih - (v / top) * ih;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': serien.map((s) => s.name).join(', ') });

    for (const t of ticks) {
      svg.append(svgEl('line', { class: 'gitter', x1: L, x2: W - R, y1: y(t), y2: y(t) }));
      const tx = svgEl('text', { x: L - 8, y: y(t) + 4, 'text-anchor': 'end' });
      tx.textContent = achsenZahl(t);
      svg.append(tx);
    }
    const xIdx = n === 1 ? [0] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
    for (const i of xIdx) {
      const anker = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      const tx = svgEl('text', { x: art === 'saeulen' ? xSaeule(i) : xLinie(i), y: H - 6, 'text-anchor': art === 'saeulen' && n > 1 ? (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') : anker });
      if (art === 'saeulen' && n > 1 && i === 0) tx.setAttribute('x', L);
      if (art === 'saeulen' && n > 1 && i === n - 1) tx.setAttribute('x', W - R);
      tx.textContent = tagText(punkte[i].tag);
      svg.append(tx);
    }

    const kreuz = svgEl('line', { class: 'fadenkreuz', y1: T, y2: T + ih, visibility: 'hidden' });
    if (art === 'saeulen') {
      const s = serien[0];
      const bw = Math.max(1, Math.min(24, band * 0.7));
      const r = Math.min(4, bw / 2);
      const g = svgEl('g', { fill: s.farbe });
      punkte.forEach((p, i) => {
        const v = Number(p[s.feld] || 0);
        if (!v) return;
        const x0 = xSaeule(i) - bw / 2;
        const y0 = y(0);
        const y1 = y(v);
        const rr = Math.min(r, y0 - y1);
        g.append(svgEl('path', { d: `M${x0},${y0}V${y1 + rr}Q${x0},${y1} ${x0 + rr},${y1}H${x0 + bw - rr}Q${x0 + bw},${y1} ${x0 + bw},${y1 + rr}V${y0}Z` }));
      });
      svg.append(g);
    } else {
      serien.forEach((s) => {
        const pts = punkte.map((p, i) => [xLinie(i), y(Number(p[s.feld] || 0))]);
        const d = pts.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${yy.toFixed(1)}`).join('');
        if (flaeche) svg.append(svgEl('path', { d: `${d}L${pts[pts.length - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z`, fill: s.farbe, 'fill-opacity': 0.1 }));
        svg.append(svgEl('path', { d, fill: 'none', stroke: s.farbe, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      });
      if (endwert) {
        const s = serien[0];
        const v = Number(punkte[n - 1][s.feld] || 0);
        svg.append(svgEl('circle', { cx: xLinie(n - 1), cy: y(v), r: 4, fill: s.farbe, stroke: 'var(--surface2)', 'stroke-width': 2 }));
        const tx = svgEl('text', { class: 'wert', x: xLinie(n - 1) + 8, y: y(v) + 4 });
        tx.textContent = zahlDe(v);
        svg.append(tx);
      }
    }
    svg.append(kreuz);
    const punkteG = svgEl('g', { visibility: 'hidden' });
    const marker = serien.map((s) => {
      const c = svgEl('circle', { r: 4, fill: s.farbe, stroke: 'var(--surface2)', 'stroke-width': 2 });
      punkteG.append(c);
      return c;
    });
    if (art !== 'saeulen') svg.append(punkteG);

    const flaecheHit = svgEl('rect', { x: L, y: T, width: iw, height: ih, fill: 'transparent' });
    svg.append(flaecheHit);
    const zeige = (ev) => {
      const box = svg.getBoundingClientRect();
      const mx = ((ev.clientX - box.left) / box.width) * W;
      const i = art === 'saeulen'
        ? Math.min(n - 1, Math.max(0, Math.floor((mx - L) / band)))
        : Math.min(n - 1, Math.max(0, Math.round(n === 1 ? 0 : ((mx - L) / iw) * (n - 1))));
      const x = xPos(i);
      kreuz.setAttribute('x1', x);
      kreuz.setAttribute('x2', x);
      kreuz.setAttribute('visibility', 'visible');
      serien.forEach((s, k) => { marker[k].setAttribute('cx', x); marker[k].setAttribute('cy', y(Number(punkte[i][s.feld] || 0))); });
      punkteG.setAttribute('visibility', 'visible');
      const skal = box.width / W;
      tippZeigen(plot, x * skal, (T + ih / 2) * skal, punkte[i].text,
        serien.map((s) => ({ name: s.name, farbe: s.farbe, wert: zahlDe(punkte[i][s.feld]) })));
    };
    const weg = () => { kreuz.setAttribute('visibility', 'hidden'); punkteG.setAttribute('visibility', 'hidden'); tipp(plot).hidden = true; };
    flaecheHit.addEventListener('pointermove', zeige);
    flaecheHit.addEventListener('pointerdown', zeige);
    flaecheHit.addEventListener('pointerleave', weg);
    plot.prepend(svg);

    if (serien.length > 1) {
      const leg = Object.assign(document.createElement('div'), { className: 'legende' });
      for (const s of serien) {
        const sp = document.createElement('span');
        const i = document.createElement('i');
        i.style.background = s.farbe;
        sp.append(i, document.createTextNode(s.name));
        leg.append(sp);
      }
      plot.append(leg);
    }
  }

  // Waagerechte Balken: Beschriftung, Balken, Wert. Mit max als Anteil an einer Gesamtzahl (Spur dahinter)
  function balken(plot, zeilen, farbe = 'var(--c1)') {
    if (!zeilen.length) { plot.replaceChildren(Object.assign(document.createElement('p'), { className: 'leer-plot', textContent: 'Noch keine Daten.' })); return; }
    const max = Math.max(1, ...zeilen.map((z) => z.max ?? z.wert));
    const liste = document.createElement('div');
    liste.className = 'balken-liste';
    for (const z of zeilen) {
      const reihe = document.createElement('div');
      reihe.className = 'balken-reihe';
      const name = Object.assign(document.createElement('span'), { className: 'balken-name', textContent: z.label });
      const spur = Object.assign(document.createElement('span'), { className: `balken-spur${z.max != null ? ' mit-spur' : ''}` });
      if (z.max != null) spur.style.setProperty('--spur', `${(z.max / max) * 100}%`);
      const b = document.createElement('i');
      b.style.width = z.wert ? `max(3px, ${(z.wert / max) * 100}%)` : '0';
      b.style.background = farbe;
      spur.append(b);
      const wert = Object.assign(document.createElement('span'), { className: 'balken-wert', textContent: z.text ?? zahlDe(z.wert) });
      reihe.append(name, spur, wert);
      reihe.addEventListener('pointerenter', () => {
        const r = reihe.getBoundingClientRect();
        const p = plot.getBoundingClientRect();
        tippZeigen(plot, r.left - p.left + Math.min(r.width - 40, (spur.offsetLeft + b.offsetWidth)), r.top - p.top + r.height / 2,
          z.label, [{ name: z.tippName || 'Anzahl', farbe, wert: z.text ?? zahlDe(z.wert) }]);
      });
      reihe.addEventListener('pointerleave', () => { tipp(plot).hidden = true; });
      liste.append(reihe);
    }
    plot.replaceChildren(liste);
  }

  function kachelSt(farbe, titel, wert, unter) {
    const d = document.createElement('div');
    d.className = `kachel ${farbe}`;
    d.append(Object.assign(document.createElement('div'), { className: 'eyebrow', textContent: titel }),
      Object.assign(document.createElement('div'), { className: 'zahl-gross', textContent: wert }),
      Object.assign(document.createElement('p'), { className: 'fine', textContent: unter }));
    return d;
  }

  async function ladeStatistik() {
    meldung($('#msg-statistik'), 'Lade …');
    try {
      stDaten = await rpc('werkbank_statistik', { p_tage: stTage });
      meldung($('#msg-statistik'), '');
      zeichneStatistik();
    } catch (e) {
      meldung($('#msg-statistik'), fehlerText(e), true);
    }
    if (darf('system')) ladeSystem();
  }

  function zeichneStatistik() {
    const s = stDaten;
    if (!s) return;
    const k = s.konten || {};
    const pr = s.premium || {};
    const fa = s.familien || {};
    const ga = s.garagen || {};
    const ka = s.katalog || {};
    const be = s.beitraege || {};
    const pro = stTage > 120 ? 'pro Woche' : 'pro Tag';
    // Leere Tage vor dem ersten Eintrag abschneiden (mindestens eine Woche bleibt sichtbar)
    const tageAlle = (k.verlauf || []).length;
    const hatDaten = (i) => Number(k.verlauf?.[i]?.gesamt) > 0 || Number(pr.verlauf?.[i]?.neu) > 0
      || ['raeder_neu', 'teile_neu', 'eans_neu', 'geaendert'].some((f) => Number(ka.verlauf?.[i]?.[f]) > 0);
    let erster = 0;
    while (erster < tageAlle && !hatDaten(erster)) erster++;
    const ab = Math.max(0, Math.min(erster - 1, tageAlle - 7));
    const schneiden = (v) => (v || []).slice(ab);

    $('#st-kacheln').replaceChildren(
      kachelSt('k1', 'Konten', zahlDe(k.gesamt), `+${zahlDe(k.neu_7)} in 7 Tagen, +${zahlDe(k.neu_30)} in 30 Tagen`),
      kachelSt('k5', 'Aktiv in 7 Tagen', zahlDe(k.aktiv_7), `${prozent(k.aktiv_7, k.gesamt)} % aller Konten, heute ${zahlDe(k.aktiv_1)}`),
      kachelSt('k4', 'Premium', zahlDe(pr.gesamt), `${zahlDe(pr.kauf)} gekauft, ${zahlDe(pr.geschenk)} geschenkt`),
      kachelSt('k3', 'Familiengaragen', zahlDe(fa.anzahl), `${zahlDe(fa.mitglieder)} Mitglieder`),
      kachelSt('k2', 'Räder in Garagen', zahlDe(ga.raeder_gesamt), `in ${zahlDe(ga.mit_sicherung)} gesicherten Garagen`));

    // Nutzer
    const nutzer = $('#st-nutzer');
    nutzer.replaceChildren();
    const kv = buendeln(schneiden(k.verlauf), ['neu'], ['gesamt']);
    let c = karte(nutzer, 'Konten insgesamt', 'Registrierte Konten am Ende jedes Tages', true);
    zeitDiagramm(c.plot, kv.punkte, [{ name: 'Konten', feld: 'gesamt', farbe: SERIE[0] }], { flaeche: true, endwert: true });
    tabelle(c.det, [kv.woche ? 'Woche ab' : 'Tag', 'Neu', 'Gesamt'], kv.punkte.slice().reverse().map((p) => [tagText(p.tag, true), zahlDe(p.neu), zahlDe(p.gesamt)]));

    c = karte(nutzer, 'Neue Konten', `Registrierungen ${pro}`);
    zeitDiagramm(c.plot, kv.punkte, [{ name: 'Neue Konten', feld: 'neu', farbe: SERIE[0] }], { art: 'saeulen' });
    tabelle(c.det, [kv.woche ? 'Woche ab' : 'Tag', 'Neu'], kv.punkte.filter((p) => p.neu).reverse().map((p) => [tagText(p.tag, true), zahlDe(p.neu)]));

    const akt = [
      { label: 'Heute', wert: k.aktiv_1, max: k.gesamt, text: `${zahlDe(k.aktiv_1)} (${prozent(k.aktiv_1, k.gesamt)} %)` },
      { label: '7 Tage', wert: k.aktiv_7, max: k.gesamt, text: `${zahlDe(k.aktiv_7)} (${prozent(k.aktiv_7, k.gesamt)} %)` },
      { label: '30 Tage', wert: k.aktiv_30, max: k.gesamt, text: `${zahlDe(k.aktiv_30)} (${prozent(k.aktiv_30, k.gesamt)} %)` },
      { label: 'E-Mail bestätigt', wert: k.bestaetigt, max: k.gesamt, text: `${zahlDe(k.bestaetigt)} (${prozent(k.bestaetigt, k.gesamt)} %)` },
    ].map((z) => ({ ...z, tippName: 'Konten' }));
    c = karte(nutzer, 'Aktivität', 'Konten mit Anmeldung im Zeitraum, Spur = alle Konten');
    balken(c.plot, akt);
    tabelle(c.det, ['Zeitraum', 'Konten', 'Anteil'], akt.map((z) => [z.label, zahlDe(z.wert), `${prozent(z.wert, k.gesamt)} %`]));

    const anb = (k.anbieter || []).map((a) => ({ label: ANBIETER[a.anbieter] || a.anbieter, wert: a.anzahl, tippName: 'Konten' }));
    c = karte(nutzer, 'Anmeldung über', 'Ein Konto kann mehrere Wege verbunden haben');
    balken(c.plot, anb, SERIE[1]);
    tabelle(c.det, ['Weg', 'Konten'], anb.map((z) => [z.label, zahlDe(z.wert)]));

    const prz = [
      { label: 'Gekauft', wert: pr.kauf, max: k.gesamt },
      { label: 'Geschenkt', wert: pr.geschenk, max: k.gesamt },
    ].map((z) => ({ ...z, text: `${zahlDe(z.wert)} (${prozent(z.wert, k.gesamt)} %)`, tippName: 'Konten' }));
    c = karte(nutzer, 'Premium-Anteil', 'Spur = alle Konten');
    balken(c.plot, prz, SERIE[3]);
    tabelle(c.det, ['Herkunft', 'Konten', 'Anteil'], prz.map((z) => [z.label, zahlDe(z.wert), `${prozent(z.wert, k.gesamt)} %`]));

    const pv = buendeln(schneiden(pr.verlauf), ['neu']);
    c = karte(nutzer, 'Neue Premium-Konten', `${pro}, gekauft und geschenkt zusammen`, true);
    zeitDiagramm(c.plot, pv.punkte, [{ name: 'Premium neu', feld: 'neu', farbe: SERIE[3] }], { art: 'saeulen' });
    tabelle(c.det, [pv.woche ? 'Woche ab' : 'Tag', 'Neu'], pv.punkte.filter((p) => p.neu).reverse().map((p) => [tagText(p.tag, true), zahlDe(p.neu)]));

    // Garagen
    const gar = $('#st-garagen');
    gar.replaceChildren();
    const vt = (ga.verteilung || []).map((v) => ({ label: v.raeder === '1' ? '1 Rad' : `${v.raeder} Räder`, wert: v.konten, tippName: 'Garagen' }));
    c = karte(gar, 'Räder je Garage', 'Nur Konten mit gesicherter Garage');
    balken(c.plot, vt);
    tabelle(c.det, ['Räder', 'Garagen'], vt.map((z) => [z.label, zahlDe(z.wert)]));

    const ds = (ga.designs || []).map((d) => ({ label: THEMES[d.theme] || d.theme, wert: d.anzahl, tippName: 'Garagen' }));
    c = karte(gar, 'Designs', 'Gewähltes Farbschema in der App');
    balken(c.plot, ds, SERIE[2]);
    tabelle(c.det, ['Design', 'Garagen'], ds.map((z) => [z.label, zahlDe(z.wert)]));

    const reg = (ga.regionen || []).map((r) => ({ label: `${r.gebiet || 'ohne Angabe'} (${r.land || '–'})`, wert: r.anzahl, tippName: 'Garagen' }));
    c = karte(gar, 'Regionen', reg.length > 10 ? 'Die zehn häufigsten, alle in der Tabelle' : 'Freiwillig in der App angegeben');
    balken(c.plot, reg.slice(0, 10), SERIE[1]);
    tabelle(c.det, ['Land', 'Gebiet', 'Garagen'], (ga.regionen || []).map((r) => [LAENDER[r.land] || r.land || '–', r.gebiet || 'ohne Angabe', zahlDe(r.anzahl)]));

    const er = (s.ereignisse || []).map((e) => ({ label: EREIGNISSE[e.art] || e.art, wert: e.anzahl, letzte: e.letzte_30, text: `${zahlDe(e.anzahl)} (30 T.: ${zahlDe(e.letzte_30)})`, tippName: 'Meldungen' }));
    c = karte(gar, 'Anonyme Nutzungsstatistik', `${zahlDe(ga.statistik_an)} von ${zahlDe(ga.mit_sicherung)} Garagen haben sie eingeschaltet`);
    balken(c.plot, er, SERIE[2]);
    tabelle(c.det, ['Ereignis', 'Gesamt', 'Letzte 30 Tage'], er.map((z) => [z.label, zahlDe(z.wert), zahlDe(z.letzte)]));

    // Katalog und Mithilfe
    const kat = $('#st-katalog');
    kat.replaceChildren();
    const kv2 = buendeln(schneiden(ka.verlauf), ['raeder_neu', 'teile_neu', 'eans_neu', 'geaendert']);
    c = karte(kat, 'Katalogarbeit', `Einträge im Verlauf ${pro}, aus Werkbank und App`, true);
    const kSerien = [
      { name: 'Räder erfasst', feld: 'raeder_neu', farbe: SERIE[0] },
      { name: 'Teile angelegt', feld: 'teile_neu', farbe: SERIE[1] },
      { name: 'Barcodes dazu', feld: 'eans_neu', farbe: SERIE[2] },
      { name: 'Geändert', feld: 'geaendert', farbe: SERIE[3] },
    ];
    zeitDiagramm(c.plot, kv2.punkte, kSerien);
    tabelle(c.det, [kv2.woche ? 'Woche ab' : 'Tag', ...kSerien.map((x) => x.name)],
      kv2.punkte.filter((p) => kSerien.some((x) => p[x.feld])).reverse().map((p) => [tagText(p.tag, true), ...kSerien.map((x) => zahlDe(p[x.feld]))]));

    const fort = [
      { label: 'Räder geprüft', wert: ka.raeder_geprueft, max: ka.raeder, text: `${zahlDe(ka.raeder_geprueft)} von ${zahlDe(ka.raeder)}` },
      { label: 'Teile mit Barcode', wert: ka.teile_mit_ean, max: ka.teile, text: `${zahlDe(ka.teile_mit_ean)} von ${zahlDe(ka.teile)}` },
    ];
    c = karte(kat, 'Katalog-Stand', 'Anteil an allen Rädern und Teilen');
    balken(c.plot, fort.map((z) => ({ ...z, tippName: `${prozent(z.wert, z.max)} %` })), SERIE[0]);
    tabelle(c.det, ['', 'Anzahl', 'Gesamt', 'Anteil'], fort.map((z) => [z.label, zahlDe(z.wert), zahlDe(z.max), `${prozent(z.wert, z.max)} %`]));

    const offen = [
      { label: 'Vorschläge offen', wert: be.vorschlaege_offen },
      { label: 'Korrekturen offen', wert: be.korrekturen_offen },
      { label: 'Ergänzungen offen', wert: be.ergaenzungen_offen },
      ...(be.nach_art || []).map((a) => ({ label: `${VORSCHLAG_ARTEN[a.art] || a.art} (alle)`, wert: a.anzahl })),
    ].map((z) => ({ ...z, tippName: 'Einträge' }));
    c = karte(kat, 'Mithilfe aus der App', `${zahlDe(be.vorschlaege_gesamt)} Vorschläge insgesamt`);
    balken(c.plot, offen, SERIE[1]);
    tabelle(c.det, ['', 'Anzahl'], offen.map((z) => [z.label, zahlDe(z.wert)]));

    $('#st-stand').textContent = `Stand ${new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}. Nur Summen, keine einzelnen Personen. Tage nach deutscher Zeit.${ab ? ' Die Verläufe beginnen kurz vor dem ersten Eintrag.' : ''}`;
  }

  for (const b of $$('#st-zeitraum button')) {
    b.addEventListener('click', () => {
      stTage = Number(b.dataset.tage);
      for (const x of $$('#st-zeitraum button')) x.setAttribute('aria-checked', String(x === b));
      ladeStatistik();
    });
  }
  let stBreite = 0;
  window.addEventListener('resize', () => {
    if ($('[data-panel="statistik"]').hidden || !stDaten) return;
    const w = $('#st-nutzer').clientWidth;
    if (Math.abs(w - stBreite) < 20) return;
    stBreite = w;
    clearTimeout(window.stTimer);
    window.stTimer = setTimeout(zeichneStatistik, 150);
  });



  // ----- Shops (Admin) -----

  let shops = [];
  async function ladeShops() {
    try {
      const { data, error } = await sb.from('shops').select('id, name, suche, position').order('position');
      if (error) throw error;
      shops = data || [];
      zeichneShops();
    } catch (e) {
      meldung($('#msg-shops'), fehlerText(e), true);
    }
  }
  function zeichneShops() {
    const ul = $('#shop-liste');
    ul.replaceChildren(...shops.map((sh, i) => {
      const li = document.createElement('li');
      const links = document.createElement('div');
      links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: `${i + 1}. ${sh.name}` }),
        Object.assign(document.createElement('div'), { className: 'neben', textContent: sh.suche }));
      const akt = Object.assign(document.createElement('div'), { className: 'karten-knoepfe' });
      const k = (text, titel, fn, aus) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: text, title: titel, disabled: !!aus });
        b.setAttribute('aria-label', titel);
        b.addEventListener('click', fn);
        akt.append(b);
      };
      const schieben = async (um) => {
        const ids = shops.map((x) => x.id);
        [ids[i], ids[i + um]] = [ids[i + um], ids[i]];
        try { shops = (await rpc('shops_sortieren', { p_ids: ids })) || shops; zeichneShops(); } catch (e) { meldung($('#msg-shops'), fehlerText(e), true); }
      };
      k('↑', 'Nach oben', () => schieben(-1), i === 0);
      k('↓', 'Nach unten', () => schieben(1), i === shops.length - 1);
      const test = Object.assign(document.createElement('a'), { className: 'knopf-weich', textContent: 'Testen', target: '_blank', rel: 'noopener noreferrer',
        href: sh.suche.replace('{q}', encodeURIComponent('Shimano CN-M8100')) });
      akt.append(test);
      k('Ändern', 'Shop ändern', () => shopDialog(sh));
      li.append(links, akt);
      return li;
    }));
    if (!shops.length) ul.innerHTML = '<li class="leer">Noch keine Shops.</li>';
  }
  function shopDialog(sh) {
    const felder = [['name', 'Name'], ['suche', 'Such-Adresse mit {q}', 'url']];
    const f = formular(felder, sh || { suche: 'https://' }, sh ? 'Speichern' : 'Hinzufügen');
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      mitKnopf(f, async () => {
        const suche = f.suche.value.trim();
        if (!/^https:\/\//.test(suche) || !suche.includes('{q}')) throw new Error('Die Adresse muss mit https:// beginnen und {q} enthalten, z. B. https://shop.de/suche?q={q}');
        shops = (await rpc('shop_speichern', { p: { ...(sh ? { id: sh.id } : {}), name: f.name.value.trim(), suche } })) || shops;
        dialogZu();
        zeichneShops();
      });
    });
    const teile = [Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Später kommen hier die Partner-Links (z. B. von Awin) hinein.' }), f];
    if (sh) {
      const weg = Object.assign(document.createElement('div'), { className: 'trenner' });
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill gefahr klein', textContent: 'Shop entfernen' });
      const lmsg = Object.assign(document.createElement('div'), { className: 'msg', role: 'status' });
      b.addEventListener('click', async () => {
        if (!window.confirm(`${sh.name} aus der App entfernen?`)) return;
        try { shops = (await rpc('shop_loeschen', { p_id: sh.id })) || []; dialogZu(); zeichneShops(); } catch (e) { meldung(lmsg, fehlerText(e), true); }
      });
      weg.append(b, lmsg);
      teile.push(weg);
    }
    dialog(sh ? `${sh.name} ändern` : 'Shop hinzufügen', ...teile);
  }
  $('#shop-neu').addEventListener('click', () => shopDialog(null));

  // ----- Systemstatus in der Statistik -----
  // Grenzen des kostenlosen Supabase-Tarifs (Stand 2026): 500 MB Datenbank, 1 GB Dateien, 50.000 aktive Nutzer im Monat

  const GRENZEN = { db: 500 * 1024 * 1024, storage: 1024 * 1024 * 1024, mau: 50000 };
  const BUCKETS = { profilbilder: 'Profilbilder', dokumente: 'Dokumente' };
  function groesse(b) {
    const n = Number(b || 0);
    if (n < 1024 * 1024) return `${(n / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 })} kB`;
    if (n < 1024 ** 3) return `${(n / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
    return `${(n / 1024 ** 3).toLocaleString('de-DE', { maximumFractionDigits: 2 })} GB`;
  }
  async function ladeSystem() {
    const ziel = $('#st-system');
    ziel.replaceChildren();
    let sys;
    try { sys = await rpc('werkbank_system'); } catch (e) {
      ziel.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: fehlerText(e) }));
      return;
    }
    const speicher = (sys.storage || []).reduce((a, x) => a + Number(x.bytes || 0), 0);
    const anteil = (a, b) => Math.max(0, Math.min(100, (a / b) * 100));
    const prozentText = (a, b) => `${anteil(a, b).toLocaleString('de-DE', { maximumFractionDigits: anteil(a, b) < 1 ? 2 : 0 })} %`;
    let c = karte(ziel, 'Belegung', 'Gegen die Grenzen des kostenlosen Tarifs. Ab etwa 80 % lohnt sich der Blick auf ein Upgrade.');
    const zeilen = [
      { label: 'Datenbank', wert: sys.db_bytes, max: GRENZEN.db, text: `${groesse(sys.db_bytes)} von 500 MB` },
      { label: 'Dateien', wert: speicher, max: GRENZEN.storage, text: `${groesse(speicher)} von 1 GB` },
      { label: 'Aktive Nutzer (30 Tage)', wert: sys.mau_30, max: GRENZEN.mau, text: `${zahlDe(sys.mau_30)} von 50.000` },
    ];
    const warn = zeilen.some((z) => anteil(z.wert, z.max) >= 80);
    // Jede Zeile hat ihre eigene Einheit, deshalb als Anteil an der jeweiligen Grenze
    balken(c.plot, zeilen.map((z) => ({ ...z, wert: anteil(z.wert, z.max), max: 100, tippName: prozentText(z.wert, z.max) })), warn ? 'var(--warn)' : SERIE[3]);
    tabelle(c.det, ['', 'Belegt', 'Grenze', 'Anteil'], zeilen.map((z) => [z.label, z.label.startsWith('Aktive') ? zahlDe(z.wert) : groesse(z.wert), z.label.startsWith('Aktive') ? '50.000' : groesse(z.max), prozentText(z.wert, z.max)]));
    const tabs = (sys.tabellen || []).map((x) => ({ label: x.name, wert: Number(x.bytes || 0), text: groesse(x.bytes), tippName: `${zahlDe(x.zeilen)} Zeilen` }));
    c = karte(ziel, 'Größte Tabellen', `${zahlDe(sys.auth_konten)} Konten insgesamt`);
    balken(c.plot, tabs, SERIE[0]);
    tabelle(c.det, ['Tabelle', 'Größe', 'Zeilen'], (sys.tabellen || []).map((x) => [x.name, groesse(x.bytes), zahlDe(x.zeilen)]));
    const st = (sys.storage || []).map((x) => ({ label: BUCKETS[x.bucket] || x.bucket, wert: Number(x.bytes || 0), text: `${groesse(x.bytes)} · ${zahlDe(x.dateien)} ${Number(x.dateien) === 1 ? 'Datei' : 'Dateien'}`, tippName: 'Größe' }));
    if (st.length) {
      c = karte(ziel, 'Dateien nach Bereich', 'Profilbilder und Dokumente der Nutzer');
      balken(c.plot, st, SERIE[2]);
      tabelle(c.det, ['Bereich', 'Dateien', 'Größe'], (sys.storage || []).map((x) => [BUCKETS[x.bucket] || x.bucket, zahlDe(x.dateien), groesse(x.bytes)]));
    }
  }

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
})();
