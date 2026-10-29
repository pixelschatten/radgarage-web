"""Was bauen.py neben den Katalogseiten erzeugt: Suchdaten, Fehlerseite, Vorschaubilder pro Rad,
Zahlen auf der Startseite und eine einheitliche Fußzeile in den von Hand gepflegten Seiten.
"""
import hashlib
import io
import json
import os
import re

from anleitungen import (CSS_VERSION, FUSS, FUSS_INHALT, ICONS, WURZEL, app_schema, e, kopf, kopf_knopf, kopfzeile, store_meta,
                         suchfeld)
from raeder import FARBEN, teilname, tsd, wartungskosten, euro_genau
from teile import KATEGORIEN

# Seiten, die nicht aus dem Generator kommen. bauen.py setzt dort Fußzeile und Symbole ein.
HANDSEITEN = ['index.html', 'danke.html', 'datenschutz.html', 'impressum.html', 'konto-loeschen.html', 'abmelden/index.html']
OHNE_KNOPF = {'danke.html', 'abmelden/index.html'}  # Seiten nach der Anmeldung: kein „Testzugang sichern“ im Kopf


def _norm(s):
    s = s.lower()
    for a, b in [('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss'), ('é', 'e'), ('è', 'e')]:
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def suchdaten(alle, teile):
    """Kompakte Liste für /js/suche.js: Räder [Name, Jahr, Radart, Pfad, Zusatz] und Teile [Name, Kategorie, ID]."""
    raeder = [[r['name'], r['baujahr'], r['kategorie'], r['pfad'], _norm(' '.join(r['zweitnamen'] or []))]
              for r in sorted(alle, key=lambda x: (x['hersteller'].lower(), x['modell'].lower(), -x['baujahr']))]
    tl = [[teilname(t), KATEGORIEN.get(t['kategorie'], t['kategorie']), t['id']]
          for t in sorted(teile.values(), key=lambda t: teilname(t).lower())]
    return json.dumps({'r': raeder, 't': tl}, ensure_ascii=False, separators=(',', ':'))


def zahlen(alle, teile):
    hundert = len(alle) // 100 * 100
    teile_rund = len(teile) // 100 * 100
    marken = len({r['marke_slug'] for r in alle})
    return {
        'raeder': tsd(len(alle)),
        'raeder-rund': f'{tsd(hundert)}+',
        'raeder-ueber': tsd(hundert),
        'marken': str(marken),
        'teile-ueber': tsd(teile_rund),
        'teile': tsd(len(teile)),
    }


def zahlen_einsetzen(html, werte):
    """Ersetzt den Inhalt von Elementen mit data-zahl="…" durch die aktuellen Werte."""
    def ersetzen(m):
        return m.group(1) + werte[m.group(2)] + m.group(3) if m.group(2) in werte else m.group(0)
    return re.sub(r'(<[a-z0-9]+[^>]*\bdata-zahl="([a-z-]+)"[^>]*>)[^<]*(</)', ersetzen, html)


def fuss_angleichen(html):
    """Fußzeile durch die gemeinsame ersetzen und die Symbole im Kopf ergänzen."""
    neu = re.sub(r'[ \t]*<footer\b.*?</footer>\n?', lambda m: FUSS_INHALT, html, count=1, flags=re.S)
    if 'rel="icon"' not in neu:
        neu = re.sub(r'(<meta name="theme-color"[^>]*>\n)', lambda m: m.group(1) + ICONS + '\n', neu, count=1)
    return neu


def kopf_angleichen(html, pfad):
    """Kopf (Menü, Suche, Knopf) wie auf den generierten Seiten, dazu das gemeinsame Rahmen-CSS."""
    url = '/' if pfad == 'index.html' else '/' + pfad.replace('index.html', '')
    kopfteil = kopfzeile(url)
    if pfad in OHNE_KNOPF:
        kopfteil = re.sub(r'\n\s*<!--kopf-knopf-->.*?<!--/kopf-knopf-->', '', kopfteil, flags=re.S)
    neu = re.sub(r'[ \t]*<header>.*?</header>\n', lambda m: kopfteil, html, count=1, flags=re.S)
    neu = re.sub(r'<link rel="stylesheet" href="/css/rahmen\.css[^"]*">\n?', '', neu)
    if '/css/seiten.css' not in neu:
        neu = neu.replace('</head>', f'<link rel="stylesheet" href="/css/rahmen.css?v={CSS_VERSION}">\n</head>', 1)
    return neu


def inhalt_angleichen(html):
    """Inhaltsverzeichnis der Datenschutzerklärung aus ihren Zwischenüberschriften (zwischen <!--inhalt--> und <!--/inhalt-->)."""
    if '<!--inhalt-->' not in html:
        return html
    vergeben = set(re.findall(r'<h3 id="([^"]+)"', html))

    def anker(m):
        text = re.sub(r'<[^>]+>', '', m.group(1))
        k = re.sub(r'[^a-z0-9]+', '-', _norm(text)).strip('-')
        while k in vergeben:
            k += '-2'
        vergeben.add(k)
        return f'<h3 id="{k}">{m.group(1)}</h3>'
    neu = re.sub(r'<h3>(.*?)</h3>', anker, html)
    eintraege = re.findall(r'<h3 id="([^"]+)">(.*?)</h3>', neu)
    links = ''.join(f'<li><a href="#{k}">{t}</a></li>' for k, t in eintraege)
    return re.sub(r'<!--inhalt-->.*?<!--/inhalt-->',
                  lambda m: f'<!--inhalt--><nav class="inhaltsliste" aria-label="Inhalt"><b>Inhalt</b><ol>{links}</ol></nav><!--/inhalt-->',
                  neu, flags=re.S)


def store_angleichen(html):
    """Store-Start (STORE_LIVE in anleitungen.py): Smart App Banner, App-Markup und Kopf-Knopf in den Handseiten."""
    neu = re.sub(r'<meta name="apple-itunes-app"[^>]*>\n?', '', html)
    neu = re.sub(r'(<meta name="theme-color"[^>]*>\n)', lambda m: m.group(1) + store_meta(), neu, count=1)
    neu = re.sub(r'<!--app-schema-->.*?<!--/app-schema-->', lambda m: f'<!--app-schema-->{app_schema()}<!--/app-schema-->', neu, flags=re.S)
    neu = re.sub(r'<!--kopf-knopf-->.*?<!--/kopf-knopf-->', lambda m: f'<!--kopf-knopf-->{kopf_knopf()}<!--/kopf-knopf-->', neu, flags=re.S)
    return neu


def beliebt(alle, anzahl=8):
    """Die Reihen mit den meisten Ausstattungen im Katalog als Schnelleinstieg auf der Startseite."""
    reihen = {}
    for r in alle:
        if r['reihe_pfad']:
            reihen.setdefault(r['reihe_pfad'], []).append(r)
    top = sorted(reihen.items(), key=lambda x: (-len(x[1]), x[0]))[:anzahl]
    links = ''.join(f'<a href="{p}">{e(rs[0]["hersteller"])} {e(rs[0]["reihe"])}</a>' for p, rs in top)
    # Dazu die Marken mit den meisten Rädern, damit die Startseite die großen Markenseiten direkt verlinkt
    zahl = {}
    for r in alle:
        zahl.setdefault(r['marke_slug'], [r['hersteller'], 0])[1] += 1
    marken = sorted(zahl.items(), key=lambda x: (-x[1][1], x[0]))[:anzahl]
    m_links = ''.join(f'<a href="/raeder/{s}/">{e(n)}</a>' for s, (n, _) in marken)
    return (f'<!--beliebt-->\n        <nav class="beliebt" aria-label="Beliebte Reihen">{links}</nav>\n'
            f'        <nav class="beliebt marken" aria-label="Marken"><span>Marken:</span>{m_links}<a href="/raeder/">alle</a></nav>\n'
            f'        <!--/beliebt-->')


def handseiten(werte, alle, lesen, schreiben):
    for pfad in HANDSEITEN:
        alt = lesen(pfad)
        neu = zahlen_einsetzen(store_angleichen(kopf_angleichen(fuss_angleichen(alt), pfad)), werte)
        neu = inhalt_angleichen(neu)
        neu = re.sub(r'<!--beliebt-->.*?<!--/beliebt-->', lambda m: beliebt(alle), neu, flags=re.S)
        if neu != alt:
            schreiben(pfad, neu)


def fehlerseite():
    titel = 'Seite nicht gefunden | Radgarage'
    beschr = 'Diese Seite gibt es bei der Radgarage nicht (mehr). Such dein Rad oder dein Teil direkt.'
    k = kopf(titel, beschr, '/404.html', [], robots=True)
    k = k.replace('<html lang="de">', '<html lang="de" data-zaehlpfad="/404">', 1)  # für js/zaehler.js
    return k + f'''  <main>
  <div class="bento uebersicht">
    <div class="t k1 kopf">
      <span class="eyebrow">Fehler 404</span>
      <h1>Diese Seite gibt es nicht (mehr).</h1>
      <p class="lead">Vielleicht hat sich der Name eines Rads geändert oder der Link hat einen Tippfehler. Such einfach direkt nach deinem Rad oder Teil.</p>
      {suchfeld('alles', 'suche-404')}
    </div>
  </div>
  <section aria-label="Weiter" style="margin-top:14px">
    <div class="karten">
      <a class="t k5 karte" href="/raeder/"><span class="eyebrow">Katalog</span><h2>Räder</h2><span class="meta">Alle Marken und Modelle</span></a>
      <a class="t k2 karte" href="/teile/"><span class="eyebrow">Katalog</span><h2>Ersatzteile</h2><span class="meta">Von Kette bis Innenlager</span></a>
      <a class="t k3 karte" href="/anleitungen/"><span class="eyebrow">Selbst machen</span><h2>Anleitungen</h2><span class="meta">Schritt für Schritt</span></a>
    </div>
  </section>
  <p class="hinweis"><a href="/">Zur Startseite</a></p>
  </main>
''' + FUSS


# Vorschaubilder fürs Teilen (WhatsApp, Foren, soziale Netzwerke), 1200 × 630 wie og:image erwartet.
BILD_B, BILD_H = 1200, 630
HELL = {'bg': (242, 237, 226), 'ink': (40, 36, 30), 'ink2': (63, 56, 47),
        'k1': (246, 199, 168), 'k2': (201, 198, 240), 'k3': (244, 222, 138), 'k4': (184, 226, 200), 'k5': (185, 216, 242)}
SCHRIFTEN = os.path.join(WURZEL, '_quellen', 'schriften')
_schrift_cache = {}


def _schrift(name, groesse, gewicht=None):
    from PIL import ImageFont
    key = (name, groesse, gewicht)
    if key not in _schrift_cache:
        f = ImageFont.truetype(os.path.join(SCHRIFTEN, name), groesse)
        if gewicht:
            f.set_variation_by_axes([gewicht])
        _schrift_cache[key] = f
    return _schrift_cache[key]


def _umbrechen(zeichnen, text, schrift, breite):
    zeilen, zeile = [], ''
    for wort in text.split():
        probe = f'{zeile} {wort}'.strip()
        if zeichnen.textlength(probe, font=schrift) <= breite or not zeile:
            zeile = probe
        else:
            zeilen.append(zeile)
            zeile = wort
    if zeile:
        zeilen.append(zeile)
    return zeilen


_symbol_cache = []


def _symbol():
    """App-Icon mit runden Ecken, 64 px, für die Vorschaubilder."""
    if not _symbol_cache:
        from PIL import Image, ImageDraw
        icon = Image.open(os.path.join(WURZEL, '_quellen', 'app-icon.png')).convert('RGBA').resize((64, 64), Image.LANCZOS)
        maske = Image.new('L', (64, 64), 0)
        ImageDraw.Draw(maske).rounded_rectangle((0, 0, 63, 63), 16, fill=255)
        icon.putalpha(maske)
        _symbol_cache.append(icon)
    return _symbol_cache[0]


def vorschaubild(r):
    from PIL import Image, ImageDraw
    farbe = FARBEN[int(hashlib.md5(r['id'].encode()).hexdigest(), 16) % len(FARBEN)]
    bild = Image.new('RGB', (BILD_B, BILD_H), HELL['bg'])
    d = ImageDraw.Draw(bild)
    d.rounded_rectangle((40, 40, BILD_B - 40, BILD_H - 40), 44, fill=HELL[farbe])
    x = 96
    d.text((x, 100), f'{r["kategorie"]} · Modelljahr {r["baujahr"]}'.upper(), font=_schrift('manrope-latin.ttf', 26, 800),
           fill=HELL['ink2'])
    # Name so groß wie möglich, höchstens drei Zeilen
    for groesse in (84, 74, 64, 56, 48):
        schrift = _schrift('bricolage-latin-800.ttf', groesse)
        zeilen = _umbrechen(d, r['name'], schrift, BILD_B - 2 * x)
        if len(zeilen) <= 3:
            break
    y = 150
    for z in zeilen[:3]:
        d.text((x, y), z, font=schrift, fill=HELL['ink'])
        y += int(groesse * 1.05)
    w = wartungskosten(r['teile'])
    fakten = f'{len(r["teile"])} verbaute Teile mit Richtpreis und passendem Ersatz'
    if w:
        fakten = f'{len(r["teile"])} verbaute Teile · Unterhalt ca. {euro_genau(w["summe"])} je 1.000 km'
    d.text((x, y + 24), fakten, font=_schrift('manrope-latin.ttf', 30, 600), fill=HELL['ink2'])
    # Fußzeile der Kachel: Name und Adresse
    bild.paste(_symbol(), (x, BILD_H - 146), _symbol())
    d.text((x + 80, BILD_H - 136), 'Radgarage', font=_schrift('bricolage-latin-800.ttf', 40), fill=HELL['ink'])
    adr = 'radgarage.app'
    s = _schrift('manrope-latin.ttf', 28, 700)
    d.text((BILD_B - x - d.textlength(adr, font=s), BILD_H - 128), adr, font=s, fill=HELL['ink2'])
    puffer = io.BytesIO()
    bild.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(puffer, 'PNG', optimize=True)
    return puffer.getvalue()


def vorschaubilder(alle):
    """Schreibt img/raeder/<id>.png nur, wenn sich das Bild geändert hat, und räumt Bilder entfernter Räder weg."""
    ordner = os.path.join(WURZEL, 'img', 'raeder')
    os.makedirs(ordner, exist_ok=True)
    neu = 0
    ids = set()
    for r in alle:
        ids.add(r['id'])
        pfad = os.path.join(ordner, f'{r["id"]}.png')
        daten = vorschaubild(r)
        if os.path.exists(pfad):
            with open(pfad, 'rb') as f:
                if f.read() == daten:
                    continue
        with open(pfad, 'wb') as f:
            f.write(daten)
        neu += 1
    for name in os.listdir(ordner):
        if name.endswith('.png') and name[:-4] not in ids:
            os.remove(os.path.join(ordner, name))
    return neu
