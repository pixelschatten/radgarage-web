"""Seiten je Schaltgruppe (/schaltgruppen/) und je E-Bike-Motorsystem (/e-bike-systeme/).

Welche Gruppe bzw. welches System ein Rad hat, bestimmt raeder.laden() aus dem verbauten Schaltwerk bzw. Motor.
Die Seiten zeigen, welche Teile an diesen Rädern tatsächlich verbaut sind, und verlinken passenden Ersatz.
Gebaut wird über python3 _quellen/bauen.py.
"""
import re
from collections import Counter, OrderedDict

from anleitungen import ANLEITUNGEN, FUSS, SEITE, e, kopf, krumen
from raeder import FARBEN, MIN_GRUPPE, NAMEN, alternativen, preis, teil_link, tsd
from teile import antrieb_paare, paar_liste, radliste

ELEKTRONISCH = re.compile(r'Di2|AXS|eTap')


def _passt(t, kat, schaltakku):
    """Bei Akkus trennen: Schaltungsakkus (Di2, AXS) gehören zur Schaltgruppe, alle anderen zum E-Bike-System."""
    if t['kategorie'] != kat:
        return False
    return kat != 'Akku' or bool(ELEKTRONISCH.search(t['name'])) == schaltakku


def _haeufigste(raeder, kat, n=6, schaltakku=False):
    """Teile einer Kategorie an diesen Rädern, häufigste zuerst: [(teil, anzahl)]."""
    zahl, teil = Counter(), {}
    for r in raeder:
        for t in {t['id']: t for t in r['teile'] if _passt(t, kat, schaltakku)}.values():
            zahl[t['id']] += 1
            teil[t['id']] = t
    return [(teil[i], z) for i, z in zahl.most_common(n)]


def _tabelle(raeder, kats, n=6, schaltakku=False):
    zeilen = []
    for kat in kats:
        for t, z in _haeufigste(raeder, kat, n, schaltakku):
            zeilen.append(f'<tr><th scope="row">{e(NAMEN.get(kat, kat))}</th><td><b>{teil_link(t)}</b>'
                          f'{"<span>" + e(t["merkmale"]) + "</span>" if t["merkmale"] else ""}</td>'
                          f'<td>{z} {"Rad" if z == 1 else "Räder"}</td><td class="preis">{preis(t["preis"])}</td></tr>')
    return f'<table class="teiltabelle gruppen-tabelle"><tbody>{"".join(zeilen)}</tbody></table>' if zeilen else ''


def _jahre(raeder):
    j = sorted({r['baujahr'] for r in raeder})
    return str(j[0]) if len(j) == 1 else f'{j[0]} bis {j[-1]}'


def _haupt_kategorie(raeder):
    return Counter(r['kategorie'] for r in raeder).most_common(1)[0][0]


def _ersatz_satz(raeder, kat):
    top = _haeufigste(raeder, kat, 1)
    if not top:
        return ''
    t = top[0][0]
    alt = [a for a in alternativen(t['id']) if a['marke'] != 'Universal'][:3]
    if not alt:
        return ''
    return (f'<p>Für {teil_link(t)} passen laut Katalog auch {", ".join(teil_link(a) for a in alt[:-1])}'
            f'{" und " if len(alt) > 1 else ""}{teil_link(alt[-1])}.</p>')


def _anleitungs_chips(slugs):
    da = {a['slug']: a for a in ANLEITUNGEN}
    links = ''.join(f'<a href="/anleitungen/{s}/">{e(da[s]["h1"])}</a>' for s in slugs if s in da)
    return f'<div class="chips">{links}</div>' if links else ''


def nach_feld(alle, feld):
    m = OrderedDict()
    for r in sorted(alle, key=lambda x: (x[feld] or '').lower()):
        if r[feld + '_pfad']:
            m.setdefault(r[feld + '_pfad'], []).append(r)
    return m


# ---------------------------------------------------------------- Schaltgruppen

def art(name):
    if 'Gang' in name or 'Speedhub' in name or 'enviolo' in name:
        return 'Nabenschaltung'
    return 'elektronisch' if ELEKTRONISCH.search(name) else 'mechanisch'


def gruppe_seite(pfad, raeder, alle_gruppen):
    name = raeder[0]['gruppe']
    marke = name.split()[0]
    a = art(name)
    fach = re.search(r'(\d+)-(fach|Gang)', name)
    nav, brot = krumen([('Radgarage', '/'), ('Schaltgruppen', '/schaltgruppen/'), (name, pfad)])
    titel = f'{name}: Kette, Kassette und Ersatzteile'
    if len(titel) < 50:
        titel += ' | Radgarage'
    beschr = (f'Welche Kette, Kassette und Bremsbeläge sind an Rädern mit {name} verbaut? '
              f'{len(raeder)} Räder im Katalog, mit Richtpreis und passendem Ersatz.')
    liste = {'@context': 'https://schema.org', '@type': 'ItemList', 'name': f'Räder mit {name}',
             'numberOfItems': len(raeder),
             'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': SEITE + r['pfad'],
                                  'name': f'{r["name"]} ({r["baujahr"]})'} for i, r in enumerate(raeder[:50])]}
    out = [kopf(titel, beschr, pfad, [liste, brot]), nav, '  <main>\n  <article class="bento anl rad">\n']
    hauptart = _haupt_kategorie(raeder)
    if a == 'Nabenschaltung':
        regel = ('Bei einer Nabenschaltung steckt die Übersetzung in der Hinterradnabe. Verschleißteile sind vor allem '
                 'Kette oder Riemen, Ritzel und Kettenblatt.')
    else:
        regel = (f'Grundregel: Kette und Kassette müssen zur Zahl der Gänge passen, hier {fach.group(1)}-fach. '
                 'Welche Teile genau als Ersatz taugen, steht auf jeder Teileseite unter „Passt auch“.')
    out.append(f'''    <div class="t k2 kopf">
      <span class="eyebrow">Schaltgruppe · {e(a)}</span>
      <h1>{e(name)}</h1>
      <p class="lead">{len(raeder)} Räder im Katalog fahren mit {e(name)}, die meisten davon {e(hauptart)}. Hier siehst du, welche Kette, Kassette und anderen Teile an diesen Rädern verbaut sind und was als Ersatz passt.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Räder im Katalog</span><div class="wert">{len(raeder)}</div></div>
      <div class="t s2"><span class="eyebrow">{"Gänge" if fach else "Art"}</span><div class="wert">{e(fach.group(1)) if fach else e(a)}</div></div>
      <div class="t s2"><span class="eyebrow">Modelljahre</span><div class="wert">{_jahre(raeder)}</div></div>
    </div>
''')
    out.append(f'''    <section class="t s1 voll" aria-labelledby="vers-titel">
      <span class="eyebrow">Verschleißteile</span>
      <h2 id="vers-titel" style="font-size:30px;margin:6px 0 4px">Kette, Kassette und Beläge an Rädern mit {e(name)}</h2>
      <p>{regel}</p>
      {_tabelle(raeder, ['Kette', 'Riemen', 'Kassette', 'Bremsbelag'], 5)}
      {_ersatz_satz(raeder, 'Kette')}{_ersatz_satz(raeder, 'Kassette')}
      <p class="klein">Anzahl = an wie vielen Rädern im Katalog das Teil verbaut ist. Preise sind Richtpreise ohne Gewähr.</p>
    </section>
''')
    out.append(f'''    <section class="t k4 voll" aria-labelledby="schalt-titel">
      <span class="eyebrow">Schaltung</span>
      <h2 id="schalt-titel" style="font-size:30px;margin:6px 0 4px">Schaltwerk, Schalthebel und Kurbel</h2>
      {_tabelle(raeder, ['Schaltwerk', 'Schalthebel', 'Umwerfer', 'Kurbel', 'Akku'], 4, schaltakku=True)}
    </section>
''')
    out.append(f'''    <nav class="t s2 voll rad-anleitungen" aria-label="Passende Anleitungen">
      <span class="eyebrow">Selbst machen</span>
      <h2 style="font-size:26px;margin:6px 0 10px">Passende Anleitungen</h2>
      {_anleitungs_chips(['kettenverschleiss-messen', 'kette-wechseln', 'kette-reinigen-oelen', 'kassette-wechseln',
                          'schaltung-einstellen'] if a != 'Nabenschaltung' else ['kette-reinigen-oelen', 'reifen-wechseln'])}
    </nav>
''')
    out.append(f'''    <section class="t s1 voll" aria-labelledby="raeder-titel">
      <span class="eyebrow">Verbaut an</span>
      <h2 id="raeder-titel" style="font-size:30px;margin:6px 0 4px">Räder mit {e(name)}</h2>
      {radliste(raeder)}
    </section>
''')
    verwandt = [(p, rs) for p, rs in alle_gruppen.items() if p != pfad and rs[0]['gruppe'].split()[0] == marke][:12]
    if verwandt:
        chips = ''.join(f'<a href="{p}">{e(rs[0]["gruppe"])}</a>' for p, rs in verwandt)
        out.append(f'''    <nav class="t mehr voll" aria-label="Weitere Schaltgruppen">
      <h2 style="font-size:26px;margin:14px 0 10px">Weitere Gruppen von {e(marke)}</h2>
      <div class="chips">{chips}</div>
    </nav>
''')
    out.append('''  </article>
  <p class="hinweis">Zugeordnet nach dem Schaltwerk, das laut Katalog am Rad verbaut ist. Hersteller kombinieren Gruppen manchmal mit Teilen anderer Serien, deshalb steht hier, was tatsächlich verbaut ist. Prüf vor dem Kauf die Angaben des Herstellers. <a href="/so-pruefen-wir/">So prüfen wir</a></p>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)


def gruppen_uebersicht(gruppen, ohne_seite):
    pfad = '/schaltgruppen/'
    nav, brot = krumen([('Radgarage', '/'), ('Schaltgruppen', pfad)])
    titel = 'Schaltgruppen am Fahrrad: Shimano, SRAM & Co. | Radgarage'
    beschr = ('Shimano XT, 105 Di2, GRX, SRAM Eagle Transmission und mehr: welche Kette, Kassette und Beläge an Rädern '
              'mit welcher Schaltgruppe verbaut sind.')
    nach_marke = OrderedDict()
    for p, rs in sorted(gruppen.items(), key=lambda x: (x[1][0]['gruppe'].split()[0].lower(), -len(x[1]))):
        nach_marke.setdefault(rs[0]['gruppe'].split()[0], []).append((p, rs))
    abschnitte = ''.join(
        f'  <section class="reihe-abschnitt" aria-label="{e(m)}"><h2 class="zwischen">{e(m)}</h2><div class="karten">'
        + ''.join(f'<a class="t {FARBEN[i % len(FARBEN)]} karte" href="{p}"><span class="eyebrow">{e(art(rs[0]["gruppe"]))}</span>'
                  f'<h3>{e(rs[0]["gruppe"])}</h3><span class="meta">{len(rs)} Räder · {_jahre(rs)}</span></a>'
                  for i, (p, rs) in enumerate(eintraege))
        + '</div></section>\n' for m, eintraege in nach_marke.items())
    rest = ''
    if ohne_seite:
        rest = (f'<p class="hinweis">Seltener im Katalog und deshalb noch ohne eigene Seite: '
                f'{e(", ".join(sorted(ohne_seite)))}.</p>')
    out = [kopf(titel, beschr, pfad, [brot]), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k2 kopf">
      <span class="eyebrow">Schaltgruppen</span>
      <h1>Welche Teile passen zu deiner Schaltgruppe?</h1>
      <p class="lead">Die Schaltgruppe bestimmt, welche Kette und Kassette an dein Rad passen. Wähle deine Gruppe und sieh, welche Teile an Rädern mit dieser Gruppe verbaut sind und was als Ersatz passt. Welche Gruppe du hast, steht auf deiner Radseite unter „Alle Teile“ beim Schaltwerk.</p>
    </div>
  </div>
{abschnitte}{rest}
  </main>
''', FUSS]
    return ''.join(out)


# ---------------------------------------------------------------- E-Bike-Systeme

SYSTEM_TEXT = {
    'Bosch Smart System': ('Das Smart System ist die aktuelle Generation von Bosch. Akkus und Displays des Smart Systems '
                           'passen nur an Räder mit Smart System, nicht an ältere Bosch-Räder (Classic+). Achte beim Kauf '
                           'eines Ersatz- oder Zweitakkus deshalb auf den Zusatz „Smart System“.'),
}
AKKU_TEXT = ('Akkus sind oft auf Rahmen und Motorsystem zugeschnitten. Ein Ersatzakku sollte dieselbe Bezeichnung tragen '
             'wie der verbaute oder vom Radhersteller ausdrücklich freigegeben sein.')


def _paar_tabelle(raeder, kat):
    """Motoren bzw. Akkus dieses Systems, jeweils mit den Gegenstücken, die am selben Rad verbaut sind."""
    paare = antrieb_paare(raeder)
    teil = {t['id']: t for r in raeder for t in r['teile']}
    gegen = 'Akkus' if kat == 'Motor' else 'Motoren'
    zeilen = []
    for t, z in _haeufigste(raeder, kat, 99):
        dazu = paare.get(t['id'])
        zeilen.append(f'<tr><th scope="row">{teil_link(t)}{"<span>" + e(t["merkmale"]) + "</span>" if t["merkmale"] else ""}'
                      f'<span>{z} {"Rad" if z == 1 else "Räder"}</span></th>'
                      f'<td>{"<span class=paar-kopf>" + gegen + " dazu:</span>" + paar_liste(dazu.most_common(), teil) if dazu else ""}</td>'
                      f'<td class="preis">{preis(t["preis"])}</td></tr>')
    return f'<table class="teiltabelle paar-tabelle"><tbody>{"".join(zeilen)}</tbody></table>' if zeilen else ''


def system_seite(pfad, raeder):
    name = raeder[0]['system']
    nav, brot = krumen([('Radgarage', '/'), ('E-Bike-Systeme', '/e-bike-systeme/'), (name, pfad)])
    titel = f'{name}: Motor, Akku und E-Bikes im Überblick'
    if len(titel) < 50:
        titel += ' | Radgarage'
    motoren = _haeufigste(raeder, 'Motor', 12)
    akkus = _haeufigste(raeder, 'Akku', 12)
    beschr = (f'{len(raeder)} E-Bikes mit {name} im Katalog: welche Motoren und Akkus verbaut sind, mit Leistung, '
              f'Kapazität und Richtpreis.')
    liste = {'@context': 'https://schema.org', '@type': 'ItemList', 'name': f'E-Bikes mit {name}',
             'numberOfItems': len(raeder),
             'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': SEITE + r['pfad'],
                                  'name': f'{r["name"]} ({r["baujahr"]})'} for i, r in enumerate(raeder[:50])]}
    out = [kopf(titel, beschr, pfad, [liste, brot]), nav, '  <main>\n  <article class="bento anl rad">\n']
    top = motoren[0][0] if motoren else None
    out.append(f'''    <div class="t k4 kopf">
      <span class="eyebrow">E-Bike-System</span>
      <h1>{e(name)}</h1>
      <p class="lead">{len(raeder)} E-Bikes im Katalog fahren mit einem Antrieb von {e(name)}{", am häufigsten mit " + e(top["marke"] + " " + top["name"]) if top else ""}. Hier siehst du Motoren, Akkus und alle Räder auf einen Blick.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">E-Bikes im Katalog</span><div class="wert">{len(raeder)}</div></div>
      <div class="t s2"><span class="eyebrow">Motoren</span><div class="wert">{len(_haeufigste(raeder, "Motor", 99))}</div></div>
      <div class="t s2"><span class="eyebrow">Modelljahre</span><div class="wert">{_jahre(raeder)}</div></div>
    </div>
''')
    out.append(f'''    <section class="t s1 voll" aria-labelledby="motor-titel">
      <span class="eyebrow">Motor und Akku</span>
      <h2 id="motor-titel" style="font-size:30px;margin:6px 0 4px">Welcher Akku zu welchem Motor?</h2>
      <p>Jeder Motor von {e(name)} im Katalog mit den Akkus, die an denselben Rädern verbaut sind. Die Zahl sagt, an wie vielen Rädern das Paar vorkommt.</p>
      <p>{e(SYSTEM_TEXT.get(name, AKKU_TEXT))}</p>
      {_paar_tabelle(raeder, 'Motor')}
    </section>
    <section class="t k5 voll" aria-labelledby="akku-titel">
      <span class="eyebrow">Akku und Motor</span>
      <h2 id="akku-titel" style="font-size:30px;margin:6px 0 4px">Akkus an diesen E-Bikes und ihre Motoren</h2>
      <p>Andersherum: Du kennst deinen Akku und suchst den Motor dazu.</p>
      {_paar_tabelle(raeder, 'Akku')}
    </section>
''')
    out.append(f'''    <section class="t s1 voll" aria-labelledby="raeder-titel">
      <span class="eyebrow">E-Bikes</span>
      <h2 id="raeder-titel" style="font-size:30px;margin:6px 0 4px">E-Bikes mit {e(name)}</h2>
      {radliste(raeder)}
    </section>
  </article>
  <p class="hinweis">Zugeordnet nach dem Motor, der laut Katalog verbaut ist. Akku-Angaben nach Herstellerdaten, prüf vor dem Kauf die Freigabe für dein Rad. <a href="/so-pruefen-wir/">So prüfen wir</a></p>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)


def systeme_uebersicht(systeme, alle):
    pfad = '/e-bike-systeme/'
    nav, brot = krumen([('Radgarage', '/'), ('E-Bike-Systeme', pfad)])
    titel = 'E-Bike-Motoren und Akkus nach System | Radgarage'
    ebikes = [r for r in alle if r['system']]
    beschr = (f'Bosch Smart System, Shimano, Yamaha, TQ und mehr: welche Motoren und Akkus an {len(ebikes)} E-Bikes '
              f'im Katalog verbaut sind.')
    karten = ''.join(
        f'<a class="t {FARBEN[i % len(FARBEN)]} karte" href="{p}"><span class="eyebrow">E-Bike-System</span>'
        f'<h2>{e(rs[0]["system"])}</h2><span class="meta">{len(rs)} E-Bikes · {_jahre(rs)}</span></a>'
        for i, (p, rs) in enumerate(sorted(systeme.items(), key=lambda x: -len(x[1]))))
    out = [kopf(titel, beschr, pfad, [brot]), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k4 kopf">
      <span class="eyebrow">E-Bikes</span>
      <h1>Welcher Motor, welcher Akku?</h1>
      <p class="lead">{len(ebikes)} E-Bikes im Katalog, sortiert nach Motorsystem. Jede Seite zeigt, welche Motoren und Akkus verbaut sind und welcher Akku zu welchem Motor gehört. Wichtig für Ersatz- und Zweitakkus: Sie müssen zum System passen.</p>
    </div>
  </div>
  <section aria-label="Systeme" style="margin-top:14px">
    <div class="karten">{karten}</div>
  </section>
  </main>
''', FUSS]
    return ''.join(out)


def bauen(alle, schreiben):
    """Schreibt Schaltgruppen- und E-Bike-Seiten und gibt die Pfade für die Sitemap zurück."""
    seiten = []
    gruppen = nach_feld(alle, 'gruppe')
    ohne = {r['gruppe'] for r in alle if r['gruppe'] and not r['gruppe_pfad']}
    schreiben('schaltgruppen/index.html', gruppen_uebersicht(gruppen, ohne))
    seiten.append('/schaltgruppen/')
    for p, rs in gruppen.items():
        schreiben(p.strip('/') + '/index.html', gruppe_seite(p, rs, gruppen))
        seiten.append((p, max(r['geaendert'] for r in rs)))
    systeme = nach_feld(alle, 'system')
    schreiben('e-bike-systeme/index.html', systeme_uebersicht(systeme, alle))
    seiten.append('/e-bike-systeme/')
    for p, rs in systeme.items():
        schreiben(p.strip('/') + '/index.html', system_seite(p, rs))
        seiten.append((p, max(r['geaendert'] for r in rs)))
    return seiten
