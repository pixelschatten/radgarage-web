"""Daten-Auswertung aus dem Katalog: Was kostet ein Fahrrad im Unterhalt? (/unterhaltskosten/)

Alle Zahlen werden beim Bauen aus dem Katalog gerechnet (Richtpreise und Verschleiß-Richtwerte wie auf den Radseiten).
Gebaut wird über python3 _quellen/bauen.py. Der Pressetext dazu liegt in den Projektdateien (seo/pressetext.md).
"""
import re
from collections import Counter, defaultdict
from statistics import median, quantiles

from anleitungen import FUSS, SEITE, e, kopf, krumen, monat
from raeder import JAHRES_KM, RICHTWERT_KM, TYP_MEHRZAHL, _fach, reifen_groesse, tsd, wartungskosten

PFAD = '/unterhaltskosten/'
MIN_RAEDER = 20          # Radtypen mit weniger ausgewerteten Rädern fehlen in der Tabelle
JAHRE = (2024, 2025, 2026)  # ältere Modelljahre sind im Katalog zu dünn besetzt
POSTEN = [('Reifen', 'Reifen'), ('Bremsbelag', 'Bremsbeläge'), ('Kette', 'Kette'), ('Kassette', 'Kassette')]
ELEKTRONISCH = re.compile(r'Di2|AXS|eTap')
ORGANISATION = {'@type': 'Organization', '@id': f'{SEITE}/#org', 'name': 'Radgarage', 'url': SEITE + '/'}


def euro(x, stellen=0):
    return (f'{x:.{stellen}f} €').replace('.', ',')


def daten(alle):
    """Alle Kennzahlen der Seite in einem Wörterbuch, damit Seite und Pressetext dieselben Zahlen nutzen."""
    je_typ, summen, anteile, reifen_typ = defaultdict(list), [], defaultdict(list), defaultdict(list)
    for r in alle:
        w = wartungskosten(r['teile'])
        if not w:
            continue
        summen.append(w['summe'])
        je_typ[r['kategorie']].append(w['summe'])
        teil = Counter()
        for p in w['posten']:
            teil[p['teil']['kategorie']] += p['je_1000']
        for k, _ in POSTEN:
            anteile[k].append(teil[k] / w['summe'])
        reifen_typ[r['kategorie']].append(teil['Reifen'])
    typen = []
    for typ, werte in je_typ.items():
        if len(werte) < MIN_RAEDER:
            continue
        q = quantiles(werte, n=4)
        typen.append({'typ': typ, 'name': TYP_MEHRZAHL.get(typ, typ), 'n': len(werte), 'median': median(werte), 'von': q[0],
                      'bis': q[2], 'reifen': median(reifen_typ[typ])})
    typen.sort(key=lambda t: t['median'])

    ketten = defaultdict(list)  # Gangzahl -> Richtpreise der verbauten Ketten (je Rad gezählt)
    for r in alle:
        for t in r['teile']:
            if t['kategorie'] == 'Kette' and t['preis']:
                m = re.search(r'(\d+)-fach', t['merkmale'] or '')
                if m:
                    ketten[int(m.group(1))].append(float(t['preis']))
    ketten = [{'fach': f, 'n': len(p), 'median': median(p)} for f, p in sorted(ketten.items()) if len(p) >= 10]

    elektro, breite, zwoelf = defaultdict(Counter), defaultdict(list), defaultdict(Counter)
    for r in alle:
        if r['baujahr'] not in JAHRE:
            continue
        sw = next((t for t in r['teile'] if t['kategorie'] == 'Schaltwerk'), None)
        if sw:
            el = bool(ELEKTRONISCH.search(f'{sw["name"]} {sw["merkmale"] or ""}'))
            for k in ('alle', r['kategorie']):
                elektro[(k, r['baujahr'])][el] += 1
        reifen = next((reifen_groesse(t) for t in r['teile'] if t['kategorie'] == 'Reifen' and reifen_groesse(t)), None)
        if reifen:
            breite[(r['kategorie'], r['baujahr'])].append(reifen[0])
        f = _fach(r)
        if f:
            zwoelf[r['baujahr']][f >= 12] += 1

    def anteil(c):
        n = c[True] + c[False]
        return (round(100 * c[True] / n), n) if n >= 20 else None

    trends = [
        ('Elektronische Schaltung, alle Räder', [anteil(elektro[('alle', j)]) for j in JAHRE], '%'),
        ('Elektronische Schaltung, Rennräder', [anteil(elektro[('Rennrad', j)]) for j in JAHRE], '%'),
        ('Elektronische Schaltung, Gravelbikes', [anteil(elektro[('Gravel', j)]) for j in JAHRE], '%'),
        ('12- oder 13-fach-Schaltung', [anteil(zwoelf[j]) for j in JAHRE], '%'),
        ('Reifenbreite Gravelbike (Median)', [(round(median(breite[('Gravel', j)])), len(breite[('Gravel', j)]))
                                             if len(breite[('Gravel', j)]) >= 20 else None for j in JAHRE], 'mm'),
        ('Reifenbreite Rennrad (Median)', [(round(median(breite[('Rennrad', j)])), len(breite[('Rennrad', j)]))
                                           if len(breite[('Rennrad', j)]) >= 20 else None for j in JAHRE], 'mm'),
    ]
    return {
        'n': len(summen), 'gesamt': len(alle), 'median': median(summen), 'typen': typen,
        'anteile': [(name, sum(anteile[k]) / len(anteile[k])) for k, name in POSTEN],
        'ketten': ketten, 'trends': trends,
    }


def _balken(zeilen, kopfzeile):
    """Tabelle mit waagerechten Balken: [(Name, Wert, Wert-Text, Nebentext)]. Ein Wert pro Zeile, eine Farbe."""
    hoch = max(w for _, w, _, _ in zeilen) or 1
    tr = ''.join(f'<tr><th scope="row">{e(n)}</th><td class="spur" aria-hidden="true"><i style="width:{max(2, w / hoch * 100):.1f}%"></i></td>'
                 f'<td class="zahl">{t}</td><td class="nebenbei">{neben}</td></tr>' for n, w, t, neben in zeilen)
    k = ''.join(f'<th scope="col"{" class=" + chr(34) + c + chr(34) if c else ""}>{e(x)}</th>' for x, c in kopfzeile)
    return f'<div class="tabelle-rahmen"><table class="balken-tabelle"><thead><tr>{k}</tr></thead><tbody>{tr}</tbody></table></div>'


def seite(alle, stand):
    d = daten(alle)
    nav, brot = krumen([('Radgarage', '/'), ('Anleitungen', '/anleitungen/'), ('Unterhaltskosten', PFAD)])
    jahr = d['median'] * JAHRES_KM / 1000
    teuer, guenstig = d['typen'][-1], d['typen'][0]
    reifen_anteil = round(100 * d['anteile'][0][1])
    titel = 'Was kostet ein Fahrrad im Unterhalt? Auswertung von über 1.000 Rädern'
    beschr = (f'Teilekosten für Kette, Kassette, Bremsbeläge und Reifen: im Mittel {euro(d["median"])} je 1.000 km. '
              f'Auswertung von {tsd(d["n"])} Rädern nach Radtyp, mit Kettenpreisen und Trends.')
    schema = {'@context': 'https://schema.org', '@type': 'Article', 'headline': 'Was kostet ein Fahrrad im Unterhalt?',
              'description': beschr, 'inLanguage': 'de', 'url': SEITE + PFAD, 'dateModified': stand,
              'author': ORGANISATION, 'publisher': ORGANISATION}
    out = [kopf(titel, beschr, PFAD, [schema, brot]), nav, '  <main>\n  <article class="bento anl">\n']
    out.append(f'''    <div class="t k2 kopf">
      <span class="eyebrow">Auswertung · Stand {monat(stand)}</span>
      <h1>Was kostet ein Fahrrad im Unterhalt?</h1>
      <p class="lead">Wir haben {tsd(d["n"])} Räder aus dem Katalog der Radgarage durchgerechnet: Was kosten Kette, Kassette, Bremsbeläge und Reifen, verteilt auf die Kilometer, die sie halten? Im Mittel sind es <b>{euro(d["median"])} je 1.000 km</b>, bei {tsd(JAHRES_KM)} km im Jahr also rund {euro(round(jahr / 5) * 5)}.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Je 1.000 km (Median)</span><div class="wert">{euro(d["median"])}</div></div>
      <div class="t s2"><span class="eyebrow">Bei {tsd(JAHRES_KM)} km im Jahr</span><div class="wert">ca. {euro(round(jahr / 5) * 5)}</div></div>
      <div class="t s2"><span class="eyebrow">Räder ausgewertet</span><div class="wert">{tsd(d["n"])}</div></div>
    </div>
''')
    zeilen = [(t['name'], t['median'], euro(t['median']), f'meist {euro(t["von"])} bis {euro(t["bis"])} · {t["n"]} Räder')
              for t in d['typen']]
    out.append(f'''    <section class="t s1 voll" aria-labelledby="typ-titel">
      <span class="eyebrow">Nach Radtyp</span>
      <h2 id="typ-titel" style="font-size:30px;margin:6px 0 4px">Unterhalt je 1.000 km</h2>
      <p>Am teuersten im Unterhalt sind {e(teuer["name"])} mit {euro(teuer["median"])} je 1.000 km, am günstigsten {e(guenstig["name"])} mit {euro(guenstig["median"])}. Ein großer Teil des Unterschieds steckt in den Reifen: Sie kosten bei {e(teuer["name"])} im Mittel {euro(teuer["reifen"])} je 1.000 km, bei {e(guenstig["name"])} {euro(guenstig["reifen"])}.</p>
      {_balken(zeilen, [('Radtyp', ''), ('', 'spur'), ('Median', 'zahl'), ('Spanne (mittlere Hälfte) · Anzahl', 'nebenbei')])}
      <p class="klein">Median = die Hälfte der Räder liegt darunter, die Hälfte darüber. „Meist“ = die mittlere Hälfte der Räder. Radtypen mit weniger als {MIN_RAEDER} ausgewerteten Rädern fehlen.</p>
    </section>
''')
    anteil_zeilen = [(n, a, f'{round(100 * a)} %', '') for n, a in d['anteile']]
    out.append(f'''    <section class="t k4 halb" aria-labelledby="anteil-titel">
      <span class="eyebrow">Wofür das Geld draufgeht</span>
      <h2 id="anteil-titel" style="font-size:28px;margin:6px 0 4px">Reifen und Beläge machen das meiste aus</h2>
      <p>Im Schnitt gehen {reifen_anteil} % der Teilekosten auf die Reifen. Zusammen mit den Bremsbelägen sind es rund {round(100 * (d["anteile"][0][1] + d["anteile"][1][1]))} %. Kette und Kassette fallen weniger ins Gewicht, als viele denken.</p>
      {_balken(anteil_zeilen, [('Teil', ''), ('', 'spur'), ('Anteil', 'zahl'), ('', 'nebenbei')])}
    </section>
''')
    ketten_zeilen = [(f'{k["fach"]}-fach', k['median'], euro(k['median']), f'{tsd(k["n"])} Räder') for k in d['ketten']]
    erste, letzte = d['ketten'][0], d['ketten'][-1]
    out.append(f'''    <section class="t k5 halb" aria-labelledby="kette-titel">
      <span class="eyebrow">Ketten</span>
      <h2 id="kette-titel" style="font-size:28px;margin:6px 0 4px">Mehr Gänge, teurere Kette</h2>
      <p>Eine {erste["fach"]}-fach-Kette kostet im Mittel {euro(erste["median"])}, eine {letzte["fach"]}-fach-Kette {euro(letzte["median"])}. Gezählt ist die Kette, die ab Werk am Rad verbaut ist.</p>
      {_balken(ketten_zeilen, [('Schaltung', ''), ('', 'spur'), ('Richtpreis', 'zahl'), ('Räder', 'nebenbei')])}
    </section>
''')

    def zelle(wert, einheit, jahr):
        if not wert:
            return f'<td class="zahl" data-label="{jahr}">–</td>'
        return f'<td class="zahl" data-label="{jahr}" title="{wert[1]} Räder">{wert[0]}{" %" if einheit == "%" else " mm"}</td>'
    trend_zeilen = ''.join(f'<tr><th scope="row">{e(n)}</th>{"".join(zelle(w, einheit, j) for w, j in zip(werte, JAHRE))}</tr>'
                           for n, werte, einheit in d['trends'])
    out.append(f'''    <section class="t s2 voll" aria-labelledby="trend-titel">
      <span class="eyebrow">Neue Räder</span>
      <h2 id="trend-titel" style="font-size:30px;margin:6px 0 4px">Was sich von Modelljahr zu Modelljahr ändert</h2>
      <p>Bei den Modelljahren 2024 bis 2026 im Katalog setzen sich elektronische Schaltungen und 12-fach durch, Gravelbikes rollen auf breiteren Reifen. Elektronische Schaltungen bringen einen kleinen Akku mit, 12- und 13-fach-Ketten sind teurer.</p>
      <div class="tabelle-rahmen"><table class="vergleichstabelle trend-tabelle">
        <thead><tr><th scope="col">Modelljahr</th>{"".join(f'<th scope="col" class="zahl">{j}</th>' for j in JAHRE)}</tr></thead>
        <tbody>{trend_zeilen}</tbody>
      </table></div>
      <p class="klein">Anteile unter den Rädern des jeweiligen Modelljahrs im Katalog, nur Werte mit mindestens 20 Rädern. Der Katalog ist keine Marktstatistik: Er enthält vor allem aktuelle Räder großer Marken.</p>
    </section>
''')
    out.append(f'''    <section class="t k3 voll text-abschnitt" aria-labelledby="methode-titel">
      <span class="eyebrow">So haben wir gerechnet</span>
      <h2 id="methode-titel" style="font-size:30px;margin:6px 0 8px">Methode und Grenzen</h2>
      <ul class="punkte">
        <li><b>Grundlage:</b> {tsd(d["gesamt"])} Räder im Katalog, davon {tsd(d["n"])} mit Richtpreisen für Reifen, Bremsbeläge und Kette oder Kassette. Die übrigen fehlen in der Auswertung.</li>
        <li><b>Rechnung:</b> Richtpreis des ab Werk verbauten Teils geteilt durch den Verschleiß-Richtwert: Kette {tsd(RICHTWERT_KM["Kette"])} km, Kassette {tsd(RICHTWERT_KM["Kassette"])} km, Bremsbeläge {tsd(RICHTWERT_KM["Bremsbelag"])} km, Reifen {tsd(RICHTWERT_KM["Reifen"])} km. Beläge und Reifen zählen für vorn und hinten. Ohne Werkstattkosten.</li>
        <li><b>E-Bikes:</b> Die Rechnung nutzt für alle Räder dieselben Richtwerte. Am E-Bike verschleißen Kette, Kassette und Beläge in der Praxis oft deutlich schneller. Wie stark, schätzt der <a href="/verschleissrechner/">Verschleißrechner</a>.</li>
        <li><b>Richtpreise</b> sind gerundete Anhaltswerte, teils geschätzt, keine Angebote. Mehr dazu unter <a href="/so-pruefen-wir/">So prüfen wir</a>.</li>
      </ul>
      <p><b>Zahlen verwenden:</b> Gern, mit der Quelle „Radgarage (radgarage.app/unterhaltskosten)“. Für Fragen und Presseanfragen: <a href="mailto:kontakt@radgarage.app">kontakt@radgarage.app</a>.</p>
    </section>
    <aside class="t k1 app">
      <div>
        <span class="eyebrow">Dein Rad</span>
        <h2 style="margin:6px 0 8px">Was kostet dein Rad?</h2>
        <p>Jede Radseite rechnet mit den Teilen, die an genau diesem Modell verbaut sind. Der Verschleißrechner berücksichtigt E-Bike, Nässe und Gelände.</p>
      </div>
      <div class="actions"><a class="pill" href="/raeder/">Rad suchen</a><a class="pill ghost" href="/verschleissrechner/">Verschleißrechner</a></div>
    </aside>
  </article>
  <p class="hinweis">Gerechnet aus dem Katalog der Radgarage, Stand {stand[8:10]}.{stand[5:7]}.{stand[:4]}. Die Zahlen werden mit dem Katalog laufend neu berechnet.</p>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)


def bauen(alle, schreiben, stand):
    schreiben('unterhaltskosten/index.html', seite(alle, stand))
    return [(PFAD, stand)]
