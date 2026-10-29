// Werkbank, Teil 8 von 11: Konten, eigenes Konto und Sicherheit, Helfer verwalten.
'use strict';

// ----- Registrierte Konten -----

const ANBIETER = { apple: 'Apple', google: 'Google', email: 'E-Mail' };
let konten = [];
let bilder = {};
let ktZeige = 50;
const datum = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
const gesperrt = (k) => k.gesperrt_bis && new Date(k.gesperrt_bis) > new Date();

let ktWorte = {};
async function ladeKontoWorte() {
  if (!darf('konten_betreuen')) return;
  try { ktWorte = (await rpc('crm_schlagwort_karte')) || {}; } catch { ktWorte = {}; }
  ladeSchlagworte().then(() => {
    const wahl = $('#kt-wort');
    const vorher = wahl.value;
    wahl.replaceChildren(new Option('Alle', ''), ...schlagworte.map((w) => new Option(`#${w.wort}`, w.wort)));
    wahl.value = schlagworte.some((w) => w.wort === vorher) ? vorher : '';
  });
}
const worteVon = (k) => ktWorte[(k.email || '').toLowerCase()] || [];

async function ladeKonten() {
  meldung($('#msg-konten'), '');
  const worteLaden = ladeKontoWorte();
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
  await worteLaden;
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
  const wort = $('#kt-wort').value;
  $('#kt-sammel').hidden = !(wort && darf('konten_verwalten'));
  $('#kt-sammel').textContent = `Sammelmail an #${wort}`;
}
function kontenGefiltert() {
  const such = $('#kt-suche').value.trim().toLowerCase();
  const filter = $('#kt-filter').value;
  const wort = $('#kt-wort').value;
  // „#tester“ in der Suche sucht nach Schlagwort
  const suchWort = such.startsWith('#') ? such.slice(1) : null;
  return konten.filter((k) => (!such || (suchWort != null ? worteVon(k).some((w) => w.toLowerCase().startsWith(suchWort))
      : (k.email || '').toLowerCase().includes(such) || String(k.id).startsWith(such)))
    && (!wort || worteVon(k).includes(wort))
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
    if (darf('konten_betreuen') && k.email) zeile.append(ktAuswahl.haken(k.email.toLowerCase()));
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
    for (const w of worteVon(k)) chip(`#${w}`, 'wort');
    links.append(chips);
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Verwalten' });
    b.addEventListener('click', () => kontoVerwalten(k));
    li.append(zeile, b);
    return li;
  }));
  if (!liste.length) ul.innerHTML = '<li class="leer">Keine Konten gefunden.</li>';
  $('#kt-mehr').hidden = liste.length <= ktZeige;
  ktAuswahl.anzeigen(liste.filter((k) => k.email).map((k) => k.email.toLowerCase()));
}
$('#kt-suche').addEventListener('input', () => { ktZeige = 50; zeichneKonten(); });
$('#kt-filter').addEventListener('change', () => { ktZeige = 50; zeichneKonten(); });
$('#kt-wort').addEventListener('change', () => { ktZeige = 50; zeichneKonten(); });
const ktAuswahl = wortAuswahl($('#kt-liste'), async () => { await ladeKontoWorte(); zeichneKonten(); });
// Aus den Konten direkt zur Sammelmail an ein Schlagwort (CRM, Kontakte, Alle + Schlagwort)
$('#kt-sammel').addEventListener('click', async () => {
  const wort = $('#kt-wort').value;
  crmAnsicht = 'kontakte';
  tab('crm');
  $('#ko-gruppe').value = 'alle';
  await ladeSchlagworte();
  $('#ko-wort').value = wort;
  await ladeKontakte();
  sammelmailEditor();
});
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
  if (darf('konten_betreuen') && k.email) {
    teile.push(block('Schlagworte', 'Nur intern, z. B. Tester, Familie, Freunde. Danach filtern in Konten, Kontakte und Postfach (#Wort), Sammelmail je Schlagwort.',
      schlagwortEditor(k.email, worteVon(k), (w) => { ktWorte[k.email.toLowerCase()] = w; zeichneKonten(); })));
  }
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
          href: '#crm', className: 'fine', textContent: `${datum(m.letzte)}: „${m.betreff || '(ohne Betreff)'}“${m.ungelesen ? ' · neu' : ''}`,
          onclick: (ev) => { ev.preventDefault(); dialogZu(); unterhaltung(m.id); },
        }));
        return li;
      }));
    }).catch(() => {});
  }
  // Tägliche Erinnerung: Der Super-Admin schaltet sie für Admins an und aus, jeder selbst über das Zahnrad (Konto)
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
    Promise.all([sb.auth.mfa.listFactors(), sb.auth.getUser()])
      .then(([r, u]) => r.data ? standardZuerst(r.data.totp.filter((f) => f.status === 'verified'), u.data && u.data.user).map((f, i, l) => ({ ...f, standard: l.length > 1 && i === 0 })) : []),
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
    const name = Object.assign(document.createElement('div'), { className: 'name', textContent: f.friendly_name || 'Authenticator' });
    if (f.standard) name.append(' ', Object.assign(document.createElement('span'), { className: 'marke neu', textContent: 'Standard', title: 'Steht beim Anmelden oben und ist vorausgewählt' }));
    links.append(name,
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
      if (f.standard) await sb.auth.updateUser({ data: { zwei_faktor_standard: null } });
      ladeSicherheit();
    });
    const akt = document.createElement('div');
    akt.className = 'aktionen';
    if (faktoren.length > 1 && !f.standard) {
      const st = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Als Standard', title: 'Beim Anmelden oben und vorausgewählt' });
      st.addEventListener('click', async () => {
        st.disabled = true;
        const { error } = await sb.auth.updateUser({ data: { zwei_faktor_standard: f.id } });
        if (error) { window.alert(fehlerText(error)); st.disabled = false; return; }
        ladeSicherheit();
      });
      akt.append(st);
    }
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
    meldung($('#hinweis-rolle'), `${$('#hinweis-rolle').textContent} Tipp: Lege über das Zahnrad oben rechts Wiederherstellungscodes an, falls dein Handy einmal weg ist.`);
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
  neuDabei();
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
