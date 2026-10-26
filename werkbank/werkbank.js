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

  $('#f-mail').addEventListener('submit', (ev) => {
    ev.preventDefault();
    mitKnopf(ev.target, async () => {
      email = ev.target.email.value.trim().toLowerCase();
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
    zeige('s-mail');
  });

  // ---------- Werkbank ----------

  async function werkbank() {
    const admin = rolle === 'admin';
    for (const el of $$('.nur-admin')) el.hidden = !admin;
    for (const el of $$('.nur-helfer')) el.hidden = admin;
    $('#hinweis-rolle').textContent = admin
      ? 'Du bist Admin: Was du speicherst, ist sofort im Katalog.'
      : 'Was du speicherst, sieht in der App erst jemand, wenn es freigegeben ist.';
    $('#f-rad').baujahr.max = new Date().getFullYear() + 1;
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

  for (const k of TEIL_KATEGORIEN) $('#teil-kategorie').append(new Option(k, k));

  function zeichneTeile() {
    const ul = $('#rad-teile');
    $('#teile-zahl').textContent = radTeile.length ? `(${radTeile.length})` : '';
    if (!radTeile.length) {
      ul.innerHTML = '<li class="leer">Noch keine Teile. Unter „Teil hinzufügen“ suchen oder neu anlegen. Barcode ist immer freiwillig.</li>';
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
      const ergebnis = await rpc('katalog_rad_erfassen', {
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

  async function ladeOffen() {
    try {
      const liste = (await rpc('katalog_offen')) || [];
      const zahl = $('#zahl-offen');
      zahl.hidden = !liste.length;
      zahl.textContent = String(liste.length);
      const box = $('#offen');
      box.replaceChildren(...liste.map((r) => radKarte(r, true)));
      if (!liste.length) box.innerHTML = '<p class="fine">Nichts offen. Alles freigegeben.</p>';
    } catch (e) {
      meldung($('#msg-freigaben'), fehlerText(e), true);
    }
  }

  async function ladeEigene() {
    const box = $('#eigene');
    try {
      const liste = (await rpc('katalog_offen')) || [];
      box.replaceChildren(...liste.map((r) => radKarte(r, false)));
      if (!liste.length) box.innerHTML = '<p class="fine">Keine offenen Räder.</p>';
    } catch (e) {
      box.textContent = fehlerText(e);
    }
  }

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
