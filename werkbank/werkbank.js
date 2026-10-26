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
    const bestaetigt = faktoren.totp.find((f) => f.status === 'verified');
    if (bestaetigt) {
      faktorId = bestaetigt.id;
      $('#f-faktor').reset();
      return zeige('s-faktor');
    }
    await einrichten(faktoren.all);
  }

  async function einrichten(alle) {
    // Abgebrochene Einrichtungen aufräumen, sonst stapeln sie sich
    for (const f of alle.filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Radgarage Werkbank', issuer: 'Radgarage' });
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
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: faktorId, code: form.code.value.trim() });
    if (error) throw error;
    await werkbank();
  }
  $('#f-einrichten').addEventListener('submit', (ev) => { ev.preventDefault(); mitKnopf(ev.target, () => faktorPruefen(ev.target)); });
  $('#f-faktor').addEventListener('submit', (ev) => { ev.preventDefault(); mitKnopf(ev.target, () => faktorPruefen(ev.target)); });

  $('#abmelden').addEventListener('click', async () => {
    await sb.auth.signOut();
    rolle = null;
    radTeile = [];
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
  }

  function tab(name) {
    for (const b of $$('nav.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== name;
    if (name === 'freigaben') ladeOffen();
    if (name === 'eigene') ladeEigene();
    if (name === 'helfer') ladeHelfer();
    if (name === 'teile' && !$('#tl-liste').children.length) ladeTeileliste(true);
    if (name === 'uebersicht') ladeUebersicht();
    if (name === 'konten') ladeKonten();
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

  function scanKnopf(wo, inp, danach) {
    if (!kameraMoeglich()) return;
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein scan-knopf', textContent: 'Scannen' });
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
      li.append(links, b);
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

  async function ladeOffen() {
    try {
      const { raeder, ergaenzungen } = await ladeAlleOffenen();
      const n = raeder.length + ergaenzungen.length;
      const zahl = $('#zahl-offen');
      zahl.hidden = !n;
      zahl.textContent = String(n);
      const box = $('#offen');
      box.replaceChildren(...raeder.map((r) => radKarte(r, true)), ...ergaenzungen.map((g) => ergaenzungKarte(g, true)));
      if (!n) box.innerHTML = '<p class="fine">Nichts offen. Alles freigegeben.</p>';
    } catch (e) {
      meldung($('#msg-freigaben'), fehlerText(e), true);
    }
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
      className: 'pill ghost klein', target: '_blank', rel: 'noopener noreferrer', textContent: 'Bei Bike24 suchen',
      href: 'https://www.bike24.de/suche?searchTerm=' + encodeURIComponent(`${t.marke} ${t.name}`),
    });
    const knoepfe = document.createElement('div');
    knoepfe.className = 'aktionen';
    knoepfe.style.justifyContent = 'flex-end';
    if (rolle === 'admin') {
      const bearb = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Bearbeiten' });
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
    const inp = Object.assign(document.createElement('input'), { inputMode: 'numeric', maxLength: 14, placeholder: 'Barcode ergänzen', required: true, pattern: '[0-9]{8,14}' });
    inp.setAttribute('aria-label', `Barcode zu ${t.marke} ${t.name}`);
    const b = Object.assign(document.createElement('button'), { type: 'submit', className: 'pill ghost klein', textContent: 'Speichern' });
    f.append(inp, b);
    scanKnopf(f, inp, () => f.requestSubmit());
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
        b.disabled = false;
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
    rad_erfasst: 'Rad erfasst', rad_freigegeben: 'Rad freigegeben', rad_abgelehnt: 'Rad abgelehnt', rad_geloescht: 'Rad gelöscht',
    rad_geaendert: 'Rad geändert', ergaenzung_erfasst: 'Ergänzung erfasst', ergaenzung_uebernommen: 'Ergänzung übernommen',
    ergaenzung_abgelehnt: 'Ergänzung abgelehnt', teil_angelegt: 'Teil angelegt', teil_geaendert: 'Teil geändert',
    teile_zusammengefuehrt: 'Teile zusammengeführt', ean_dazu: 'Barcode ergänzt', ean_weg: 'Barcode entfernt',
    rolle: 'Rolle gesetzt', rolle_weg: 'Rolle entfernt',
    konto_premium: 'Premium geändert', konto_gesperrt: 'Sperre geändert', konto_geloescht: 'Konto gelöscht',
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
  let ktZeige = 50;
  const datum = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
  const gesperrt = (k) => k.gesperrt_bis && new Date(k.gesperrt_bis) > new Date();

  async function ladeKonten() {
    meldung($('#msg-konten'), '');
    try {
      konten = (await rpc('konten_liste')) || [];
    } catch (e) {
      konten = [];
      meldung($('#msg-konten'), fehlerText(e), true);
    }
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
      const links = document.createElement('div');
      links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: k.email || `Konto ${String(k.id).slice(0, 8)}` }),
        Object.assign(document.createElement('div'), { className: 'fine', textContent: `Seit ${datum(k.registriert)} · zuletzt ${datum(k.letzte_anmeldung)} · ${k.raeder || 0} ${k.raeder === 1 ? 'Rad' : 'Räder'}` }));
      const chips = document.createElement('div');
      chips.className = 'eans';
      const chip = (text, art) => chips.append(Object.assign(document.createElement('span'), { className: 'chip' + (art ? ' ' + art : ''), textContent: text }));
      for (const a of k.anbieter || []) chip(ANBIETER[a] || a);
      if (k.premium) chip('Premium', 'gut');
      if (k.familie) chip(k.familie === 'besitzer' ? 'Familie gegründet' : 'In Familie');
      if (k.rolle) chip(k.rolle === 'admin' ? 'Admin' : 'Helfer');
      if (!k.bestaetigt) chip('nicht bestätigt', 'warn');
      if (gesperrt(k)) chip('gesperrt', 'warn');
      links.append(chips);
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Verwalten' });
      b.addEventListener('click', () => kontoVerwalten(k));
      li.append(links, b);
      return li;
    }));
    if (!liste.length) ul.innerHTML = '<li class="leer">Keine Konten gefunden.</li>';
    $('#kt-mehr').hidden = liste.length <= ktZeige;
  }
  $('#kt-suche').addEventListener('input', () => { ktZeige = 50; zeichneKonten(); });
  $('#kt-filter').addEventListener('change', () => { ktZeige = 50; zeichneKonten(); });
  $('#kt-mehr').addEventListener('click', () => { ktZeige += 50; zeichneKonten(); });

  function kontoVerwalten(k) {
    const ich = !!(email && k.email && k.email.toLowerCase() === email.toLowerCase());
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
      + (k.familie === 'besitzer' ? ` Hat die Familiengarage „${k.familie_name || ''}“ gegründet.` : k.familie ? ` Mitglied der Familiengarage „${k.familie_name || ''}“.` : '')
      + ` Kennung ${k.id}.`;

    const premium = block('Premium', k.premium ? `Aktiv (${k.premium === 'geschenk' ? 'geschenkt' : k.premium}).` : 'Nicht aktiv.',
      k.premium
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
    const loeschen = block('Konto löschen', 'Löscht das Konto mit Garage, Einstellungen und hochgeladenen Dokumenten. Das lässt sich nicht rückgängig machen. '
      + (k.familie === 'besitzer' ? 'Die Familiengarage geht an das am längsten beigetretene Mitglied. ' : '')
      + 'Zur Bestätigung die E-Mail-Adresse eintippen.',
      bestaetigen, knopf('Endgültig löschen', async () => {
        const soll = (k.email || 'LÖSCHEN').toLowerCase();
        if (bestaetigen.value.trim().toLowerCase() !== soll) { meldung(msg, 'Die eingetippte Adresse stimmt nicht.', true); return false; }
        await dokumenteLoeschen(k.id);
        await rpc('konto_loeschen_admin', { p_nutzer: k.id });
      }, 'pill gefahr klein'));

    const teile = [info, premium];
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

  // Wie die App: Dokumente zuerst, sonst blieben Dateien ohne Konto liegen
  async function dokumenteLoeschen(id) {
    const pfade = [];
    for (const ordner of ['rad', 'fitting']) {
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
  }

  // ----- Konto: Passwort -----

  $('#f-passwort').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    mitKnopf(f, async (msg) => {
      if (f.pw1.value !== f.pw2.value) throw new Error('Die beiden Passwörter sind nicht gleich.');
      if (f.pw1.value.length < 12) throw new Error('Bitte mindestens 12 Zeichen.');
      const { error } = await sb.auth.updateUser({ password: f.pw1.value });
      if (error) throw /different from the old/i.test(error.message) ? new Error('Das ist schon dein Passwort.') : error;
      f.reset();
      meldung(msg, 'Passwort gespeichert. Ab jetzt kannst du dich auch damit anmelden.');
    });
  });

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

  async function ladeHelfer() {
    const tb = $('#helfer-liste');
    try {
      const liste = (await rpc('helfer_liste')) || [];
      tb.replaceChildren(...liste.map((h) => {
        const tr = document.createElement('tr');
        const td = (text) => { const c = document.createElement('td'); c.textContent = text; return c; };
        const seit = h.seit ? new Date(h.seit).toLocaleDateString('de-DE') : '';
        const knopf = document.createElement('td');
        knopf.className = 'knopf';
        if (!h.ich) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'pill ghost klein';
          b.textContent = 'Entfernen';
          b.addEventListener('click', async () => {
            if (!window.confirm(`${h.email} entfernen? Bereits erfasste Räder bleiben im Katalog.`)) return;
            b.disabled = true;
            try {
              await rpc('helfer_setzen', { p_email: h.email, p_rolle: null });
              meldung($('#msg-helfer'), `${h.email} ist entfernt.`);
              ladeHelfer();
            } catch (e) {
              meldung($('#msg-helfer'), fehlerText(e), true);
              b.disabled = false;
            }
          });
          knopf.append(b);
        } else {
          knopf.textContent = 'Du';
        }
        const raeder = `${h.raeder || 0}` + (h.offen ? ` (${h.offen} offen)` : '');
        tr.append(td(h.email), td(h.rolle === 'admin' ? 'Admin' : 'Helfer'), td(raeder), td(seit), knopf);
        return tr;
      }));
    } catch (e) {
      meldung($('#msg-helfer'), fehlerText(e), true);
    }
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
        meldung($('#msg-helfer'), `${mail} ist jetzt ${r === 'admin' ? 'Admin' : 'Helfer'}. Gilt ab dem nächsten App-Start.`);
        f.reset();
        ladeHelfer();
      } catch (e) {
        meldung($('#msg-helfer'), fehlerText(e), true);
      } finally {
        knopf.disabled = false;
      }
    })();
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
