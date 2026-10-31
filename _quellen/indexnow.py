"""Meldet neue und geänderte Seiten per IndexNow an Bing, Yandex, Seznam und Naver (Google nutzt IndexNow nicht).

Aufruf im Repo-Wurzelordner:
  git diff --name-only HEAD~1 HEAD | python3 _quellen/indexnow.py   (geänderte Dateien aus dem letzten Commit)
  python3 _quellen/indexnow.py --alle                                 (alle Seiten aus den Sitemaps)

Der Schlüssel ist kein Geheimnis: Er liegt öffentlich als /<SCHLUESSEL>.txt auf der Seite und beweist nur,
dass die Meldung von dieser Domain kommt.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = 'radgarage.app'
SCHLUESSEL = 'dfe499f7da4718649072a948343bc571'
ZIEL = 'https://api.indexnow.org/indexnow'
NICHT = ('werkbank/', 'feedback/', 'abmelden/', 'einladung/', '_', 'danke.html', '404.html', 'img/', 'css/', 'js/', 'fonts/')


def url_zu(datei):
    """Repo-Pfad einer HTML-Datei -> öffentliche Adresse, oder None für Dateien, die nicht in die Suche sollen."""
    datei = datei.strip()
    if not datei.endswith('.html') or datei.startswith(NICHT):
        return None
    pfad = datei[:-len('index.html')] if datei.endswith('index.html') else datei
    voll = os.path.join(WURZEL, datei)
    if os.path.exists(voll):
        with open(voll, encoding='utf-8') as f:
            if 'name="robots" content="noindex' in f.read(3000):
                return None
    return f'https://{HOST}/{pfad}'


def aus_sitemaps():
    urls = []
    with open(os.path.join(WURZEL, 'sitemap.xml'), encoding='utf-8') as f:
        index = f.read()
    for teil in re.findall(r'<loc>https://radgarage\.app/([^<]+\.xml)</loc>', index) or ['sitemap.xml']:
        with open(os.path.join(WURZEL, teil), encoding='utf-8') as f:
            urls += [u for u in re.findall(r'<loc>([^<]+)</loc>', f.read()) if not u.endswith('.xml')]
    return urls


def melden(urls):
    for i in range(0, len(urls), 10000):
        teil = urls[i:i + 10000]
        daten = json.dumps({'host': HOST, 'key': SCHLUESSEL, 'keyLocation': f'https://{HOST}/{SCHLUESSEL}.txt',
                            'urlList': teil}).encode()
        anfrage = urllib.request.Request(ZIEL, data=daten, headers={'Content-Type': 'application/json; charset=utf-8'})
        try:
            with urllib.request.urlopen(anfrage, timeout=30) as antwort:
                print(f'IndexNow: {len(teil)} Adressen gemeldet, Antwort {antwort.status}.')
        except urllib.error.HTTPError as fehler:
            # 202 heißt angenommen, 422/403 meist: Schlüsseldatei noch nicht online. Kein Grund, den Lauf abzubrechen.
            print(f'IndexNow: Antwort {fehler.code} {fehler.reason}.')


if __name__ == '__main__':
    if '--alle' in sys.argv:
        urls = aus_sitemaps()
    else:
        dateien = sys.argv[1:] or sys.stdin.read().split()
        urls = sorted({u for u in map(url_zu, dateien) if u})
    if urls:
        melden(urls)
    else:
        print('IndexNow: nichts zu melden.')
