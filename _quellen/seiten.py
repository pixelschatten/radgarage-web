"""Feste Seiten über Radgarage selbst: Über uns und wie der Katalog entsteht.

Gebaut wird über python3 _quellen/bauen.py. Zahlen kommen aus dem Katalog, der Rest steht hier.
"""
from anleitungen import FUSS, SEITE, e, kopf, krumen
from raeder import RICHTWERT_KM, tsd

GRUENDER = 'Marino Scholz'
ORGANISATION = {'@type': 'Organization', '@id': f'{SEITE}/#org', 'name': 'Radgarage', 'url': SEITE + '/'}


def _abschnitt(farbe, eyebrow, titel, inhalt, kennung):
    return f'''    <section class="t {farbe} voll text-abschnitt" aria-labelledby="{kennung}">
      <span class="eyebrow">{e(eyebrow)}</span>
      <h2 id="{kennung}" style="font-size:30px;margin:6px 0 8px">{e(titel)}</h2>
      {inhalt}
    </section>
'''


def ueber_uns(anzahl_raeder, anzahl_teile, anzahl_marken):
    pfad = '/ueber-uns/'
    nav, brot = krumen([('Radgarage', '/'), ('Über uns', pfad)])
    schema = {'@context': 'https://schema.org', '@type': 'AboutPage', 'url': SEITE + pfad, 'name': 'Über Radgarage',
              'inLanguage': 'de',
              'about': dict(ORGANISATION, founder={'@type': 'Person', 'name': GRUENDER},
                            email='kontakt@radgarage.app')}
    titel = 'Über Radgarage: wer hinter der App steht'
    beschr = ('Radgarage ist eine App und ein offener Teilekatalog für Radfahrer. Wer dahintersteht, warum es sie gibt '
              'und wie sie sich finanziert.')
    out = [kopf(titel + ' | Radgarage', beschr, pfad, [schema, brot]), nav, '  <main>\n  <article class="bento anl">\n']
    out.append(f'''    <div class="t k5 kopf">
      <span class="eyebrow">Über uns</span>
      <h1>Über Radgarage</h1>
      <p class="lead">Radgarage ist eine App für iPhone und Android und ein offener Teilekatalog für alle, die ihr Rad selbst pflegen oder einfach wissen wollen, was daran verbaut ist. Dahinter steht {GRUENDER} aus Mindelheim.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Räder im Katalog</span><div class="wert">{tsd(anzahl_raeder)}</div></div>
      <div class="t s2"><span class="eyebrow">Teile</span><div class="wert">{tsd(anzahl_teile)}</div></div>
      <div class="t s2"><span class="eyebrow">Marken</span><div class="wert">{anzahl_marken}</div></div>
    </div>
''')
    out.append(_abschnitt('s1', 'Warum', 'Warum es Radgarage gibt', '''<p>Welche Kette passt an mein Rad? Sind die Bremsbeläge schon fällig? Was kostet mich das Rad im Jahr? Die Antworten stehen verstreut in Datenblättern, Foren und Shops, und jedes Rad ist ein bisschen anders ausgestattet. Radgarage bringt sie an einen Ort: welche Teile an deinem Rad verbaut sind, was als Ersatz passt, wann ein Wechsel fällig ist und ob du ihn selbst schaffst.</p>
      <p>Die Website zeigt den Katalog für jeden, ohne Anmeldung. In der App kommen deine eigenen Kilometer, dein Wartungsheft und die Erinnerungen dazu.</p>''', 'warum-titel'))
    out.append(_abschnitt('k4', 'Wer', 'Wer dahintersteht', f'''<p>Radgarage ist ein kleines Projekt von {GRUENDER}. Er ist Webdesigner und fährt selbst Rennrad und Gravelbike. Die ersten Räder im Katalog waren seine eigenen, danach kamen Rad für Rad die Modelle der großen Marken dazu.</p>
      <p>Mitmachen kann jeder: Auf jeder Radseite gibt es das Formular „Stimmt etwas nicht?“, in der App den Knopf „Verbesserung vorschlagen“. Jeder Hinweis wird geprüft, bevor er im Katalog landet.</p>''', 'wer-titel'))
    out.append(_abschnitt('s2', 'Geld', 'Wie sich Radgarage finanziert', '''<p>Die App ist im Alltag kostenlos. Wer mehr will, kauft einmalig Premium, ohne Abo. Hersteller und Shops bezahlen nicht dafür, im Katalog zu stehen oder als Ersatz genannt zu werden.</p>
      <p>Die Shop-Links auf dieser Website sind einfache Suchlinks. Sollten wir später an einzelnen Links eine kleine Provision verdienen, kennzeichnen wir das direkt am Link.</p>''', 'geld-titel'))
    out.append(f'''    <aside class="t k3 app">
      <div>
        <span class="eyebrow">Mehr erfahren</span>
        <h2 style="margin:6px 0 8px">So entsteht der Katalog</h2>
        <p>Woher die Daten kommen, wie wir sie prüfen und was Richtpreise und Verschleiß-Richtwerte bedeuten.</p>
      </div>
      <div class="actions"><a class="pill" href="/so-pruefen-wir/">Zur Erklärung</a><a class="pill ghost" href="mailto:kontakt@radgarage.app">kontakt@radgarage.app</a></div>
    </aside>
  </article>
  <p class="hinweis">Anbieter dieser Website: {GRUENDER}, Anschrift im <a href="/impressum.html">Impressum</a>.</p>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)


def methodik(anzahl_raeder, anzahl_teile, stand):
    pfad = '/so-pruefen-wir/'
    nav, brot = krumen([('Radgarage', '/'), ('So prüfen wir', pfad)])
    schema = {'@context': 'https://schema.org', '@type': 'WebPage', 'url': SEITE + pfad, 'inLanguage': 'de',
              'name': 'So entsteht der Katalog der Radgarage', 'dateModified': stand, 'publisher': ORGANISATION}
    titel = 'So entsteht der Katalog: Quellen und Prüfung | Radgarage'
    beschr = ('Woher die Daten im Teilekatalog der Radgarage kommen, wie wir sie prüfen und was Richtpreise, '
              '„Passt auch“ und Verschleiß-Richtwerte bedeuten.')
    out = [kopf(titel, beschr, pfad, [schema, brot]), nav, '  <main>\n  <article class="bento anl">\n']
    out.append(f'''    <div class="t k3 kopf">
      <span class="eyebrow">So prüfen wir</span>
      <h1>So entsteht der Katalog</h1>
      <p class="lead">{tsd(anzahl_raeder)} Räder und {tsd(anzahl_teile)} Teile, zusammengetragen aus einzelnen Fakten und vor der Veröffentlichung geprüft. Hier steht, woher die Angaben kommen und wie sicher sie sind.</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Stand</span><div class="wert">{e(stand[8:10])}.{e(stand[5:7])}.{e(stand[:4])}</div></div>
      <div class="t s2"><span class="eyebrow">Aktualisiert</span><div class="wert">täglich</div></div>
    </div>
''')
    richt = ', '.join(f'{n} etwa {tsd(km)} km' for n, km in
                      [('Kette', RICHTWERT_KM['Kette']), ('Bremsbeläge', RICHTWERT_KM['Bremsbelag']),
                       ('Reifen', RICHTWERT_KM['Reifen']), ('Kassette', RICHTWERT_KM['Kassette'])])
    out.append(_abschnitt('s1', 'Quellen', 'Woher die Angaben kommen', '''<ul class="punkte">
        <li><b>Hersteller zuerst.</b> Grundlage sind die Ausstattungslisten und Datenblätter der Hersteller für das jeweilige Modelljahr.</li>
        <li><b>Andere Quellen nur zum Ergänzen.</b> Fehlt beim Hersteller ein Detail, ziehen wir einzelne Angaben aus Händlerseiten oder Testberichten heran, nie ganze Listen.</li>
        <li><b>Nur Fakten.</b> Wir übernehmen Modell, Jahr, Teile und Größen, aber keine fremden Texte, Bilder oder Preise.</li>
        <li><b>Erschlossene Teile sind markiert.</b> Manche Teile stehen nirgends ausdrücklich, ergeben sich aber aus den übrigen, etwa die Beläge aus der Bremse. Sie tragen ein Sternchen und den Hinweis „bitte am Rad prüfen“.</li>
      </ul>''', 'quellen-titel'))
    out.append(_abschnitt('k4', 'Prüfung', 'Wie wir prüfen', '''<ul class="punkte">
        <li>Jedes Rad wird erfasst und erst nach einer zweiten Durchsicht freigegeben. Nur freigegebene Räder erscheinen hier und in der App.</li>
        <li>Hinweise von Radfahrern über das Formular „Stimmt etwas nicht?“ oder aus der App sehen wir uns einzeln an. Was stimmt, fließt in den Katalog ein.</li>
        <li>Hersteller ändern Ausstattungen manchmal mitten im Modelljahr. Prüf vor dem Kauf eines Teils kurz, was an deinem Rad tatsächlich verbaut ist.</li>
      </ul>''', 'pruefung-titel'))
    out.append(_abschnitt('s2', 'Begriffe', 'Was die Angaben bedeuten', f'''<ul class="punkte">
        <li><b>Richtpreis:</b> ein gerundeter Anhaltswert für das Teil, kein Angebot. Manche Richtpreise sind geschätzt. Der tatsächliche Preis hängt vom Shop und vom Tag ab.</li>
        <li><b>Passt auch:</b> Teile mit gleichen Einbaumaßen und gleicher Norm, zum Beispiel gleiche Gangzahl und gleiche Aufnahme. Herstellerfreigaben gehen immer vor.</li>
        <li><b>Verschleiß-Richtwerte:</b> {richt}. Ab etwa 80 % davon lohnt sich ein Blick aufs Teil, gewechselt wird nach Messung. Fahrweise, Wetter und Pflege verschieben die Werte stark.</li>
        <li><b>Unterhalt je 1.000 km:</b> Teilekosten für Kette, Kassette, Bremsbeläge und Reifen aus Richtpreis und Richtwert, ohne Werkstatt.</li>
      </ul>''', 'begriffe-titel'))
    out.append('''    <aside class="t k5 app">
      <div>
        <span class="eyebrow">Mitmachen</span>
        <h2 style="margin:6px 0 8px">Fehler gefunden?</h2>
        <p>Auf jeder Radseite kannst du ohne Anmeldung einen Hinweis schicken. Fehlt dein Rad ganz, sag es uns über die Feedback-Seite.</p>
      </div>
      <div class="actions"><a class="pill" href="/feedback/">Feedback geben</a><a class="pill ghost" href="/ueber-uns/">Über uns</a></div>
    </aside>
  </article>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)
