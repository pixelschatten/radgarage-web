"""Baut alle generierten Seiten: Anleitungen, Modellseiten, Reihen- und Teileseiten, gemeinsames CSS und sitemap.xml.

Aufruf im Repo-Wurzelordner: python3 _quellen/bauen.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import anleitungen as an
import raeder as ra
import teile as te

GESAMT_RAEDER = 800  # für den Text der Übersicht („über 800 Fahrräder“), beim Katalogausbau anpassen


def lesen(pfad):
    with open(os.path.join(an.WURZEL, pfad), encoding='utf-8') as f:
        return f.read()


def sitemap(seiten):
    zeilen = ''.join(f'  <url><loc>{an.SEITE}{p}</loc><lastmod>{an.STAND}</lastmod></url>\n' for p in seiten)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{zeilen}</urlset>\n'


if __name__ == '__main__':
    an.schreiben('css/seiten.css', '\n'.join(lesen(f'_quellen/{n}') for n in ['basis.css', 'anleitungen-extra.css', 'raeder-extra.css']))
    seiten = ['/', '/anleitungen/', '/raeder/']
    an.schreiben('anleitungen/index.html', an.uebersicht(an.ANLEITUNGEN))
    for a in an.ANLEITUNGEN:
        an.schreiben(f'anleitungen/{a["slug"]}/index.html', an.anleitung_seite(a, an.ANLEITUNGEN))
        seiten.append(f'/anleitungen/{a["slug"]}/')
    alle = ra.laden()
    an.schreiben('raeder/vorschlag.js', lesen('_quellen/vorschlag.js'))
    an.schreiben('raeder/index.html', ra.uebersicht_seite(alle, GESAMT_RAEDER))
    for slug, rs in ra.marken(alle).items():
        an.schreiben(f'raeder/{slug}/index.html', ra.marken_seite(slug, rs))
        seiten.append(f'/raeder/{slug}/')
    for r in alle:
        an.schreiben(r['pfad'].strip('/') + '/index.html', ra.rad_seite(r, alle))
        seiten.append(r['pfad'])
    for pfad, rs in ra.reihen(alle).items():
        an.schreiben(pfad.strip('/') + '/index.html', ra.reihe_seite(pfad, rs))
        seiten.append(pfad)
    seiten += te.bauen(alle, an.schreiben)
    seiten += ['/datenschutz.html', '/impressum.html', '/konto-loeschen.html']
    an.schreiben('sitemap.xml', sitemap(seiten))
    print(f'{len(an.ANLEITUNGEN)} Anleitungen, {len(alle)} Räder, {len(seiten)} Seiten in der Sitemap.')
