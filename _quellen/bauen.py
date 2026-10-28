"""Baut alle generierten Seiten: Anleitungen, Modellseiten, Reihen- und Teileseiten, Feedback, Fehlerseite,
Suchdaten, Vorschaubilder, gemeinsames CSS und sitemap.xml. Setzt außerdem in den von Hand gepflegten Seiten
(Startseite, Rechtstexte, Danke, Abmelden) die gemeinsame Fußzeile, die Symbole und die Katalogzahlen ein.

Aufruf im Repo-Wurzelordner: python3 _quellen/bauen.py
Vorher bei Bedarf die Daten holen: python3 _quellen/holen.py (läuft jede Nacht als GitHub Action).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import anleitungen as an
import extras as ex
import feedback as fb
import raeder as ra
import teile as te


def lesen(pfad):
    with open(os.path.join(an.WURZEL, pfad), encoding='utf-8') as f:
        return f.read()


GESCHRIEBEN = set()


def schreiben(pfad, text):
    GESCHRIEBEN.add(pfad)
    an.schreiben(pfad, text)


def aufraeumen(ordner):
    """Löscht Seiten von Rädern und Teilen, die es im Katalog nicht mehr gibt (umbenannt oder entfernt)."""
    weg = 0
    for wurzel, _, dateien in os.walk(os.path.join(an.WURZEL, ordner), topdown=False):
        rel = os.path.relpath(wurzel, an.WURZEL)
        if 'index.html' in dateien and f'{rel}/index.html' not in GESCHRIEBEN:
            os.remove(os.path.join(wurzel, 'index.html'))
            weg += 1
        if not os.listdir(wurzel):
            os.rmdir(wurzel)
    return weg


def sitemap(seiten):
    zeilen = ''.join(f'  <url><loc>{an.SEITE}{p}</loc><lastmod>{d}</lastmod></url>\n' for p, d in seiten)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{zeilen}</urlset>\n'


if __name__ == '__main__':
    schreiben('css/seiten.css', '\n'.join(lesen(f'_quellen/{n}') for n in ['basis.css', 'anleitungen-extra.css', 'raeder-extra.css']))
    alle = ra.laden()
    neuestes = max(r['geaendert'] for r in alle)
    seiten = ['/', '/anleitungen/', '/raeder/']
    schreiben('anleitungen/index.html', an.uebersicht(an.ANLEITUNGEN))
    for a in an.ANLEITUNGEN:
        schreiben(f'anleitungen/{a["slug"]}/index.html', an.anleitung_seite(a, an.ANLEITUNGEN))
        seiten.append(f'/anleitungen/{a["slug"]}/')
    werte = ex.zahlen(alle, ra.TEILE)
    schreiben('raeder/vorschlag.js', lesen('_quellen/vorschlag.js'))
    schreiben('raeder/rechner.js', lesen('_quellen/rechner.js'))
    schreiben('js/suche.js', lesen('_quellen/suche.js'))
    schreiben('raeder/index.html', ra.uebersicht_seite(alle, len(alle) // 100 * 100))
    for slug, rs in ra.marken(alle).items():
        schreiben(f'raeder/{slug}/index.html', ra.marken_seite(slug, rs))
        seiten.append(f'/raeder/{slug}/')
    for r in alle:
        schreiben(r['pfad'].strip('/') + '/index.html', ra.rad_seite(r, alle))
        seiten.append((r['pfad'], r['geaendert']))
    for pfad, rs in ra.reihen(alle).items():
        schreiben(pfad.strip('/') + '/index.html', ra.reihe_seite(pfad, rs))
        seiten.append((pfad, max(r['geaendert'] for r in rs)))
    seiten += te.bauen(alle, schreiben)
    schreiben('feedback/index.html', fb.seite())
    schreiben('feedback/feedback.js', lesen('_quellen/feedback.js'))
    seiten.append('/feedback/')
    schreiben('404.html', ex.fehlerseite())
    schreiben('suche.json', ex.suchdaten(alle, ra.TEILE))
    ex.handseiten(werte, alle, lesen, an.schreiben)
    seiten += ['/datenschutz.html', '/impressum.html', '/konto-loeschen.html']
    # Seiten ohne eigenes Datum bekommen den Stand der Anleitungen bzw. des Katalogs.
    seiten = [s if isinstance(s, tuple) else (s, max(an.STAND, neuestes) if s.startswith(('/raeder/', '/teile/')) else an.STAND)
              for s in seiten]
    schreiben('sitemap.xml', sitemap(seiten))
    weg = aufraeumen('raeder') + aufraeumen('teile')
    bilder = ex.vorschaubilder(alle)
    print(f'{len(an.ANLEITUNGEN)} Anleitungen, {len(alle)} Räder, {len(ra.TEILE)} Teile, {len(seiten)} Seiten in der Sitemap, '
          f'{bilder} Vorschaubilder neu, {weg} alte Seiten entfernt.')
