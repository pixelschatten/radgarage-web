// Werkbank, Teil 3 von 11: Freigaben, eigene offene Räder, Feedback.
'use strict';

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
    const entscheiden = async (gut, grund = null) => {
      ok.disabled = nein.disabled = true;
      try {
        await rpc('katalog_freigeben', { p_rad_id: r.id, p_ok: gut, p_grund: grund });
        // Erst neu laden (leert die Meldung), dann melden
        await ladeOffen();
        meldung($('#msg-freigaben'), gut ? `${r.hersteller} ${r.modell} ist freigegeben.` : `${r.hersteller} ${r.modell} wurde abgelehnt.`);
      } catch (e) {
        meldung($('#msg-freigaben'), fehlerText(e), true);
        ok.disabled = nein.disabled = false;
      }
    };
    ok.addEventListener('click', () => entscheiden(true));
    nein.addEventListener('click', () => ablehnenFragen(div, akt, 'Rad und seine neuen Teile werden gelöscht.', (grund) => entscheiden(false, grund), !!r.von));
    akt.append(ok, nein);
    div.append(akt);
  }
  return div;
}

// Beim Ablehnen: Grund für den Helfer (sieht ihn in der App und unter „Meine offenen Räder“), dann endgültig
function ablehnenFragen(karte, akt, folge, fn, helfer) {
  if (karte.querySelector('.ablehnen-grund')) return;
  const box = Object.assign(document.createElement('div'), { className: 'ablehnen-grund' });
  const feld = Object.assign(document.createElement('textarea'), { rows: 2, maxLength: 500,
    placeholder: helfer ? 'Grund für den Helfer, z. B. „Quelle fehlt“ oder „gibt es schon als …“ (freiwillig)' : 'Grund (freiwillig)' });
  feld.setAttribute('aria-label', 'Grund fürs Ablehnen');
  const los = Object.assign(document.createElement('button'), { type: 'button', className: 'pill rot klein', textContent: 'Endgültig ablehnen' });
  const zurueck = Object.assign(document.createElement('button'), { type: 'button', className: 'pill ghost klein', textContent: 'Abbrechen' });
  const knoepfe = Object.assign(document.createElement('div'), { className: 'aktionen' });
  knoepfe.append(los, zurueck);
  box.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: folge }), feld, knoepfe);
  akt.hidden = true;
  karte.append(box);
  feld.focus();
  zurueck.addEventListener('click', () => { box.remove(); akt.hidden = false; });
  los.addEventListener('click', () => { los.disabled = true; fn(feld.value.trim() || null); });
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
    const entscheiden = async (gut, grund = null) => {
      ok.disabled = nein.disabled = true;
      try {
        await rpc('katalog_ergaenzung_freigeben', { p_id: g.id, p_ok: gut, p_grund: grund });
        // Erst neu laden (leert die Meldung), dann melden
        await ladeOffen();
        meldung($('#msg-freigaben'), gut ? `Ergänzung zu ${g.hersteller} ${g.modell} ist übernommen.` : `Ergänzung zu ${g.hersteller} ${g.modell} wurde abgelehnt.`);
      } catch (e) {
        meldung($('#msg-freigaben'), fehlerText(e), true);
        ok.disabled = nein.disabled = false;
      }
    };
    ok.addEventListener('click', () => entscheiden(true));
    nein.addEventListener('click', () => ablehnenFragen(div, akt, 'Die Ergänzung wird verworfen, neu angelegte Teile fallen weg.', (grund) => entscheiden(false, grund), !!g.von));
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
  $('#fg-zahl-helfer').textContent = helferOffen ? `(${helferOffen})` : '';
  $('#fg-zahl-app').textContent = app ? `(${app})` : '';
  $('#fg-zahl-web').textContent = web ? `(${web})` : '';
  hinweiseZeichnen();
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
  if (darf('katalog_pflegen')) ladeHelferTeam();
}

// Helfer-Team: je Person, wie es läuft (katalog_helfer_ueberblick)
async function ladeHelferTeam() {
  const tb = $('#ht-liste');
  try {
    const liste = (await rpc('katalog_helfer_ueberblick')) || [];
    $('#ht-zahl').textContent = `(${liste.length})`;
    tb.replaceChildren(...liste.map((h) => {
      const tr = document.createElement('tr');
      const wer = document.createElement('td');
      wer.append(h.email, ' ', Object.assign(document.createElement('span'), { className: 'fine', textContent: h.rolle ? ROLLEN[h.rolle] || h.rolle : 'ohne Rolle' }));
      tr.append(wer, ...[h.freigegeben, h.offen, h.abgelehnt, h.quote == null ? '–' : `${h.quote} %`,
        h.ergaenzungen ? `${h.ergaenzungen}${h.ergaenzungen_abgelehnt ? ` (${h.ergaenzungen_abgelehnt} abgelehnt)` : ''}` : '0',
        h.zuletzt ? new Date(h.zuletzt).toLocaleDateString('de-DE') : '–'].map((v) => Object.assign(document.createElement('td'), { textContent: String(v) })));
      return tr;
    }));
    if (!liste.length) tb.innerHTML = '<tr><td colspan="7" class="fine">Noch niemand im Team.</td></tr>';
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="7" class="fine"></td></tr>';
    tb.querySelector('td').textContent = fehlerText(e);
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
  // Abgelehntes mit Grund (katalog_meine_rueckmeldungen)
  try {
    const rm = (await rpc('katalog_meine_rueckmeldungen')) || [];
    $('#rueckmeldungen-box').hidden = !rm.length;
    $('#rueckmeldungen').replaceChildren(...rm.map((x) => {
      const li = Object.assign(document.createElement('li'), { className: 'rueckmeldung' });
      const d = document.createElement('div');
      d.append(Object.assign(document.createElement('div'), { className: 'name', textContent: x.titel }),
        Object.assign(document.createElement('span'), { className: 'neben',
          textContent: `${x.grund ? `„${x.grund}“` : 'Ohne Begründung abgelehnt'} · ${new Date(x.wann).toLocaleDateString('de-DE')}` }));
      li.append(d);
      return li;
    }));
  } catch { /* Rückmeldungen sind Beiwerk */ }
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
  $('#fb-zahl-neu').textContent = n ? `(${n})` : '';
  hinweiseZeichnen();
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
