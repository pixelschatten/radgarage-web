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
  let rolle = null; // 'helfer' | 'admin'
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

    rolle = await rpc('helfer_rolle');
    if (rolle !== 'helfer' && rolle !== 'admin') {
      await sb.auth.signOut();
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
    await sb.auth.signOut();
    rolle = null;
    radTeile = [];
    $('#wer-bild').replaceWith(Object.assign(document.createElement('span'), { id: 'wer-bild', className: 'ava' }));
    ergaenzenEnde();
    zeige('s-mail');
  });

  // ---------- Werkbank ----------

  async function werkbank() {
    const admin = rolle === 'admin';
    for (const el of $$('.nur-admin')) el.hidden = !admin;
    for (const el of $$('.nur-helfer')) el.hidden = admin;
    $('#f-neues-teil').closest('.t').hidden = !admin;
    $('#hinweis-rolle').textContent = admin
      ? 'Du bist Admin: Was du speicherst, ist sofort im Katalog.'
      : 'Was du speicherst, sieht in der App erst jemand, wenn es freigegeben ist.';
    $('#f-rad').baujahr.max = new Date().getFullYear() + 1;
    $('#f-passwort').email.value = email;
    zeige('s-werkbank');
    tab('erfassen');
    ladeMarken();
    if (admin) ladeOffen();
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
    for (const b of $$('nav.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== name;
    if (name === 'freigaben') ladeOffen();
    if (name === 'eigene') ladeEigene();
    if (name === 'teile' && !$('#tl-liste').children.length) ladeTeileliste(true);
    if (name === 'uebersicht') ladeUebersicht();
    if (name === 'statistik') ladeStatistik();
    if (name === 'konten') ladeKonten();
    if (name === 'konto') ladeSicherheit();
  }
  for (const b of $$('nav.tabs button')) b.addEventListener('click', () => tab(b.dataset.tab));
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

  async function suche(text) {
    const nr = ++suchZaehler;
    const woerter = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}.\-/+]/gu, '')).filter((w) => w.length >= 2);
    const ul = $('#treffer');
    if (!woerter.length) { ul.replaceChildren(); $('#such-info').textContent = ''; return; }
    let q = sb.from('teile').select('id, marke, name, kategorie, richtpreis_eur').limit(30);
    for (const w of woerter) q = q.or(`marke.ilike.*${w}*,name.ilike.*${w}*,kategorie.ilike.*${w}*`);
    const { data, error } = await q;
    if (nr !== suchZaehler) return;
    if (error) { $('#such-info').textContent = fehlerText(error); return; }
    $('#such-info').textContent = data.length ? (data.length === 30 ? 'Mehr als 30 Treffer, genauer suchen.' : '') : 'Nichts gefunden. Unten neu anlegen.';
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
      });
      li.append(b);
      return li;
    }));
  }

  $('#f-teil').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const ean = f.ean.value.replace(/\D/g, '');
    const neu = { marke: f.marke.value.trim(), name: f.name.value.trim(), kategorie: f.kategorie.value };
    if (f.preis.value) neu.preis = Number(f.preis.value);
    radTeile.push({ neu, name: `${neu.marke} ${neu.name}`, kategorie: neu.kategorie, ean });
    zeichneTeile();
    f.reset();
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
      if (ergaenzen) {
        const name = ergaenzen.rad.name;
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
        if (rolle === 'admin') ladeOffen();
        return;
      }
      const fehlt = fehlendePflichtteile();
      if (teile.length < MIN_TEILE) throw new Error(`Bitte mindestens ${MIN_TEILE} Teile eintragen, sonst hilft der Eintrag beim Teilekauf kaum.`);
      if (fehlt.wichtig.length && !window.confirm(`Es fehlen noch: ${fehlt.wichtig.join(', ')}.\n\nTrotzdem speichern?`)) return;
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
      if (rolle === 'admin') ladeOffen();
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
      let punkte = woerter.filter((w) => hay.includes(w)).length;
      // Modellnummern (mit Ziffern) zählen doppelt
      punkte += woerter.filter((w) => /\d/.test(w) && w.length >= 3 && hay.includes(w)).length;
      if (kategorie && t.kategorie === kategorie) punkte += 1.5;
      return { ...t, punkte };
    }).sort((a, b) => b.punkte - a.punkte || a.name.length - b.name.length).slice(0, 6);
    return { zeile, text, kategorie, kandidaten };
  }

  let einfuegenErgebnis = [];
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
    const sicher = einfuegenErgebnis.filter((e) => e.kandidaten[0] && e.kandidaten[0].punkte >= 2.5).length;
    info.textContent = `${sicher} von ${zeilen.length} Zeilen sicher zugeordnet. Bitte kurz prüfen.`;
    $('#einfuegen-ergebnis').replaceChildren(...einfuegenErgebnis.map((e, i) => {
      const li = document.createElement('li');
      li.append(Object.assign(document.createElement('div'), { className: 'zeilentext', textContent: e.zeile }));
      const sel = document.createElement('select');
      sel.dataset.i = String(i);
      sel.setAttribute('aria-label', `Katalogteil für ${e.text}`);
      sel.append(new Option('Nicht übernehmen', ''));
      for (const k of e.kandidaten) sel.append(new Option(`${k.marke} ${k.name} · ${k.kategorie}`, k.id));
      const beste = e.kandidaten[0];
      sel.value = beste && beste.punkte >= 2.5 ? beste.id : '';
      li.append(sel);
      if (!e.kandidaten.length) li.append(Object.assign(document.createElement('div'), { className: 'zeilentext', textContent: 'Nichts gefunden. Unten unter „Neu anlegen“ eintragen.' }));
      return li;
    }));
    $('#einfuegen-fertig').hidden = !einfuegenErgebnis.length;
  });

  $('#einfuegen-uebernehmen').addEventListener('click', () => {
    let n = 0;
    for (const sel of $$('#einfuegen-ergebnis select')) {
      const e = einfuegenErgebnis[Number(sel.dataset.i)];
      const t = e && e.kandidaten.find((k) => k.id === sel.value);
      if (!t || radTeile.some((x) => x.teil_id === t.id)) continue;
      if (ergaenzen && ergaenzen.vorhanden.some((x) => x.id === t.id)) continue;
      radTeile.push({ teil_id: t.id, name: `${t.marke} ${t.name}`, kategorie: t.kategorie, ean: '' });
      n += 1;
    }
    zeichneTeile();
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
    const app = appGruppen.length;
    const n = helferOffen + app;
    const zahl = $('#zahl-offen');
    zahl.hidden = !n;
    zahl.textContent = String(n);
    $('#fg-zahl-helfer').textContent = helferOffen ? `(${helferOffen})` : '';
    $('#fg-zahl-app').textContent = app ? `(${app})` : '';
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

  // ----- Vorschläge aus der App (Admin) -----
  // Gleiche Meldungen werden zu einer Karte zusammengefasst, die Zahl der Geräte zeigt, wie oft etwas gemeldet wurde.

  const GRUND_TEXT = { falsch: 'Teil stimmt nicht', fehlt: 'Teil fehlt', zuviel: 'Teil nicht verbaut', rad: 'Name oder Baujahr', sonst: 'Etwas anderes' };
  const ART_TEXT = { korrektur: 'Korrektur', rad: 'Neues Rad', ean: 'Barcode', teil: 'Neues Teil' };
  const ART_REIHE = ['korrektur', 'rad', 'ean', 'teil'];
  let appGruppen = [];
  let appNamen = new Map();
  let appFilter = '';
  let fgAnsicht = 'helfer';
  let appUebernahme = null; // { ids, titel } solange ein App-Rad im Erfassen-Formular steht
  const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();

  function appSchluessel(v) {
    const d = v.daten || {};
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
      if (!g) { g = { art: v.art, schluessel: k, eintraege: [], geraete: new Set() }; map.set(k, g); }
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
    const zeigen = appGruppen.filter((g) => !appFilter || g.art === appFilter);
    for (const b of $$('#app-filter button')) {
      const n = appGruppen.filter((g) => !b.dataset.art || g.art === b.dataset.art).length;
      b.textContent = `${b.textContent.replace(/\s*\(\d+\)$/, '')}${n ? ` (${n})` : ''}`;
    }
    zeigen.sort((a, b) => ART_REIHE.indexOf(a.art) - ART_REIHE.indexOf(b.art));
    box.replaceChildren(...zeigen.map(appKarte));
    if (!zeigen.length) box.innerHTML = '<p class="fine">Nichts offen aus der App.</p>';
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
    rechts.append(Object.assign(document.createElement('span'), { className: `chip${n > 1 ? ' gut' : ''}`, textContent: n === 1 ? '1 Gerät' : `${n} Geräte` }));
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
    for (const b of $$('#fg-ansicht button')) b.setAttribute('aria-checked', String(b.dataset.ansicht === wahl));
    $('#offen').hidden = wahl !== 'helfer';
    $('#app-box').hidden = wahl !== 'app';
    if (wahl === 'app') zeichneApp();
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
    if (rolle === 'admin') {
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
        if (rolle === 'admin') {
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
  function dialogZu() { $('#dlg').hidden = true; $('#dlg-inhalt').replaceChildren(); }
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
    dialog(`${data.hersteller} ${data.modell} (${data.baujahr}) ändern`,
      Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Die Kennung des Rads bleibt gleich, Garagen auf den Handys stimmen also weiter.' }), f);
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
    dialog(`${data.marke} ${data.name}`, f, zus);
  }

  // ----- Übersicht, Baustellen, Verlauf -----

  const VERLAUF_TEXTE = {
    vorschlag_uebernommen: 'App-Vorschlag übernommen', vorschlag_abgelehnt: 'App-Vorschlag abgelehnt',
    rad_erfasst: 'Rad erfasst', rad_freigegeben: 'Rad freigegeben', rad_abgelehnt: 'Rad abgelehnt', rad_geloescht: 'Rad gelöscht',
    rad_geaendert: 'Rad geändert', ergaenzung_erfasst: 'Ergänzung erfasst', ergaenzung_uebernommen: 'Ergänzung übernommen',
    ergaenzung_abgelehnt: 'Ergänzung abgelehnt', teil_angelegt: 'Teil angelegt', teil_geaendert: 'Teil geändert',
    teile_zusammengefuehrt: 'Teile zusammengeführt', ean_dazu: 'Barcode ergänzt', ean_weg: 'Barcode entfernt',
    rolle: 'Rolle gesetzt', rolle_weg: 'Rolle entfernt',
    konto_premium: 'Premium geändert', konto_gesperrt: 'Sperre geändert', konto_geloescht: 'Konto gelöscht',
    wiederherstellung_benutzt: 'Wiederherstellungscode benutzt', zwei_faktor_zurueckgesetzt: 'Zweiter Faktor zurückgesetzt',
  };
  let baustellen = [];
  let bsZeige = 30;
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
      $('#ue-marken').replaceChildren(...marken.map((m) => {
        const tr = document.createElement('tr');
        for (const v of [m.hersteller, zahl(m.raeder), Number(m.teile_schnitt || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })]) {
          tr.append(Object.assign(document.createElement('td'), { textContent: v }));
        }
        return tr;
      }));
      if (!markenGeladen) {
        for (const m of marken.map((x) => x.hersteller).sort((a, b) => a.localeCompare(b, 'de'))) $('#bs-marke').append(new Option(m, m));
        markenGeladen = true;
      }
    } catch (e) {
      meldung($('#msg-uebersicht'), fehlerText(e), true);
    }
    ladeBaustellen();
    ladeVerlauf();
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

  function zeichneBaustellen() {
    const filter = $('#bs-filter').value;
    const liste = baustellen.filter((r) => (filter === 'wenig' ? r.teile < 8 : filter === 'quelle' ? !r.quelle : filter === 'uvp' ? !r.uvp : true));
    $('#bs-zahl').textContent = `(${liste.length.toLocaleString('de-DE')})`;
    const ul = $('#bs-liste');
    ul.replaceChildren(...liste.slice(0, bsZeige).map((r) => {
      const li = document.createElement('li');
      const links = document.createElement('div');
      links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: `${r.hersteller} ${r.modell} (${r.baujahr})` }));
      const neben = document.createElement('div');
      neben.className = 'eans';
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
    $('#bs-mehr').hidden = liste.length <= bsZeige;
  }
  $('#bs-marke').addEventListener('change', ladeBaustellen);
  $('#bs-filter').addEventListener('change', () => { bsZeige = 30; zeichneBaustellen(); });
  $('#bs-mehr').addEventListener('click', () => { bsZeige += 30; zeichneBaustellen(); });

  async function ladeVerlauf() {
    const tb = $('#ue-verlauf');
    try {
      const liste = (await rpc('katalog_verlauf', { p_limit: vlLimit })) || [];
      tb.replaceChildren(...liste.map((v) => {
        const tr = document.createElement('tr');
        const wann = new Date(v.wann);
        tr.append(Object.assign(document.createElement('td'), { className: 'wann', textContent: `${wann.toLocaleDateString('de-DE')} ${wann.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` }),
          Object.assign(document.createElement('td'), { textContent: v.von || '–' }),
          Object.assign(document.createElement('td'), { textContent: `${VERLAUF_TEXTE[v.art] || v.art}${v.text ? ': ' + v.text : ''}` }));
        return tr;
      }));
      if (!liste.length) tb.innerHTML = '<tr><td colspan="3" class="fine">Noch keine Einträge.</td></tr>';
      $('#vl-mehr').hidden = liste.length < vlLimit || vlLimit >= 500;
    } catch (e) {
      tb.innerHTML = '';
      meldung($('#msg-uebersicht'), fehlerText(e), true);
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
      [konten, helfer] = await Promise.all([rpc('konten_liste'), rpc('helfer_liste')]);
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
    const such = $('#kt-suche').value.trim().toLowerCase();
    const filter = $('#kt-filter').value;
    const liste = konten.filter((k) => (!such || (k.email || '').toLowerCase().includes(such) || String(k.id).startsWith(such))
      && (filter === 'premium' ? k.premium : filter === 'familie' ? k.familie : filter === 'rolle' ? k.rolle
        : filter === 'gesperrt' ? gesperrt(k) : filter === 'unbestaetigt' ? !k.bestaetigt : true));
    $('#kt-zahl').textContent = `(${liste.length.toLocaleString('de-DE')})`;
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
      if (k.rolle) chip(k.rolle === 'admin' ? 'Admin' : 'Helfer');
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

    const rolleWahl = document.createElement('select');
    rolleWahl.setAttribute('aria-label', 'Rolle in der Werkbank');
    rolleWahl.style.width = 'auto';
    for (const [w, t] of [['', 'Keine'], ['helfer', 'Helfer'], ['admin', 'Admin']]) rolleWahl.append(new Option(t, w));
    rolleWahl.value = k.rolle || '';
    const rolleBlock = k.email
      ? block('Rolle in der Werkbank', 'Admins sehen auch diese Kontenverwaltung.', rolleWahl, knopf('Übernehmen', async () => {
        const neu = rolleWahl.value || null;
        if (neu === (k.rolle || null)) return false;
        if (neu === 'admin' && !window.confirm(`${k.email} zum Admin machen? Admins dürfen auch Konten verwalten und löschen.`)) return false;
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

    const teile = [info, premium];
    if (zweiFaktor && !ich) teile.push(zweiFaktor);
    if (!ich) teile.push(sperre);
    if (rolleBlock && !ich) teile.push(rolleBlock);
    if (!ich) teile.push(loeschen);
    else teile.push(Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Das ist dein eigenes Konto. Sperren, Rolle und Löschen gehen hier nicht.' }));
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
  setInterval(async () => {
    if ($('#s-werkbank').hidden) return;
    if (Date.now() - letzteAktivitaet < Number($('#auto-ab').value) * 60000) return;
    await sb.auth.signOut();
    rolle = null;
    radTeile = [];
    $('#wer-bild').replaceWith(Object.assign(document.createElement('span'), { id: 'wer-bild', className: 'ava' }));
    ergaenzenEnde();
    dialogZu();
    zeige('s-mail');
    meldung($('#f-mail .msg'), 'Du wurdest nach längerer Pause automatisch abgemeldet.');
  }, 30000);

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
    const ohne = helfer.filter((h) => !mitKonto.has(h.email.toLowerCase()));
    const zahl = helfer.length;
    $('#helfer-zusammenfassung').textContent = `${zahl} ${zahl === 1 ? 'Rolle' : 'Rollen'} vergeben` + (ohne.length ? `, ${ohne.length} noch ohne Konto` : '');
    const ul = $('#helfer-ohne');
    ul.replaceChildren(...ohne.map((h) => {
      const li = document.createElement('li');
      const links = document.createElement('div');
      links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: h.email }),
        Object.assign(document.createElement('div'), { className: 'neben', textContent: `${h.rolle === 'admin' ? 'Admin' : 'Helfer'} seit ${datum(h.seit)}` }));
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: 'Zurückziehen' });
      b.addEventListener('click', async () => {
        if (!window.confirm(`Freischaltung für ${h.email} zurückziehen?`)) return;
        b.disabled = true;
        try { await rpc('helfer_setzen', { p_email: h.email, p_rolle: null }); ladeKonten(); } catch (e) { meldung($('#msg-helfer'), fehlerText(e), true); b.disabled = false; }
      });
      li.append(zeile, b);
      return li;
    }));
    if (!ohne.length) ul.innerHTML = '<li class="leer">Keine offenen Einladungen.</li>';
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
        meldung($('#msg-helfer'), `${mail} ist jetzt ${r === 'admin' ? 'Admin' : 'Helfer'}. Gilt ab der nächsten Anmeldung.`);
        f.reset();
        ladeKonten();
      } catch (e) {
        meldung($('#msg-helfer'), fehlerText(e), true);
      } finally {
        knopf.disabled = false;
      }
    })();
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
