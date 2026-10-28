// Werkbank, Teil 10 von 11: Statistik, Shops, Systemstatus.
'use strict';

// ---------- Statistik (Admin) ----------
// Nur Summen vom Server (werkbank_statistik). Diagramme als eigenes SVG, ohne Bibliothek.

let stTage = 90;
let stDaten = null;
let stKlicks = null;
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
  const klicks = rpc('werkbank_klicks', { p_tage: stTage }).catch(() => null);
  try {
    stDaten = await rpc('werkbank_statistik', { p_tage: stTage });
    meldung($('#msg-statistik'), '');
    zeichneStatistik();
  } catch (e) {
    meldung($('#msg-statistik'), fehlerText(e), true);
  }
  stKlicks = await klicks;
  zeichneKlicks();
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

// Klicks auf „Zum Shop“ (werkbank_klicks): nur Tagessummen je Shop, Stelle in der App und Kategorie
const HERKUNFT = { teil: 'Teil-Seite', merkliste: 'Merkliste', einkauf: 'Einkaufsliste', versicherung: 'Versicherungstipp', '': 'ohne Angabe' };
function zeichneKlicks() {
  const ziel = $('#st-shops');
  ziel.replaceChildren();
  const k = stKlicks;
  if (!k) return;
  const pro = stTage > 120 ? 'pro Woche' : 'pro Tag';
  // Tage ohne Klick auffüllen, damit die Zeitachse durchläuft
  const n = {};
  for (const t of k.tage || []) n[t.tag] = t.n;
  const tage = [];
  for (let i = stTage - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tag = d.toLocaleDateString('sv-SE');
    tage.push({ tag, n: n[tag] || 0 });
  }
  const erster = tage.findIndex((t) => t.n > 0);
  const kv = buendeln(erster < 0 ? [] : tage.slice(Math.max(0, Math.min(erster - 1, tage.length - 7))), ['n']);
  let c = karte(ziel, `Klicks auf „Zum Shop“: ${zahlDe(k.summe)}`, `${pro}, aus der App, inklusive Versicherungstipp`, true);
  zeitDiagramm(c.plot, kv.punkte, [{ name: 'Klicks', feld: 'n', farbe: SERIE[0] }], { art: 'saeulen' });
  tabelle(c.det, [kv.woche ? 'Woche ab' : 'Tag', 'Klicks'], kv.punkte.filter((p) => p.n).reverse().map((p) => [tagText(p.tag, true), zahlDe(p.n)]));

  const sh = (k.shops || []).map((x) => ({ label: x.name, wert: x.n, tippName: 'Klicks' }));
  c = karte(ziel, 'Nach Shop', 'Welcher Shop angetippt wurde');
  balken(c.plot, sh, SERIE[1]);
  tabelle(c.det, ['Shop', 'Klicks', 'Anteil'], sh.map((z) => [z.label, zahlDe(z.wert), `${prozent(z.wert, k.summe)} %`]));

  const he = (k.herkunft || []).map((x) => ({ label: HERKUNFT[x.name] || x.name, wert: x.n, tippName: 'Klicks' }));
  c = karte(ziel, 'Nach Stelle in der App', 'Wo der Knopf angetippt wurde');
  balken(c.plot, he, SERIE[2]);
  tabelle(c.det, ['Stelle', 'Klicks'], he.map((z) => [z.label, zahlDe(z.wert)]));

  const ka = (k.kategorien || []).map((x) => ({ label: x.name, wert: x.n, tippName: 'Klicks' }));
  c = karte(ziel, 'Nach Teil-Kategorie', 'Die zwölf häufigsten, nur von der Teil-Seite');
  balken(c.plot, ka, SERIE[3]);
  tabelle(c.det, ['Kategorie', 'Klicks'], ka.map((z) => [z.label, zahlDe(z.wert)]));

  if (k.einnahmen) zeichneEinnahmen(ziel, k.einnahmen);
}

const monatText = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
function zeichneEinnahmen(ziel, liste) {
  // Monatssummen als Säulen, dazu die Einträge zum Löschen
  const je = {};
  for (const e of liste) je[e.monat] = (je[e.monat] || 0) + Number(e.betrag);
  const monate = Object.keys(je).sort().map((m) => ({ tag: m, text: monatText(m), betrag: Math.round(je[m] * 100) / 100 }));
  const gesamt = liste.reduce((a, e) => a + Number(e.betrag), 0);
  const c = karte(ziel, `Einnahmen: ${euro(gesamt)}`, 'Eingetragene Auszahlungen je Monat, die letzten zwölf, unabhängig vom Zeitraum oben');
  balken(c.plot, monate.slice().reverse().slice(0, 12).map((m) => ({ label: m.text, wert: m.betrag, text: euro(m.betrag), tippName: 'Summe' })), SERIE[3]);
  tabelle(c.det, ['Monat', 'Summe'], monate.slice().reverse().map((m) => [m.text, euro(m.betrag)]));

  const monat = $('#f-einnahme').elements.monat;
  if (!monat.value) monat.value = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  $('#ein-liste').replaceChildren(...liste.map((e) => {
    const tr = document.createElement('tr');
    const weg = Object.assign(document.createElement('button'), { type: 'button', className: 'knopf-weich', textContent: 'Löschen' });
    weg.addEventListener('click', async () => {
      if (!window.confirm(`${e.quelle}, ${monatText(e.monat)}, ${euro(e.betrag)} löschen?`)) return;
      try {
        await rpc('einnahme_loeschen', { p_id: e.id });
        ladeStatistik();
      } catch (err) {
        meldung($('#f-einnahme .msg'), fehlerText(err), true);
      }
    });
    const td = document.createElement('td');
    td.append(weg);
    for (const v of [monatText(e.monat), e.quelle, euro(e.betrag), e.notiz || '']) tr.append(Object.assign(document.createElement('td'), { textContent: v }));
    tr.append(td);
    return tr;
  }));
  if (!liste.length) $('#ein-liste').innerHTML = '<tr><td colspan="5" class="fine">Noch keine Einträge.</td></tr>';
}
$('#f-einnahme').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  mitKnopf(f, async (msg) => {
    const betrag = Number(f.elements.betrag.value.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(betrag)) throw new Error('Betrag bitte als Zahl, z. B. 12,50.');
    await rpc('einnahme_speichern', { p: { monat: `${f.elements.monat.value}-01`, quelle: f.elements.quelle.value.trim(), betrag, notiz: f.elements.notiz.value } });
    f.elements.betrag.value = '';
    f.elements.notiz.value = '';
    meldung(msg, 'Eingetragen.');
    ladeStatistik();
  });
});

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
  window.stTimer = setTimeout(() => { zeichneStatistik(); zeichneKlicks(); }, 150);
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
