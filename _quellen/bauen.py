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
import auswertung as au
import extras as ex
import feedback as fb
import gruppen as gr
import raeder as ra
import seiten as se
import teile as te
import wissen as wi


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


# Eine Sitemap je Bereich, damit die Search Console zeigt, welcher Bereich wie gut im Index ist.
# sitemap.xml ist der Index darüber, so wie er in der Search Console eingereicht ist.
BEREICHE = [('raeder', ('/raeder/',)), ('teile', ('/teile/',)),
            ('ratgeber', ('/anleitungen/', '/reifengroessen/', '/verschleissrechner/', '/schaltgruppen/',
                          '/e-bike-systeme/', '/unterhaltskosten/')),
            ('seiten', ('',))]


def sitemaps(seiten):
    rest = list(seiten)
    eintraege = []
    for name, praefixe in BEREICHE:
        teil = [s for s in rest if s[0].startswith(praefixe)]
        rest = [s for s in rest if s not in teil]
        schreiben(f'sitemap-{name}.xml', sitemap(teil))
        eintraege.append(f'  <sitemap><loc>{an.SEITE}/sitemap-{name}.xml</loc><lastmod>{max(d for _, d in teil)}</lastmod></sitemap>\n')
    schreiben('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n'
              '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(eintraege) + '</sitemapindex>\n')


if __name__ == '__main__':
    schreiben('css/seiten.css', '\n'.join(lesen(f'_quellen/{n}') for n in ['basis.css', 'anleitungen-extra.css', 'raeder-extra.css']))
    alle = ra.laden()
    neuestes = max(r['geaendert'] for r in alle)
    seiten = ['/', '/anleitungen/', '/raeder/']
    schreiben('anleitungen/index.html', an.uebersicht(an.ANLEITUNGEN))
    for a in an.ANLEITUNGEN:
        schreiben(f'anleitungen/{a["slug"]}/index.html', an.anleitung_seite(a, an.ANLEITUNGEN))
        seiten.append((f'/anleitungen/{a["slug"]}/', a.get('stand', an.STAND)))
    werte = ex.zahlen(alle, ra.TEILE)
    schreiben('raeder/vorschlag.js', lesen('_quellen/vorschlag.js'))
    schreiben('raeder/rechner.js', lesen('_quellen/rechner.js'))
    schreiben('js/suche.js', lesen('_quellen/suche.js'))
    schreiben('raeder/index.html', ra.uebersicht_seite(alle, len(alle)))
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
    seiten += gr.bauen(alle, schreiben)
    seiten += wi.bauen(alle, schreiben, lesen)
    schreiben('js/finder.js', lesen('_quellen/finder.js'))
    schreiben('ueber-uns/index.html', se.ueber_uns(len(alle), len(ra.TEILE), int(werte['marken'])))
    schreiben('so-pruefen-wir/index.html', se.methodik(len(alle), len(ra.TEILE), neuestes))
    schreiben('fuer-vereine/index.html', se.fuer_vereine(len(alle), len(an.ANLEITUNGEN)))
    seiten += [('/ueber-uns/', an.STAND), ('/so-pruefen-wir/', neuestes), ('/fuer-vereine/', an.STAND)]
    seiten += au.bauen(alle, schreiben, neuestes)
    schreiben('js/zaehler.js', lesen('_quellen/zaehler.js'))
    schreiben('feedback/index.html', fb.seite())
    schreiben('feedback/feedback.js', lesen('_quellen/feedback.js'))
    seiten.append('/feedback/')
    schreiben('404.html', ex.fehlerseite())
    schreiben('suche.json', ex.suchdaten(alle, ra.TEILE))
    ex.handseiten(werte, alle, lesen, an.schreiben)
    seiten += ['/datenschutz.html', '/impressum.html', '/konto-loeschen.html']
    # Seiten ohne eigenes Datum bekommen den Stand der Anleitungen bzw. des Katalogs.
    seiten = [s if isinstance(s, tuple) else (s, max(an.STAND, neuestes) if s.startswith(('/raeder/', '/teile/', '/schaltgruppen/', '/e-bike-systeme/')) else an.STAND)
              for s in seiten]
    sitemaps(seiten)
    weg = aufraeumen('raeder') + aufraeumen('teile') + aufraeumen('schaltgruppen') + aufraeumen('e-bike-systeme')
    bilder = ex.vorschaubilder(alle)
    print(f'{len(an.ANLEITUNGEN)} Anleitungen, {len(alle)} Räder, {len(ra.TEILE)} Teile, {len(seiten)} Seiten in der Sitemap, '
          f'{bilder} Vorschaubilder neu, {weg} alte Seiten entfernt.')
