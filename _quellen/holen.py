"""Holt den geprüften Katalog aus Supabase und schreibt _quellen/katalog-auszug.json und _quellen/teile-auszug.json.

Zwei Wege, dasselbe Ergebnis:
- ohne Angaben: über die öffentliche REST-Schnittstelle mit dem öffentlichen Schlüssel aus der App
  (so läuft die nächtliche GitHub Action „Seiten aus dem Katalog bauen“). Die Regeln in Supabase geben
  dabei nur geprüfte Räder und Teile heraus.
- mit SUPABASE_MANAGEMENT=1: über die Management-API (api.supabase.com), z. B. aus einer Claude-Sitzung,
  in der *.supabase.co nicht erreichbar ist. Das Token setzt der Proxy ein.

Aufruf im Repo-Wurzelordner: python3 _quellen/holen.py, danach python3 _quellen/bauen.py.
"""
import json
import os
import sys
import urllib.request

PROJEKT = 'axiirnfgtbmmjlfwlyfe'
URL = f'https://{PROJEKT}.supabase.co/rest/v1'
SCHLUESSEL = 'sb_publishable_dBz5uK-7wYwKKL3O8Qd0MA_pYzxTP_2'  # öffentlicher Schlüssel der App, nur Lesen
SEITE = 1000  # Supabase gibt höchstens 1000 Zeilen pro Abfrage zurück
WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SPALTEN = {
    'raeder': ['id', 'hersteller', 'modell', 'reihe', 'baujahr', 'kategorie', 'uvp_eur', 'zweitnamen', 'geaendert'],
    'rad_teile': ['rad_id', 'teil_id', 'position', 'abgeleitet', 'hinweis'],
    'teile': ['id', 'marke', 'name', 'kategorie', 'passt_key', 'merkmale', 'richtpreis_eur', 'richtpreis_ist_schaetzung'],
}
ORDNUNG = {'raeder': 'id', 'rad_teile': 'rad_id,position,teil_id', 'teile': 'id'}


def _anfrage(url, daten=None, kopf=None):
    req = urllib.request.Request(url, data=daten, headers=kopf or {})
    for versuch in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as antwort:
                return json.loads(antwort.read())
        except Exception as fehler:  # Netzaussetzer: kurz warten und erneut versuchen
            if versuch == 3:
                raise
            print(f'Abfrage fehlgeschlagen ({fehler}), neuer Versuch …', file=sys.stderr)
            import time
            time.sleep(5 * (versuch + 1))


def tabelle_rest(name):
    zeilen, ab = [], 0
    while True:
        url = f'{URL}/{name}?select={",".join(SPALTEN[name])}&order={ORDNUNG[name]}&offset={ab}&limit={SEITE}'
        stueck = _anfrage(url, kopf={'apikey': SCHLUESSEL, 'Accept': 'application/json'})
        zeilen += stueck
        if len(stueck) < SEITE:
            return zeilen
        ab += SEITE


def tabelle_management(name):
    filter_ = '' if name == 'rad_teile' else ' where geprueft'
    sql = (f'select coalesce(json_agg(x order by {ORDNUNG[name]}), \'[]\') as daten from '
           f'(select {", ".join(SPALTEN[name])} from {name}{filter_}) x')
    antwort = _anfrage(f'https://api.supabase.com/v1/projects/{PROJEKT}/database/query',
                       json.dumps({'query': sql}).encode(),
                       {'Authorization': 'Bearer platzhalter', 'Content-Type': 'application/json'})
    return antwort[0]['daten']


def zahl(x):
    """numeric kommt je nach Weg als Zahl oder Text, ganze Euro bleiben ganze Zahlen."""
    if x is None:
        return None
    f = float(x)
    return int(f) if f.is_integer() else f


def zusammenbauen(raeder, rad_teile, teile):
    teile_nach_id = {t['id']: t for t in teile}
    je_rad = {}
    for rt in sorted(rad_teile, key=lambda x: (x['rad_id'], x['position'] if x['position'] is not None else 10**6, x['teil_id'])):
        t = teile_nach_id.get(rt['teil_id'])
        if t is None:
            continue
        je_rad.setdefault(rt['rad_id'], []).append({
            'id': t['id'], 'marke': t['marke'], 'name': t['name'], 'kategorie': t['kategorie'], 'merkmale': t['merkmale'],
            'preis': zahl(t['richtpreis_eur']), 'abgeleitet': bool(rt['abgeleitet']), 'hinweis': rt['hinweis'],
        })
    katalog = [{
        'id': r['id'], 'hersteller': r['hersteller'], 'modell': r['modell'], 'reihe': r['reihe'], 'baujahr': r['baujahr'],
        'kategorie': r['kategorie'], 'uvp_eur': zahl(r['uvp_eur']), 'zweitnamen': r['zweitnamen'],
        'geaendert': (r['geaendert'] or '')[:10], 'teile': je_rad.get(r['id']),
    } for r in raeder]
    katalog.sort(key=lambda r: (r['hersteller'].lower(), r['modell'].lower(), r['id']))
    teile_aus = [{
        'id': t['id'], 'marke': t['marke'], 'name': t['name'], 'kategorie': t['kategorie'], 'passt_key': t['passt_key'],
        'merkmale': t['merkmale'], 'preis': zahl(t['richtpreis_eur']), 'schaetzung': t['richtpreis_ist_schaetzung'],
    } for t in sorted(teile, key=lambda t: t['id'])]
    return katalog, teile_aus


def schreiben(name, daten):
    with open(os.path.join(WURZEL, '_quellen', name), 'w', encoding='utf-8') as f:
        json.dump(daten, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


if __name__ == '__main__':
    holen = tabelle_management if os.environ.get('SUPABASE_MANAGEMENT') else tabelle_rest
    raeder, rad_teile, teile = (holen(n) for n in ['raeder', 'rad_teile', 'teile'])
    if len(raeder) < 100 or len(teile) < 100:
        sys.exit(f'Zu wenig Daten ({len(raeder)} Räder, {len(teile)} Teile), es wird nichts überschrieben.')
    katalog, teile_aus = zusammenbauen(raeder, rad_teile, teile)
    schreiben('katalog-auszug.json', katalog)
    schreiben('teile-auszug.json', teile_aus)
    print(f'{len(katalog)} Räder, {len(teile_aus)} Teile, {len(rad_teile)} Zuordnungen geholt.')
