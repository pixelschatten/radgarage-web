"""Feedback-Seite /feedback/: Wünsche, fehlende Funktionen, Katalog-Lücken. Speichert über Supabase (Tabelle feedback)."""
from anleitungen import FUSS, kopf, krumen

KATEGORIEN = [
    ('verbesserung', 'Verbesserung', 'Was kann besser werden?'),
    ('funktion', 'Fehlende Funktion', 'Was fehlt dir ganz?'),
    ('katalog', 'Katalog-Lücke', 'Rad oder Teil fehlt'),
    ('sonstiges', 'Sonstiges', 'Lob, Kritik, Ideen'),
]

WER = [
    ('', 'Bitte wählen'),
    ('interessent', 'Ich interessiere mich für die App'),
    ('nutzer', 'Ich nutze die App'),
    ('tester', 'Ich teste die App'),
    ('sonstige', 'Etwas anderes'),
]


def seite():
    pfad = '/feedback/'
    nav, brot = krumen([('Radgarage', '/'), ('Feedback', pfad)])
    titel = 'Feedback: Wünsche und Ideen für die Radgarage'
    beschr = 'Was fehlt dir in der Radgarage? Schick uns Verbesserungen, fehlende Funktionen und Lücken im Fahrrad-Katalog, ganz ohne Anmeldung.'
    wahl = ''.join(
        f'<label><input type="radio" name="kategorie" value="{k}" required><span>{t}<small>{u}</small></span></label>'
        for k, t, u in KATEGORIEN)
    wer = ''.join(f'<option value="{k}">{t}</option>' for k, t in WER)
    return kopf(titel, beschr, pfad, [brot]) + nav + f'''  <main>
  <style>
    .fb .intro {{ grid-column: span 5; display: flex; flex-direction: column; gap: 18px; padding: 34px 32px; }}
    .fb .formular {{ grid-column: span 7; padding: 30px 32px; }}
    .fb .vs-form {{ margin-top: 0; }}
    .fb .vs-form .wahl {{ grid-template-columns: 1fr 1fr; }}
    .fb .vs-form input[type=email] {{ width: 100%; font: inherit; font-size: 17px; font-weight: 500; padding: 13px 16px; border-radius: 18px; border: 2px solid var(--line); background: var(--bg); color: var(--text); }}
    .fb .vs-form textarea {{ min-height: 150px; }}
    .fb .zaehler {{ justify-self: end; font-size: 13px; color: var(--muted); margin-top: -8px; }}
    .fb h1 {{ font-size: min(var(--h1), 60px); margin: 8px 0 0; }}
    @media (max-width: 900px) {{ .fb .intro, .fb .formular {{ grid-column: span 12; }} .fb .intro {{ padding: 28px 24px; }} .fb .formular {{ padding: 26px 22px; }} }}
    @media (max-width: 600px) {{ .fb .vs-form .wahl {{ grid-template-columns: 1fr; }} }}
  </style>
  <div class="bento fb">
    <div class="t k2 intro">
      <div>
        <span class="eyebrow">Feedback</span>
        <h1>Was fehlt dir noch?</h1>
      </div>
      <p class="lead">Die Radgarage entsteht gerade, und du kannst mitbestimmen, wohin sie fährt. Ob du die App schon nutzt oder nur neugierig bist: Sag uns, was besser werden soll, welche Funktion dir fehlt oder welches Rad im Katalog noch nicht drin ist.</p>
      <ol class="steps">
        <li><span><strong>Du schreibst</strong>, ganz ohne Anmeldung.</span></li>
        <li><span><strong>Wir lesen alles</strong> und sammeln, was oft gewünscht wird.</span></li>
        <li><span><strong>Mit E-Mail-Adresse</strong> können wir dir antworten oder Bescheid geben, wenn es umgesetzt ist.</span></li>
      </ol>
      <p class="fine">Lieber per Mail? <a href="mailto:feedback@radgarage.app">feedback@radgarage.app</a></p>
    </div>
    <section class="t s1 formular" aria-labelledby="fb-titel">
      <h2 id="fb-titel" style="font-size:var(--h2-t);margin:0 0 14px">Dein Feedback</h2>
      <form class="vs-form fb-form" novalidate>
        <fieldset><legend>Worum geht es?</legend><div class="wahl">{wahl}</div></fieldset>
        <label class="feld"><span class="fb-frage" style="font-weight:800;color:var(--ink)">Was möchtest du uns sagen?</span>
          <textarea name="text" rows="6" maxlength="3000" placeholder="Beschreib es so, wie du es einem Freund erzählen würdest."></textarea></label>
        <span class="zaehler" aria-hidden="true">0 / 3000</span>
        <label class="feld">Wer bist du? <span>(freiwillig)</span>
          <select name="wer">{wer}</select></label>
        <label class="feld">E-Mail-Adresse <span>(freiwillig, nur damit wir dir antworten können)</span>
          <input type="email" name="email" maxlength="200" autocomplete="email" inputmode="email"></label>
        <label class="falle" aria-hidden="true">Bitte leer lassen <input type="text" name="webseite" tabindex="-1" autocomplete="off"></label>
        <div class="actions"><button class="pill" type="submit">Feedback senden</button></div>
        <p class="msg" role="status" hidden></p>
        <p class="klein">Wir speichern dein Feedback und, falls angegeben, deine E-Mail-Adresse. Sie wird nicht veröffentlicht und nicht für Werbung genutzt. Mehr in der <a href="/datenschutz.html#feedback">Datenschutzerklärung</a>.</p>
      </form>
    </section>
  </div>
  <p class="hinweis">Ein Fehler bei einem bestimmten Rad? Auf jeder <a href="/raeder/">Radseite</a> gibt es unten „Stimmt etwas nicht?“. Dort landet dein Hinweis direkt beim richtigen Rad.</p>
  </main>
  <script src="/feedback/feedback.js" defer></script>
''' + FUSS
