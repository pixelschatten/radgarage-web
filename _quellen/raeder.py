"""Modellseiten: eine Seite pro Rad aus dem Katalog mit allen verbauten Teilen, dazu Seiten je Marke.

Daten: _quellen/katalog-auszug.json, erzeugt mit der Abfrage _quellen/katalog-auszug.sql
(Supabase, Ergebnisspalte daten). Gebaut wird über python3 _quellen/bauen.py.
"""
import json
import os
import re
from collections import OrderedDict
from urllib.parse import quote_plus

from anleitungen import ANLEITUNGEN, SEITE, FUSS, WURZEL, e, kopf, krumen

GRUPPEN = [
    ('Antrieb', ['Kette', 'Kassette', 'Riemen', 'Schaltwerk', 'Umwerfer', 'Schalthebel', 'Kurbel', 'Motor', 'Akku']),
    ('Bremsen', ['Bremsbelag', 'Bremsscheibe', 'Bremssattel']),
    ('Laufräder', ['Reifen', 'Schlauch', 'Laufradsatz']),
    ('Rahmen', ['Innenlager', 'Steckachse', 'Steuersatz', 'Gabel']),
    ('Cockpit', ['Lenker', 'Lenkerband']),
    ('Sitzen', ['Sattel', 'Sattelstütze', 'Pedale']),
    ('Sonstiges', ['Sonstiges']),
]
VERSCHLEISS = ['Kette', 'Kassette', 'Riemen', 'Bremsbelag', 'Bremsscheibe', 'Reifen', 'Schlauch']
NAMEN = {'Bremsbelag': 'Bremsbeläge', 'Bremsscheibe': 'Bremsscheiben', 'Bremssattel': 'Bremssättel'}
RICHTWERT_KM = {'Kette': 6000, 'Kassette': 15000, 'Bremsbelag': 3000, 'Reifen': 6000}
ANLEITUNG = {
    'Kette': 'kette-wechseln', 'Kassette': 'kassette-wechseln', 'Bremsbelag': 'bremsbelaege-wechseln',
    'Bremsscheibe': 'bremsscheibe-wechseln', 'Reifen': 'reifen-wechseln', 'Schlauch': 'schlauch-wechseln',
    'Lenkerband': 'lenkerband-wickeln', 'Innenlager': 'innenlager-wechseln',
}
SHOPS = [
    ('bike-components', 'https://www.bike-components.de/de/s/?keywords={q}'),
    ('BIKE24', 'https://www.bike24.de/suche?searchTerm={q}'),
    ('ROSE Bikes', 'https://www.rosebikes.de/search?q={q}'),
]
FARBEN = ['k1', 'k2', 'k3', 'k4', 'k5']


def laden():
    with open(os.path.join(WURZEL, '_quellen/katalog-auszug.json'), encoding='utf-8') as f:
        raeder = json.load(f)
    for r in raeder:
        m = re.match(r'^(.+?)-(\d{4})-(.+)$', r['id'])
        r['marke_slug'], r['slug'] = m.group(1), f'{m.group(2)}-{m.group(3)}'
        r['pfad'] = f'/raeder/{r["marke_slug"]}/{r["slug"]}/'
        r['name'] = f'{r["hersteller"]} {r["modell"]}'
        r['teile'] = r['teile'] or []
    return raeder


def preis(p):
    return f'ca. {round(float(p))} €' if p else ''


def teilname(t):
    return t['name'] if t['name'].lower().startswith(t['marke'].lower()) or t['marke'] == 'Universal' else f'{t["marke"]} {t["name"]}'


def hinweis(t):
    h = t.get('hinweis') or ''
    return '' if '99spokes' in h.lower() else h


def shoplinks(t):
    q = quote_plus(teilname(t).replace('Universal ', ''))
    return ' · '.join(f'<a href="{e(u.replace("{q}", q))}" target="_blank" rel="nofollow noopener">{e(n)}</a>' for n, u in SHOPS)


def verschleiss_kachel(t, farbe):
    kat = t['kategorie']
    zeilen = [f'<span class="eyebrow">{e(NAMEN.get(kat, kat))}</span>',
              f'<h3>{e(teilname(t))}</h3>']
    info = ', '.join(x for x in [t['merkmale'], hinweis(t)] if x)
    if info:
        zeilen.append(f'<p>{e(info)}</p>')
    fakten = []
    if t['preis']:
        fakten.append(f'<span><b>{preis(t["preis"])}</b> Richtpreis</span>')
    if kat in RICHTWERT_KM:
        fakten.append(f'<span>Wechsel etwa alle <b>{RICHTWERT_KM[kat]:,} km</b></span>'.replace(',', '.'))
    if fakten:
        zeilen.append(f'<p class="fakten">{"".join(fakten)}</p>')
    if t['abgeleitet']:
        zeilen.append('<p class="pruefen">Aus den übrigen Teilen erschlossen, bitte am Rad prüfen.</p>')
    alt = [a for a in (t.get('alternativen') or []) if a['marke'] != 'Universal']
    if alt:
        namen = ', '.join(e(teilname(a)) for a in alt)
        zeilen.append(f'<p class="klein"><b>Passt auch:</b> {namen}</p>')
    zeilen.append(f'<p class="klein">Suchen bei {shoplinks(t)}</p>')
    if kat in ANLEITUNG:
        a = next(x for x in ANLEITUNGEN if x['slug'] == ANLEITUNG[kat])
        zeilen.append(f'<a class="pill ghost klein-pill" href="/anleitungen/{a["slug"]}/">Anleitung: {e(a["h1"])}</a>')
    return f'<div class="t {farbe} teilkarte">{"".join(zeilen)}</div>'


def rad_seite(r, alle):
    nav, brot = krumen([('Radgarage', '/'), ('Räder', '/raeder/'), (r['hersteller'], f'/raeder/{r["marke_slug"]}/'),
                        (f'{r["modell"]} ({r["baujahr"]})', r['pfad'])])
    teile = r['teile']
    vers = [t for t in teile if t['kategorie'] in VERSCHLEISS]
    vers.sort(key=lambda t: VERSCHLEISS.index(t['kategorie']))
    titel_name = f'{r["name"]} ({r["baujahr"]})'
    titel = f'{titel_name}: Ersatzteile und verbaute Teile'
    if len(titel) < 50:
        titel += ' | Radgarage'
    kurz = [NAMEN.get(k, k) for k in ['Kette', 'Bremsbelag', 'Reifen'] if any(t['kategorie'] == k for t in teile)]
    beschr = (f'Welche {", ".join(kurz[:-1]) + " und " + kurz[-1] if len(kurz) > 1 else "Teile"} hat das {titel_name}? '
              f'Alle {len(teile)} verbauten Teile mit Richtpreis und passendem Ersatz.')
    produkt = {
        '@context': 'https://schema.org', '@type': 'Product', 'name': titel_name,
        'brand': {'@type': 'Brand', 'name': r['hersteller']}, 'model': r['modell'], 'category': r['kategorie'],
        'url': SEITE + r['pfad'],
        'hasPart': [{'@type': 'Product', 'name': teilname(t), 'brand': {'@type': 'Brand', 'name': t['marke']},
                     'category': t['kategorie']} for t in teile if t['marke'] != 'Universal'],
    }
    out = [kopf(titel, beschr, r['pfad'], [produkt, brot]), nav, '  <main>\n  <article class="bento anl rad">\n']
    uvp = f'<div class="t s2"><span class="eyebrow">Preis neu (UVP)</span><div class="wert">{round(r["uvp_eur"]):,} €</div></div>'.replace(',', '.') if r['uvp_eur'] else ''
    out.append(f'''    <div class="t k5 kopf">
      <span class="eyebrow">{e(r["kategorie"])} · Modelljahr {r["baujahr"]}</span>
      <h1>{e(titel_name)}</h1>
      <p class="lead">Alle {len(teile)} verbauten Teile des {e(r["name"])} aus dem Modelljahr {r["baujahr"]}: von der Kette bis zum Innenlager, mit Richtpreisen und Teilen, die als Ersatz passen.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Teile im Katalog</span><div class="wert">{len(teile)}</div></div>
      <div class="t s2"><span class="eyebrow">Verschleißteile</span><div class="wert">{len(vers)}</div></div>
      {uvp}
    </div>
''')
    if vers:
        karten = ''.join(verschleiss_kachel(t, FARBEN[i % len(FARBEN)]) for i, t in enumerate(vers))
        out.append(f'''    <section class="voll" aria-labelledby="vers-titel">
      <h2 id="vers-titel" class="zwischen">Verschleißteile am {e(r["modell"])}</h2>
      <div class="karten">{karten}</div>
    </section>
''')
    gruppen = []
    for name, kats in GRUPPEN:
        g = [t for t in teile if t['kategorie'] in kats]
        if not g:
            continue
        g.sort(key=lambda t: kats.index(t['kategorie']))
        zeilen = ''.join(
            f'<tr><th scope="row">{e(NAMEN.get(t["kategorie"], t["kategorie"]))}</th>'
            f'<td><b>{e(teilname(t))}</b>{"<sup>*</sup>" if t["abgeleitet"] else ""}'
            f'{"<span>" + e(", ".join(x for x in [t["merkmale"], hinweis(t)] if x)) + "</span>" if (t["merkmale"] or hinweis(t)) else ""}</td>'
            f'<td class="preis">{preis(t["preis"])}</td></tr>'
            for t in g)
        gruppen.append(f'<h3>{e(name)}</h3><table class="teiltabelle"><tbody>{zeilen}</tbody></table>')
    out.append(f'''    <section class="t s1 voll alle" aria-labelledby="alle-titel">
      <span class="eyebrow">Ausstattung</span>
      <h2 id="alle-titel" style="font-size:30px;margin:6px 0 4px">Alle Teile am {e(r["name"])}</h2>
      {"".join(gruppen)}
      <p class="klein">* Aus den übrigen Teilen erschlossen, bitte am Rad prüfen. Preise sind Richtpreise ohne Gewähr.</p>
    </section>
''')
    out.append(f'''    <aside class="t k4 app">
      <div>
        <span class="eyebrow">Die App zum Rad</span>
        <h2 style="margin:6px 0 8px">Dein {e(r["modell"])} in der Radgarage</h2>
        <p>Leg dein Rad in der App an und alle Teile sind sofort da. Die Radgarage zählt die Kilometer mit, sagt dir, wann Kette, Beläge und Reifen fällig sind, und zeigt passenden Ersatz mit Preisen aus mehreren Shops.</p>
      </div>
      <div class="actions"><a class="pill" href="/#anmelden">Testplatz sichern</a><a class="pill ghost" href="/">Mehr zur App</a></div>
    </aside>
''')
    andere = [x for x in alle if x['marke_slug'] == r['marke_slug'] and x['id'] != r['id']][:3]
    if len(andere) < 3:
        andere += [x for x in alle if x['marke_slug'] != r['marke_slug'] and x['kategorie'] == r['kategorie']][:3 - len(andere)]
    if andere:
        out.append(f'''    <section class="t mehr" aria-labelledby="mehr-titel">
      <h2 id="mehr-titel" style="font-size:30px;margin:14px 0 12px">Weitere Räder</h2>
      <div class="karten">{"".join(radkarte(x, i) for i, x in enumerate(andere))}</div>
    </section>
''')
    out.append(f'''  </article>
  <p class="hinweis">Angaben nach Herstellerdaten und Testberichten, Stand {e(r["geaendert"][:7].replace("-", "/"))}. Hersteller ändern die Ausstattung manchmal während des Modelljahrs, prüf vor dem Kauf die Teile an deinem Rad. Fehler entdeckt? Schreib uns an <a href="mailto:kontakt@radgarage.app">kontakt@radgarage.app</a> oder nutze in der App „Verbesserung vorschlagen“. Shop-Links sind Suchlinks, keine Partnerlinks.</p>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)


def radkarte(r, i=0, ebene='h3'):
    return (f'<a class="t {FARBEN[i % len(FARBEN)]} karte" href="{r["pfad"]}">'
            f'<span class="eyebrow">{e(r["hersteller"])} · {r["baujahr"]}</span><{ebene}>{e(r["modell"])}</{ebene}>'
            f'<span class="meta">{e(r["kategorie"])} · {len(r["teile"])} Teile</span></a>')


def marken(alle):
    m = OrderedDict()
    for r in sorted(alle, key=lambda x: (x['hersteller'].lower(), x['modell'], x['baujahr'])):
        m.setdefault(r['marke_slug'], []).append(r)
    return m


def marken_seite(slug, raeder):
    name = raeder[0]['hersteller']
    pfad = f'/raeder/{slug}/'
    nav, brot = krumen([('Radgarage', '/'), ('Räder', '/raeder/'), (name, pfad)])
    titel = f'{name}: Ersatzteile für alle Modelle | Radgarage'
    beschr = f'Ersatzteile für dein {name}: verbaute Teile, Verschleißteile und passender Ersatz für {len(raeder)} Modelle.'
    out = [kopf(titel, beschr, pfad, [brot]), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k1 kopf">
      <span class="eyebrow">Marke</span>
      <h1>{e(name)}: Teile und Ersatzteile</h1>
      <p class="lead">Wähle dein Modell und sieh, welche Kette, Bremsbeläge, Reifen und anderen Teile verbaut sind.</p>
    </div>
  </div>
  <section aria-label="Modelle" style="margin-top:14px">
    <div class="karten">{"".join(radkarte(r, i, 'h2') for i, r in enumerate(raeder))}</div>
  </section>
  </main>
''', FUSS]
    return ''.join(out)


def uebersicht_seite(alle, gesamt):
    nav, brot = krumen([('Radgarage', '/'), ('Räder', '/raeder/')])
    titel = 'Fahrrad-Ersatzteile nach Modell finden | Radgarage'
    beschr = 'Welche Teile sind an deinem Fahrrad verbaut? Ersatzteile nach Marke und Modell, mit Richtpreisen und passendem Ersatz.'
    m = marken(alle)
    marken_kacheln = ''.join(
        f'<a class="t {FARBEN[i % len(FARBEN)]} karte" href="/raeder/{s}/"><span class="eyebrow">Marke</span>'
        f'<h2>{e(rs[0]["hersteller"])}</h2><span class="meta">{len(rs)} Modelle</span></a>'
        for i, (s, rs) in enumerate(m.items()))
    return ''.join([kopf(titel, beschr, '/raeder/', [brot]), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k5 kopf">
      <span class="eyebrow">Räder und Teile</span>
      <h1>Was ist an deinem Rad verbaut?</h1>
      <p class="lead">Der Katalog der Radgarage kennt über {gesamt} Fahrräder mit allen verbauten Teilen. Such dir Marke und Modell aus und sieh, welche Kette, Beläge und Reifen passen.</p>
    </div>
  </div>
  <section aria-label="Marken" style="margin-top:14px">
    <div class="karten">{marken_kacheln}</div>
  </section>
  </main>
''', FUSS])
