"""Teileseiten: eine Seite pro Teil mit den Rädern, an denen es verbaut ist, und passendem Ersatz.

Daten: _quellen/teile-auszug.json (alle geprüften Teile, Abfrage _quellen/teile-auszug.sql) und
_quellen/katalog-auszug.json (Räder mit ihren Teilen). Gebaut wird über python3 _quellen/bauen.py.
"""
from collections import OrderedDict

from anleitungen import ANLEITUNGEN, FUSS, SEITE, e, kopf, krumen, suchfeld
from raeder import (ANLEITUNG, FARBEN, NAMEN, RICHTWERT_KM, TEILE, alternativen, preis, shoplinks, slug,
                    teilname, tsd)

# Kategorien in der Reihenfolge der Übersicht, mit Mehrzahl für Überschriften.
KATEGORIEN = OrderedDict([
    ('Kette', 'Ketten'), ('Kassette', 'Kassetten'), ('Bremsbelag', 'Bremsbeläge'), ('Bremsscheibe', 'Bremsscheiben'),
    ('Reifen', 'Reifen'), ('Schlauch', 'Schläuche'), ('Riemen', 'Riemen'), ('Schaltwerk', 'Schaltwerke'),
    ('Umwerfer', 'Umwerfer'), ('Schalthebel', 'Schalthebel'), ('Kurbel', 'Kurbeln'), ('Innenlager', 'Innenlager'),
    ('Bremssattel', 'Bremssättel'), ('Laufradsatz', 'Laufradsätze'), ('Gabel', 'Gabeln'), ('Steckachse', 'Steckachsen'),
    ('Lenker', 'Lenker'), ('Lenkerband', 'Lenkerbänder'), ('Sattel', 'Sättel'), ('Sattelstütze', 'Sattelstützen'),
    ('Motor', 'Motoren'), ('Akku', 'Akkus'), ('Sonstiges', 'Sonstige Teile'),
])

MIN_KATEGORIE = 5  # Kategorien mit weniger Teilen sind für Google zu dünn und bleiben vorerst aus dem Index


def kat_pfad(kat):
    return f'/teile/{slug(kat)}/'


def verbaut_an(alle):
    """Teil-ID -> Räder, an denen es verbaut ist."""
    m = {}
    for r in alle:
        for t in r['teile']:
            m.setdefault(t['id'], []).append(r)
    return m


def indexieren(t, raeder):
    # Dünne Seiten (ein Rad, kein Ersatz) und Universal-Teile bleiben aus dem Google-Index, bis mehr Daten da sind.
    return t['marke'] != 'Universal' and (len(raeder) > 1 or bool(alternativen(t['id'])))


def ersatzkarte(a, i, n_raeder):
    zeilen = [f'<span class="eyebrow">{e(a["marke"])}</span>', f'<h3>{e(teilname(a))}</h3>']
    if a['merkmale']:
        zeilen.append(f'<p>{e(a["merkmale"])}</p>')
    meta = ' · '.join(x for x in [preis(a['preis']), f'an {n_raeder} Rädern verbaut' if n_raeder else ''] if x)
    if meta:
        zeilen.append(f'<span class="meta">{meta}</span>')
    return f'<a class="t {FARBEN[i % len(FARBEN)]} karte" href="/teile/{e(a["id"])}/">{"".join(zeilen)}</a>'


def radliste(raeder):
    gruppen = OrderedDict()
    for r in sorted(raeder, key=lambda x: (x['hersteller'].lower(), x['modell'], -x['baujahr'])):
        gruppen.setdefault(r['hersteller'], []).append(r)
    li = []
    for marke, rs in gruppen.items():
        li.append(f'<li class="marke">{e(marke)}</li>')
        li += [f'<li><a href="{r["pfad"]}">{e(r["modell"])} ({r["baujahr"]})</a></li>' for r in rs]
    return f'<ul class="radliste">{"".join(li)}</ul>'


def teil_seite(t, raeder, verbaut):
    name = teilname(t)
    kat = t['kategorie']
    pfad = f'/teile/{t["id"]}/'
    nav, brot = krumen([('Radgarage', '/'), ('Teile', '/teile/'), (KATEGORIEN.get(kat, kat), kat_pfad(kat)), (name, pfad)])
    alt = alternativen(t['id'])
    titel = f'{name}: passende Räder und Ersatz'
    if len(titel) < 50:
        titel += ' | Radgarage'
    beispiele = ', '.join(f'{r["name"]}' for r in raeder[:2])
    beschr = ' '.join(x for x in [
        f'{name}{" (" + t["merkmale"] + ")" if t["merkmale"] else ""}:',
        f'Richtpreis {preis(t["preis"])}.' if t['preis'] else '',
        f'Verbaut an {len(raeder)} Rädern, z. B. {beispiele}.' if raeder else '',
        f'{len(alt)} Teile passen als Ersatz.' if alt else '',
    ] if x)
    # Liste der Räder statt „Product“: ohne festen Preis und Bewertungen wertet Google Produktdaten als ungültig.
    schema = [brot]
    if raeder:
        schema.insert(0, {'@context': 'https://schema.org', '@type': 'ItemList', 'name': f'Räder mit {name}',
                          'numberOfItems': len(raeder),
                          'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': SEITE + r['pfad'],
                                               'name': f'{r["name"]} ({r["baujahr"]})'} for i, r in enumerate(raeder[:50])]})
    k = kopf(titel, beschr, pfad, schema, robots=not indexieren(t, raeder))
    out = [k, nav, '  <main>\n  <article class="bento anl rad">\n']
    lead = (f'{e(name)} ist an {len(raeder)} {"Rad" if len(raeder) == 1 else "Rädern"} aus unserem Katalog verbaut. '
            if raeder else f'{e(name)} passt als Ersatz an Räder aus unserem Katalog. ')
    lead += 'Hier siehst du, an welchen, und welche Teile stattdessen passen.' if alt else 'Hier siehst du, an welchen.'
    fakten = []
    if t['preis']:
        fakten.append(('Richtpreis', preis(t['preis'])))
    fakten.append(('Verbaut an', f'{len(raeder)} {"Rad" if len(raeder) == 1 else "Rädern"}'))
    if kat in RICHTWERT_KM:
        fakten.append(('Wechsel etwa alle', f'{tsd(RICHTWERT_KM[kat])} km'))
    elif alt:
        fakten.append(('Passender Ersatz', f'{len(alt)} Teile'))
    daten = ''.join(f'<div class="t s2"><span class="eyebrow">{e(a)}</span><div class="wert">{e(b)}</div></div>' for a, b in fakten)
    out.append(f'''    <div class="t k1 kopf">
      <span class="eyebrow">{e(NAMEN.get(kat, kat))} · {e(t["marke"])}</span>
      <h1>{e(name)}</h1>
      <p class="lead">{lead}</p>
      {"<p><b>Merkmale:</b> " + e(t["merkmale"]) + "</p>" if t["merkmale"] else ""}
    </div>
    <div class="daten">{daten}</div>
''')
    anleitung = ''
    if kat in ANLEITUNG:
        a = next(x for x in ANLEITUNGEN if x['slug'] == ANLEITUNG[kat])
        anleitung = f'<a class="pill ghost" href="/anleitungen/{a["slug"]}/">Anleitung: {e(a["h1"])}</a>'
    out.append(f'''    <section class="t s2 voll teil-kauf" aria-labelledby="kauf-titel">
      <span class="eyebrow">Kaufen und einbauen</span>
      <h2 id="kauf-titel" style="font-size:26px;margin:6px 0 6px">{e(name)} finden</h2>
      <p>Suchen bei {shoplinks(t)}. Preise schwanken, der Richtpreis ist ein Anhaltswert ohne Gewähr.</p>
      {"<div class='actions'>" + anleitung + "</div>" if anleitung else ""}
    </section>
''')
    if alt:
        karten = ''.join(ersatzkarte(a, i, len(verbaut.get(a['id'], []))) for i, a in enumerate(alt[:12]))
        mehr = f'<p class="klein">Und {len(alt) - 12} weitere passende Teile.</p>' if len(alt) > 12 else ''
        out.append(f'''    <section class="voll" aria-labelledby="alt-titel">
      <h2 id="alt-titel" class="zwischen">Passt auch: Ersatz für {e(name)}</h2>
      <div class="karten">{karten}</div>{mehr}
    </section>
''')
    if raeder:
        out.append(f'''    <section class="t s1 voll" aria-labelledby="raeder-titel">
      <span class="eyebrow">Verbaut an</span>
      <h2 id="raeder-titel" style="font-size:30px;margin:6px 0 4px">Räder mit {e(name)}</h2>
      {radliste(raeder)}
    </section>
''')
    out.append('''    <aside class="t k4 app">
      <div>
        <span class="eyebrow">Die App zum Rad</span>
        <h2 style="margin:6px 0 8px">Nie wieder das falsche Teil bestellen</h2>
        <p>Leg dein Rad in der Radgarage an und alle verbauten Teile sind sofort da. Die App zählt die Kilometer mit, erinnert dich an den Wechsel und zeigt passenden Ersatz mit Preisen aus mehreren Shops.</p>
      </div>
      <div class="actions"><a class="pill" href="/#anmelden">Testplatz sichern</a><a class="pill ghost" href="/">Mehr zur App</a></div>
    </aside>
  </article>
  <p class="hinweis">Angaben nach Herstellerdaten und Testberichten. „Passt auch“ heißt: gleiche Einbaumaße und Norm nach unserem Katalog. Prüf vor dem Kauf trotzdem die Angaben des Herstellers. Shop-Links sind Suchlinks, keine Partnerlinks. Fehler entdeckt? Schreib uns an <a href="mailto:kontakt@radgarage.app">kontakt@radgarage.app</a>.</p>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)


def kategorie_seite(kat, teile, verbaut):
    mehrzahl = KATEGORIEN.get(kat, kat)
    pfad = kat_pfad(kat)
    nav, brot = krumen([('Radgarage', '/'), ('Teile', '/teile/'), (mehrzahl, pfad)])
    titel = f'{mehrzahl} fürs Fahrrad: welche passen an welches Rad? | Radgarage'
    beschr = f'{len(teile)} {mehrzahl} im Katalog der Radgarage, mit Richtpreis, passenden Rädern und Ersatz.'
    teile = sorted(teile, key=lambda t: (-len(verbaut.get(t['id'], [])), teilname(t).lower()))
    zeilen = ''.join(
        f'<tr><th scope="row"><a href="/teile/{e(t["id"])}/">{e(teilname(t))}</a>'
        f'{"<span>" + e(t["merkmale"]) + "</span>" if t["merkmale"] else ""}</th>'
        f'<td>{len(verbaut.get(t["id"], []))} Räder</td><td class="preis">{preis(t["preis"])}</td></tr>'
        for t in teile)
    return ''.join([kopf(titel, beschr, pfad, [brot], robots=len(teile) < MIN_KATEGORIE), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k2 kopf">
      <span class="eyebrow">Teile</span>
      <h1>{e(mehrzahl)}</h1>
      <p class="lead">{len(teile)} {e(mehrzahl)} im Katalog, die häufigsten zuerst. Jede Seite zeigt, an welchen Rädern das Teil verbaut ist und was als Ersatz passt.</p>
    </div>
    <section class="t s1 voll alle">
      <table class="teiltabelle kat-tabelle"><tbody>{zeilen}</tbody></table>
    </section>
  </div>
  </main>
''', FUSS])


def uebersicht_seite(nach_kat):
    nav, brot = krumen([('Radgarage', '/'), ('Teile', '/teile/')])
    titel = 'Fahrrad-Ersatzteile: was passt an welches Rad? | Radgarage'
    gesamt = sum(len(v) for v in nach_kat.values())
    beschr = f'{tsd(gesamt)} Fahrradteile von Kette bis Innenlager: an welchen Rädern sie verbaut sind und welcher Ersatz passt.'
    kacheln = ''.join(
        f'<a class="t {FARBEN[i % len(FARBEN)]} karte" href="{kat_pfad(k)}"><span class="eyebrow">Teile</span>'
        f'<h2>{e(KATEGORIEN.get(k, k))}</h2><span class="meta">{len(ts)} im Katalog</span></a>'
        for i, (k, ts) in enumerate(nach_kat.items()))
    return ''.join([kopf(titel, beschr, '/teile/', [brot]), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k1 kopf">
      <span class="eyebrow">Teile und Ersatz</span>
      <h1>Welches Teil passt an dein Rad?</h1>
      <p class="lead">Der Katalog der Radgarage kennt {tsd(gesamt)} Teile und weiß, an welchen Rädern sie verbaut sind. Such ein Teil oder wähle eine Kategorie und finde passenden Ersatz.</p>
      {suchfeld('teile')}
    </div>
  </div>
  <section aria-label="Kategorien" style="margin-top:14px">
    <div class="karten">{kacheln}</div>
  </section>
  </main>
''', FUSS])


def bauen(alle, schreiben):
    """Schreibt alle Teileseiten und gibt die Pfade für die Sitemap zurück (nur indexierte Seiten)."""
    verbaut = verbaut_an(alle)
    nach_kat = OrderedDict((k, []) for k in KATEGORIEN)
    for t in TEILE.values():
        nach_kat.setdefault(t['kategorie'], []).append(t)
    nach_kat = OrderedDict((k, v) for k, v in nach_kat.items() if v)
    assert not set(slug(k) for k in nach_kat) & set(TEILE), 'Kategorie-Slug kollidiert mit einer Teile-ID'
    seiten = ['/teile/']
    schreiben('teile/index.html', uebersicht_seite(nach_kat))
    for k, ts in nach_kat.items():
        schreiben(kat_pfad(k).strip('/') + '/index.html', kategorie_seite(k, ts, verbaut))
        if len(ts) >= MIN_KATEGORIE:
            seiten.append(kat_pfad(k))
    for t in TEILE.values():
        raeder = verbaut.get(t['id'], [])
        schreiben(f'teile/{t["id"]}/index.html', teil_seite(t, raeder, verbaut))
        if indexieren(t, raeder):
            seiten.append(f'/teile/{t["id"]}/')
    return seiten
