"""Modellseiten: eine Seite pro Rad aus dem Katalog mit allen verbauten Teilen, dazu Seiten je Marke.

Daten: _quellen/katalog-auszug.json, erzeugt mit der Abfrage _quellen/katalog-auszug.sql
(Supabase, Ergebnisspalte daten). Gebaut wird über python3 _quellen/bauen.py.
"""
import json
import os
import re
from collections import OrderedDict, defaultdict
from statistics import median
from urllib.parse import quote_plus

from anleitungen import ANLEITUNGEN, SEITE, FUSS, WURZEL, e, kopf, krumen, passend, suchfeld

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
    'Lenkerband': 'lenkerband-wickeln', 'Innenlager': 'innenlager-wechseln', 'Kurbel': 'innenlager-wechseln',
    'Lenker': 'lenkerband-wickeln',
}
SHOPS = [
    ('bike-components', 'https://www.bike-components.de/de/s/?keywords={q}'),
    ('BIKE24', 'https://www.bike24.de/suche?searchTerm={q}'),
    ('ROSE Bikes', 'https://www.rosebikes.de/search?q={q}'),
]
FARBEN = ['k1', 'k2', 'k3', 'k4', 'k5']


def art_farbe(kategorie):
    """Farbe einer Radkarte nach Radart, damit die Farbe etwas bedeutet: Rennrad gelb, Gravel apricot, MTB grün,
    E-Bikes blau, alles andere lila."""
    if kategorie.startswith('E-'):
        return 'k5'
    return {'Rennrad': 'k3', 'Gravel': 'k1', 'MTB': 'k4'}.get(kategorie, 'k2')
# Radversicherung als Anzeige auf den Radseiten, wie in der App (src/data/versicherung.ts).
# Ohne Partnerlink erscheint der Kasten nicht. Richtwert aus denselben Beispielbeiträgen wie in der App.
VERSICHERUNG = {
    'name': 'hepster',
    # Awin-Deeplink (hepster = Advertiser 17549, Radgarage = Publisher 3134923), {ziel} wird zur Zielseite
    'link': 'https://www.awin1.com/cread.php?awinmid=17549&awinaffid=3134923&clickref=website&ued={ziel}',
    'ziel': {'rad': 'https://hepster.com/de-de/fahrradversicherung', 'ebike': 'https://hepster.com/de-de/e-bike-versicherung'},
    'anteil_monat': {'rad': 0.0042, 'ebike': 0.0022},
    'mindestens': 2.42,
    'stand': 'Oktober 2026',
}
JAHRES_KM = 3000  # Beispiel-Fahrleistung für die Wartungskosten pro Jahr


def _teile_laden():
    # Alle geprüften Teile mit passt_key, erzeugt mit _quellen/teile-auszug.sql
    with open(os.path.join(WURZEL, '_quellen/teile-auszug.json'), encoding='utf-8') as f:
        return {t['id']: t for t in json.load(f)}


TEILE = _teile_laden()


def alternativen(teil_id):
    """Teile mit gleichem passt_key, günstigste zuerst."""
    t = TEILE.get(teil_id)
    if not t or not t['passt_key']:
        return []
    alt = [a for a in TEILE.values() if a['passt_key'] == t['passt_key'] and a['id'] != teil_id]
    return sorted(alt, key=lambda a: (a['preis'] is None, a['preis'] or 0, a['marke'], a['name']))


def slug(s):
    s = s.lower().replace('+', ' plus')
    for a, b in [('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss'), ('é', 'e'), ('è', 'e')]:
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def laden():
    with open(os.path.join(WURZEL, '_quellen/katalog-auszug.json'), encoding='utf-8') as f:
        raeder = json.load(f)
    for r in raeder:
        m = re.match(r'^(.+?)-(\d{4})-(.+)$', r['id'])
        r['marke_slug'], r['slug'] = m.group(1), f'{m.group(2)}-{m.group(3)}'
        r['pfad'] = f'/raeder/{r["marke_slug"]}/{r["slug"]}/'
        r['name'] = f'{r["hersteller"]} {r["modell"]}'
        r['teile'] = r['teile'] or []
    # Reihenseite nur, wenn die Reihe mindestens zwei Räder hat. Der Slug darf nicht mit einer Ziffer
    # beginnen, sonst könnte er mit den Radpfaden /raeder/<marke>/<jahr>-<modell>/ kollidieren.
    zahl = {}
    for r in raeder:
        zahl[(r['marke_slug'], r['reihe'])] = zahl.get((r['marke_slug'], r['reihe']), 0) + 1
    for r in raeder:
        s = slug(r['reihe'])
        if s[:1].isdigit():
            s = f'{r["marke_slug"]}-{s}'
        r['reihe_pfad'] = f'/raeder/{r["marke_slug"]}/{s}/' if zahl[(r['marke_slug'], r['reihe'])] > 1 else None
    # Schaltgruppe und Motorsystem, mit Seite ab MIN_GRUPPE Rädern
    for feld, fn, basis in (('gruppe', schaltgruppe, '/schaltgruppen/'), ('system', motorsystem, '/e-bike-systeme/')):
        anzahl = {}
        for r in raeder:
            r[feld] = fn(r)
            anzahl[r[feld]] = anzahl.get(r[feld], 0) + 1
        for r in raeder:
            r[feld + '_pfad'] = f'{basis}{slug(r[feld])}/' if r[feld] and anzahl[r[feld]] >= MIN_GRUPPE else None
    return raeder


SHIMANO_LINIE = re.compile(r'^(.*?)\s*(?:RD-|$)')
SRAM_WEG = re.compile(r'\(.*?\)|\bSchaltwerk\b|\b1[123]-fach\b|\bmechanisch\b|\beTap\b|\b[DE][12]\b')


def _fach(r):
    for kat in ('Kassette', 'Kette', 'Schaltwerk', 'Schalthebel'):
        for t in r['teile']:
            if t['kategorie'] == kat:
                m = re.search(r'(\d{1,2})-fach', t.get('merkmale') or '')
                if m:
                    return int(m.group(1))
    return None


def schaltgruppe(r):
    """Name der Schaltgruppe aus dem verbauten Schaltwerk, z. B. „Shimano XT 12-fach“, oder None."""
    sw = next((t for t in r['teile'] if t['kategorie'] == 'Schaltwerk'), None)
    if not sw:
        return None
    marke, name = sw['marke'], sw['name']
    if 'Nabenschaltung' in name or marke in ('Rohloff', 'enviolo'):
        if marke == 'Rohloff':
            return 'Rohloff Speedhub'
        if marke == 'enviolo':
            return 'enviolo Nabenschaltung'
        m = re.match(r'(Nexus|Alfine) (\d+)-Gang', name)
        return f'Shimano {m.group(1)} {m.group(2)}-Gang' if m else None
    fach = _fach(r)
    if not fach:
        return None
    if marke == 'Shimano':
        linie = SHIMANO_LINIE.match(name).group(1).replace('Deore XT', 'XT').strip()
        if not linie:
            return None
        if 'LinkGlide' in name:
            linie += ' LinkGlide'
        return f'Shimano {linie} {fach}-fach'
    if marke == 'SRAM':
        linie = re.sub(r'\s+', ' ', SRAM_WEG.sub(' ', name)).strip().replace('XO1', 'X01')
        if 'AXS' in name and 'AXS' not in linie:
            linie += ' AXS'
        return f'SRAM {linie} {fach}-fach' if linie else None
    if marke == 'microSHIFT':
        linie = re.sub(r'\s+(Schaltwerk.*|RD-.*)$', '', name).strip()
        return f'microSHIFT {linie} {fach}-fach' if linie and not linie.startswith(('RD', 'MS')) else None
    return None


MOTOR_SYSTEME = [  # (Name, Bedingung auf Motor-Marke und -Name)
    ('Bosch Smart System', lambda m, n, x: m == 'Bosch' and 'Smart System' in f'{n} {x}'),
    ('Bosch ohne Smart System', lambda m, n, x: m == 'Bosch'),
    ('Shimano', lambda m, n, x: m == 'Shimano'), ('Yamaha', lambda m, n, x: m == 'Yamaha'),
    ('Giant SyncDrive', lambda m, n, x: m == 'Giant'), ('Specialized Turbo', lambda m, n, x: m == 'Specialized'),
    ('TQ', lambda m, n, x: m == 'TQ'), ('Pinion MGU', lambda m, n, x: m == 'Pinion'),
    ('Mahle', lambda m, n, x: m == 'Mahle'), ('Brose', lambda m, n, x: m == 'Brose'), ('Fazua', lambda m, n, x: m == 'Fazua'),
]


def motorsystem(r):
    mo = next((t for t in r['teile'] if t['kategorie'] == 'Motor'), None)
    if not mo:
        return None
    return next((n for n, wenn in MOTOR_SYSTEME if wenn(mo['marke'], mo['name'], mo.get('merkmale') or '')), None)


MIN_GRUPPE = 5  # eigene Seite für Schaltgruppen und Motorsysteme erst ab so vielen Rädern


def preis(p):
    return f'ca. {round(float(p))} €' if p else ''


def teilname(t):
    return t['name'] if t['name'].lower().startswith(t['marke'].lower()) or t['marke'] == 'Universal' else f'{t["marke"]} {t["name"]}'


# Felgendurchmesser nach ETRTO und wie man die Größe im Laden nennt
FELGEN = OrderedDict([
    (622, '28 bzw. 29 Zoll (700C)'), (584, '27,5 Zoll (650B)'), (571, '26 Zoll (650C)'), (559, '26 Zoll'),
    (507, '24 Zoll'), (406, '20 Zoll'), (355, '18 Zoll'), (305, '16 Zoll'),
])
ZOLL_FELGE = {'29': 622, '28': 622, '700': 622, '27.5': 584, '650b': 584, '26': 559, '24': 507, '20': 406, '16': 305}


def reifen_groesse(t):
    """Breite in mm und Felge nach ETRTO aus Name und Merkmalen eines Reifens.

    Gibt (breite, felge, ungefaehr) zurück oder None. „ungefaehr“ heißt: aus einer Zoll-Breite umgerechnet.
    """
    s = f'{t["name"]} {t.get("merkmale") or ""}'.replace(',', '.').replace('×', 'x')
    m = re.search(r'(?<![\d.])(\d{2})-(\d{3})(?!\d)', s)
    if m and int(m.group(2)) in FELGEN:
        return int(m.group(1)), int(m.group(2)), False
    m = re.search(r'\b700\s*x\s*(\d{2})\s*c?\b', s, re.I)
    if m:
        return int(m.group(1)), 622, False
    if re.search(r'27\.5\s*/\s*29', s):
        return None  # Reifen gibt es in beiden Größen, welche verbaut ist, steht nicht fest
    m = re.search(r'(?<![\d.])(29|28|27\.5|26|24|20|16|650b)\s*x\s*(\d\.\d{1,2})(?!\d)', s, re.I)
    if m:
        return round(float(m.group(2)) * 25.4), ZOLL_FELGE[m.group(1).lower()], True
    return None


def groesse_text(g):
    breite, felge, ungefaehr = g
    return f'{"ca. " if ungefaehr else ""}{breite}-{felge}'


def teil_link(t):
    return f'<a href="/teile/{e(t["id"])}/">{e(teilname(t))}</a>' if t['id'] in TEILE else e(teilname(t))


def wartungskosten(teile):
    """Teilekosten der Verschleißteile pro 1.000 km nach den Richtwerten der App.

    Ein Bremsbelag- oder Reifeneintrag gilt für beide Räder, zwei Einträge stehen für vorne und hinten.
    Gibt None zurück, wenn zu wenig Preise bekannt sind.
    """
    posten, fehlt = [], []
    for kat in ['Kette', 'Kassette', 'Bremsbelag', 'Reifen']:
        ts = [t for t in teile if t['kategorie'] == kat]
        anzahl = 2 if kat in ('Bremsbelag', 'Reifen') and len(ts) == 1 else 1
        for t in ts[:2]:
            if not t['preis']:
                fehlt.append(t)
                continue
            je_1000 = float(t['preis']) * anzahl * 1000 / RICHTWERT_KM[kat]
            posten.append({'teil': t, 'anzahl': anzahl, 'km': RICHTWERT_KM[kat], 'je_1000': je_1000})
    # Nur zeigen, wenn Beläge, Reifen und Kette oder Kassette mit Preis drin sind, sonst wirkt der Wert zu niedrig.
    kats = {p['teil']['kategorie'] for p in posten}
    if not ({'Bremsbelag', 'Reifen'} <= kats and kats & {'Kette', 'Kassette'}):
        return None
    return {'posten': posten, 'fehlt': fehlt, 'summe': sum(p['je_1000'] for p in posten),
            'riemen': any(t['kategorie'] == 'Riemen' for t in teile)}


def unterhalt_luecken(teile):
    """Was fehlt, damit wartungskosten() rechnen kann: Teile, die im Katalog fehlen oder keinen Richtpreis haben."""
    def mit_preis(kat):
        return any(t['preis'] for t in teile if t['kategorie'] == kat)

    luecken = []
    if not (mit_preis('Kette') or mit_preis('Kassette')):
        luecken.append('Kette')
    for kat, name in (('Bremsbelag', 'Bremsbeläge'), ('Reifen', 'Reifen')):
        if not mit_preis(kat):
            luecken.append(name)
    return luecken


def euro_genau(x):
    return f'{x:.2f} €'.replace('.', ',')


def tsd(n):
    return f'{n:,}'.replace(',', '.')


def liste(w):
    namen = []
    for p in w['posten']:
        n = {'Bremsbelag': 'Bremsbeläge', 'Kette': 'Kette', 'Kassette': 'Kassette', 'Reifen': 'Reifen'}[p['teil']['kategorie']]
        if n not in namen:
            namen.append(n)
    return ', '.join(namen[:-1]) + ' und ' + namen[-1]


TYP_MEHRZAHL = {'Rennrad': 'Rennräder', 'Gravel': 'Gravelbikes', 'MTB': 'Mountainbikes', 'E-MTB': 'E-Mountainbikes',
                'Trekking': 'Trekkingräder', 'E-Trekking': 'E-Trekkingräder', 'Fitness': 'Fitnessräder',
                'E-City': 'E-Cityräder', 'E-Gravel': 'E-Gravelbikes', 'E-Bike': 'E-Bikes'}
_TYP_MEDIAN = {}


def typ_median(alle, typ):
    """Median der Unterhaltskosten je 1.000 km für einen Radtyp (ab 20 Rädern), einmal pro Lauf gerechnet."""
    if not _TYP_MEDIAN:
        je = defaultdict(list)
        for x in alle:
            w = wartungskosten(x['teile'])
            if w:
                je[x['kategorie']].append(w['summe'])
        _TYP_MEDIAN.update({k: median(v) for k, v in je.items() if len(v) >= 20})
        _TYP_MEDIAN.setdefault('', None)
    return _TYP_MEDIAN.get(typ)


def wartung_kasten(r, w, alle):
    zeilen = ''.join(
        f'<tr><th scope="row">{e(NAMEN.get(p["teil"]["kategorie"], p["teil"]["kategorie"]))}</th>'
        f'<td>{teil_link(p["teil"])}<span>{"2 × " if p["anzahl"] == 2 else ""}{preis(p["teil"]["preis"])}, '
        f'Wechsel etwa alle {tsd(p["km"])} km</span></td>'
        f'<td class="preis">{euro_genau(p["je_1000"])}</td></tr>'
        for p in w['posten'])
    zusatz = []
    if w['fehlt']:
        zusatz.append('Ohne Preis und deshalb nicht eingerechnet: ' + ', '.join(e(teilname(t)) for t in w['fehlt']) + '.')
    if w['riemen']:
        zusatz.append('Der Riemen hält meist deutlich länger als eine Kette und ist nicht eingerechnet.')
    jahr = round(w['summe'] * JAHRES_KM / 1000)
    mittel = typ_median(alle, r['kategorie'])
    vergleich = (f'<p class="klein">Zum Vergleich: {e(TYP_MEHRZAHL.get(r["kategorie"], r["kategorie"]))} im Katalog liegen im Mittel bei '
                 f'{euro_genau(mittel)} je 1.000 km. <a href="/unterhaltskosten/">Unterhaltskosten nach Radtyp</a></p>'
                 if mittel else '<p class="klein"><a href="/unterhaltskosten/">Unterhaltskosten nach Radtyp</a></p>')
    rechner = f'''<div class="rechner" data-je1000="{w["summe"]:.4f}">
        <label for="km-jahr">Deine Kilometer im Jahr: <output for="km-jahr" class="rechner-km">{tsd(JAHRES_KM)} km</output></label>
        <input type="range" id="km-jahr" min="500" max="20000" step="500" value="{JAHRES_KM}">
        <p>Teilekosten etwa <b class="rechner-euro">{tsd(jahr)} €</b> im Jahr.</p>
      </div>'''
    return f'''      <section class="t k2 wartung" id="unterhalt" aria-labelledby="wk-titel">
        <span class="eyebrow">Unterhalt</span>
        <h2 id="wk-titel">Was kostet das {e(r["modell"])} im Unterhalt?</h2>
        <p>Rund <b>{euro_genau(w["summe"])} pro 1.000 km</b> für {liste(w)}. Schieb den Regler auf deine Kilometer im Jahr.</p>
        {rechner}
        <details class="aufklapp"><summary>So setzt sich das zusammen</summary>
        <table class="teiltabelle"><tbody>{zeilen}</tbody></table>
        <p class="klein">Nur Teile, ohne Werkstatt. Gerechnet mit Richtpreisen und typischen Wechselabständen, die je nach Fahrweise, Wetter und Pflege stark schwanken. {" ".join(zusatz)} In der App rechnet die Radgarage mit deinen eigenen Kilometern.</p>
        </details>
        {vergleich}
      </section>
'''


def hinweis(t):
    h = t.get('hinweis') or ''
    return '' if '99spokes' in h.lower() else h


def shoplinks(t):
    q = quote_plus(teilname(t).replace('Universal ', ''))
    return ' · '.join(f'<a href="{e(u.replace("{q}", q))}" target="_blank" rel="nofollow noopener">{e(n)}</a>' for n, u in SHOPS)


def verschleiss_zeile(t):
    """Ein Verschleißteil als Zeile: Name, Richtpreis und Wechselabstand sofort, Ersatz und Shops zum Aufklappen."""
    kat = t['kategorie']
    fakten = []
    if t['preis']:
        fakten.append(f'{preis(t["preis"])}')
    if kat in RICHTWERT_KM:
        fakten.append(f'alle {tsd(RICHTWERT_KM[kat])} km')
    mehr = []
    info = ', '.join(x for x in [t['merkmale'], hinweis(t)] if x)
    if info:
        mehr.append(f'<p>{e(info)}</p>')
    if t['abgeleitet']:
        mehr.append('<p class="pruefen">Aus den übrigen Teilen erschlossen, bitte am Rad prüfen.</p>')
    alt = [a for a in alternativen(t['id']) if a['marke'] != 'Universal'][:3]
    if alt:
        mehr.append(f'<p><b>Passt auch:</b> {", ".join(teil_link(a) for a in alt)}</p>')
    mehr.append(f'<p>Suchen bei {shoplinks(t)}</p>')
    if kat in ANLEITUNG:
        a = next(x for x in ANLEITUNGEN if x['slug'] == ANLEITUNG[kat])
        mehr.append(f'<p><a class="pfeil" href="/anleitungen/{a["slug"]}/">Anleitung: {e(a["h1"])}</a></p>')
    return (f'<li><details><summary><span class="vk">{e(NAMEN.get(kat, kat))}</span>'
            f'<span class="vn">{teil_link(t)}{"<sup>*</sup>" if t["abgeleitet"] else ""}</span>'
            f'<span class="vf">{" · ".join(fakten)}</span></summary>'
            f'<div class="vmehr">{"".join(mehr)}</div></details></li>')


def radzeile(r, zeige_marke=False, mit_jahr=True):
    name = r['name'] if zeige_marke else r['modell']
    return (f'<li><a href="{r["pfad"]}"><b>{e(name)}</b>'
            f'<span>{r["baujahr"] if mit_jahr else ""}{" · " if mit_jahr else ""}{e(r["kategorie"])} · {len(r["teile"])} Teile</span></a></li>')


def ist_ebike(r):
    # Nur am Motor erkennen: einen Akku haben auch Räder mit elektronischer Schaltung (Di2, AXS)
    return r['kategorie'].startswith('E-') or any(t['kategorie'] == 'Motor' for t in r['teile'])


def versicherung_link(art):
    v = VERSICHERUNG
    return v['link'].replace('{ziel}', quote_plus(v['ziel'][art])) if v['link'] else None


def versicherung_kasten(r):
    """Kasten „Rad versichern“ auf jeder Radseite mit Partnerlink, klar als Anzeige gekennzeichnet.
    Richtwert im Monat nur, wenn der Katalog eine UVP kennt."""
    art = 'ebike' if ist_ebike(r) else 'rad'
    link = versicherung_link(art)
    if not link:
        return ''
    v = VERSICHERUNG
    wort = 'E-Bike' if art == 'ebike' else 'Rad'
    if r['uvp_eur']:
        monat = max(v['mindestens'], round(float(r['uvp_eur']) * v['anteil_monat'][art] * 2) / 2)
        betrag = f'{monat:.2f}'.replace('.', ',').replace(',00', '')
        text = (f'Bei einem Neupreis von {tsd(round(r["uvp_eur"]))} € kostet eine Versicherung gegen Diebstahl, Unfall und '
                f'Vandalismus grob <b>{betrag} € im Monat</b>. Deinen genauen Beitrag rechnest du bei {e(v["name"])} aus.')
        richtwert = f'Grober Richtwert aus Beispielbeiträgen ({v["stand"]}), kein Angebot. '
    else:
        text = (f'Schutz gegen Diebstahl, Unfall und Vandalismus für dein {wort}. Mit Kaufpreis und Kaufdatum '
                f'rechnest du deinen Beitrag bei {e(v["name"])} in ein paar Minuten aus.')
        richtwert = 'Kein Angebot. '
    return f'''    <aside class="t k3 voll versichern" aria-labelledby="versichern-titel">
      <span class="anzeige">Anzeige · Partner {e(v["name"])}</span>
      <h2 id="versichern-titel">{wort} versichern</h2>
      <p>{text}</p>
      <div class="actions"><a class="pill" href="{e(link)}" target="_blank" rel="sponsored noopener">Beitrag bei {e(v["name"])} berechnen</a></div>
      <p class="klein">{richtwert}Wir vergleichen keine Tarife und beraten nicht. Schließt du über den Link ab, bekommen wir eine Provision, dein Beitrag ändert sich dadurch nicht. <a href="/datenschutz.html#partnerlinks">Datenschutz</a></p>
    </aside>
'''


def rad_seite(r, alle):
    reihe = [(r['reihe'], r['reihe_pfad'])] if r['reihe_pfad'] else []
    nav, brot = krumen([('Radgarage', '/'), ('Räder', '/raeder/'), (r['hersteller'], f'/raeder/{r["marke_slug"]}/')]
                       + reihe + [(f'{r["modell"]} ({r["baujahr"]})', r['pfad'])])
    teile = r['teile']
    vers = [t for t in teile if t['kategorie'] in VERSCHLEISS]
    vers.sort(key=lambda t: VERSCHLEISS.index(t['kategorie']))
    titel_name = f'{r["name"]} ({r["baujahr"]})'
    titel = passend(f'{titel_name}: Ersatzteile und verbaute Teile', f'{titel_name}: Ersatzteile und Teile',
                    f'{titel_name}: Ersatzteile', titel_name)
    if len(titel) < 50:
        titel += ' | Radgarage'
    kurz = [NAMEN.get(k, k) for k in ['Kette', 'Bremsbelag', 'Reifen'] if any(t['kategorie'] == k for t in teile)]
    frage = f'Welche {", ".join(kurz[:-1]) + " und " + kurz[-1] if len(kurz) > 1 else "Teile"} hat das {titel_name}?'
    beschr = passend(f'{frage} Alle {len(teile)} verbauten Teile mit Richtpreis und passendem Ersatz.',
                     f'{frage} Alle {len(teile)} Teile mit Richtpreis und Ersatz.',
                     f'{titel_name}: alle {len(teile)} verbauten Teile mit Richtpreis und passendem Ersatz.',
                     f'{titel_name}: {len(teile)} Teile mit Richtpreis und Ersatz.', grenze=165)
    # Als Liste der verbauten Teile, nicht als „Product“: Google erwartet bei Produkten ein Angebot mit
    # festem Preis oder Bewertungen, und unsere Richtpreise sind nur Anhaltswerte.
    teileliste = {
        '@context': 'https://schema.org', '@type': 'ItemList', 'name': f'Verbaute Teile am {titel_name}',
        'numberOfItems': len(teile),
        'itemListElement': [dict({'@type': 'ListItem', 'position': i + 1, 'name': teilname(t)},
                                 **({'url': f'{SEITE}/teile/{t["id"]}/'} if t['id'] in TEILE else {}))
                            for i, t in enumerate(teile)],
    }
    w = wartungskosten(teile)
    out = [kopf(titel, beschr, r['pfad'], [teileliste, brot], bild=f'{SEITE}/img/raeder/{r["id"]}.png'), nav,
           '  <main>\n  <article class="bento anl rad">\n']
    zahlen = [('Verbaute Teile', str(len(teile)))]
    if r['uvp_eur']:
        zahlen.append(('Preis neu (UVP)', f'{tsd(round(r["uvp_eur"]))} €'))
    if w:
        zahlen.append(('Unterhalt je 1.000 km', euro_genau(w['summe'])))
    elif vers:
        zahlen.append(('Verschleißteile', str(len(vers))))
    kacheln = ''.join(f'<div class="t s2"><span class="eyebrow">{e(k)}</span><div class="wert">{v}</div></div>' for k, v in zahlen)
    out.append(f'''    <div class="t {art_farbe(r["kategorie"])} kopf">
      <span class="eyebrow">{e(r["kategorie"])} · Modelljahr {r["baujahr"]}</span>
      <h1>{e(titel_name)}</h1>
      <p class="lead">Alle {len(teile)} verbauten Teile, was als Ersatz passt und was der Unterhalt kostet.</p>
    </div>
    <div class="daten">{kacheln}</div>
''')
    # Inhalt links, auf dem Desktop rechts eine mitlaufende Spalte mit Sprungmarken und App
    sprung = []
    haupt = []
    if vers:
        sprung.append(('verschleiss', 'Verschleißteile'))
        zeilen = ''.join(verschleiss_zeile(t) for t in vers)
        haupt.append(f'''      <section class="t s1 vliste-box" id="verschleiss" aria-labelledby="vers-titel">
        <span class="eyebrow">Verschleißteile</span>
        <h2 id="vers-titel">Was am {e(r["modell"])} verschleißt</h2>
        <p>Die {len(vers)} Teile, die du regelmäßig tauschst. Tipp auf eine Zeile für Ersatz und Shops.</p>
        <ul class="vliste">{zeilen}</ul>
      </section>
''')
    if w:
        sprung.append(('unterhalt', 'Unterhalt'))
        haupt.append(wartung_kasten(r, w, alle))
    else:
        luecken = unterhalt_luecken(teile)
        if luecken:
            haupt.append(f'''      <section class="t k2 wartung" id="unterhalt" aria-labelledby="wk-titel">
        <span class="eyebrow">Unterhalt</span>
        <h2 id="wk-titel">Unterhalt noch nicht berechnet</h2>
        <p>Für {e(" und ".join(luecken))} fehlt im Katalog noch ein Teil oder ein Richtpreis. Ohne sie wäre der Wert zu niedrig, deshalb rechnen wir ihn hier noch nicht aus. Weißt du, was verbaut ist? <a href="#verbessern">Schick uns einen Hinweis.</a></p>
      </section>
''')
    haupt.append(versicherung_kasten(r))
    gruppen = []
    for name, kats in GRUPPEN:
        g = [t for t in teile if t['kategorie'] in kats]
        if not g:
            continue
        g.sort(key=lambda t: kats.index(t['kategorie']))
        zeilen = ''.join(
            f'<tr><th scope="row">{e(NAMEN.get(t["kategorie"], t["kategorie"]))}</th>'
            f'<td><b>{teil_link(t)}</b>{"<sup>*</sup>" if t["abgeleitet"] else ""}'
            f'{"<span>" + e(", ".join(x for x in [t["merkmale"], hinweis(t)] if x)) + "</span>" if (t["merkmale"] or hinweis(t)) else ""}</td>'
            f'<td class="preis">{preis(t["preis"])}</td></tr>'
            for t in g)
        gruppen.append(f'<details class="gruppe"{" open" if not gruppen else ""}><summary><h3>{e(name)}</h3>'
                       f'<span>{len(g)} {"Teil" if len(g) == 1 else "Teile"}</span></summary>'
                       f'<table class="teiltabelle"><tbody>{zeilen}</tbody></table></details>')
    sprung.append(('alle', 'Alle Teile'))
    haupt.append(f'''      <section class="t s1 alle" id="alle" aria-labelledby="alle-titel">
        <span class="eyebrow">Ausstattung</span>
        <h2 id="alle-titel">Alle {len(teile)} Teile am {e(r["name"])}</h2>
        {"".join(gruppen)}
        <p class="klein">* Aus den übrigen Teilen erschlossen, bitte am Rad prüfen. Preise sind Richtpreise ohne Gewähr.</p>
      </section>
''')
    fragen = kurz_gefragt(r)
    if fragen:
        sprung.append(('fragen', 'Fragen'))
        haupt.append(fragen)
    vgl = vergleich_kasten(r, alle)
    if vgl:
        sprung.append(('vergleich', 'Vergleich'))
        haupt.append(vgl)
    haupt.append(anleitungen_fuers_rad(r))
    # Mehr Räder: andere Ausstattungen derselben Reihe, dann dieselbe Radart der Marke, dazu ähnliche anderer Marken
    marke = [x for x in alle if x['marke_slug'] == r['marke_slug'] and x['id'] != r['id']]
    marke.sort(key=lambda x: (x['reihe'] != r['reihe'], x['kategorie'] != r['kategorie'], abs(x['baujahr'] - r['baujahr']),
                              x['modell']))
    andere = marke[:6]
    aehnlich = aehnliche(r, alle)
    if andere or aehnlich:
        spalten = []
        if andere:
            spalten.append(f'<div><h3>Weitere Räder von {e(r["hersteller"])}</h3><ul class="radzeilen">{"".join(radzeile(x) for x in andere)}</ul></div>')
        if aehnlich:
            spalten.append(f'<div><h3>Ähnliche Räder anderer Marken</h3><ul class="radzeilen">{"".join(radzeile(x, zeige_marke=True) for x in aehnlich)}</ul></div>')
        haupt.append(f'''      <section class="t s2 mehr-raeder" aria-label="Weitere Räder">
        <div class="spalten">{"".join(spalten)}</div>
      </section>
''')
    haupt.append(vorschlag_form(r, titel_name))
    app = f'''<aside class="t k4 app-klein">
          <span class="eyebrow">Die App zum Rad</span>
          <h2>Dein {e(r["modell"])} in der Radgarage</h2>
          <p>Alle Teile sind sofort da. Die App zählt deine Kilometer und sagt dir, wann Kette, Beläge und Reifen fällig sind.</p>
          <div class="actions"><a class="pill" href="/#anmelden">Testzugang anfordern</a><a class="pill ghost" href="/">Mehr zur App</a></div>
        </aside>'''
    marken = ''.join(f'<a href="#{i}">{e(t)}</a>' for i, t in sprung)
    out.append(f'''    <nav class="sprung" aria-label="Auf dieser Seite">{marken}</nav>
    <div class="haupt">
{"".join(haupt)}    </div>
    <div class="seite">
      <div class="klebt">
        <nav class="t s1 inhalt" aria-label="Inhalt"><span class="eyebrow">Auf dieser Seite</span>{marken}<a href="#verbessern">Fehler melden</a></nav>
        {app}
      </div>
    </div>
  </article>
  <p class="hinweis">Angaben nach Herstellerdaten und Testberichten, Stand {e(r["geaendert"][:7].replace("-", "/"))}. Hersteller ändern die Ausstattung manchmal während des Modelljahrs, prüf vor dem Kauf die Teile an deinem Rad. Fehler entdeckt? Schreib uns an <a href="mailto:kontakt@radgarage.app">kontakt@radgarage.app</a> oder nutze in der App „Verbesserung vorschlagen“. Shop-Links sind Suchlinks, keine Partnerlinks.</p>
  </main>
''')
    out.append('<script src="/raeder/vorschlag.js?v=2" defer></script>\n')
    if w:
        out.append('<script src="/raeder/rechner.js?v=1" defer></script>\n')
    out.append(FUSS)
    return ''.join(out)


def _speed(t):
    m = re.search(r'(\d{1,2})-fach', t.get('merkmale') or '')
    return int(m.group(1)) if m else None


def _ersatz(t, n=2):
    alt = [a for a in alternativen(t['id']) if a['marke'] != 'Universal'][:n]
    return f' Als Ersatz passen laut Katalog auch {" und ".join(teil_link(a) for a in alt)}.' if alt else ''


def kurz_gefragt(r):
    """Die Fragen, mit denen Radfahrer nach ihrem Modell suchen, mit einem Antwortsatz aus dem Katalog."""
    teile = r['teile']
    wer = f'das {e(r["modell"])} ({r["baujahr"]})'
    fragen = []

    def erstes(kat):
        return next((t for t in teile if t['kategorie'] == kat), None)
    belaege = [t for t in teile if t['kategorie'] == 'Bremsbelag']
    if belaege:
        t = belaege[0]
        text = f'Ab Werk sind {teil_link(t)} verbaut{" (" + e(t["merkmale"]) + ")" if t["merkmale"] else ""}.'
        if len(belaege) > 1 and belaege[1]['id'] != t['id']:
            text += f' Hinten: {teil_link(belaege[1])}.'
        text += _ersatz(t)
        if t['abgeleitet']:
            text += ' Die Beläge haben wir aus der Bremse erschlossen, schau beim Kauf kurz auf deine Bremse.'
        fragen.append((f'Welche Bremsbeläge passen an {wer}?', text))
    kette, riemen = erstes('Kette'), erstes('Riemen')
    if riemen and not kette:
        fragen.append((f'Welche Kette braucht {wer}?', f'Keine: Es fährt mit Riemen, verbaut ist {teil_link(riemen)}. Ein Riemen hält meist deutlich länger als eine Kette.'))
    elif kette:
        fach = _speed(kette)
        text = (f'Eine {fach}-fach-Kette. ' if fach else '') + f'Ab Werk ist {teil_link(kette)} montiert.' + _ersatz(kette)
        if r.get('gruppe_pfad'):
            text += f' Mehr zur Schaltgruppe: <a href="{r["gruppe_pfad"]}">{e(r["gruppe"])}</a>.'
        fragen.append((f'Welche Kette braucht {wer}?', text))
    reifen = [t for t in teile if t['kategorie'] == 'Reifen']
    if reifen:
        t = reifen[0]
        g = reifen_groesse(t)
        if g:
            text = (f'{groesse_text(g)} nach ETRTO: {"etwa " if g[2] else ""}{g[0]} mm breit, Felge {g[1]} mm, '
                    f'im Laden meist {FELGEN[g[1]]} genannt. Ab Werk: {teil_link(t)}.')
        else:
            text = f'Ab Werk ist {teil_link(t)} montiert{" (" + e(t["merkmale"]) + ")" if t["merkmale"] else ""}.'
        if len(reifen) > 1 and reifen[1]['id'] != t['id']:
            g2 = reifen_groesse(reifen[1])
            text += f' Hinten: {teil_link(reifen[1])}{" (" + groesse_text(g2) + ")" if g2 else ""}.'
        text += ' Wie die Angaben zusammenhängen, steht in der <a href="/reifengroessen/">Übersicht der Reifengrößen</a>.'
        fragen.append((f'Welche Reifengröße hat {wer}?', text))
    schlauch = erstes('Schlauch')
    if schlauch:
        text = f'{teil_link(schlauch)}{" (" + e(schlauch["merkmale"]) + ")" if schlauch["merkmale"] else ""}.'
        if any(re.search(r'tubeless|tlr|tle|tcs|2bliss', f'{t["name"]} {t["merkmale"] or ""}', re.I) for t in reifen):
            text += ' Die Reifen sind tubeless-fähig. Ein Ersatzschlauch gehört trotzdem ins Pannenset.'
        fragen.append((f'Welcher Schlauch passt in {wer}?', text))
    akku, motor = erstes('Akku'), erstes('Motor')
    if motor and akku and 'Di2' not in akku['name']:
        text = (f'Verbaut ist {teil_link(motor)}{" (" + e(motor["merkmale"]) + ")" if motor["merkmale"] else ""} '
                f'mit {teil_link(akku)}{" (" + e(akku["merkmale"]) + ")" if akku["merkmale"] else ""}.')
        if r.get('system_pfad'):
            text += f' Welche Akkus zum System passen: <a href="{r["system_pfad"]}">{e(r["system"])}</a>.'
        fragen.append((f'Welcher Motor und Akku stecken im {e(r["modell"])}?', text))
    kassette = erstes('Kassette')
    if kassette and len(fragen) < 4:
        fragen.append((f'Welche Kassette hat {wer}?',
                       f'{teil_link(kassette)}{" (" + e(kassette["merkmale"]) + ")" if kassette["merkmale"] else ""}.' + _ersatz(kassette)))
    if not fragen:
        return ''
    inhalt = ''.join(f'<details><summary><h3>{q}</h3></summary><p>{a}</p></details>' for q, a in fragen)
    return f'''      <section class="t s1 gefragt" id="fragen" aria-labelledby="gefragt-titel">
        <span class="eyebrow">Kurz gefragt</span>
        <h2 id="gefragt-titel">Häufige Fragen zum {e(r["modell"])}</h2>
        <div class="antworten">{inhalt}</div>
      </section>
'''


def nachbar(r, alle):
    """Das Rad, mit dem man dieses am ehesten verwechselt: dasselbe Modell aus dem nächsten Jahr,
    sonst eine andere Ausstattung derselben Reihe aus dem gleichen oder nächsten Jahr."""
    gleich = [x for x in alle if x['id'] != r['id'] and x['marke_slug'] == r['marke_slug'] and x['modell'] == r['modell']]
    if gleich:
        return min(gleich, key=lambda x: (abs(x['baujahr'] - r['baujahr']), -x['baujahr']))
    reihe = [x for x in alle if x['id'] != r['id'] and x['marke_slug'] == r['marke_slug'] and x['reihe'] == r['reihe']
             and abs(x['baujahr'] - r['baujahr']) <= 1 and len(x['teile']) >= 6]
    if reihe:
        return min(reihe, key=lambda x: (abs(x['baujahr'] - r['baujahr']), abs((x['uvp_eur'] or 0) - (r['uvp_eur'] or 0)), x['modell']))
    return None


def unterschiede(r, n):
    """Teile, die sich zwischen zwei Rädern unterscheiden, in der Reihenfolge der Gruppen."""
    reihenfolge = [k for _, ks in GRUPPEN for k in ks]
    zeilen = []
    for kat in reihenfolge:
        a = [t for t in r['teile'] if t['kategorie'] == kat]
        b = [t for t in n['teile'] if t['kategorie'] == kat]
        if {t['id'] for t in a} == {t['id'] for t in b}:
            continue
        zeilen.append((kat, a, b))
    return zeilen


def vergleich_kasten(r, alle):
    n = nachbar(r, alle)
    if not n:
        return ''
    n_name = f'{n["modell"]} ({n["baujahr"]})'
    diff = unterschiede(r, n)
    if not diff:
        satz = (f'Laut Katalog sind die Teile beim {e(r["modell"])} ({r["baujahr"]}) und beim <a href="{n["pfad"]}">{e(n_name)}</a> gleich. '
                'Unterschiede gibt es dann meist bei Farben, Rahmendetails oder Ausstattung, die wir nicht erfassen.')
        tabelle = ''
    else:
        satz = (f'Gegenüber dem <a href="{n["pfad"]}">{e(n_name)}</a> unterscheiden sich {len(diff)} '
                f'{"Teil" if len(diff) == 1 else "Teile"}.')

        def zelle(ts):
            return ', '.join(teil_link(t) for t in ts) if ts else '–'
        zeilen = ''.join(
            f'<tr><th scope="row">{e(NAMEN.get(k, k))}</th><td data-label="{e(r["modell"])} ({r["baujahr"]})">{zelle(a)}</td>'
            f'<td data-label="{e(n_name)}">{zelle(b)}</td></tr>' for k, a, b in diff[:8])
        mehr = f'<p class="klein">Und {len(diff) - 8} weitere Unterschiede.</p>' if len(diff) > 8 else ''
        tabelle = f'''<div class="tabelle-rahmen"><table class="vergleichstabelle unterschied">
        <thead><tr><th scope="col">Teil</th><th scope="col">{e(r["modell"])} ({r["baujahr"]})</th><th scope="col">{e(n_name)}</th></tr></thead>
        <tbody>{zeilen}</tbody></table></div>{mehr}'''
    if r['uvp_eur'] and n['uvp_eur'] and round(r['uvp_eur']) != round(n['uvp_eur']):
        satz += f' Die UVP lag bei {tsd(round(r["uvp_eur"]))} € statt {tsd(round(n["uvp_eur"]))} €.'
    titel = (f'{r["baujahr"]} oder {n["baujahr"]}: was ist anders?' if n['modell'] == r['modell']
             else f'Was ist anders als beim {n["modell"]}?')
    if tabelle:
        tabelle = f'<details class="aufklapp"><summary>Unterschiede ansehen</summary>{tabelle}</details>'
    return f'''      <section class="t k3 nachbar-vgl" id="vergleich" aria-labelledby="vgl-titel">
        <span class="eyebrow">Vergleich</span>
        <h2 id="vgl-titel">{e(titel)}</h2>
        <p>{satz}</p>
        {tabelle}
      </section>
'''


# Anleitungen, die zum Rad passen: nach verbauten Teilen und Radart
RAD_ANLEITUNGEN = [
    ('kettenverschleiss-messen', lambda r, k: 'Kette' in k), ('kette-wechseln', lambda r, k: 'Kette' in k),
    ('kette-reinigen-oelen', lambda r, k: 'Kette' in k),
    ('schaltung-einstellen', lambda r, k: (r.get('gruppe') or '').endswith('-fach')),
    ('bremsbelaege-wechseln', lambda r, k: 'Bremsbelag' in k),
    ('scheibenbremse-schleift', lambda r, k: 'Bremsscheibe' in k),
    ('reifen-wechseln', lambda r, k: 'Reifen' in k), ('schlauch-wechseln', lambda r, k: 'Schlauch' in k),
    ('kassette-wechseln', lambda r, k: 'Kassette' in k), ('bremsscheibe-wechseln', lambda r, k: 'Bremsscheibe' in k),
    ('innenlager-wechseln', lambda r, k: 'Innenlager' in k or 'Kurbel' in k),
    ('lenkerband-wickeln', lambda r, k: r['kategorie'] in ('Rennrad', 'Gravel', 'E-Gravel')),
]


def anleitungen_fuers_rad(r):
    kats = {t['kategorie'] for t in r['teile']}
    da = {a['slug']: a for a in ANLEITUNGEN}
    liste = [da[s] for s, wenn in RAD_ANLEITUNGEN if s in da and wenn(r, kats)]
    if not liste:
        return ''
    links = ''.join(f'<a href="/anleitungen/{a["slug"]}/">{e(a["h1"])}</a>' for a in liste)
    links += '<a class="alle-link" href="/anleitungen/">Alle Anleitungen</a>'
    return f'''      <nav class="t s2 rad-anleitungen" aria-label="Anleitungen für dieses Rad">
        <span class="eyebrow">Selbst machen</span>
        <h2>Anleitungen für dein {e(r["modell"])}</h2>
        <div class="chips">{links}</div>
      </nav>
'''


GRUENDE = [
    ('falsch', 'Teil stimmt nicht'), ('fehlt', 'Teil fehlt'), ('zuviel', 'Teil nicht verbaut'),
    ('rad', 'Name oder Baujahr'), ('sonst', 'Etwas anderes'),
]


def vorschlag_form(r, titel_name):
    """Hinweis ohne Anmeldung, landet wie die Korrekturen aus der App in vorschlaege (daten.herkunft = 'website')."""
    gruende = ''.join(
        f'<label><input type="radio" name="grund" value="{g}" required> {e(t)}</label>' for g, t in GRUENDE)
    teile = ''.join(
        f'<option value="{e(t["id"])}">{e(NAMEN.get(t["kategorie"], t["kategorie"]))}: {e(teilname(t))}</option>' for t in r['teile'])
    return f'''      <details class="t s1 vorschlag" id="verbessern">
      <summary><span class="eyebrow">Mitmachen</span>
      <h2 id="vs-titel">Stimmt etwas nicht?</h2>
      <p>Du kennst das {e(r["modell"])} besser? Sag uns, was falsch ist oder fehlt. Ganz ohne Anmeldung.</p>
      <span class="pill ghost">Hinweis geben</span></summary>
      <form class="vs-form" data-rad="{e(r["id"])}" data-titel="{e(titel_name)}" novalidate>
        <fieldset><legend>Was ist los?</legend><div class="wahl">{gruende}</div></fieldset>
        <label class="feld vs-teil" hidden>Welches Teil?
          <select name="teil"><option value="">Bitte wählen</option>{teile}</select></label>
        <label class="feld">Was ist richtig? <span class="vs-frei" hidden>(freiwillig)</span>
          <textarea name="text" rows="3" maxlength="1000" placeholder="z. B. Verbaut ist eine Shimano CN-M8100, nicht CN-M7100"></textarea></label>
        <label class="feld">Woher weißt du das? <span>(freiwillig, z. B. Link zur Herstellerseite)</span>
          <input type="text" name="beleg" maxlength="300" autocomplete="off"></label>
        <label class="falle" aria-hidden="true">Bitte leer lassen <input type="text" name="webseite" tabindex="-1" autocomplete="off"></label>
        <div class="actions"><button class="pill" type="submit">Hinweis senden</button></div>
        <p class="msg" role="status" hidden></p>
        <p class="klein">Wir speichern nur deinen Hinweis, keinen Namen und keine E-Mail-Adresse. Mehr in der <a href="/datenschutz.html#hinweise">Datenschutzerklärung</a>.</p>
      </form>
      </details>
'''


def radkarte(r, i=0, ebene='h3', zeige_marke=False, mit_jahr=False):
    name = r['name'] if zeige_marke else r['modell']
    if mit_jahr:
        name += f' ({r["baujahr"]})'
    return (f'<a class="t {art_farbe(r["kategorie"])} karte" href="{r["pfad"]}">'
            f'<span class="eyebrow">{e(r["hersteller"])} · {r["baujahr"]}</span><{ebene}>{e(name)}</{ebene}>'
            f'<span class="meta">{e(r["kategorie"])} · {len(r["teile"])} Teile</span></a>')


def aehnliche(r, alle, anzahl=3):
    """Gleiche Radart anderer Marken aus einem nahen Modelljahr, mit ähnlichem Neupreis, je Marke höchstens ein Rad."""
    kandidaten = [x for x in alle if x['marke_slug'] != r['marke_slug'] and x['kategorie'] == r['kategorie']
                  and abs(x['baujahr'] - r['baujahr']) <= 1 and len(x['teile']) >= 8]

    def abstand(x):
        preis_abstand = abs(x['uvp_eur'] - r['uvp_eur']) if x['uvp_eur'] and r['uvp_eur'] else 10**6
        return (preis_abstand, abs(x['baujahr'] - r['baujahr']), x['id'])
    gewaehlt, marken_ = [], set()
    for x in sorted(kandidaten, key=abstand):
        if x['marke_slug'] in marken_:
            continue
        gewaehlt.append(x)
        marken_.add(x['marke_slug'])
        if len(gewaehlt) == anzahl:
            break
    return gewaehlt


def marken(alle):
    m = OrderedDict()
    for r in sorted(alle, key=lambda x: (x['hersteller'].lower(), x['modell'], x['baujahr'])):
        m.setdefault(r['marke_slug'], []).append(r)
    return m


def reihe_titel(name, rs):
    p = rs[0]['reihe_pfad']
    return f'<a href="{p}">{e(name)}</a>' if p else e(name)


def reihen_abschnitte(raeder):
    reihen = OrderedDict()
    for r in sorted(raeder, key=lambda x: (x['reihe'].lower(), -x['baujahr'], x['modell'])):
        reihen.setdefault(r['reihe'], []).append(r)
    # Eine Kachel je Reihe mit den Rädern als kurze Zeilen, oben Sprungmarken zu den Reihen
    sprung = ''.join(f'<a href="#reihe-{slug(n)}">{e(n)}</a>' for n in reihen)
    kacheln = ''.join(
        f'<section class="t s1 reihe-kachel" id="reihe-{slug(name)}" aria-label="{e(name)}"><h2>{reihe_titel(name, rs)}'
        f'<span>{len(rs)} {"Rad" if len(rs) == 1 else "Räder"}</span></h2>'
        f'<ul class="radzeilen">{"".join(radzeile(x) for x in rs)}</ul></section>'
        for name, rs in reihen.items())
    return f'  <nav class="chips reihen-sprung" aria-label="Reihen">{sprung}</nav>\n  <div class="reihen-raster">{kacheln}</div>\n'


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
      <p class="lead">{len(raeder)} Modelle im Katalog. Wähle dein Rad und sieh, welche Kette, Bremsbeläge, Reifen und anderen Teile verbaut sind.</p>
    </div>
  </div>
{reihen_abschnitte(raeder)}
  </main>
''', FUSS]
    return ''.join(out)


def uebersicht_seite(alle, gesamt):
    nav, brot = krumen([('Radgarage', '/'), ('Räder', '/raeder/')])
    titel = 'Fahrrad-Ersatzteile nach Modell finden | Radgarage'
    beschr = 'Welche Teile sind an deinem Fahrrad verbaut? Ersatzteile nach Marke und Modell, mit Richtpreisen und passendem Ersatz.'
    m = marken(alle)
    marken_kacheln = ''.join(
        f'<a class="marke-kachel" href="/raeder/{s}/"><h2>{e(rs[0]["hersteller"])}</h2><span>{len(rs)} Modelle</span></a>'
        for i, (s, rs) in enumerate(m.items()))
    return ''.join([kopf(titel, beschr, '/raeder/', [brot]), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k5 kopf">
      <span class="eyebrow">Räder und Teile</span>
      <h1>Was ist an deinem Rad verbaut?</h1>
      <p class="lead">Der Katalog der Radgarage kennt {tsd(gesamt)} Fahrräder von {len(m)} Marken mit allen verbauten Teilen. Such dein Modell oder wähl die Marke und sieh, welche Kette, Beläge und Reifen passen.</p>
      {suchfeld('raeder')}
      <form class="finder" action="#" aria-label="Rad nach Marke, Modell und Jahr finden">
        <label>Marke<select name="marke"><option value="">Marke wählen</option>{''.join(f'<option value="{s}">{e(rs[0]["hersteller"])}</option>' for s, rs in m.items())}</select></label>
        <label>Modell<select name="modell" disabled><option value="">Modell</option></select></label>
        <label>Jahr<select name="jahr" disabled><option value="">Jahr</option></select></label>
        <button class="pill" type="submit" disabled>Zum Rad</button>
      </form><script src="/js/finder.js?v=1" defer></script>
    </div>
  </div>
  <section aria-label="Wissen" style="margin-top:14px">
    <div class="chips">{WISSEN_CHIPS}</div>
  </section>
  <section class="t s1 marken-box" aria-labelledby="marken-titel">
    <h2 id="marken-titel">Alle {len(m)} Marken</h2>
    <div class="marken-raster">{marken_kacheln}</div>
  </section>
  </main>
''', FUSS])


# Ratgeber- und Übersichtsseiten, die von den Übersichten aus verlinkt werden
WISSEN = [('/schaltgruppen/', 'Schaltgruppen'), ('/e-bike-systeme/', 'E-Bike-Systeme'), ('/reifengroessen/', 'Reifengrößen'),
          ('/verschleissrechner/', 'Verschleißrechner'), ('/unterhaltskosten/', 'Unterhaltskosten')]
WISSEN_CHIPS = ''.join(f'<a href="{p}">{e(n)}</a>' for p, n in WISSEN)


def reihen(alle):
    """Räder je Reihenseite, nur Reihen mit mindestens zwei Rädern."""
    m = OrderedDict()
    for r in sorted(alle, key=lambda x: (x['hersteller'].lower(), x['reihe'].lower(), -x['baujahr'], x['modell'])):
        if r['reihe_pfad']:
            m.setdefault(r['reihe_pfad'], []).append(r)
    return m


def _erstes(r, *kats):
    for k in kats:
        t = next((t for t in r['teile'] if t['kategorie'] == k), None)
        if t:
            return teil_link(t)
    return '–'


def reihe_seite(pfad, rs):
    r0 = rs[0]
    name = f'{r0["hersteller"]} {r0["reihe"]}'
    jahre = sorted({r['baujahr'] for r in rs})
    spanne = f'{jahre[0]}' if len(jahre) == 1 else f'{jahre[0]} bis {jahre[-1]}'
    nav, brot = krumen([('Radgarage', '/'), ('Räder', '/raeder/'), (r0['hersteller'], f'/raeder/{r0["marke_slug"]}/'),
                        (r0['reihe'], pfad)])
    titel = passend(f'{name}: alle Ausstattungen und Teile im Vergleich', f'{name}: Ausstattungen im Vergleich',
                    f'{name}: alle Ausstattungen', name)
    if len(titel) < 50:
        titel += ' | Radgarage'
    mit_uvp = any(r['uvp_eur'] for r in rs)
    beschr = passend(f'{len(rs)} Ausstattungen des {name} ({spanne}) im Vergleich: Schaltung, Bremsen, Reifen, '
                     f'{"UVP und " if mit_uvp else ""}was jede Version im Unterhalt kostet.',
                     f'{len(rs)} Ausstattungen des {name} ({spanne}) im Vergleich: Schaltung, Bremsen, Reifen und Unterhalt.',
                     f'{len(rs)} Ausstattungen des {name} im Vergleich: Teile und Unterhalt.', grenze=165)
    liste = {'@context': 'https://schema.org', '@type': 'ItemList', 'name': name,
             'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': SEITE + r['pfad'],
                                  'name': f'{r["name"]} ({r["baujahr"]})'} for i, r in enumerate(rs)]}
    zeilen = []
    guenstig = None
    offen = 0
    for r in rs:
        w = wartungskosten(r['teile'])
        if w and (guenstig is None or w['summe'] < guenstig[1]):
            guenstig = (r, w['summe'])
        uvp = (f'<td class="zahl" data-label="UVP">{tsd(round(r["uvp_eur"])) + " €" if r["uvp_eur"] else "k. A."}</td>'
               if mit_uvp else '')
        if w:
            unterhalt = euro_genau(w['summe'])
        else:
            offen += 1
            unterhalt = f'<span class="offen">fehlt: {e(", ".join(unterhalt_luecken(r["teile"])) or "Preise")}</span>'
        zeilen.append(
            f'<tr><th scope="row"><a href="{r["pfad"]}">{e(r["modell"])}</a></th><td data-label="Jahr">{r["baujahr"]}</td>'
            f'{uvp}<td data-label="Schaltung">{_erstes(r, "Schaltwerk", "Motor")}</td>'
            f'<td data-label="Bremse">{_erstes(r, "Bremssattel", "Bremsbelag")}</td><td data-label="Reifen">{_erstes(r, "Reifen")}</td>'
            f'<td class="zahl" data-label="Unterhalt je 1.000 km">{unterhalt}</td></tr>')
    fussnote = ('Unterhalt = Teilekosten für Kette, Kassette, Bremsbeläge und Reifen (soweit Preise bekannt) nach Richtpreisen '
                'und typischen Wechselabständen, ohne Werkstatt. Angaben ohne Gewähr.')
    if offen:
        fussnote += (f' Bei {offen} {"Version" if offen == 1 else "Versionen"} fehlt noch ein Teil oder Richtpreis, '
                     'dort steht, was fehlt. Ohne diese Teile wäre der Wert zu niedrig.')
    if mit_uvp:
        fussnote += ' UVP nur, wenn der Hersteller sie selbst nennt (k. A. = keine Angabe).'

    satz = ''
    if guenstig and len(rs) > 2:
        satz = (f' Am günstigsten im Unterhalt ist das {e(guenstig[0]["modell"])} ({guenstig[0]["baujahr"]}) '
                f'mit rund {euro_genau(guenstig[1])} pro 1.000 km.')
    out = [kopf(titel, beschr, pfad, [liste, brot]), nav, f'''  <main>
  <div class="bento uebersicht">
    <div class="t k3 kopf">
      <span class="eyebrow">{e(r0["kategorie"])} · {e(r0["hersteller"])}</span>
      <h1>{e(name)}: Ausstattungen im Vergleich</h1>
      <p class="lead">{len(rs)} Versionen aus den Modelljahren {spanne}. Hier siehst du auf einen Blick, womit sie sich unterscheiden.{satz}</p>
    </div>
    <section class="t s1 voll vergleich" aria-labelledby="vg-titel">
      <h2 id="vg-titel" style="font-size:30px;margin:0 0 10px">Ausstattung und Unterhalt</h2>
      <div class="tabelle-rahmen"><table class="vergleichstabelle">
        <thead><tr><th scope="col">Ausstattung</th><th scope="col">Jahr</th>{'<th scope="col" class="zahl">UVP</th>' if mit_uvp else ''}<th scope="col">Schaltung</th><th scope="col">Bremse</th><th scope="col">Reifen</th><th scope="col" class="zahl">Unterhalt je 1.000 km</th></tr></thead>
        <tbody>{"".join(zeilen)}</tbody>
      </table></div>
      <p class="klein">{e(fussnote)}</p>
    </section>
  </div>
  <section aria-label="Alle Versionen" style="margin-top:14px">
    <h2 class="zwischen">Alle Versionen</h2>
    <div class="karten">{"".join(radkarte(x, i) for i, x in enumerate(rs))}</div>
  </section>
  </main>
''', FUSS]
    return ''.join(out)
