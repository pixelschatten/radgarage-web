// Werkbank, Teil 7 von 11: Übersicht: Baustellen, Verlauf, Papierkorb, Läuft alles?, App steuern, Gesucht-Liste.
'use strict';

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
  rueckgaengig: 'Rückgängig gemacht',
  app_steuerung: 'App steuern', crm_sammelmail: 'Sammelmail', datenauskunft: 'Datenschutz', premium_geschenkt: 'Store-Start',
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
  ladeBetrieb();
  if (darf('system')) { ladeSteuerung(); ladeTester(); }
  ladeFuellrunde();
  ladeNachfrage();
  ladeQualitaet();
  ladePapierkorb();
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
      const ende = document.createElement('td');
      if (v.rueckgaengig) ende.append(rueckgaengigKnopf(v, 'Rückgängig'));
      else if (v.rueckgaengig_am) ende.append(Object.assign(document.createElement('span'), { className: 'chip', textContent: 'zurückgedreht' }));
      tr.classList.toggle('zurueck', !!v.rueckgaengig_am);
      tr.append(Object.assign(document.createElement('td'), { className: 'wann', textContent: `${wann.toLocaleDateString('de-DE')} ${wann.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` }),
        Object.assign(document.createElement('td'), { textContent: v.von || '–' }),
        Object.assign(document.createElement('td'), { textContent: verlaufText(v) }), ende);
      return tr;
    }));
    if (!liste.length) tb.innerHTML = `<tr><td colspan="4" class="fine">${verlauf.length ? 'Keine passenden Einträge, „Mehr zeigen“ lädt ältere.' : 'Noch keine Einträge.'}</td></tr>`;
  }
}
$('#vl-mehr').addEventListener('click', () => { vlLimit = Math.min(500, vlLimit + 100); ladeVerlauf(); });

// „rueckgaengig“ trägt die ursprüngliche Art vorn im Text (rad_geloescht: Cube …)
function verlaufText(v) {
  const teile = (v.text || '').split(': ');
  // Vorn stehen bei Rückgängig die Arten der zurückgedrehten Einträge, auch mehrfach (rueckgaengig: rad_geaendert: …)
  for (let i = 0; v.art === 'rueckgaengig' && i < teile.length - 1 && VERLAUF_TEXTE[teile[i]]; i++) {
    teile[i] = teile[i] === 'rueckgaengig' ? 'Rückgängig' : VERLAUF_TEXTE[teile[i]];
  }
  const text = teile.join(': ');
  return `${VERLAUF_TEXTE[v.art] || v.art}${text ? ': ' + text : ''}`;
}

// ----- Rückgängig und Papierkorb (katalog_rueckgaengig, katalog_papierkorb) -----

function rueckgaengigKnopf(v, titel, ziel = null) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: titel });
  b.addEventListener('click', async () => {
    if (!window.confirm(`${verlaufText(v)}\n\nDiesen Stand wirklich zurückdrehen? Das landet selbst im Verlauf und lässt sich ebenso zurückdrehen.`)) return;
    b.disabled = true;
    const msg = ziel || $('#msg-uebersicht');
    meldung(msg, '');
    try {
      const r = await rpc('katalog_rueckgaengig', { p_id: v.id });
      meldung(msg, `Zurückgedreht (${zahlDe(r.zeilen)} ${r.zeilen === 1 ? 'Änderung' : 'Änderungen'}).`);
      await Promise.all([ladeVerlauf(), ladePapierkorb()]);
      ladeBaustellen();
      kat.raeder = null; kat.teile = null;
    } catch (e) {
      meldung(msg, fehlerText(e), true);
      b.disabled = false;
    }
  });
  return b;
}

const PK_TEXTE = {
  rad_geloescht: 'Rad gelöscht', rad_abgelehnt: 'Rad abgelehnt', teil_geloescht: 'Teil gelöscht',
  teile_zusammengefuehrt: 'Teile zusammengeführt', shop_geloescht: 'Shop gelöscht',
};
async function ladePapierkorb() {
  const ul = $('#pk-liste');
  try {
    const liste = (await rpc('katalog_papierkorb')) || [];
    $('#pk-zahl').textContent = liste.length ? `(${zahlDe(liste.length)})` : '';
    ul.replaceChildren(...liste.map((v) => {
      const li = document.createElement('li');
      const links = document.createElement('div');
      const wann = new Date(v.wann);
      links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: v.text || '' }),
        Object.assign(document.createElement('span'), { className: 'neben',
          textContent: `${PK_TEXTE[v.art] || v.art} am ${wann.toLocaleDateString('de-DE')} um ${wann.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
            + `${v.von ? ' von ' + v.von : ''}${v.teile ? `, mit ${zahlDe(v.teile)} ${v.art === 'teile_zusammengefuehrt' ? 'Zuordnungen' : 'Teilen'}` : ''}` }));
      li.append(links, rueckgaengigKnopf({ ...v, art: v.art }, v.art === 'teile_zusammengefuehrt' ? 'Trennen' : 'Wiederherstellen', $('#msg-papierkorb')));
      return li;
    }));
    if (!liste.length) ul.innerHTML = '<li class="leer">Leer. Was du löschst, liegt hier 30 Tage.</li>';
  } catch (e) {
    ul.replaceChildren();
    meldung($('#msg-papierkorb'), fehlerText(e), true);
  }
}

// ----- Läuft alles? (werkbank_betrieb) -----

const AMPEL_TEXT = { gruen: 'Alles grün', gelb: 'Bitte ansehen', rot: 'Störung' };
function vorZeit(d) {
  if (!d) return 'noch nie';
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  if (min < 60 * 24) return `vor ${Math.round(min / 60)} Std.`;
  const t = Math.round(min / 1440);
  return t === 1 ? 'gestern' : `vor ${t} Tagen`;
}
function wieOft(min) {
  if (min < 60) return `alle ${min} Min.`;
  if (min === 60) return 'stündlich';
  if (min === 1440) return 'täglich';
  if (min === 10080) return 'wöchentlich';
  return `alle ${Math.round(min / 60)} Std.`;
}
async function ladeBetrieb() {
  const karte = $('#betrieb');
  meldung($('#msg-betrieb'), '');
  let b;
  try {
    b = await rpc('werkbank_betrieb');
  } catch (e) {
    $('#be-ampel').className = 'ampel';
    $('#be-ampel').textContent = 'unbekannt';
    $('#be-stand').textContent = '';
    meldung($('#msg-betrieb'), fehlerText(e), true);
    return;
  }
  karte.classList.remove('k1', 'k3', 'k4');
  karte.classList.add(b.ampel === 'rot' ? 'k1' : b.ampel === 'gelb' ? 'k3' : 'k4');
  $('#be-ampel').className = `ampel ${b.ampel}`;
  $('#be-ampel').textContent = AMPEL_TEXT[b.ampel] || b.ampel;
  $('#be-stand').textContent = `Geprüft ${new Date(b.stand).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr. Rote Punkte stehen auch in deiner Morgen-Mail.`;
  $('#be-probleme').replaceChildren(...(b.probleme || []).map((p) => Object.assign(document.createElement('li'), { className: p.stufe, textContent: p.text })));

  const feld = (titel, wert, unter, anteil = null) => {
    const d = Object.assign(document.createElement('div'), { className: 'be-feld' });
    d.append(Object.assign(document.createElement('div'), { className: 'eyebrow', textContent: titel }),
      Object.assign(document.createElement('b'), { textContent: wert }),
      Object.assign(document.createElement('p'), { className: 'fine', textContent: unter }));
    if (anteil !== null) {
      const bal = Object.assign(document.createElement('div'), { className: 'balken' });
      bal.append(Object.assign(document.createElement('span'), { style: `width:${Math.min(100, Math.max(2, anteil * 100)).toFixed(1)}%` }));
      d.append(bal);
    }
    return d;
  };
  const s = b.sicherung;
  const zeiten = b.zeitplaene || [];
  const zeitOk = zeiten.filter((z) => z.aktiv && z.status !== 'failed').length;
  const a = b.anfragen || {};
  $('#be-gitter').replaceChildren(
    feld('Datensicherung', s ? vorZeit(s.wann) : 'noch keine',
      s ? `${s.ok ? 'erfolgreich' : 'fehlgeschlagen'}${s.bytes ? `, ${groesse(s.bytes)} verschlüsselt` : ''}, ${zahlDe(b.sicherungen_30)} ${b.sicherungen_30 === 1 ? 'Sicherung' : 'Sicherungen'} in 30 Tagen` : 'Einrichtung siehe docs/datensicherung.md im App-Repo'),
    feld('Zeitpläne', `${zahlDe(zeitOk)} von ${zahlDe(zeiten.length)}`, 'laufen ohne Fehler'),
    feld('Brevo, 24 Std.', a.fehler_24h ? `${zahlDe(a.fehler_24h)} Fehler` : 'keine Fehler', `${zahlDe(a.gesamt_24h)} Mails und Abrufe`),
    feld('Werkbank-Mails heute', `${zahlDe(b.mails.heute)} / ${zahlDe(b.mails.grenze)}`, 'Grenze für Sammelmails', b.mails.heute / b.mails.grenze),
    feld('Datenbank', groesse(b.datenbank.bytes), `von ${groesse(b.datenbank.grenze)} im Gratis-Plan`, b.datenbank.bytes / b.datenbank.grenze),
    feld('Postfach', vorZeit(b.postfach.letzter_eingang), 'letzte eingegangene Mail'));
  if (s && s.lauf) {
    const f = $('#be-gitter').firstElementChild;
    f.append(Object.assign(document.createElement('a'), { href: s.lauf, target: '_blank', rel: 'noopener', className: 'fine', textContent: 'Lauf ansehen' }));
  }

  $('#be-zeit-zahl').textContent = `(${zahlDe(zeiten.length)})`;
  $('#be-zeit').replaceChildren(...zeiten.map((z) => {
    const tr = document.createElement('tr');
    const zuletzt = document.createElement('td');
    zuletzt.append(vorZeit(z.letzter));
    if (!z.aktiv) zuletzt.append(' ', Object.assign(document.createElement('span'), { className: 'chip warn', textContent: 'aus' }));
    else if (z.status === 'failed') zuletzt.append(' ', Object.assign(document.createElement('span'), { className: 'chip warn', textContent: 'Fehler', title: z.meldung || '' }));
    tr.append(Object.assign(document.createElement('td'), { textContent: z.titel }),
      Object.assign(document.createElement('td'), { textContent: wieOft(z.minuten) }), zuletzt,
      Object.assign(document.createElement('td'), { textContent: `${zahlDe(z.laeufe_24h)} ${z.laeufe_24h === 1 ? 'Lauf' : 'Läufe'}${z.fehler_24h ? `, ${zahlDe(z.fehler_24h)} Fehler` : ''}` }));
    return tr;
  }));
  const fehler = a.letzte_fehler || [];
  $('#be-fehler').textContent = fehler.length
    ? 'Letzte Fehler bei Brevo: ' + fehler.map((f) => `${new Date(f.wann).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} (${f.status || 'ohne Antwort'}${f.fehler ? ': ' + f.fehler.slice(0, 80) : ''})`).join(' · ')
    : 'Keine Fehler bei Brevo in den letzten 7 Tagen.';
}
$('#be-neu').addEventListener('click', ladeBetrieb);

// ----- App steuern (app_steuerung_lesen / _setzen, nur Super-Admin) -----

const STEUER_TEXTE = ['banner_text', 'banner_link', 'wartung_text', 'mindest_version', 'update_text'];
function steuerungFuellen(st) {
  const f = $('#f-steuer');
  for (const k of STEUER_TEXTE) f.elements[k].value = st[k] || '';
  f.elements.banner_art.value = st.banner_art || 'info';
  f.elements.banner_bis.value = st.banner_bis ? new Date(st.banner_bis).toLocaleDateString('sv-SE') : '';
  f.elements.wartung.checked = !!st.wartung;
  f.elements.premium_aktiv.checked = !!st.premium_aktiv;
  $('#st-geaendert').textContent = st.von
    ? `Zuletzt geändert ${new Date(st.geaendert).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} von ${st.von}.` : '';
}
async function ladeSteuerung() {
  const msg = $('#f-steuer .msg');
  try {
    steuerungFuellen(await rpc('app_steuerung_lesen'));
    meldung(msg, '');
  } catch (e) {
    meldung(msg, fehlerText(e), true);
  }
}
$('#steuer-neu').addEventListener('click', ladeSteuerung);
$('#f-steuer').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  mitKnopf(f, async (msg) => {
    const p = { banner_art: f.elements.banner_art.value, wartung: f.elements.wartung.checked, premium_aktiv: f.elements.premium_aktiv.checked };
    for (const k of STEUER_TEXTE) p[k] = f.elements[k].value.trim();
    // „Bis“ gilt bis zum Ende des Tages
    p.banner_bis = f.elements.banner_bis.value ? new Date(`${f.elements.banner_bis.value}T23:59:59`).toISOString() : '';
    if (p.premium_aktiv && !window.confirm('Premium-Funktionen sind dann nur noch nach Kauf nutzbar (in App-Versionen mit eingebautem Kauf). Wirklich einschalten?')) return;
    if (p.mindest_version && !window.confirm(`Alle App-Versionen unter ${p.mindest_version} zeigen dann nur noch „Bitte aktualisieren“. Ist die neue Version in beiden Stores freigegeben?`)) return;
    steuerungFuellen(await rpc('app_steuerung_setzen', { p }));
    meldung(msg, 'Gespeichert. Die App holt es beim nächsten Öffnen.');
  });
});

// ----- Gesucht, aber nicht im Katalog (katalog_nachfrage_liste) -----

const KURZ_NF = 10;
let nfAlle = false;
function nachfrageZeigen() {
  const extra = $$('#nf-liste li[data-extra="1"]');
  for (const li of extra) li.hidden = !nfAlle;
  $('#nf-auf').hidden = !extra.length;
  $('#nf-auf').textContent = nfAlle ? 'Weniger zeigen' : `Alle ${zahlDe(extra.length + KURZ_NF)} zeigen`;
  $('#nf-auf').setAttribute('aria-expanded', String(nfAlle));
}
$('#nf-auf').addEventListener('click', () => { nfAlle = !nfAlle; nachfrageZeigen(); });

function alsVorlageSuchen(begriff) {
  tab('erfassen');
  $('#vorlage').open = true;
  const s = $('#vorlage-suche');
  s.value = begriff;
  s.dispatchEvent(new Event('input'));
  s.scrollIntoView({ block: 'center' });
}

async function ladeNachfrage() {
  const ul = $('#nf-liste');
  const msg = $('#msg-nachfrage');
  let d;
  try {
    d = await rpc('katalog_nachfrage_liste', { p_tage: 90 });
    meldung(msg, '');
  } catch (e) {
    ul.replaceChildren();
    meldung(msg, fehlerText(e), true);
    return;
  }
  const begriffe = d.begriffe || [];
  $('#nf-zahl').textContent = begriffe.length ? `(${zahlDe(begriffe.length)})` : '';
  ul.replaceChildren(...begriffe.map((b, i) => {
    const li = document.createElement('li');
    li.dataset.extra = i >= KURZ_NF ? '1' : '';
    const links = document.createElement('div');
    const zuletzt = new Date(`${b.zuletzt}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: b.begriff }),
      Object.assign(document.createElement('span'), { className: 'neben',
        textContent: `${zahlDe(b.anzahl)}× gesucht, zuletzt ${zuletzt}${b.eigenes ? `, ${zahlDe(b.eigenes)}× selbst angelegt` : ''}` }));
    if (b.im_katalog) links.append(' ', Object.assign(document.createElement('span'), { className: 'chip gut', style: 'padding-right:10px',
      textContent: `inzwischen ${zahlDe(b.im_katalog)} ${b.im_katalog === 1 ? 'passendes Rad' : 'passende Räder'} im Katalog` }));
    const knoepfe = Object.assign(document.createElement('div'), { className: 'nf-knoepfe' });
    const erfassen = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: 'Erfassen' });
    erfassen.title = 'Öffnet „Rad erfassen“ und sucht ein ähnliches Rad als Vorlage';
    erfassen.addEventListener('click', () => alsVorlageSuchen(b.begriff));
    const erledigt = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: 'Erledigt' });
    erledigt.title = 'Aus der Liste nehmen (erfasst oder kein Rad)';
    erledigt.addEventListener('click', async () => {
      erledigt.disabled = true;
      try {
        await rpc('katalog_nachfrage_erledigen', { p_begriff: b.begriff, p_erledigt: true });
        li.remove();
        meldung(msg, `„${b.begriff}“ ist erledigt.`);
      } catch (e) {
        erledigt.disabled = false;
        meldung(msg, fehlerText(e), true);
      }
    });
    knoepfe.append(erfassen, erledigt);
    li.append(links, knoepfe);
    return li;
  }));
  if (!begriffe.length) ul.innerHTML = '<li class="leer">Noch nichts. Sobald in der App jemand ein Rad sucht, das fehlt, steht es hier.</li>';
  nachfrageZeigen();

  const vs = d.vorschlaege || [];
  $('#nf-vorschlaege-box').hidden = !vs.length;
  $('#nf-vorschlaege-zahl').textContent = `(${zahlDe(vs.length)})`;
  $('#nf-vorschlaege').replaceChildren(...vs.map((v) => {
    const li = document.createElement('li');
    const links = document.createElement('div');
    links.append(Object.assign(document.createElement('div'), { className: 'name', textContent: v.titel || 'ohne Namen' }),
      Object.assign(document.createElement('span'), { className: 'neben',
        textContent: `${v.anzahl === 1 ? '1 Vorschlag' : `${zahlDe(v.anzahl)} Vorschläge`}, zuletzt ${new Date(v.zuletzt).toLocaleDateString('de-DE')}` }));
    const knopf = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: 'Erfassen' });
    knopf.addEventListener('click', () => alsVorlageSuchen(v.titel || ''));
    li.append(links, knopf);
    return li;
  }));
}

// ----- Tägliche Füllrunde (werkbank_fuellrunde): Zahlen aus raeder.erstellt, Text von der Runde selbst -----

async function ladeFuellrunde() {
  const msg = $('#msg-fuellrunde');
  let d;
  try {
    d = await rpc('werkbank_fuellrunde', { p_tage: 14 });
    meldung(msg, '');
  } catch (e) {
    meldung(msg, fehlerText(e), true);
    return;
  }
  const tage = d.tage || [];
  const heute = tage[0] || { raeder: 0, teile: 0, marken: [] };
  const gestern = tage[1];
  const zuletzt = tage.find((t) => t.bericht);
  $('#fr-heute').textContent = `Heute ${zahlDe(heute.raeder)} ${heute.raeder === 1 ? 'Rad' : 'Räder'} und ${zahlDe(heute.teile)} ${heute.teile === 1 ? 'Teil' : 'Teile'} neu im Katalog`
    + (heute.marken.length ? ` (${heute.marken.map((m) => `${m.marke} ${m.n}`).join(', ')})` : '')
    + (gestern ? `, gestern ${zahlDe(gestern.raeder)}.` : '.');
  const box = $('#fr-bericht');
  box.replaceChildren();
  if (zuletzt) {
    const wann = new Date(zuletzt.gemeldet);
    const kopf = `Bericht ${zuletzt === heute ? 'von heute' : 'vom ' + new Date(`${zuletzt.tag}T12:00:00`).toLocaleDateString('de-DE')}, ${wann.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    box.append(Object.assign(document.createElement('p'), { className: 'eyebrow', textContent: kopf }),
      Object.assign(document.createElement('p'), { textContent: zuletzt.bericht || '' }));
    if (zuletzt.probleme) box.append(Object.assign(document.createElement('p'), { className: 'msg fehler', textContent: zuletzt.probleme }));
    if (zuletzt.naechster) box.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: `Nächster Lauf beginnt bei: ${zuletzt.naechster}` }));
  } else {
    box.append(Object.assign(document.createElement('p'), { className: 'fine', textContent: 'Noch kein Bericht. Die Runde meldet sich ab jetzt am Ende jedes Laufs hier.' }));
  }
  balken($('#fr-tage'), tage.slice(0, 7).map((t) => ({ label: tagText(t.tag), wert: t.raeder, tippName: 'Räder' })), SERIE[0]);
  balken($('#fr-marken'), (d.woche || []).slice(0, 10).map((m) => ({ label: m.marke, wert: m.n, text: `+${zahlDe(m.n)} (${zahlDe(m.gesamt)})`, tippName: 'neu' })), SERIE[1]);
}

// ----- Katalog-Qualität (katalog_qualitaet): Teile ohne Preis, mögliche Doppelte, Shop-Links -----

let qaDaten = null;
let qaAnsicht = 'preis';
let qaAlle = false;
const KURZ_QA = 15;

async function ladeQualitaet() {
  try {
    qaDaten = await rpc('katalog_qualitaet');
    meldung($('#msg-qualitaet'), '');
  } catch (e) {
    meldung($('#msg-qualitaet'), fehlerText(e), true);
    return;
  }
  $('#qa-zahl-preis').textContent = `(${zahlDe(qaDaten.ohne_preis.anzahl)})`;
  $('#qa-zahl-doppelt').textContent = `(${zahlDe(qaDaten.doppelt.length)}${qaDaten.doppelt.length >= 100 ? '+' : ''})`;
  zeichneQualitaet();
}

function qaKnopf(text, fn) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: text });
  b.addEventListener('click', fn);
  return b;
}

function zeichneQualitaet() {
  if (!qaDaten) return;
  for (const b of $$('#qa-ansicht button')) b.setAttribute('aria-checked', String(b.dataset.ansicht === qaAnsicht));
  const ul = $('#qa-liste');
  const msg = $('#msg-qualitaet');
  let zeilen = [];
  $('#qa-pruefen').hidden = qaAnsicht !== 'shops';
  if (qaAnsicht === 'preis') {
    $('#qa-info').textContent = `${zahlDe(qaDaten.ohne_preis.anzahl)} Teile haben keinen Richtpreis. Oben die, die an den meisten Rädern verbaut sind, dort lohnt sich ein Preis am meisten.`;
    zeilen = qaDaten.ohne_preis.teile.map((t) => {
      const li = document.createElement('li');
      const d = document.createElement('div');
      d.append(Object.assign(document.createElement('div'), { className: 'name', textContent: `${t.marke} ${t.name}` }),
        Object.assign(document.createElement('span'), { className: 'neben', textContent: `${t.kategorie} · an ${zahlDe(t.raeder)} ${t.raeder === 1 ? 'Rad' : 'Rädern'}` }));
      li.append(d, qaKnopf('Preis eintragen', () => teilBearbeiten({ id: t.id }, ladeQualitaet)));
      return li;
    });
  } else if (qaAnsicht === 'doppelt') {
    $('#qa-info').textContent = 'Gleiche Marke und Kategorie mit gleichem oder fast gleichem Namen, oder derselbe Barcode an zwei Teilen. „Zusammenführen“ behält das Teil mit mehr Rädern, alles lässt sich im Verlauf rückgängig machen.';
    zeilen = qaDaten.doppelt.map((p) => {
      const li = document.createElement('li');
      const d = document.createElement('div');
      const teil = (t) => `${t.marke} ${t.name} (${zahlDe(t.raeder)} ${t.raeder === 1 ? 'Rad' : 'Räder'}${t.preis != null ? ', ' + euro(t.preis) : ''})`;
      d.append(Object.assign(document.createElement('div'), { className: 'name', textContent: `${teil(p.a)} ↔ ${p.b.name}` }),
        Object.assign(document.createElement('span'), { className: 'neben', textContent: `${p.a.kategorie} · ${p.grund} · ${teil(p.b)}` }));
      const [bleibt, weg] = Number(p.a.raeder) >= Number(p.b.raeder) ? [p.a, p.b] : [p.b, p.a];
      const knoepfe = Object.assign(document.createElement('div'), { className: 'nf-knoepfe' });
      knoepfe.append(qaKnopf('Zusammenführen', async () => {
        if (!window.confirm(`„${weg.marke} ${weg.name}“ in „${bleibt.marke} ${bleibt.name}“ aufgehen lassen?\n\nRäder und Barcodes wandern dorthin.`)) return;
        try {
          await rpc('katalog_teile_zusammenfuehren', { p_behalten: bleibt.id, p_weg: weg.id });
          await ladeQualitaet();
          meldung(msg, `Zusammengeführt in ${bleibt.marke} ${bleibt.name}.`);
          ladeVerlauf();
          ladePapierkorb();
        } catch (e) { meldung(msg, fehlerText(e), true); }
      }), qaKnopf('Kein Duplikat', async () => {
        try {
          await rpc('teile_kein_duplikat', { p_a: p.a.id, p_b: p.b.id });
          li.remove();
        } catch (e) { meldung(msg, fehlerText(e), true); }
      }), qaKnopf('Ansehen', () => teilBearbeiten({ id: p.a.id }, ladeQualitaet)));
      li.append(d, knoepfe);
      return li;
    });
  } else {
    $('#qa-info').textContent = 'Ruft die Suche jedes Shops mit „kette“ auf. Manche Shops sperren automatische Abrufe (403), dann bitte im Browser testen.';
    zeilen = qaDaten.shops.map((x) => {
      const li = document.createElement('li');
      const d = document.createElement('div');
      const ok = x.status >= 200 && x.status < 400;
      const text = x.laeuft ? 'wird geprüft …' : !x.wann ? 'noch nicht geprüft'
        : x.fehler ? `Fehler: ${x.fehler}` : ok ? `funktioniert (${x.status})` : x.status === 403 || x.status === 429 ? `sperrt automatische Prüfung (${x.status}), im Browser testen` : `antwortet mit ${x.status}`;
      d.append(Object.assign(document.createElement('div'), { className: 'name', textContent: x.name }),
        Object.assign(document.createElement('span'), { className: `chip ${ok ? 'gut' : x.wann && !x.laeuft ? 'warn' : ''}`, style: 'padding-right:10px', textContent: text }),
        ' ', Object.assign(document.createElement('span'), { className: 'neben', textContent: x.wann ? `geprüft ${vorZeit(x.wann)}` : '' }));
      li.append(d, Object.assign(document.createElement('a'), { className: 'knopf-weich', href: x.url, target: '_blank', rel: 'noopener noreferrer', textContent: 'Im Browser testen' }));
      return li;
    });
  }
  zeilen.forEach((li, i) => { li.dataset.extra = i >= KURZ_QA ? '1' : ''; li.hidden = i >= KURZ_QA && !qaAlle; });
  ul.replaceChildren(...zeilen);
  if (!zeilen.length) ul.innerHTML = '<li class="leer">Nichts gefunden. Sehr gut.</li>';
  const extra = zeilen.length - KURZ_QA;
  $('#qa-auf').hidden = extra <= 0;
  $('#qa-auf').textContent = qaAlle ? 'Weniger zeigen' : `Alle ${zahlDe(zeilen.length)} zeigen`;
  $('#qa-auf').setAttribute('aria-expanded', String(qaAlle));
}

for (const b of $$('#qa-ansicht button')) b.addEventListener('click', () => { qaAnsicht = b.dataset.ansicht; qaAlle = false; zeichneQualitaet(); });
$('#qa-auf').addEventListener('click', () => { qaAlle = !qaAlle; zeichneQualitaet(); });
$('#qa-pruefen').addEventListener('click', async () => {
  const b = $('#qa-pruefen');
  b.disabled = true;
  try {
    await rpc('shops_pruefen');
    meldung($('#msg-qualitaet'), 'Prüfe … das dauert ein paar Sekunden.');
    setTimeout(async () => { await ladeQualitaet(); meldung($('#msg-qualitaet'), ''); b.disabled = false; }, 6000);
  } catch (e) {
    b.disabled = false;
    meldung($('#msg-qualitaet'), fehlerText(e), true);
  }
});

// ----- Store-Start und Tester (werkbank_tester, nur Super-Admin) -----

async function ladeTester() {
  const msg = $('#msg-tester');
  let t;
  try {
    t = await rpc('werkbank_tester');
    meldung(msg, '');
  } catch (e) {
    meldung(msg, fehlerText(e), true);
    return;
  }
  zeichneTester(t);
}

function zeichneTester(t) {
  const feld = (titel, wert, unter, anteil = null) => {
    const d = Object.assign(document.createElement('div'), { className: 'be-feld' });
    d.append(Object.assign(document.createElement('div'), { className: 'eyebrow', textContent: titel }),
      Object.assign(document.createElement('b'), { textContent: wert }),
      Object.assign(document.createElement('p'), { className: 'fine', textContent: unter }));
    if (anteil !== null) {
      const bal = Object.assign(document.createElement('div'), { className: 'balken' });
      bal.append(Object.assign(document.createElement('span'), { style: `width:${Math.min(100, Math.max(2, anteil * 100)).toFixed(1)}%` }));
      d.append(bal);
    }
    return d;
  };
  const p = t.testplaetze || {};
  const g = t.google || {};
  const tf = t.testflight || {};
  const gs = t.geschenk || {};
  const datumKurz = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  $('#ts-gitter').replaceChildren(
    feld('Testplätze', `${zahlDe(p.vergeben)} / ${zahlDe(p.grenze)}`, `${zahlDe(p.iphone)} iPhone, ${zahlDe(p.android)} Android, ${zahlDe(p.warteliste)} auf der Warteliste`, p.grenze ? p.vergeben / p.grenze : null),
    feld('Nutzen die App', `${zahlDe(p.aktiv_14)} aktiv`, `in 14 Tagen angemeldet, ${zahlDe(p.mit_konto)} mit Konto, ${zahlDe(p.mit_rad)} mit Rad in der Garage`),
    feld('Google: 12 Tester, 14 Tage', g.start ? (g.tag > 14 ? 'Zeit erfüllt' : `Tag ${zahlDe(g.tag)} von 14`) : 'noch nicht gestartet',
      g.start ? `${g.tester == null ? '?' : zahlDe(g.tester)} von 12 Testern${g.tester != null && g.tester < 12 ? `, es fehlen ${12 - g.tester}` : ''}, frühestens am ${datumKurz(g.fertig_ab)} fertig${g.erfuellt ? ' ✓' : ''}`
        : 'Startdatum unten eintragen, sobald der geschlossene Test läuft', g.start ? Math.min(1, (g.tag || 0) / 14) : null),
    feld('TestFlight', `${tf.tester == null ? '?' : zahlDe(tf.tester)} / ${zahlDe(tf.grenze)}`, 'Tester in App Store Connect', tf.tester != null && tf.grenze ? tf.tester / tf.grenze : null),
    feld('Premium-Geschenk', gs.am ? `${zahlDe(gs.geschenkt)} verschenkt` : 'noch nicht', gs.offen ? `${zahlDe(gs.offen)} mit Testplatz haben es noch nicht` : 'Alle mit Testplatz haben es'));
  $('#ts-schenken').disabled = !gs.offen;
  const f = $('#f-tester');
  const e = t.eingaben || {};
  for (const k of ['google_start', 'google_tester', 'testflight_tester', 'testflight_grenze', 'testplaetze', 'notiz']) f.elements[k].value = e[k] ?? '';
}

$('#f-tester').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  mitKnopf(f, async (msg) => {
    const p = {};
    for (const k of ['google_start', 'google_tester', 'testflight_tester', 'testflight_grenze', 'testplaetze', 'notiz']) p[k] = f.elements[k].value;
    zeichneTester(await rpc('werkbank_tester_setzen', { p }));
    meldung(msg, 'Gespeichert.');
  });
});
$('#ts-schenken').addEventListener('click', async () => {
  if (!window.confirm('Allen mit Testplatz Premium schenken? Das gilt dauerhaft und lässt sich nur einzeln im Konto zurücknehmen. Gedacht für den Store-Start.')) return;
  try {
    const n = await rpc('tester_premium_schenken');
    await ladeTester();
    meldung($('#msg-tester'), `Premium an ${zahlDe(n)} Tester verschenkt. Es wird beim nächsten App-Start ans Konto gebunden.`);
  } catch (e) {
    meldung($('#msg-tester'), fehlerText(e), true);
  }
});
