"""Ratgeber-Seiten mit Rechner: Reifengrößen (/reifengroessen/) und Verschleißrechner (/verschleissrechner/),
dazu beide Rechner zum Einbetten auf fremden Websites (/einbetten/).

Zahlen und Beispiele kommen aus dem Katalog, gerechnet wird im Browser (js/reifen.js, js/verschleiss.js,
Quellen in _quellen/). Gebaut wird über python3 _quellen/bauen.py.
"""
import json
import re
from collections import Counter, OrderedDict

from anleitungen import ANLEITUNGEN, CSS_VERSION, FUSS, ICONS, SEITE, STAND, e, kopf, krumen
from raeder import FELGEN, RICHTWERT_KM, TEILE, reifen_groesse, teil_link, tsd

STAND_WISSEN = '2026-10-28'


def schlauch_bereich(t):
    """(von, bis, felge) eines Schlauchs aus Name oder Merkmalen, sonst None."""
    s = f'{t["name"]} {t["merkmale"] or ""}'
    m = re.search(r'(\d{2})\s*[–-]\s*(\d{2})-(\d{3})', s)
    if m:
        return int(m.group(1)), int(m.group(2)), int(m.group(3))
    m = re.search(r'700\s*[×x]\s*(\d{2})\s*[–-]\s*(\d{2})\s*C', s)
    if m:
        return int(m.group(1)), int(m.group(2)), 622
    return None


def _faq(fragen):
    return ''.join(f'<details><summary>{e(q)}</summary><p>{a}</p></details>' for q, a in fragen)


def _chips(slugs):
    da = {a['slug']: a for a in ANLEITUNGEN}
    return ''.join(f'<a href="/anleitungen/{s}/">{e(da[s]["h1"])}</a>' for s in slugs if s in da)


# ---------------------------------------------------------------- Reifengrößen

def reifen_daten(alle):
    """Größe (breite, felge) -> {'raeder': n, 'art': häufigste Radart, 'reifen': Counter der Teile}."""
    groessen = {}
    for r in alle:
        gesehen = set()
        for t in r['teile']:
            if t['kategorie'] != 'Reifen':
                continue
            g = reifen_groesse(t)
            if not g:
                continue
            key = g[:2]
            d = groessen.setdefault(key, {'raeder': 0, 'arten': Counter(), 'reifen': Counter(), 'ungefaehr': g[2]})
            d['reifen'][t['id']] += 1
            d['ungefaehr'] = d['ungefaehr'] and g[2]
            if key not in gesehen:
                gesehen.add(key)
                d['raeder'] += 1
                d['arten'][r['kategorie']] += 1
    return groessen


def schlauch_liste():
    schlaeuche = []
    for t in sorted(TEILE.values(), key=lambda t: t['id']):
        if t['kategorie'] == 'Schlauch':
            b = schlauch_bereich(t)
            if b:
                schlaeuche.append({'id': t['id'], 'name': t['name'], 'von': b[0], 'bis': b[1], 'felge': b[2],
                                   'merkmale': t['merkmale'] or ''})
    return schlaeuche


def reifen_js_daten(groessen, schlaeuche):
    """Was js/reifen.js im Browser braucht: Größen mit Anzahl Räder, Felgennamen, Schläuche."""
    return {
        'groessen': {f'{b}-{f}': d['raeder'] for (b, f), d in groessen.items()},
        'felgen': {str(k): v for k, v in FELGEN.items()},
        'schlaeuche': [{'url': f'/teile/{s["id"]}/', 'name': s['name'], 'von': s['von'], 'bis': s['bis'], 'felge': s['felge']}
                       for s in schlaeuche],
    }


def reifen_rechner(js_daten, farbe='k5'):
    """Der Rechner-Block, gleich auf /reifengroessen/ und in der Version zum Einbetten."""
    return f'''    <section class="t {farbe} voll" aria-labelledby="rechner-titel">
      <span class="eyebrow">Rechner</span>
      <h2 id="rechner-titel" style="font-size:30px;margin:6px 0 4px">Welche Größe ist das?</h2>
      <p>Tipp ab, was auf deinem Reifen steht, zum Beispiel <b>28 x 1.75</b>, <b>700 x 32C</b>, <b>29 x 2.4</b> oder <b>55-622</b>.</p>
      <form class="werkzeug-form reifen-rechner" action="#" data-daten='{e(json.dumps(js_daten, ensure_ascii=False, separators=(",", ":")))}'>
        <label for="reifen-eingabe">Größe auf dem Reifen</label>
        <input type="text" id="reifen-eingabe" value="28 x 1.75" autocomplete="off" spellcheck="false" inputmode="text">
        <div class="ergebnis" role="status" aria-live="polite"></div>
      </form>
    </section>
'''


def reifen_seite(alle):
    pfad = '/reifengroessen/'
    nav, brot = krumen([('Radgarage', '/'), ('Anleitungen', '/anleitungen/'), ('Reifengrößen', pfad)])
    titel = 'Fahrrad-Reifengrößen: ETRTO, Zoll und 700C umrechnen'
    beschr = ('Reifengröße am Fahrrad verstehen und umrechnen: ETRTO (z. B. 55-622), Zoll (28 x 2.15) und 700 x 35C. '
              'Mit Tabelle der gängigen Größen und passendem Schlauch.')
    groessen = reifen_daten(alle)
    schlaeuche = schlauch_liste()
    js_daten = reifen_js_daten(groessen, schlaeuche)
    # Tabelle: Größen mit mindestens drei Rädern, nach Felge
    abschnitte = []
    for felge, name in FELGEN.items():
        zeilen = []
        for (b, f), d in sorted(groessen.items(), key=lambda x: x[0][0]):
            if f != felge or d['raeder'] < 3:
                continue
            bsp = ', '.join(teil_link(TEILE[i]) if i in TEILE else e(i) for i, _ in d['reifen'].most_common(2))
            zeilen.append(f'<tr><th scope="row">{"ca. " if d["ungefaehr"] else ""}{b}-{f}</th>'
                          f'<td>{b} mm breit<span>meist {e(d["arten"].most_common(1)[0][0])} · z. B. {bsp}</span></td>'
                          f'<td class="preis">{d["raeder"]} Räder</td></tr>')
        if zeilen:
            abschnitte.append(f'<h3>{felge} mm: {e(name)}</h3><table class="teiltabelle"><tbody>{"".join(zeilen)}</tbody></table>')
    schlauch_zeilen = ''.join(
        f'<tr><th scope="row"><a href="/teile/{e(s["id"])}/">{e(s["name"])}</a></th>'
        f'<td>Reifen {s["von"]} bis {s["bis"]} mm auf {s["felge"]}er Felge<span>{e(s["merkmale"])}</span></td></tr>'
        for s in schlaeuche)
    fragen = [
        ('Ist 28 Zoll das Gleiche wie 29 Zoll?', 'Bei der Felge ja: Beide haben 622 mm Durchmesser, ebenso 700C. „29 Zoll“ sagt man meist bei breiten MTB-Reifen, „28 Zoll“ bei Trekking- und Cityrädern. Ob ein Reifen passt, entscheidet dann die Breite.'),
        ('Wie breit darf mein Reifen sein?', 'Das hängt von der Innenbreite der Felge und vom Platz in Rahmen und Gabel ab. Die Hersteller nennen dafür eine maximale Reifenbreite. Etwas schmaler oder breiter als ab Werk geht meist, große Sprünge nur nach Prüfung.'),
        ('Was bedeutet das C bei 700 x 35C?', 'Das C stammt aus dem alten französischen System und steht heute praktisch nur noch für die 622-mm-Felge. 700 x 35C entspricht ETRTO 35-622.'),
        ('Welches Ventil brauche ich?', 'Sclaverand (Presta) ist schlank und bei Rennrädern und vielen MTBs üblich, Autoventil (Schrader) passt an jede Tankstelle, Dunlop (Blitzventil) findet man an älteren Stadträdern. Das Ventil muss zum Loch in der Felge passen.'),
    ]
    out = [kopf(titel + ' | Radgarage' if len(titel) < 50 else titel, beschr, pfad, [brot]), nav,
           '  <main>\n  <article class="bento anl">\n']
    out.append(f'''    <div class="t k4 kopf">
      <span class="eyebrow">Ratgeber · Reifen</span>
      <h1>Reifengrößen verstehen und umrechnen</h1>
      <p class="lead">Auf jedem Reifen stehen mehrere Größen, etwa 55-622, 28 x 2.15 und manchmal 700 x 55C. Sie meinen alle dasselbe. Die verlässlichste ist die ETRTO-Angabe: Breite und Felgendurchmesser in Millimetern.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Größen im Katalog</span><div class="wert">{len(groessen)}</div></div>
      <div class="t s2"><span class="eyebrow">Häufigste Felge</span><div class="wert">622 mm</div></div>
    </div>
{reifen_rechner(js_daten)}    <section class="t s1 voll text-abschnitt" aria-labelledby="lesen-titel">
      <span class="eyebrow">So liest du die Größe</span>
      <h2 id="lesen-titel" style="font-size:30px;margin:6px 0 8px">Drei Angaben, eine Größe</h2>
      <ul class="punkte">
        <li><b>ETRTO, z. B. 55-622:</b> 55 mm Reifenbreite, 622 mm Felgendurchmesser am Reifensitz. Eindeutig und am besten zum Vergleichen.</li>
        <li><b>Zoll, z. B. 28 x 2.15:</b> ungefährer Außendurchmesser und Breite in Zoll. 2.15 Zoll sind etwa 55 mm. Achtung: „28 Zoll“ und „29 Zoll“ meinen dieselbe Felge.</li>
        <li><b>Französisch, z. B. 700 x 35C:</b> 700 steht für die 622-mm-Felge, 35 für die Breite in Millimetern. Typisch bei Rennrad, Gravel und Trekking.</li>
      </ul>
    </section>
    <section class="t s1 voll alle" aria-labelledby="tabelle-titel">
      <span class="eyebrow">Aus dem Katalog</span>
      <h2 id="tabelle-titel" style="font-size:30px;margin:6px 0 4px">Gängige Reifengrößen</h2>
      <p>Welche Größen an den Rädern im Katalog ab Werk montiert sind, mit Beispielreifen. „ca.“ heißt: aus einer Zoll-Breite umgerechnet.</p>
      {"".join(abschnitte)}
    </section>
    <section class="t k3 voll alle" aria-labelledby="schlauch-titel">
      <span class="eyebrow">Schlauch</span>
      <h2 id="schlauch-titel" style="font-size:30px;margin:6px 0 4px">Welcher Schlauch passt?</h2>
      <p>Ein Schlauch passt, wenn der Felgendurchmesser gleich ist und die Reifenbreite im Bereich auf der Packung liegt. Ein Schlauch für 40 bis 62 mm passt also in einen 55-622-Reifen. Dazu muss das Ventil zur Felge passen, bei hohen Felgen auch die Ventillänge.</p>
      <table class="teiltabelle"><tbody>{schlauch_zeilen}</tbody></table>
    </section>
    <section class="t s2 fragen" aria-labelledby="fragen-titel">
      <span class="eyebrow">Häufige Fragen</span>
      <h2 id="fragen-titel" style="font-size:30px;margin:6px 0 8px">Gut zu wissen</h2>
      {_faq(fragen)}
    </section>
    <nav class="t s2 voll rad-anleitungen" aria-label="Passende Anleitungen">
      <span class="eyebrow">Selbst machen</span>
      <h2 style="font-size:26px;margin:6px 0 10px">Passende Anleitungen</h2>
      <div class="chips">{_chips(['reifen-wechseln', 'schlauch-wechseln', 'fruehjahrscheck'])}<a href="/teile/reifen/">Alle Reifen im Katalog</a><a href="/raeder/">Reifengröße deines Rads</a></div>
    </nav>
  </article>
  <p class="hinweis">Umrechnungen von Zoll in Millimeter sind Näherungen. Maßgeblich ist die ETRTO-Angabe auf der Reifenflanke. Stand: Oktober 2026.</p>
  </main>
<script src="/js/reifen.js?v=1" defer></script>
''')
    out.append(FUSS)
    return ''.join(out)


# ---------------------------------------------------------------- Verschleißrechner

TEILE_RECHNER = [  # (Schlüssel, Name, Richtwert km, Beispielpreis für beide Räder bzw. das Teil)
    ('kette', 'Kette', RICHTWERT_KM['Kette'], 25),
    ('kassette', 'Kassette', RICHTWERT_KM['Kassette'], 50),
    ('belaege', 'Bremsbeläge (vorn und hinten)', RICHTWERT_KM['Bremsbelag'], 24),
    ('reifen', 'Reifen (beide)', RICHTWERT_KM['Reifen'], 60),
]


def verschleiss_rechner():
    """Der Rechner-Block, gleich auf /verschleissrechner/ und in der Version zum Einbetten."""
    daten = json.dumps([{'k': k, 'n': n, 'km': km, 'preis': p} for k, n, km, p in TEILE_RECHNER], ensure_ascii=False,
                       separators=(',', ':'))
    zeilen = ''.join(
        f'<tr data-teil="{k}"><th scope="row">{e(n)}</th><td class="v-km" data-label="Wechsel">etwa alle {tsd(km)} km</td>'
        f'<td class="v-zeit" data-label="Bei dir">–</td><td class="zahl v-euro" data-label="Pro Jahr">–</td></tr>'
        for k, n, km, _ in TEILE_RECHNER)
    return f'''    <section class="t k2 voll verschleiss-rechner" aria-labelledby="vr-titel" data-teile='{e(daten)}'>
      <span class="eyebrow">Rechner</span>
      <h2 id="vr-titel" style="font-size:30px;margin:6px 0 10px">Dein Fahrprofil</h2>
      <form class="werkzeug-form" action="#">
        <label for="vr-km">Kilometer im Jahr: <output for="vr-km" class="vr-km-wert">3.000 km</output></label>
        <input type="range" id="vr-km" min="500" max="20000" step="500" value="3000">
        <fieldset><legend>Wie fährst du meistens?</legend><div class="wahl">
          <label><input type="checkbox" name="ebike"> E-Bike</label>
          <label><input type="checkbox" name="nass"> Oft bei Nässe</label>
          <label><input type="checkbox" name="gelaende"> Viel Gelände oder Berge</label>
        </div></fieldset>
      </form>
      <div class="tabelle-rahmen"><table class="vergleichstabelle vr-tabelle">
        <thead><tr><th scope="col">Teil</th><th scope="col">Wechsel</th><th scope="col">Bei dir</th><th scope="col" class="zahl">Pro Jahr</th></tr></thead>
        <tbody>{zeilen}</tbody>
      </table></div>
      <p class="vr-summe">Teilekosten zusammen etwa <b>–</b> im Jahr.</p>
      <p class="klein">Grobe Schätzung mit Richtwerten und Beispielpreisen (Kette 25 €, Kassette 50 €, Beläge 2 × 12 €, Reifen 2 × 30 €), ohne Werkstatt. E-Bike, Nässe und Gelände verkürzen die Abstände um Schätzfaktoren. Ab etwa 80 % lohnt sich ein Blick aufs Teil. Messen ersetzt der Rechner nicht.</p>
    </section>
'''


def verschleiss_seite():
    pfad = '/verschleissrechner/'
    nav, brot = krumen([('Radgarage', '/'), ('Anleitungen', '/anleitungen/'), ('Verschleißrechner', pfad)])
    titel = 'Verschleißrechner: wann Kette, Beläge und Reifen fällig sind'
    beschr = ('Wann muss die Fahrradkette gewechselt werden, wie lange halten Bremsbeläge und Reifen? Der Rechner schätzt '
              'es aus deinen Kilometern, Wetter und Gelände.')
    fragen = [
        ('Wann muss die Fahrradkette gewechselt werden?', f'Als Richtwert nach etwa {tsd(RICHTWERT_KM["Kette"])} km, entscheidend ist aber die Messung: Bei 11- und 12-fach-Ketten ab 0,5 % Längung, bei 10-fach und weniger ab 0,75 %. Wie das geht, steht in der Anleitung <a href="/anleitungen/kettenverschleiss-messen/">Kettenverschleiß messen</a>.'),
        ('Wie lange halten Bremsbeläge?', f'Organische Beläge an Scheibenbremsen halten im Schnitt etwa {tsd(RICHTWERT_KM["Bremsbelag"])} km, bei Bergtouren, Nässe und am E-Bike oft nur die Hälfte. Getauscht wird, wenn der Belag dünner als etwa 0,5 mm ist.'),
        ('Wie lange hält ein Fahrradreifen?', f'Rund {tsd(RICHTWERT_KM["Reifen"])} km sind ein guter Richtwert, hinten weniger als vorne. Leichte Rennreifen halten kürzer, robuste Trekkingreifen deutlich länger. Abgefahrenes Profil oder Risse in der Flanke sind das Zeichen zum Wechseln.'),
        ('Wann ist die Kassette fällig?', f'Meist nach zwei bis drei Ketten, also grob {tsd(RICHTWERT_KM["Kassette"])} km. Springt eine neue Kette auf einzelnen Ritzeln, ist die Kassette verschlissen.'),
    ]
    out = [kopf(titel, beschr, pfad, [brot]), nav, '  <main>\n  <article class="bento anl">\n']
    out.append(f'''    <div class="t k1 kopf">
      <span class="eyebrow">Ratgeber · Verschleiß</span>
      <h1>Verschleißrechner</h1>
      <p class="lead">Wann ist die Kette fällig, wann die Bremsbeläge? Stell ein, wie viel und wo du fährst, und der Rechner schätzt, wie oft du welches Teil tauschen musst und was das im Jahr kostet.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Kette</span><div class="wert">{tsd(RICHTWERT_KM["Kette"])} km</div></div>
      <div class="t s2"><span class="eyebrow">Bremsbeläge</span><div class="wert">{tsd(RICHTWERT_KM["Bremsbelag"])} km</div></div>
    </div>
{verschleiss_rechner()}    <section class="t s2 fragen" aria-labelledby="fragen-titel">
      <span class="eyebrow">Häufige Fragen</span>
      <h2 id="fragen-titel" style="font-size:30px;margin:6px 0 8px">Wann ist was fällig?</h2>
      {_faq(fragen)}
    </section>
    <aside class="t k4 app">
      <div>
        <span class="eyebrow">Für dein Rad</span>
        <h2 style="margin:6px 0 8px">Genauer geht es mit deinem Modell</h2>
        <p>Auf jeder Radseite rechnet die Radgarage mit den Teilen, die an deinem Rad verbaut sind. In der App zählt sie deine echten Kilometer mit und erinnert dich ans Prüfen.</p>
      </div>
      <div class="actions"><a class="pill" href="/raeder/">Rad suchen</a><a class="pill ghost" href="/#anmelden">Testplatz sichern</a></div>
    </aside>
    <nav class="t s2 voll rad-anleitungen" aria-label="Passende Anleitungen">
      <span class="eyebrow">Selbst machen</span>
      <h2 style="font-size:26px;margin:6px 0 10px">Passende Anleitungen</h2>
      <div class="chips">{_chips(['kettenverschleiss-messen', 'kette-wechseln', 'bremsbelaege-wechseln', 'reifen-wechseln', 'kassette-wechseln'])}</div>
    </nav>
  </article>
  <p class="hinweis">Richtwerte wie in der App der Radgarage. Wie wir zu den Werten kommen: <a href="/so-pruefen-wir/">So prüfen wir</a>. Stand: Oktober 2026.</p>
  </main>
<script src="/js/verschleiss.js?v=1" defer></script>
''')
    out.append(FUSS)
    return ''.join(out)


# ---------------------------------------------------------------- Zum Einbetten

EINBETTEN = [  # (Ordner, Titel, Seite mit Erklärung, Starthöhe in px, Skript, Satz für die Übersicht)
    ('verschleissrechner', 'Verschleißrechner', '/verschleissrechner/', 900, 'verschleiss',
     'Kilometer und Fahrprofil einstellen, der Rechner zeigt, wann Kette, Kassette, Beläge und Reifen fällig sind und was das im Jahr kostet.'),
    ('reifengroessen', 'Reifengrößen-Rechner', '/reifengroessen/', 560, 'reifen',
     'Größe vom Reifen abtippen, der Rechner zeigt die ETRTO-Größe, die Felge und passende Schläuche.'),
]


def einbett_seite(titel, ziel, inhalt, skript):
    """Schlanke Seite nur mit dem Rechner, für ein iframe auf fremden Websites. Links öffnen sich in einem neuen Tab."""
    return f'''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titel)} | Radgarage</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="{SEITE}{ziel}">
<base target="_blank">
{ICONS}
<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/bricolage-latin-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/seiten.css?v={CSS_VERSION}">
</head>
<body class="eingebettet">
<main class="bento anl">
{inhalt}</main>
<p class="einbett-quelle">{e(titel)} von <a href="{SEITE}{ziel}">Radgarage</a>. Alles rund um dein Rad.</p>
<script src="/js/{skript}.js?v=1" defer></script>
<script src="/js/einbetten.js?v=1" defer></script>
<script src="/js/zaehler.js?v=1" defer></script>
</body>
</html>
'''


def schnipsel(ordner, titel, ziel, hoehe):
    return (f'<iframe src="{SEITE}/einbetten/{ordner}/" title="{titel} von Radgarage" loading="lazy" '
            f'style="width:100%;max-width:760px;height:{hoehe}px;border:0"></iframe>\n'
            f'<p style="font-size:14px">{titel} von <a href="{SEITE}{ziel}">Radgarage</a></p>\n'
            '<script>addEventListener("message",function(e){if(e.origin==="https://radgarage.app"&&e.data&&e.data.radgarageHoehe)'
            'document.querySelectorAll(\'iframe[src^="https://radgarage.app/einbetten/"]\').forEach(function(f)'
            '{if(f.contentWindow===e.source)f.style.height=e.data.radgarageHoehe+"px"})})</script>')


def einbetten_uebersicht():
    pfad = '/einbetten/'
    nav, brot = krumen([('Radgarage', '/'), ('Rechner einbetten', pfad)])
    titel = 'Fahrrad-Rechner für deine Website: kostenlos einbetten | Radgarage'
    beschr = ('Verschleißrechner und Reifengrößen-Rechner der Radgarage kostenlos auf Blog, Vereins- oder Werkstattseite '
              'einbinden. Ohne Anmeldung, ohne Cookies, ohne Werbung.')
    out = [kopf(titel, beschr, pfad, [brot]), nav, '  <main>\n  <article class="bento anl">\n']
    out.append('''    <div class="t k3 kopf">
      <span class="eyebrow">Für Blogs, Vereine und Werkstätten</span>
      <h1>Unsere Rechner auf deiner Website</h1>
      <p class="lead">Den Verschleißrechner und den Reifengrößen-Rechner der Radgarage kannst du kostenlos auf deiner Website einbinden, im Blog, auf der Vereinsseite oder bei deiner Werkstatt. Code kopieren, einfügen, fertig.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Kosten</span><div class="wert">keine</div></div>
      <div class="t s2"><span class="eyebrow">Cookies und Werbung</span><div class="wert">keine</div></div>
    </div>
''')
    for i, (ordner, name, ziel, hoehe, _, satz) in enumerate(EINBETTEN):
        farbe = ['s1', 'k5'][i % 2]
        out.append(f'''    <section class="t {farbe} voll einbett-karte" aria-labelledby="eb-{ordner}">
      <span class="eyebrow">Rechner {i + 1}</span>
      <h2 id="eb-{ordner}" style="font-size:30px;margin:6px 0 4px">{e(name)}</h2>
      <p>{e(satz)} <a href="{ziel}">Zur Seite</a></p>
      <iframe class="einbett-vorschau" src="/einbetten/{ordner}/" title="Vorschau: {e(name)}" loading="lazy" style="height:{hoehe}px"></iframe>
      <label class="schnipsel-label" for="code-{ordner}">Code zum Einfügen</label>
      <textarea class="schnipsel" id="code-{ordner}" rows="5" readonly spellcheck="false">{e(schnipsel(ordner, name, ziel, hoehe))}</textarea>
      <div class="actions"><button class="pill" type="button" data-kopieren="code-{ordner}">Code kopieren</button></div>
    </section>
''')
    out.append('''    <section class="t k4 voll text-abschnitt" aria-labelledby="regeln-titel">
      <span class="eyebrow">Gut zu wissen</span>
      <h2 id="regeln-titel" style="font-size:30px;margin:6px 0 8px">So funktioniert es</h2>
      <ul class="punkte">
        <li><b>Kostenlos und ohne Anmeldung.</b> Du brauchst kein Konto und musst uns nicht fragen.</li>
        <li><b>Höhe passt sich an.</b> Das kleine Skript im Code stellt die Höhe automatisch ein. Lässt dein Baukasten keine Skripte zu, funktioniert der Rechner trotzdem, dann mit fester Höhe.</li>
        <li><b>Der Link darunter ist freiwillig.</b> Wir freuen uns, wenn er stehen bleibt, weil uns so mehr Radfahrer finden. Pflicht ist er nicht.</li>
        <li><b>Immer aktuell.</b> Der Rechner wird von radgarage.app geladen. Verbessern wir ihn, hast du die neue Version automatisch.</li>
      </ul>
    </section>
    <section class="t s2 voll text-abschnitt" aria-labelledby="ds-titel">
      <span class="eyebrow">Datenschutz</span>
      <h2 id="ds-titel" style="font-size:30px;margin:6px 0 8px">Was du in deine Datenschutzerklärung schreiben kannst</h2>
      <p>Der Rechner setzt keine Cookies, zeigt keine Werbung und rechnet nur im Browser. Beim Laden verbindet sich der Browser deiner Besucher aber mit radgarage.app (GitHub Pages), und wir zählen den Aufruf ohne Cookies und ohne Kennung als „eingebettet“. Ein Vorschlag für deine Datenschutzerklärung, bitte selbst prüfen:</p>
      <p class="zitat">„Auf dieser Seite binden wir einen Rechner von Radgarage (radgarage.app) ein. Beim Aufruf lädt Ihr Browser den Rechner von radgarage.app; dabei wird technisch Ihre IP-Adresse an den Hoster GitHub Pages (GitHub Inc., USA) übertragen. Die Radgarage zählt den Aufruf ohne Cookies und ohne Personenbezug. Die Einbindung erfolgt auf Grundlage unseres berechtigten Interesses an einem nützlichen Angebot (Art. 6 Abs. 1 lit. f DSGVO). Details: radgarage.app/datenschutz.html“</p>
    </section>
    <aside class="t k1 app">
      <div>
        <span class="eyebrow">Mehr für Vereine</span>
        <h2 style="margin:6px 0 8px">Ihr seid ein Verein oder eine Werkstatt?</h2>
        <p>Was die Radgarage sonst noch für euch tun kann und wie ihr uns erreicht.</p>
      </div>
      <div class="actions"><a class="pill" href="/fuer-vereine/">Für Vereine und Werkstätten</a><a class="pill ghost" href="mailto:kontakt@radgarage.app">kontakt@radgarage.app</a></div>
    </aside>
  </article>
  </main>
<script src="/js/einbetten.js?v=1" defer></script>
''')
    out.append(FUSS)
    return ''.join(out)


def bauen(alle, schreiben, lesen):
    schreiben('reifengroessen/index.html', reifen_seite(alle))
    schreiben('verschleissrechner/index.html', verschleiss_seite())
    schreiben('js/reifen.js', lesen('_quellen/reifen.js'))
    schreiben('js/verschleiss.js', lesen('_quellen/verschleiss.js'))
    schreiben('js/einbetten.js', lesen('_quellen/einbetten.js'))
    js_daten = reifen_js_daten(reifen_daten(alle), schlauch_liste())
    inhalt = {'verschleissrechner': verschleiss_rechner(), 'reifengroessen': reifen_rechner(js_daten)}
    for ordner, name, ziel, _, skript, _ in EINBETTEN:
        schreiben(f'einbetten/{ordner}/index.html', einbett_seite(name, ziel, inhalt[ordner], skript))
    schreiben('einbetten/index.html', einbetten_uebersicht())
    return [('/reifengroessen/', STAND_WISSEN), ('/verschleissrechner/', STAND_WISSEN), ('/einbetten/', STAND_WISSEN)]
