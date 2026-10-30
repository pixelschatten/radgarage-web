"""Teileseiten: eine Seite pro Teil mit den Rädern, an denen es verbaut ist, und passendem Ersatz.

Daten: _quellen/teile-auszug.json (alle geprüften Teile, Abfrage _quellen/teile-auszug.sql) und
_quellen/katalog-auszug.json (Räder mit ihren Teilen). Gebaut wird über python3 _quellen/bauen.py.
"""
import re
from collections import Counter, OrderedDict

from anleitungen import ANLEITUNGEN, FUSS, SEITE, e, kopf, krumen, passend, suchfeld
from raeder import (ANLEITUNG, NAMEN, RICHTWERT_KM, TEILE, alternativen, preis, shoplinks, slug,
                    teil_link, teilname, tsd)

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


SCHALTAKKU = re.compile(r'Di2|AXS|eTap')  # Akkus der elektronischen Schaltung, nicht des E-Antriebs


def antrieb_paare(raeder):
    """Teil-ID -> Counter der Gegenstücke: zu jedem Motor die Akkus, die mit ihm am selben Rad verbaut sind, und umgekehrt."""
    m = {}
    for r in raeder:
        motoren = {t['id'] for t in r['teile'] if t['kategorie'] == 'Motor'}
        akkus = {t['id'] for t in r['teile'] if t['kategorie'] == 'Akku' and not SCHALTAKKU.search(t['name'])}
        for mo in motoren:
            for ak in akkus:
                m.setdefault(mo, Counter())[ak] += 1
                m.setdefault(ak, Counter())[mo] += 1
    return m


def paar_liste(dazu, teil):
    """Gegenstücke als kleine Linkliste, häufigste zuerst: [(id, anzahl)] -> HTML."""
    li = ''.join(f'<li>{teil_link(teil[i])} <small>{n} {"Rad" if n == 1 else "Räder"}</small></li>' for i, n in dazu)
    return f'<ul class="paare">{li}</ul>' if li else ''


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
    return f'<a class="t s1 karte" href="/teile/{e(a["id"])}/">{"".join(zeilen)}</a>'


def radliste(raeder):
    gruppen = OrderedDict()
    for r in sorted(raeder, key=lambda x: (x['hersteller'].lower(), x['modell'], -x['baujahr'])):
        gruppen.setdefault(r['hersteller'], []).append(r)
    if len(raeder) > 30:
        # Lange Listen nach Marke eingeklappt, die Links bleiben im HTML
        return '<div class="radmarken">' + ''.join(
            f'<details><summary><b>{e(marke)}</b><span>{len(rs)}</span></summary><ul>'
            + ''.join(f'<li><a href="{r["pfad"]}">{e(r["modell"])} ({r["baujahr"]})</a></li>' for r in rs)
            + '</ul></details>' for marke, rs in gruppen.items()) + '</div>'
    li = []
    for marke, rs in gruppen.items():
        li.append(f'<li class="marke">{e(marke)}</li>')
        li += [f'<li><a href="{r["pfad"]}">{e(r["modell"])} ({r["baujahr"]})</a></li>' for r in rs]
    return f'<ul class="radliste">{"".join(li)}</ul>'


def teil_seite(t, raeder, verbaut, paare=None):
    name = teilname(t)
    kat = t['kategorie']
    pfad = f'/teile/{t["id"]}/'
    nav, brot = krumen([('Radgarage', '/'), ('Teile', '/teile/'), (KATEGORIEN.get(kat, kat), kat_pfad(kat)), (name, pfad)])
    alt = alternativen(t['id'])
    titel = passend(f'{name}: passende Räder und Ersatz', f'{name}: Räder und Ersatz', f'{name}: Ersatz', name)
    if len(titel) < 50:
        titel += ' | Radgarage'
    def text(n_beispiele, merkmale=True):
        beispiele = ', '.join(f'{r["name"]}' for r in raeder[:n_beispiele])
        verbaut = f'Verbaut an {len(raeder)} Rädern' + (f', z. B. {beispiele}.' if beispiele else '.')
        return ' '.join(x for x in [
            f'{name}{" (" + t["merkmale"] + ")" if t["merkmale"] and merkmale else ""}:',
            f'Richtpreis {preis(t["preis"])}.' if t['preis'] else '',
            verbaut if raeder else '',
            f'{len(alt)} Teile passen als Ersatz.' if alt else '',
        ] if x)
    beschr = passend(text(2), text(1), text(0), text(0, False), grenze=165)
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
    # Schaltteile verlinken ihre Schaltgruppe, Motor und Akku ihr E-Bike-System (die häufigste an diesen Rädern)
    feld = 'gruppe' if kat in ('Schaltwerk', 'Schalthebel', 'Kassette', 'Kette', 'Umwerfer') else 'system' if kat in ('Motor', 'Akku') else None
    if feld and raeder:
        pfade = Counter(r[feld + '_pfad'] for r in raeder if r.get(feld + '_pfad'))
        if pfade:
            p_ = pfade.most_common(1)[0][0]
            n_ = next(r[feld] for r in raeder if r.get(feld + '_pfad') == p_)
            anleitung += f'<a class="pill ghost" href="{p_}">{"Schaltgruppe" if feld == "gruppe" else "E-Bike-System"}: {e(n_)}</a>'
    if kat in ANLEITUNG:
        a = next(x for x in ANLEITUNGEN if x['slug'] == ANLEITUNG[kat])
        anleitung += f'<a class="pill ghost" href="/anleitungen/{a["slug"]}/">Anleitung: {e(a["h1"])}</a>'
    out.append(f'''    <section class="t s2 voll teil-kauf" aria-labelledby="kauf-titel">
      <span class="eyebrow">Kaufen und einbauen</span>
      <h2 id="kauf-titel" style="font-size:var(--h2-k);margin:6px 0 6px">{e(name)} finden</h2>
      <p>Suchen bei {shoplinks(t)}. Preise schwanken, der Richtpreis ist ein Anhaltswert ohne Gewähr.</p>
      {"<div class='actions'>" + anleitung + "</div>" if anleitung else ""}
    </section>
''')
    dazu = (paare or {}).get(t['id'])
    if dazu and kat in ('Motor', 'Akku'):
        teil = {x['id']: x for r in raeder for x in r['teile']}
        gegen = 'Akku' if kat == 'Motor' else 'Motor'
        ueber = f'Passende Akkus zu {name}' if kat == 'Motor' else f'Passende Motoren zu {name}'
        text = (f'Mit diesem Motor sind im Katalog diese Akkus verbaut, häufigste zuerst. ' if kat == 'Motor' else
                f'Diesen Akku treiben im Katalog diese Motoren an, häufigste zuerst. ')
        text += ('Ein Ersatz- oder Zweitakku muss zum Motorsystem und zum Rahmen passen: Nimm dieselbe Bezeichnung wie '
                 'am Rad oder einen Akku, den der Radhersteller für dein Modell freigibt.')
        out.append(f'''    <section class="t k4 voll" aria-labelledby="paar-titel">
      <span class="eyebrow">Passt zusammen · {e(NAMEN.get(gegen, gegen))}</span>
      <h2 id="paar-titel" style="font-size:var(--h2-t);margin:6px 0 4px">{e(ueber)}</h2>
      <p>{text}</p>
      {paar_liste(dazu.most_common(), teil)}
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
      <h2 id="raeder-titel" style="font-size:var(--h2-t);margin:6px 0 4px">Räder mit {e(name)}</h2>
      {radliste(raeder)}
    </section>
''')
    out.append('''    <aside class="t k4 app">
      <div>
        <span class="eyebrow">Die App zum Rad</span>
        <h2 style="margin:6px 0 8px">Nie wieder das falsche Teil bestellen</h2>
        <p>Leg dein Rad in der Radgarage an und alle verbauten Teile sind sofort da. Die App zählt die Kilometer mit, erinnert dich an den Wechsel und zeigt passenden Ersatz mit Preisen aus mehreren Shops.</p>
      </div>
      <div class="actions"><a class="pill" href="/#anmelden">Testzugang anfordern</a><a class="pill ghost" href="/">Mehr zur App</a></div>
    </aside>
  </article>
  <p class="hinweis">Angaben nach Herstellerdaten und Testberichten. „Passt auch“ heißt: gleiche Einbaumaße und Norm nach unserem Katalog. Prüf vor dem Kauf trotzdem die Angaben des Herstellers. Shop-Links sind Suchlinks, keine Partnerlinks. Fehler entdeckt? Schreib uns an <a href="mailto:kontakt@radgarage.app">kontakt@radgarage.app</a>.</p>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)


def kategorie_seite(kat, teile, verbaut, paare=None):
    mehrzahl = KATEGORIEN.get(kat, kat)
    pfad = kat_pfad(kat)
    nav, brot = krumen([('Radgarage', '/'), ('Teile', '/teile/'), (mehrzahl, pfad)])
    titel = f'{mehrzahl} fürs Fahrrad: welche passen an welches Rad? | Radgarage'
    beschr = f'{len(teile)} {mehrzahl} im Katalog der Radgarage, mit Richtpreis, passenden Rädern und Ersatz.'
    teile = sorted(teile, key=lambda t: (-len(verbaut.get(t['id'], [])), teilname(t).lower()))
    teil = {x['id']: x for rs in verbaut.values() for r in rs for x in r['teile']}
    gegen = {'Motor': 'Akkus', 'Akku': 'Motoren'}.get(kat)

    def dazu(t):
        d = (paare or {}).get(t['id'])
        if not gegen or not d:
            return ''
        return f'<span class="paar-kopf">{gegen} dazu:</span>{paar_liste(d.most_common(4), teil)}'
    zeilen = ''.join(
        f'<tr><th scope="row"><a href="/teile/{e(t["id"])}/">{e(teilname(t))}</a>'
        f'{"<span>" + e(t["merkmale"]) + "</span>" if t["merkmale"] else ""}</th>'
        f'<td>{len(verbaut.get(t["id"], []))} Räder{dazu(t)}</td><td class="preis">{preis(t["preis"])}</td></tr>'
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


# Bereiche am Rad für die Übersicht /teile/, Farben wie bei den Anleitungen
BEREICHE_TEILE = [
    ('Antrieb', 'k1', ['Kette', 'Kassette', 'Riemen', 'Schaltwerk', 'Umwerfer', 'Schalthebel', 'Kurbel', 'Innenlager']),
    ('Bremsen', 'k2', ['Bremsbelag', 'Bremsscheibe', 'Bremssattel']),
    ('Laufräder und Reifen', 'k5', ['Reifen', 'Schlauch', 'Laufradsatz', 'Steckachse']),
    ('Cockpit, Sattel und Gabel', 'k3', ['Lenker', 'Lenkerband', 'Sattel', 'Sattelstütze', 'Gabel']),
    ('E-Antrieb', 'k4', ['Motor', 'Akku']),
    ('Sonstiges', 's1', ['Sonstiges']),
]


def bereich_kachel(name, farbe, kats):
    zeilen = ''.join(f'<li><a href="{kat_pfad(k)}"><b>{e(KATEGORIEN.get(k, k))}</b><span>{len(ts)} im Katalog</span></a></li>'
                     for k, ts in kats)
    return (f'<section class="t {farbe} bereich"><span class="eyebrow">Bereich</span><h3>{e(name)}</h3>'
            f'<ul class="radzeilen">{zeilen}</ul></section>') if zeilen else ''


def uebersicht_seite(nach_kat):
    nav, brot = krumen([('Radgarage', '/'), ('Teile', '/teile/')])
    titel = 'Fahrrad-Ersatzteile: was passt an welches Rad? | Radgarage'
    gesamt = sum(len(v) for v in nach_kat.values())
    beschr = f'{tsd(gesamt)} Fahrradteile von Kette bis Innenlager: an welchen Rädern sie verbaut sind und welcher Ersatz passt.'
    kacheln = ''.join(bereich_kachel(name, farbe, [(k, nach_kat[k]) for k in kats if k in nach_kat])
                      for name, farbe, kats in BEREICHE_TEILE)
    rest = [(k, ts) for k, ts in nach_kat.items() if not any(k in kats for _, _, kats in BEREICHE_TEILE)]
    if rest:
        kacheln += bereich_kachel('Weitere Teile', 's1', rest)
    return ''.join([kopf(titel, beschr, '/teile/', [brot]), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k1 kopf">
      <span class="eyebrow">Teile und Ersatz</span>
      <h1>Welches Teil passt an dein Rad?</h1>
      <p class="lead">Der Katalog der Radgarage kennt {tsd(gesamt)} Teile und weiß, an welchen Rädern sie verbaut sind. Such ein Teil oder wähle eine Kategorie und finde passenden Ersatz.</p>
      {suchfeld('teile')}
    </div>
  </div>
  <section aria-label="Nach System" style="margin-top:14px">
    <div class="karten">
      <a class="t k2 karte" href="/schaltgruppen/"><span class="eyebrow">Nach Gruppe</span><h2>Schaltgruppen</h2><span class="meta">Shimano, SRAM und mehr: was zu deiner Gruppe passt</span></a>
      <a class="t k4 karte" href="/e-bike-systeme/"><span class="eyebrow">E-Bike</span><h2>Motoren und Akkus</h2><span class="meta">Nach System: Bosch, Shimano, Yamaha und mehr</span></a>
      <a class="t k5 karte" href="/reifengroessen/"><span class="eyebrow">Reifen</span><h2>Reifengrößen</h2><span class="meta">ETRTO, Zoll und 700C umrechnen</span></a>
    </div>
  </section>
  <section aria-labelledby="bereiche-titel" style="margin-top:14px">
    <h2 id="bereiche-titel" class="zwischen">Alle Teile nach Bereich</h2>
    <div class="bereiche">{kacheln}</div>
  </section>
  </main>
''', FUSS])


def bauen(alle, schreiben):
    """Schreibt alle Teileseiten und gibt die Pfade für die Sitemap zurück (nur indexierte Seiten)."""
    verbaut = verbaut_an(alle)
    paare = antrieb_paare(alle)
    nach_kat = OrderedDict((k, []) for k in KATEGORIEN)
    for t in TEILE.values():
        nach_kat.setdefault(t['kategorie'], []).append(t)
    nach_kat = OrderedDict((k, v) for k, v in nach_kat.items() if v)
    assert not set(slug(k) for k in nach_kat) & set(TEILE), 'Kategorie-Slug kollidiert mit einer Teile-ID'
    seiten = ['/teile/']
    schreiben('teile/index.html', uebersicht_seite(nach_kat))
    for k, ts in nach_kat.items():
        schreiben(kat_pfad(k).strip('/') + '/index.html', kategorie_seite(k, ts, verbaut, paare))
        if len(ts) >= MIN_KATEGORIE:
            seiten.append(kat_pfad(k))
    for t in TEILE.values():
        raeder = verbaut.get(t['id'], [])
        schreiben(f'teile/{t["id"]}/index.html', teil_seite(t, raeder, verbaut, paare))
        if indexieren(t, raeder):
            seiten.append(f'/teile/{t["id"]}/')
    return seiten
