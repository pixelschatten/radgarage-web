"""Baut den Bereich /anleitungen/ (eine Seite pro Wartungsarbeit), dazu sitemap.xml.

Gebaut wird über python3 _quellen/bauen.py (Anleitungen, Modellseiten, CSS, Sitemap).
Inhalte stammen aus den App-Anleitungen (src/data/anleitungen.ts im App-Repo), hier ausführlicher.
Ordner mit _ am Anfang veröffentlicht GitHub Pages nicht.

Video: Feld "video" mit der YouTube-ID füllen (der Teil nach watch?v=). Leer heißt: Link zur YouTube-Suche.
"""
import html
import json
import os

SEITE = 'https://radgarage.app'

# Store-Start: Sobald die App im App Store und bei Google Play ist, die App-Store-Nummer eintragen und STORE_LIVE auf True
# setzen, dann python3 _quellen/bauen.py. Danach zeigt jede Seite oben „App laden“ statt „Testzugang sichern“, iPhones
# bekommen den Smart App Banner von Safari, und die Startseite meldet die App als SoftwareApplication (ohne Bewertungen,
# solange es keine echten gibt). Checkliste: Projektdateien seo/store-start-checkliste.md.
APP_STORE_ID = ''              # Zahl aus der App-Store-Adresse apps.apple.com/de/app/radgarage/id<Zahl>
PLAY_PAKET = 'app.radgarage'
STORE_LIVE = False
APP_STORE_URL = f'https://apps.apple.com/de/app/id{APP_STORE_ID}' if APP_STORE_ID else ''
PLAY_URL = f'https://play.google.com/store/apps/details?id={PLAY_PAKET}'
STAND = '2026-10-28'
WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ANLEITUNGEN = [
    {
        'slug': 'kette-wechseln', 'farbe': 'k1', 'teil': 'Kette',
        'h1': 'Fahrradkette wechseln',
        'titel': 'Fahrradkette wechseln: Anleitung Schritt für Schritt',
        'beschreibung': 'Fahrradkette selbst wechseln: Verschleiß messen, Länge bestimmen, Kettenschloss schließen. Mit Werkzeugliste, Dauer und Werkstattpreis.',
        'lead': 'Eine neue Kette ist der günstigste Weg, Kassette und Kettenblätter lange zu erhalten. Mit Kettenlehre, Nieter und etwas Ruhe schaffst du den Wechsel in rund 20 Minuten.',
        'level': 'Mittel', 'zeit': 'ca. 20 Min.', 'minuten': 20, 'werkstatt': 'ca. 15–25 €',
        'wann': [
            'Die Kettenlehre zeigt 0,5 % Längung (bei 11- und 12-fach) bzw. 0,75 % (bei 10-fach und weniger).',
            'Die Schaltung springt oder rattert, obwohl sie richtig eingestellt ist.',
            'Als Richtwert nach etwa 6.000 km. Bei Regen, Matsch und E-Bikes oft früher.',
        ],
        'werkzeug': [('Kettenverschleißlehre', 10), ('Kettennieter', 20), ('Kettenschloss-Zange', 15)],
        'schritte': [
            ('Verschleiß messen', 'Lege die Kettenlehre auf die Kette. Fällt sie bei 0,5 % ganz ein, ist die Kette gelängt und sollte raus. Prüfe auch die Kassette: Springt eine neue Kette darauf, ist sie ebenfalls verschlissen.'),
            ('Alte Kette öffnen', 'Schalte vorne aufs kleine und hinten aufs kleinste Ritzel, das entspannt die Kette. Öffne das Kettenschloss mit der Zange oder drücke mit dem Kettennieter einen Bolzen heraus.'),
            ('Neue Kette ablängen', 'Lege die alte und die neue Kette nebeneinander und kürze die neue auf dieselbe Gliederzahl. War die alte schon falsch, gilt: großes Kettenblatt und größtes Ritzel ohne Schaltwerk umlegen, plus zwei Glieder.'),
            ('Kette schließen und prüfen', 'Führe die Kette durch Umwerfer und Schaltwerk, setze das Kettenschloss ein und ziehe es mit einem kräftigen Tritt aufs Pedal (Bremse gezogen) oder der Zange zu. Danach alle Gänge durchschalten.'),
        ],
        'tipp': 'Wer die Kette rechtzeitig wechselt, schont Kassette und Kettenblatt. Zwei Ketten im Wechsel zu fahren, lohnt sich meist nicht, rechtzeitiges Messen schon.',
        'fragen': [
            ('Kann ich ein Kettenschloss wiederverwenden?', 'Das hängt vom Hersteller ab. Viele Schlösser für 11- und 12-fach sind nur für eine Montage gedacht. Im Zweifel ein neues nehmen, es kostet nur wenige Euro.'),
            ('Welche Kette passt an mein Rad?', 'Entscheidend sind die Zahl der Gänge hinten und das System (z. B. Shimano, SRAM, Campagnolo). Die Radgarage kennt die verbaute Kette deines Modells und zeigt dir passende Alternativen.'),
            ('Muss die Kassette gleich mit getauscht werden?', 'Nicht immer. Wird die Kette früh genug gewechselt, hält eine Kassette zwei bis drei Ketten. Springt die neue Kette auf einzelnen Ritzeln, ist die Kassette fällig.'),
        ],
        'app': 'Die Radgarage zählt die Kilometer deiner Kette mit und erinnert dich, wenn es Zeit zum Messen ist. Welche Kette an dein Modell passt, weiß sie auch.',
        'suche': 'fahrradkette wechseln',
        'video': '-hbAvh92c54',
        'verwandt': ['kassette-wechseln', 'innenlager-wechseln', 'reifen-wechseln'],
    },
    {
        'slug': 'bremsbelaege-wechseln', 'farbe': 'k2', 'teil': 'Bremsbeläge',
        'h1': 'Bremsbeläge wechseln (Scheibenbremse)',
        'titel': 'Bremsbeläge am Fahrrad wechseln: Scheibenbremse',
        'beschreibung': 'Bremsbeläge der Scheibenbremse selbst wechseln: Beläge ausbauen, Kolben zurückdrücken, neue Beläge einbremsen. Werkzeug, Dauer, Kosten.',
        'lead': 'Neue Beläge sind bei der Scheibenbremse in einer Viertelstunde drin. Wichtig sind saubere Hände, fettfreie Teile und das Einbremsen danach.',
        'level': 'Leicht', 'zeit': 'ca. 15 Min.', 'minuten': 15, 'werkstatt': 'ca. 10–20 €',
        'wann': [
            'Der Belag ist samt Trägerplatte dünner als etwa 2,5 mm, oder der Belag selbst unter 0,5 mm.',
            'Die Bremse quietscht stark, schleift metallisch oder zieht deutlich schwächer.',
            'Als Richtwert nach etwa 3.000 km. Bei Bergtouren und im Winter deutlich früher.',
        ],
        'werkzeug': [('Innensechskant-Set', 15), ('Kolbenrücksteller', 10), ('Bremsenreiniger', 8)],
        'schritte': [
            ('Laufrad ausbauen', 'Steckachse oder Schnellspanner lösen und das Laufrad herausnehmen. Ab jetzt den Bremshebel nicht mehr ziehen, sonst kommen die Kolben heraus.'),
            ('Alte Beläge herausziehen', 'Sicherungssplint oder Halteschraube lösen und die Beläge mitsamt Feder nach oben oder unten aus dem Bremssattel ziehen. Merke dir, wie die Feder sitzt.'),
            ('Kolben zurückdrücken', 'Drücke die Kolben mit einem Kolbenrücksteller oder einem Kunststoffhebel gerade und vorsichtig zurück. Kein Schraubendreher, der beschädigt die Kolben.'),
            ('Neue Beläge einsetzen und einbremsen', 'Neue Beläge mit Feder einsetzen, sichern, Laufrad einbauen und den Hebel ein paar Mal ziehen. Dann etwa 20 Mal aus mittlerem Tempo kräftig bis fast zum Stillstand bremsen.'),
        ],
        'tipp': 'Bremsen sind sicherheitsrelevant. Wenn du unsicher bist oder die Bremse nach dem Wechsel nicht sauber greift, lass sie in der Werkstatt prüfen.',
        'fragen': [
            ('Organische oder Sinter-Beläge?', 'Organische Beläge bremsen leiser und greifen schneller, verschleißen aber früher. Sinter-Beläge halten länger und sind bei Nässe und Hitze robuster. Wichtig ist, dass die Scheibe für den Belag freigegeben ist.'),
            ('Muss ich die Scheibe gleich mit tauschen?', 'Nur wenn sie unter der Mindeststärke ist (steht meist auf der Scheibe) oder verzogen ist. Siehe Anleitung zur Bremsscheibe.'),
            ('Warum quietscht die Bremse nach dem Wechsel?', 'Meist sind Fett oder Öl auf Belag oder Scheibe gekommen, oder die Beläge sind nicht eingebremst. Scheibe mit Bremsenreiniger säubern und erneut einbremsen. Verölte Beläge lassen sich nicht retten.'),
        ],
        'app': 'Die Radgarage kennt die Bremse an deinem Rad und damit die passenden Beläge. Sie behält im Blick, wie viele Kilometer die Beläge schon gefahren sind.',
        'suche': 'bremsbeläge wechseln scheibenbremse fahrrad',
        'video': 'bL6NM-lA7zM',
        'verwandt': ['bremsscheibe-wechseln', 'reifen-wechseln', 'kette-wechseln'],
    },
    {
        'slug': 'kassette-wechseln', 'farbe': 'k3', 'teil': 'Kassette',
        'h1': 'Kassette wechseln',
        'titel': 'Fahrrad-Kassette wechseln: Anleitung mit Werkzeug',
        'beschreibung': 'Kassette am Hinterrad selbst wechseln: mit Kettenpeitsche und Abzieher lösen, neue Kassette montieren, richtig festziehen. Dauer und Kosten.',
        'lead': 'Mit Kettenpeitsche und Kassettenabzieher ist die Kassette in 20 Minuten getauscht. Meist gehört eine neue Kette dazu.',
        'level': 'Mittel', 'zeit': 'ca. 20 Min.', 'minuten': 20, 'werkstatt': 'ca. 10–20 €',
        'wann': [
            'Eine neue Kette springt oder rutscht auf einzelnen Ritzeln.',
            'Die Zähne der meistgefahrenen Ritzel sind sichtbar spitz oder haifischflossenförmig.',
            'Als Richtwert nach etwa 15.000 km, also meist mit jeder zweiten oder dritten Kette.',
        ],
        'werkzeug': [('Kassettenabzieher', 10), ('Kettenpeitsche', 15), ('Drehmomentschlüssel', 40)],
        'schritte': [
            ('Hinterrad ausbauen', 'Aufs kleinste Ritzel schalten, Achse lösen und das Hinterrad herausnehmen.'),
            ('Verschlussring lösen', 'Kassettenabzieher in den Verschlussring stecken. Mit der Kettenpeitsche die Kassette gegen die Drehrichtung halten und den Ring gegen den Uhrzeigersinn lösen.'),
            ('Neue Kassette aufsetzen', 'Freilaufkörper säubern. Die Ritzel haben eine breite Nut, sie passen nur in einer Stellung. Je nach System gehört ein Distanzring dahinter.'),
            ('Festziehen und prüfen', 'Verschlussring mit dem Drehmoment des Herstellers anziehen (bei Shimano meist 30–50 Nm), Hinterrad einbauen und alle Gänge durchschalten.'),
        ],
        'tipp': 'Eine neue Kassette braucht fast immer auch eine neue Kette. Umgekehrt hält eine Kassette länger, wenn du die Kette rechtzeitig wechselst.',
        'fragen': [
            ('Welche Kassette passt?', 'Es kommt auf die Gangzahl, die Bandbreite (z. B. 11–34) und den Freilauf an (Shimano HG, Micro Spline, SRAM XD oder XDR). Die Radgarage kennt die verbaute Kassette deines Modells.'),
            ('Brauche ich wirklich einen Drehmomentschlüssel?', 'Zu lockere Kassetten klappern, zu feste beschädigen den Freilauf. Ein Drehmomentschlüssel lohnt sich, weil du ihn auch für Vorbau und Sattelstütze brauchst.'),
        ],
        'app': 'Die Radgarage merkt sich, wie viele Ketten deine Kassette schon gesehen hat, und zeigt dir die passende Kassette mit Preisen aus mehreren Shops.',
        'suche': 'kassette wechseln fahrrad',
        'video': 'TNYoZ7Ev4Qw',
        'verwandt': ['kette-wechseln', 'reifen-wechseln', 'innenlager-wechseln'],
    },
    {
        'slug': 'reifen-wechseln', 'farbe': 'k4', 'teil': 'Reifen',
        'h1': 'Fahrradreifen wechseln',
        'titel': 'Fahrradreifen wechseln: Anleitung in 4 Schritten',
        'beschreibung': 'Fahrradreifen selbst wechseln: Reifen abziehen, Laufrichtung beachten, neuen Reifen aufziehen und richtig aufpumpen. Werkzeug, Dauer, Kosten.',
        'lead': 'Ein Reifenwechsel ist die einfachste Wartung am Rad. Zwei Reifenheber und eine Standpumpe reichen, wenn du ein paar Kniffe kennst.',
        'level': 'Leicht', 'zeit': 'ca. 15 Min.', 'minuten': 15, 'werkstatt': 'ca. 10–20 €',
        'wann': [
            'Die Verschleißanzeige (kleine Vertiefungen im Profil) ist verschwunden oder das Profil ist abgefahren.',
            'Risse in der Flanke, Beulen oder sichtbares Gewebe.',
            'Als Richtwert nach etwa 6.000 km. Hinten verschleißt der Reifen schneller als vorne.',
        ],
        'werkzeug': [('Reifenheber', 5), ('Standpumpe mit Manometer', 30)],
        'schritte': [
            ('Luft ablassen', 'Laufrad ausbauen und die Luft komplett ablassen. Bei Sclaverand-Ventilen (Presta) erst die kleine Mutter aufdrehen.'),
            ('Reifen abziehen', 'Reifenwulst ringsum in die Felgenmitte drücken, das schafft Platz. Dann gegenüber dem Ventil mit zwei Reifenhebern eine Seite über die Felge hebeln und abziehen.'),
            ('Neuen Reifen aufziehen', 'Auf die Laufrichtung achten (Pfeil auf der Flanke). Eine Seite aufziehen, Schlauch leicht aufgepumpt einlegen, dann die zweite Seite am Ventil beginnend mit den Daumen aufdrücken.'),
            ('Aufpumpen und prüfen', 'Auf den Druck pumpen, der auf der Reifenflanke steht, und prüfen, ob die Linie am Reifen ringsum gleichmäßig über der Felge sitzt.'),
        ],
        'tipp': 'Am besten beide Reifen gleichzeitig prüfen. Wer nur einen neuen kauft, setzt ihn hinten ein und den besseren alten nach vorne.',
        'fragen': [
            ('Welche Reifengröße habe ich?', 'Die Größe steht auf der Flanke, z. B. 28-622 (ETRTO) oder 700x28C. Die erste Zahl ist die Breite in Millimetern, die zweite der Felgendurchmesser.'),
            ('Tubeless oder mit Schlauch?', 'Tubeless-Reifen fahren mit Dichtmilch statt Schlauch, sind pannensicherer und mit weniger Druck fahrbar. Felge und Reifen müssen dafür freigegeben sein.'),
        ],
        'app': 'Die Radgarage kennt die Reifengröße deines Modells und zeigt passende Reifen mit Preisen aus mehreren Shops. Die Kilometer zählt sie automatisch mit.',
        'suche': 'fahrradreifen wechseln',
        'video': 'u-Ew__6Jr-g',
        'verwandt': ['schlauch-wechseln', 'bremsbelaege-wechseln', 'kette-wechseln'],
    },
    {
        'slug': 'schlauch-wechseln', 'farbe': 'k5', 'teil': 'Schlauch',
        'h1': 'Fahrradschlauch wechseln',
        'titel': 'Fahrradschlauch wechseln: Platten in 15 Minuten beheben',
        'beschreibung': 'Platten am Fahrrad? So wechselst du den Schlauch: Laufrad ausbauen, Fremdkörper finden, neuen Schlauch einlegen. Mit Tipps zur Ventillänge.',
        'lead': 'Ein Platten passiert jedem. Mit Ersatzschlauch, zwei Reifenhebern und einer Pumpe bist du in einer Viertelstunde wieder unterwegs, auch unterwegs am Straßenrand.',
        'level': 'Leicht', 'zeit': 'ca. 15 Min.', 'minuten': 15, 'werkstatt': 'ca. 10–15 €',
        'wann': [
            'Der Reifen verliert Luft, schnell oder über Nacht.',
            'Das Ventil ist undicht oder abgerissen.',
            'Bei alten, porösen Schläuchen lohnt sich der Tausch beim Reifenwechsel gleich mit.',
        ],
        'werkzeug': [('Reifenheber', 5), ('Standpumpe mit Manometer', 30)],
        'schritte': [
            ('Laufrad ausbauen und Luft ablassen', 'Bremse ggf. öffnen (Felgenbremse), Achse lösen, Laufrad herausnehmen und die restliche Luft ablassen.'),
            ('Reifen abziehen und Schlauch herausnehmen', 'Eine Reifenseite mit Reifenhebern über die Felge hebeln, den Schlauch herausziehen, zuletzt das Ventil.'),
            ('Ursache finden', 'Taste den Reifen innen vorsichtig nach Dornen, Glas oder Drahtstücken ab. Steckt noch etwas drin, ist der nächste Platten sonst sicher.'),
            ('Neuen Schlauch einlegen', 'Schlauch leicht aufpumpen, damit er rund ist, Ventil durch das Felgenloch stecken, Schlauch einlegen, Reifen aufdrücken und auf Nenndruck pumpen.'),
        ],
        'tipp': 'Bei hohen Felgen auf die Ventillänge achten, sonst kommt die Pumpe nicht ans Ventil. Ventil (Presta, Schrader, Dunlop) und Größe stehen auf dem alten Schlauch.',
        'fragen': [
            ('Flicken oder neuer Schlauch?', 'Unterwegs ist ein Ersatzschlauch schneller. Zu Hause lässt sich der alte Schlauch flicken und wird zum nächsten Ersatzschlauch.'),
            ('Welcher Schlauch passt?', 'Die Größe des Reifens (z. B. 28-622) muss im Bereich des Schlauchs liegen, und das Ventil muss zur Felge passen.'),
        ],
        'app': 'Die Radgarage kennt Reifengröße und Felge deines Modells. So findest du den passenden Schlauch mit der richtigen Ventillänge ohne Rätselraten.',
        'suche': 'fahrradschlauch wechseln',
        'video': 'tOfyby4tGzQ',
        'verwandt': ['reifen-wechseln', 'bremsbelaege-wechseln', 'kette-wechseln'],
    },
    {
        'slug': 'bremsscheibe-wechseln', 'farbe': 'k1', 'teil': 'Bremsscheibe',
        'h1': 'Bremsscheibe wechseln',
        'titel': 'Bremsscheibe am Fahrrad wechseln: Center-Lock und 6-Loch',
        'beschreibung': 'Bremsscheibe selbst tauschen: Mindeststärke prüfen, Center-Lock oder 6-Loch lösen, neue Scheibe richtig festziehen und einbremsen.',
        'lead': 'Ob Center-Lock oder sechs Schrauben: Eine Bremsscheibe ist in 20 Minuten getauscht. Entscheidend sind das richtige Drehmoment und fettfreie Finger.',
        'level': 'Mittel', 'zeit': 'ca. 20 Min.', 'minuten': 20, 'werkstatt': 'ca. 15–25 €',
        'wann': [
            'Die Scheibe ist dünner als die Mindeststärke, die auf ihr steht (oft 1,5 mm).',
            'Die Scheibe ist verzogen, schleift trotz Ausrichten oder hat tiefe Riefen.',
            'Spätestens bei jedem zweiten Belagwechsel nachmessen.',
        ],
        'werkzeug': [('Center-Lock-Werkzeug', 12), ('Drehmomentschlüssel', 40), ('Bremsenreiniger', 8)],
        'schritte': [
            ('Laufrad ausbauen', 'Laufrad herausnehmen und auf eine saubere Unterlage legen. Bremshebel nicht ziehen.'),
            ('Alte Scheibe abnehmen', 'Bei Center-Lock den Verschlussring mit dem Werkzeug lösen, bei 6-Loch die sechs Torx-Schrauben über Kreuz lösen.'),
            ('Neue Scheibe aufsetzen', 'Laufrichtung beachten (Pfeil auf der Scheibe). Schrauben über Kreuz bzw. den Ring mit dem Drehmoment des Herstellers festziehen.'),
            ('Reinigen und einbremsen', 'Scheibe nicht mit den Fingern berühren, im Zweifel mit Bremsenreiniger säubern. Laufrad einbauen und die Bremse wie bei neuen Belägen einbremsen.'),
        ],
        'tipp': 'Unter 1,5 mm Dicke sollte die Scheibe meist getauscht werden. Die Mindeststärke steht auf der Scheibe. Neue Scheibe heißt oft auch: neue Beläge.',
        'fragen': [
            ('Center-Lock oder 6-Loch: was habe ich?', 'Siehst du sechs Schrauben an der Nabe, ist es 6-Loch. Ein gezahnter Ring in der Mitte ist Center-Lock. Mit Adaptern passt eine 6-Loch-Scheibe auch auf Center-Lock-Naben.'),
            ('Darf ich eine größere Scheibe fahren?', 'Nur, wenn Rahmen und Gabel dafür freigegeben sind und der passende Adapter verbaut wird. Die Angabe steht in der Anleitung des Herstellers.'),
        ],
        'app': 'Die Radgarage kennt Durchmesser und Aufnahme der Scheiben an deinem Rad und zeigt dir passende Ersatzscheiben.',
        'suche': 'bremsscheibe wechseln fahrrad',
        'video': 'GnADpYq96jk',
        'verwandt': ['bremsbelaege-wechseln', 'reifen-wechseln', 'kassette-wechseln'],
    },
    {
        'slug': 'lenkerband-wickeln', 'farbe': 'k2', 'teil': 'Lenkerband',
        'h1': 'Lenkerband wickeln',
        'titel': 'Lenkerband wickeln am Rennrad: Anleitung',
        'beschreibung': 'Lenkerband am Rennrad oder Gravelbike selbst wickeln: altes Band entfernen, richtige Wickelrichtung, sauberer Abschluss. Dauer und Kosten.',
        'lead': 'Frisches Lenkerband fühlt sich an wie ein neues Rad. Mit der richtigen Wickelrichtung und gleichmäßigem Zug wird es auch beim ersten Mal sauber.',
        'level': 'Mittel', 'zeit': 'ca. 30 Min.', 'minuten': 30, 'werkstatt': 'ca. 15–25 €',
        'wann': [
            'Das Band ist rissig, speckig, löst sich oder ist nach einem Sturz aufgerissen.',
            'Beim Tausch von Schalthebeln, Leitungen oder Lenker.',
            'Je nach Fahrleistung etwa einmal im Jahr.',
        ],
        'werkzeug': [],
        'schritte': [
            ('Altes Band entfernen', 'Lenkerendstopfen abziehen, Band abwickeln und die Griffgummis der Schalthebel nach vorne klappen.'),
            ('Lenker vorbereiten', 'Kleberreste entfernen, Leitungen mit Isolierband am Lenker fixieren. Die kurzen Zusatzstreifen hinter die Schaltgriffe legen.'),
            ('Neues Band wickeln', 'Am Lenkerende beginnen, etwas überstehen lassen, mit gleichmäßigem Zug und rund einem Drittel Überlappung nach oben wickeln. Um die Schaltgriffe in einer Acht führen.'),
            ('Abschluss setzen', 'Am Oberlenker schräg abschneiden, mit dem Abschlussband fixieren, den Überstand am Ende einstecken und den Stopfen eindrücken.'),
        ],
        'tipp': 'Rechts im Uhrzeigersinn, links gegen den Uhrzeigersinn wickeln. Dann zieht die Hand das Band beim Greifen fest statt auf.',
        'fragen': [
            ('Wie dick sollte Lenkerband sein?', 'Etwa 2,5 bis 3,5 mm sind üblich. Dickeres Band dämpft mehr, besonders auf dem Gravelbike, dünneres gibt mehr Gefühl.'),
        ],
        'app': 'Die Radgarage führt dein Wartungsheft, damit du weißt, wann du was zuletzt getauscht hast, und zeigt passendes Lenkerband aus mehreren Shops.',
        'suche': 'lenkerband wickeln rennrad',
        'video': 'lc0wH_-S-uQ',
        'verwandt': ['kette-wechseln', 'bremsbelaege-wechseln', 'reifen-wechseln'],
    },
    {
        'slug': 'innenlager-wechseln', 'farbe': 'k3', 'teil': 'Innenlager',
        'h1': 'Innenlager wechseln',
        'titel': 'Innenlager am Fahrrad wechseln: BSA, Pressfit & Co.',
        'beschreibung': 'Innenlager tauschen: Knacken und Spiel erkennen, Standard (BSA, BB86, PF30) bestimmen, Lager wechseln. Wann sich die Werkstatt lohnt.',
        'lead': 'Knackt es beim Treten oder hat die Kurbel Spiel, ist oft das Innenlager schuld. Schraublager schaffst du mit dem passenden Werkzeug selbst, für Pressfit lohnt sich meist die Werkstatt.',
        'level': 'Schwer', 'zeit': 'ca. 45 Min.', 'minuten': 45, 'werkstatt': 'ca. 30–50 €',
        'wann': [
            'Knacken oder Knarzen bei jeder Kurbelumdrehung, besonders unter Last.',
            'Die Kurbel hat seitliches Spiel oder läuft rau, wenn die Kette abgenommen ist.',
            'Nach vielen Fahrten im Regen oder nach Hochdruckreiniger-Einsatz.',
        ],
        'werkzeug': [],
        'schritte': [
            ('Kurbel ausbauen', 'Kette abnehmen, Kurbelschrauben bzw. die Kurbelkappe lösen und die Kurbel aus dem Lager ziehen.'),
            ('Altes Lager entfernen', 'Schraublager (BSA, ITA, T47) mit dem passenden Innenlagerwerkzeug herausdrehen. Achtung: Bei BSA hat die rechte Seite Linksgewinde. Pressfit-Lager werden mit einem Austreiber herausgedrückt.'),
            ('Lagersitz reinigen', 'Gewinde bzw. Lagersitz gründlich säubern und auf Beschädigungen prüfen.'),
            ('Neues Lager einbauen', 'Gewinde fetten und das Lager mit dem vorgegebenen Drehmoment einschrauben oder mit einem Einpresswerkzeug gerade einpressen. Kurbel montieren und auf Spiel prüfen.'),
        ],
        'tipp': 'Pressfit-Lager brauchen Spezialwerkzeug und Gefühl, damit der Rahmen keinen Schaden nimmt. Hier ist die Werkstatt meist die bessere Wahl.',
        'fragen': [
            ('Welches Innenlager habe ich?', 'Das hängt vom Rahmen ab (z. B. BSA, BB86, PF30, T47) und von der Kurbelachse (24 mm, DUB, 30 mm). Die Radgarage kennt Rahmen und Kurbel deines Modells.'),
        ],
        'app': 'Die Radgarage kennt Rahmenstandard und Kurbel deines Modells und zeigt dir das passende Innenlager. So kaufst du nicht auf Verdacht.',
        'suche': 'innenlager wechseln fahrrad',
        'video': 'aPaP_MLAq0I',
        'verwandt': ['kette-wechseln', 'kassette-wechseln', 'lenkerband-wickeln'],
    },
    {
        'slug': 'kettenverschleiss-messen', 'farbe': 'k4', 'teil': 'Kette', 'stand': '2026-10-28',
        'h1': 'Kettenverschleiß messen',
        'titel': 'Kettenverschleiß messen: so erkennst du, wann die Kette fällig ist',
        'beschreibung': 'Kettenverschleiß in zwei Minuten messen: mit Kettenlehre oder Zollstock. Ab welchem Wert die Kette raus muss und warum sich frühes Wechseln lohnt.',
        'lead': 'Eine Kette wird mit der Zeit länger, weil Bolzen und Hülsen verschleißen. Wer das rechtzeitig misst, wechselt nur die Kette statt gleich Kassette und Kettenblätter.',
        'level': 'Leicht', 'zeit': 'ca. 5 Min.', 'minuten': 5, 'werkstatt': 'oft kostenlos',
        'wann': [
            'Etwa alle 500 bis 1.000 km, bei Regen, Matsch und E-Bikes öfter.',
            'Wenn die Schaltung unsauber wird oder die Kette auf einzelnen Ritzeln springt.',
            'Immer vor dem Kauf einer neuen Kassette: Eine gelängte Kette ruiniert auch die neue.',
        ],
        'werkzeug': [('Kettenverschleißlehre', 10)],
        'schritte': [
            ('Kette sauber wischen', 'Wisch die Kette mit einem Lappen ab, damit Schmutz das Ergebnis nicht verfälscht. Schalte hinten auf ein mittleres Ritzel, damit die Kette gespannt ist.'),
            ('Lehre einsetzen', 'Hänge die Lehre mit dem Haken in eine Rolle ein und senke die andere Seite auf die Kette. Lies die Seite für 0,5 % und die für 0,75 % ab.'),
            ('Ergebnis einordnen', 'Fällt die 0,5-%-Seite ganz ein, ist eine 11- oder 12-fach-Kette fällig. Bei 10-fach und weniger gilt 0,75 % als Grenze. Fällt auch die 0,75-%-Seite ein, prüf die Kassette gleich mit.'),
            ('Ohne Lehre messen', 'Leg einen Zollstock an einen Bolzen und zähl 24 Glieder ab. Neu messen sie genau 304,8 mm (12 Zoll). Sind es 1,5 mm mehr, ist die Kette um etwa 0,5 % gelängt.'),
        ],
        'tipp': 'Miss an zwei, drei Stellen der Kette. Und schreib dir die Kilometer dazu: Dann weißt du beim nächsten Mal, wie schnell deine Kette verschleißt.',
        'fragen': [
            ('Warum sieht man den Verschleiß nicht?', 'Die Längung entsteht innen an Bolzen und Hülsen. Von außen sieht eine abgenutzte Kette oft noch gut aus. Nur Messen zeigt, wie weit sie ist.'),
            ('Wie genau sind einfache Kettenlehren?', 'Für die Entscheidung „wechseln oder nicht“ reichen sie. Sie messen den Abstand über die Rollen, das schließt etwas Rollenverschleiß mit ein und zeigt eher etwas zu früh als zu spät an.'),
        ],
        'app': 'Die Radgarage zählt die Kilometer deiner Kette mit und erinnert dich ab etwa 80 % des Richtwerts ans Messen. Danach rechnet sie mit deinem eigenen Messwert weiter.',
        'suche': 'kettenverschleiß messen fahrrad',
        'video': 's1qwU_VtojA',
        'verwandt': ['kette-wechseln', 'kette-reinigen-oelen', 'kassette-wechseln'],
    },
    {
        'slug': 'kette-reinigen-oelen', 'farbe': 'k5', 'teil': 'Kette', 'stand': '2026-10-28',
        'h1': 'Fahrradkette reinigen und ölen',
        'titel': 'Fahrradkette reinigen und ölen: richtig und sparsam',
        'beschreibung': 'Fahrradkette in 10 Minuten reinigen und ölen: welches Öl, wie viel, wie oft. So läuft die Kette leise und hält deutlich länger.',
        'lead': 'Eine saubere, richtig geölte Kette läuft leiser, schaltet besser und hält länger. Wichtig ist nicht viel Öl, sondern Öl an der richtigen Stelle.',
        'level': 'Leicht', 'zeit': 'ca. 10 Min.', 'minuten': 10, 'werkstatt': 'ca. 5–15 €',
        'wann': [
            'Nach jeder Fahrt im Regen oder durch Matsch.',
            'Wenn die Kette quietscht, rasselt oder sich trocken anfühlt.',
            'Sonst etwa alle 200 bis 300 km.',
        ],
        'werkzeug': [('Kettenöl', 10), ('Kettenbürste oder Reinigungsgerät', 15)],
        'schritte': [
            ('Grob abwischen', 'Halt einen Lappen um die Kette und kurbel ein paar Runden rückwärts. Bei leichtem Schmutz reicht das schon.'),
            ('Bei starkem Schmutz entfetten', 'Mit Kettenbürste oder Reinigungsgerät und etwas Entfetter die Kette säubern, mit Wasser nachspülen und gut trocknen lassen.'),
            ('Sparsam ölen', 'Gib auf jede Rolle einen kleinen Tropfen, am besten von innen auf das untere Kettentrum, während du langsam rückwärts kurbelst. Danach ein paar Gänge durchschalten.'),
            ('Einziehen lassen und abwischen', 'Lass das Öl ein paar Minuten einziehen und wisch dann außen alles ab, was übrig ist. Außen hilft Öl nicht, es sammelt nur Schmutz.'),
        ],
        'tipp': 'Kein Öl auf Bremsscheiben oder Felgenflanken. Am besten legst du beim Ölen einen Lappen unter die Kette.',
        'fragen': [
            ('Welches Öl ist das richtige?', 'Nassschmierstoff hält bei Regen und im Winter besser, zieht aber mehr Schmutz an. Trockenschmierstoff oder Wachs bleibt bei trockenem, staubigem Wetter sauberer, muss dafür öfter nachgelegt werden.'),
            ('Reicht ein Kriechöl aus der Sprühdose?', 'Kriechöl löst Schmutz, schmiert aber nicht lange. Nimm danach ein richtiges Kettenöl.'),
        ],
        'app': 'Die Radgarage merkt sich, wann du die Kette zuletzt gepflegt hast, und zählt die Kilometer bis zum nächsten Messen.',
        'suche': 'fahrradkette reinigen ölen',
        'video': '-TZ5X52EOEI',
        'verwandt': ['kettenverschleiss-messen', 'kette-wechseln', 'fahrrad-einwintern'],
    },
    {
        'slug': 'schaltung-einstellen', 'farbe': 'k3', 'teil': 'Schaltung', 'stand': '2026-10-28',
        'h1': 'Kettenschaltung einstellen',
        'titel': 'Fahrradschaltung einstellen: Schaltwerk Schritt für Schritt',
        'beschreibung': 'Schaltung springt oder rattert? So stellst du Zugspannung und Anschläge am Schaltwerk ein. Mit Hinweisen zu Di2 und AXS.',
        'lead': 'Rattert die Kette oder springt sie nicht sauber aufs nächste Ritzel, hilft meist eine Viertelumdrehung an der richtigen Schraube. Mit etwas Geduld klappt das ohne Werkstatt.',
        'level': 'Mittel', 'zeit': 'ca. 20 Min.', 'minuten': 20, 'werkstatt': 'ca. 10–20 €',
        'wann': [
            'Die Kette zögert beim Hochschalten oder springt beim Runterschalten über zwei Ritzel.',
            'Es rattert in einzelnen Gängen, obwohl Kette und Kassette in Ordnung sind.',
            'Bei neuen Rädern nach den ersten 100 bis 200 km, weil sich neue Züge noch setzen.',
        ],
        'werkzeug': [('Kreuzschlitz-Schraubendreher', 5), ('Innensechskant-Set', 15)],
        'schritte': [
            ('Ausgangslage prüfen', 'Hänge das Rad so auf, dass du die Kurbel drehen kannst. Schalte aufs kleinste Ritzel. Prüfe, ob das Schaltauge gerade ist: Ist es verbogen, hilft kein Einstellen.'),
            ('Zugspannung einstellen', 'Schalte einen Gang hoch. Zögert die Kette, dreh die Einstellschraube am Schaltwerk oder Hebel eine Viertelumdrehung gegen den Uhrzeigersinn. Springt sie zu weit oder rattert beim Runterschalten, im Uhrzeigersinn drehen. Alle Gänge prüfen.'),
            ('Endanschläge prüfen', 'Die Schraube H begrenzt den Weg nach außen, L den Weg nach innen. Im größten Gang darf das Schaltwerk nicht in Richtung Speichen ausweichen. Nur nachstellen, wenn die Kette am Rand abspringt oder den äußersten Gang nicht erreicht.'),
            ('Probefahrt', 'Fahr eine Runde und schalte unter leichter Last durch alle Gänge. Kleine Korrekturen an der Zugspannung sind normal.'),
        ],
        'tipp': 'Immer nur in Vierteldrehungen arbeiten und nach jeder Änderung testen. Wer viel auf einmal dreht, verliert schnell den Überblick.',
        'fragen': [
            ('Und bei elektronischen Schaltungen wie Di2 oder AXS?', 'Dort gibt es keinen Zug. Die Feinjustierung läuft über einen Einstellmodus am Schalter oder in der App des Herstellers. Endanschläge und ein gerades Schaltauge sind aber genauso wichtig.'),
            ('Warum verstellt sich die Schaltung immer wieder?', 'Neue Züge längen sich in den ersten Wochen. Verstellt sie sich später ständig, sind oft Zug oder Hülle verschlissen oder das Schaltauge ist verbogen.'),
        ],
        'app': 'Die Radgarage kennt Schaltwerk und Schalthebel deines Rads und führt im Wartungsheft, wann du zuletzt Züge oder Kette getauscht hast.',
        'suche': 'schaltung einstellen fahrrad schaltwerk',
        'video': 'UN1jJ3A5Gmw',
        'verwandt': ['kette-wechseln', 'kassette-wechseln', 'kettenverschleiss-messen'],
    },
    {
        'slug': 'scheibenbremse-schleift', 'farbe': 'k1', 'teil': 'Bremse', 'stand': '2026-10-28',
        'h1': 'Scheibenbremse schleift oder quietscht',
        'titel': 'Scheibenbremse schleift oder quietscht: was wirklich hilft',
        'beschreibung': 'Scheibenbremse schleift oder quietscht? Ursache finden, Bremssattel ausrichten, Scheibe und Beläge reinigen. Schritt für Schritt.',
        'lead': 'Ein Schleifgeräusch an der Scheibenbremse hat meist eine einfache Ursache: ein schief sitzender Sattel, ein nicht sauber eingebautes Laufrad oder eine leicht verzogene Scheibe.',
        'level': 'Leicht', 'zeit': 'ca. 15 Min.', 'minuten': 15, 'werkstatt': 'ca. 10–20 €',
        'wann': [
            'Die Bremse schleift dauerhaft oder in jeder Radumdrehung an einer Stelle.',
            'Sie quietscht laut, auch bei trockenem Wetter.',
            'Nach dem Ausbauen des Laufrads schleift es plötzlich.',
        ],
        'werkzeug': [('Innensechskant-Set', 15), ('Bremsenreiniger', 8)],
        'schritte': [
            ('Ursache eingrenzen', 'Dreh das Rad langsam. Schleift es nur an einer Stelle, ist die Scheibe leicht verzogen. Schleift es gleichmäßig, sitzt meist der Sattel schief oder das Laufrad nicht richtig.'),
            ('Laufrad richtig einbauen', 'Steckachse oder Schnellspanner lösen, das Rad gerade in die Ausfallenden drücken und die Achse wieder festziehen. Oft ist das Schleifen damit schon weg.'),
            ('Bremssattel ausrichten', 'Die beiden Schrauben, die den Sattel halten, leicht lösen. Bremshebel ziehen und halten, dann die Schrauben abwechselnd festziehen. Hebel loslassen und prüfen, ob die Scheibe frei läuft.'),
            ('Gegen Quietschen: reinigen und einbremsen', 'Scheibe mit Bremsenreiniger und sauberem Tuch abwischen. Dann etwa 20 Mal aus mittlerem Tempo kräftig bremsen. Sind die Beläge verölt, helfen nur neue Beläge.'),
        ],
        'tipp': 'Fass die Bremsscheibe nie mit den Fingern an. Schon etwas Hautfett reicht, damit sie quietscht.',
        'fragen': [
            ('Kann ich eine verzogene Scheibe richten?', 'Leichte Schläge lassen sich mit einem Richtwerkzeug vorsichtig ausbiegen. Ist die Scheibe stark verbogen oder zu dünn, tausch sie aus.'),
            ('Warum quietscht die Bremse nur bei Nässe?', 'Wasser und Schmutz auf der Scheibe sind die häufigste Ursache und meist harmlos. Hört es nach ein paar Bremsungen nicht auf, Scheibe reinigen.'),
        ],
        'app': 'Die Radgarage kennt Bremse, Scheiben und Beläge deines Rads und zeigt dir passenden Ersatz, wenn ein Tausch nötig ist.',
        'suche': 'scheibenbremse schleift fahrrad',
        'video': 'omr2Q-Z22iU',
        'verwandt': ['bremsbelaege-wechseln', 'bremsscheibe-wechseln', 'fruehjahrscheck'],
    },
    {
        'slug': 'fahrrad-einwintern', 'farbe': 'k2', 'teil': 'Pflege', 'stand': '2026-10-29',
        'h1': 'Fahrrad einwintern',
        'titel': 'Fahrrad einwintern und lagern: so übersteht es den Winter',
        'beschreibung': 'Fahrrad und E-Bike richtig einwintern: reinigen, Kette pflegen, Reifen und Akku richtig lagern. Damit im Frühjahr alles startklar ist.',
        'lead': 'Wer sein Rad über den Winter abstellt, sollte es nicht einfach dreckig in die Ecke stellen. Eine halbe Stunde Pflege schützt vor Rost und spart im Frühjahr Ärger.',
        'level': 'Leicht', 'zeit': 'ca. 30 Min.', 'minuten': 30, 'werkstatt': 'ca. 50–100 €',
        'wann': [
            'Bevor das Rad für mehrere Wochen steht.',
            'Nach Fahrten auf gesalzenen Straßen, damit das Salz nicht weiter frisst.',
        ],
        'werkzeug': [('Kettenöl', 10), ('Standpumpe mit Manometer', 30)],
        'schritte': [
            ('Gründlich reinigen', 'Rad mit Wasser, Bürste und mildem Reiniger waschen und trocknen. Keinen Hochdruckreiniger auf Lager, Naben und Steuersatz richten.'),
            ('Kette und blanke Teile pflegen', 'Kette reinigen und ölen, Überschuss abwischen. Blanke Schrauben und Züge leicht mit etwas Öl gegen Rost schützen, aber nichts an Bremsscheiben oder Felgenflanken.'),
            ('Reifen und Lagerplatz', 'Reifen auf Nenndruck pumpen, damit sie nicht platt auf einer Stelle stehen. Rad trocken und möglichst frostfrei lagern, am besten hängend.'),
            ('E-Bike-Akku einlagern', 'Akku herausnehmen und bei Zimmertemperatur trocken lagern, mit etwa 30 bis 60 % Ladung. Alle paar Monate den Ladestand prüfen. Die Angaben deines Herstellers gehen vor.'),
        ],
        'tipp': 'Der Winter ist die beste Zeit für die Werkstatt: kurze Wartezeiten und im Frühjahr ein fertiges Rad.',
        'fragen': [
            ('Darf das Rad im Winter draußen stehen?', 'Mit einer Abdeckung geht das, aber Feuchtigkeit und Salz setzen Kette und Schrauben zu. Ein trockener Keller oder eine Garage ist besser.'),
            ('Soll der Akku im E-Bike bleiben?', 'Besser nicht. Kälte schadet dem Akku, und ganz leer gelagert kann er Schaden nehmen. Drinnen bei mittlerer Ladung ist er am besten aufgehoben.'),
            ('Und wenn ich im Winter weiterfahre?', 'Dann braucht das Rad mehr Pflege statt einer Pause: nach Fahrten auf gesalzenen Straßen mit klarem Wasser abspülen und trocknen, die Kette öfter und mit einem Öl für nasse Bedingungen schmieren, Bremsen und Licht regelmäßig prüfen. Schutzbleche halten viel Dreck und Salz fern. Den E-Bike-Akku zwischen den Fahrten drinnen aufbewahren und erst kurz vor der Fahrt einsetzen.'),
        ],
        'app': 'Die Radgarage führt dein Wartungsheft und erinnert dich im Frühjahr daran, Kette, Beläge und Reifen zu prüfen.',
        'suche': 'fahrrad einwintern',
        'video': 'phDwNIl3Grc',
        'video_titel': 'Du fährst im Winter weiter?',
        'video_text': 'Dann hilft dieses Video: So pflegst du dein Rad bei Kälte, Nässe und Streusalz.',
        'verwandt': ['fruehjahrscheck', 'kette-reinigen-oelen', 'reifen-wechseln'],
    },
    {
        'slug': 'fruehjahrscheck', 'farbe': 'k4', 'teil': 'Pflege', 'stand': '2026-10-28',
        'h1': 'Frühjahrscheck am Fahrrad',
        'titel': 'Frühjahrscheck am Fahrrad: in 4 Schritten startklar',
        'beschreibung': 'Fahrrad nach dem Winter startklar machen: Reifen, Bremsen, Antrieb, Schrauben und Licht prüfen. Checkliste für den Frühjahrscheck.',
        'lead': 'Bevor die Saison losgeht, lohnt sich eine halbe Stunde für dein Rad. Mit dieser Reihenfolge findest du fast alles, was eine Werkstatt beim Frühjahrscheck auch anschaut.',
        'level': 'Leicht', 'zeit': 'ca. 30 Min.', 'minuten': 30, 'werkstatt': 'ca. 50–100 €',
        'wann': [
            'Vor der ersten Ausfahrt nach dem Winter.',
            'Nach längerer Standzeit, auch im Sommer.',
        ],
        'werkzeug': [('Standpumpe mit Manometer', 30), ('Kettenverschleißlehre', 10), ('Innensechskant-Set', 15)],
        'schritte': [
            ('Reifen und Laufräder', 'Luftdruck nach Reifenflanke pumpen, Profil und Flanken auf Risse prüfen. Laufräder drehen: Laufen sie rund, sitzen Achsen und Schnellspanner fest, sind alle Speichen gespannt?'),
            ('Bremsen', 'Belagstärke prüfen, Hebel ziehen: Der Druckpunkt muss fest sein und darf nicht bis zum Lenker gehen. Scheiben oder Felgenflanken sauber und frei von Öl?'),
            ('Antrieb', 'Kette reinigen, ölen und den Verschleiß messen. Alle Gänge durchschalten und bei Bedarf die Zugspannung nachstellen.'),
            ('Schrauben, Licht, Akku', 'Vorbau, Lenker und Sattelstütze auf festen Sitz prüfen, mit dem Drehmoment, das auf dem Bauteil steht. Licht und Klingel testen. Beim E-Bike den Akku voll laden und nach Software-Updates schauen.'),
        ],
        'tipp': 'Ruckelt der Lenker beim Bremsen oder hat die Kurbel Spiel, lass Steuersatz oder Innenlager in der Werkstatt prüfen. Das sind Lager, die man ungern im Fahren verliert.',
        'fragen': [
            ('Wann lohnt sich doch die Werkstatt?', 'Bei schwammigen Bremsen, Spiel in Lagern, einer Federgabel, die lange keinen Service hatte, oder wenn du dir bei Bremsen unsicher bist.'),
            ('Wie oft im Jahr sollte ich so einen Check machen?', 'Einmal gründlich vor der Saison. Reifendruck, Bremsen und Kette sind bei Vielfahrern am besten jede Woche einen kurzen Blick wert.'),
        ],
        'app': 'Die Radgarage kennt alle Teile an deinem Rad und zeigt dir, welche nach Kilometern als Nächstes dran sind.',
        'suche': 'fahrrad frühjahrscheck',
        'video': 'oIfAQUdwd8Q',
        'verwandt': ['kettenverschleiss-messen', 'bremsbelaege-wechseln', 'schaltung-einstellen'],
    },
]

PLAY = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>'


def e(s):
    return html.escape(s, quote=True)


MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November',
          'Dezember']


def monat(datum):
    return f'{MONATE[int(datum[5:7]) - 1]} {datum[:4]}'


def euro(n):
    return f'ca. {n} €'


# Farbe der Anleitungskarten nach Bereich am Rad: Antrieb apricot, Bremse lila, Laufrad blau, Pflege grün, Rest gelb
BEREICH_FARBE = {'Kette': 'k1', 'Kassette': 'k1', 'Schaltung': 'k1', 'Bremsbeläge': 'k2', 'Bremsscheibe': 'k2', 'Bremse': 'k2',
                 'Reifen': 'k5', 'Schlauch': 'k5', 'Pflege': 'k4'}
for _a in ANLEITUNGEN:
    _a['farbe'] = BEREICH_FARBE.get(_a['teil'], 'k3')

HAUPTMENUE = [('/raeder/', 'Räder'), ('/teile/', 'Ersatzteile'), ('/anleitungen/', 'Anleitungen'), ('/wissen/', 'Wissen')]
# Rechner, Auswertungen und Übersichten, die im Menü unter „Wissen“ hängen: (Pfad, Name, Art, Satz)
WISSEN_SEITEN = [
    ('/reifengroessen/', 'Reifengrößen', 'Rechner', 'ETRTO, Zoll und 700C umrechnen, mit passendem Schlauch'),
    ('/verschleissrechner/', 'Verschleißrechner', 'Rechner', 'Wann Kette, Beläge, Reifen und Kassette fällig sind'),
    ('/unterhaltskosten/', 'Unterhaltskosten', 'Auswertung', 'Was ein Fahrrad je 1.000 km kostet, nach Radtyp'),
    ('/schaltgruppen/', 'Schaltgruppen', 'Übersicht', 'Welche Kette und Kassette zu deiner Gruppe passen'),
    ('/e-bike-systeme/', 'E-Bike-Systeme', 'Übersicht', 'Welcher Motor, welcher Akku, was zusammenpasst'),
    ('/einbetten/', 'Rechner einbetten', 'Für deine Website', 'Unsere Rechner kostenlos und ohne Cookies einbinden'),
]

WISSEN_FARBE = {'Rechner': 'k1', 'Auswertung': 'k3', 'Übersicht': 'k2', 'Für deine Website': 'k4'}


def wissen_karten(ebene='h3'):
    return ''.join(f'<a class="t {WISSEN_FARBE[art]} karte" href="{p}"><span class="eyebrow">{e(art)}</span>'
                   f'<{ebene}>{e(n)}</{ebene}><span class="meta">{e(satz)}</span></a>' for p, n, art, satz in WISSEN_SEITEN)


def kopfnav(pfad):
    """Hauptmenü im Kopf. Der Bereich, in dem die Seite liegt, ist markiert."""
    wissen = any(pfad.startswith(p) for p, *_ in WISSEN_SEITEN)

    def aktiv(h):
        if h == '/wissen/' and wissen:
            return ' aria-current="true"'
        if not pfad.startswith(h):
            return ''
        return ' aria-current="page"' if pfad == h else ' aria-current="true"'
    links = ''.join(f'<a href="{h}"{aktiv(h)}>{e(t)}</a>' for h, t in HAUPTMENUE)
    return f'<nav class="kopfnav" aria-label="Hauptmenü">{links}</nav>'


LUPE = ('<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" '
        'stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>')


def kopfsuche():
    """Lupe im Kopf: klappt die Suche nach Rad oder Teil auf, auf jeder Seite."""
    return (f'<details class="kopfsuche"><summary aria-label="Rad oder Teil suchen">{LUPE}</summary>'
            f'<div class="kopfsuche-feld">{suchfeld("alles", "suche-kopf")}</div></details>')


def kopfzeile(pfad):
    """Kopf aller Seiten: Logo, Hauptmenü, Suche und Knopf. bauen.py setzt ihn auch in die Handseiten ein."""
    return f'''  <header>
    <a href="/" class="logo">Radgarage</a>
    {kopfnav(pfad)}
    {kopfsuche()}
    <!--kopf-knopf-->{kopf_knopf()}<!--/kopf-knopf-->
  </header>
'''


def kopf_knopf():
    if STORE_LIVE:
        return '<a class="pill" href="/#app">App laden</a>'
    return '<a class="pill" href="/#anmelden">Testzugang sichern</a>'


def store_meta():
    """Smart App Banner für Safari auf dem iPhone, erst ab Store-Start."""
    return f'<meta name="apple-itunes-app" content="app-id={APP_STORE_ID}">\n' if STORE_LIVE and APP_STORE_ID else ''


def app_schema():
    """SoftwareApplication für die Startseite, erst ab Store-Start. Bewertungen erst eintragen, wenn es echte gibt."""
    if not STORE_LIVE:
        return ''
    app = {'@context': 'https://schema.org', '@type': 'SoftwareApplication', 'name': 'Radgarage', 'url': SEITE + '/',
           'operatingSystem': 'iOS, Android', 'applicationCategory': 'UtilitiesApplication', 'inLanguage': 'de',
           'description': 'App und Teilekatalog für Fahrräder: verbaute Teile, passender Ersatz, Verschleiß und Wartung.',
           'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'},
           'publisher': {'@id': SEITE + '/#org'}, 'sameAs': [u for u in (APP_STORE_URL, PLAY_URL) if u]}
    return f'<script type="application/ld+json">{json.dumps(app, ensure_ascii=False)}</script>'


def kopf(titel, beschreibung, pfad, schema, bild='https://radgarage.app/img/werkstatt.jpg', robots=False):
    url = SEITE + pfad
    daten = '\n'.join(
        f'<script type="application/ld+json">{json.dumps(s, ensure_ascii=False)}</script>' for s in schema
    )
    return f'''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(titel)}</title>
<meta name="description" content="{e(beschreibung)}">
{'<meta name="robots" content="noindex, follow">' + chr(10) if robots else ''}<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Radgarage">
<meta property="og:title" content="{e(titel)}">
<meta property="og:description" content="{e(beschreibung)}">
<meta property="og:image" content="{bild}">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
{ICONS}
<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/bricolage-latin-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/seiten.css?v={CSS_VERSION}">
<meta name="theme-color" content="#F2EDE2">
{store_meta()}{daten}
</head>
<body>
<div class="wrap">
{kopfzeile(pfad)}'''


# Symbol für Browser-Tab, Lesezeichen und Handy-Startbildschirm (aus dem App-Icon, erzeugt von bauen.py)
ICONS = ('<link rel="icon" href="/favicon.ico" sizes="32x32">\n'
         '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n'
         '<link rel="manifest" href="/site.webmanifest">')
CSS_VERSION = 10  # hochzählen, wenn sich css/seiten.css ändert, sonst laden Browser die alte Datei

UMFRAGE = 'https://tally.so/r/0VQ0JP'  # Nachfragetest, nach der Auswertung (20.11.2026) aus der Fußzeile nehmen

# Eine Fußzeile für alle öffentlichen Seiten. bauen.py setzt sie auch in die von Hand gepflegten Seiten
# (Startseite, Danke, Impressum, Datenschutz, Konto löschen, Abmelden) ein.
FUSS_INHALT = f'''  <footer class="fuss">
    <div class="fuss-spalten">
      <nav aria-label="Katalog"><b>Katalog</b>
        <a href="/raeder/">Räder</a>
        <a href="/teile/">Ersatzteile</a>
        <a href="/anleitungen/">Anleitungen</a>
      </nav>
      <nav aria-label="Wissen"><b>Wissen</b>
        <a href="/reifengroessen/">Reifengrößen</a>
        <a href="/verschleissrechner/">Verschleißrechner</a>
        <a href="/unterhaltskosten/">Unterhaltskosten</a>
        <a href="/schaltgruppen/">Schaltgruppen</a>
        <a href="/e-bike-systeme/">E-Bike-Systeme</a>
      </nav>
      <nav aria-label="Radgarage"><b>Radgarage</b>
        <a href="/ueber-uns/">Über uns</a>
        <a href="/so-pruefen-wir/">So prüfen wir</a>
        <a href="/fuer-vereine/">Für Vereine</a>
        <a href="/feedback/">Feedback</a>
        <a href="mailto:kontakt@radgarage.app">Für Partner</a>
        <a href="{UMFRAGE}" target="_blank" rel="noopener">Zur Umfrage</a>
      </nav>
      <nav aria-label="Rechtliches"><b>Rechtliches</b>
        <a href="/impressum.html">Impressum</a>
        <a href="/datenschutz.html">Datenschutz</a>
        <a href="/konto-loeschen.html">Konto löschen</a>
      </nav>
    </div>
    <p>Gerade in Entwicklung. Gemacht aus Leidenschaft fürs Rad.</p>
    <script src="/js/zaehler.js?v=1" defer></script>
  </footer>
'''

FUSS = FUSS_INHALT + '''</div>
</body>
</html>
'''


SUCHE_TEXT = {
    'raeder': ('Rad suchen', 'z. B. Topstone 2025'),
    'teile': ('Teil suchen', 'z. B. CN-M8100'),
    'alles': ('Rad oder Teil suchen', 'z. B. Topstone oder CN-M8100'),
}


def suchfeld(art, kennung=None):
    """Suchfeld mit Vorschlägen. Die Daten (suche.json) lädt /js/suche.js erst, wenn jemand ins Feld tippt."""
    kennung = kennung or f'suche-{art}'
    label, platzhalter = SUCHE_TEXT[art]
    return (f'<form class="suche" role="search" data-art="{art}" action="#">'
            f'<label class="sr" for="{kennung}">{e(label)}</label>'
            f'<input type="search" id="{kennung}" placeholder="{e(platzhalter)}" autocomplete="off" spellcheck="false" '
            f'role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="{kennung}-liste">'
            f'<ul class="treffer" id="{kennung}-liste" role="listbox" aria-label="Vorschläge" hidden></ul>'
            f'<p class="suche-info" role="status" aria-live="polite"></p>'
            f'</form><script src="/js/suche.js?v=2" defer></script>')


def passend(*varianten, grenze=65):
    """Erste Variante, die in die Grenze passt (Titel 65, Beschreibung 165 Zeichen), sonst die kürzeste.
    Längere Texte schneidet Google in den Suchergebnissen ab."""
    for v in varianten:
        if len(v) <= grenze:
            return v
    return min(varianten, key=len)


def krumen(teile):
    li = []
    for i, (name, pfad) in enumerate(teile):
        if i == len(teile) - 1:
            li.append(f'<li><span aria-current="page">{e(name)}</span></li>')
        else:
            li.append(f'<li><a href="{pfad}">{e(name)}</a></li>')
    schema = {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SEITE + p} for i, (n, p) in enumerate(teile)
        ],
    }
    return f'  <nav class="krumen" aria-label="Brotkrumen"><ol>{"".join(li)}</ol></nav>\n', schema


def karte(a, ebene='h3'):
    return (f'<a class="t {a["farbe"]} karte" href="/anleitungen/{a["slug"]}/">'
            f'<span class="eyebrow">{e(a["teil"])}</span><{ebene}>{e(a["h1"])}</{ebene}>'
            f'<span class="meta">{e(a["level"])} · {e(a["zeit"])}</span></a>')


def youtube_suche(a):
    return 'https://www.youtube.com/results?search_query=' + a['suche'].replace(' ', '+')


def video_kachel(a):
    titel = f'Video: {a["h1"]}'
    if a['video']:
        start = a.get('video_start')  # Sekunde, ab der das Video startet (optional)
        player = (f'<div class="player" data-video="{e(a["video"])}" data-titel="{e(titel)}"{f' data-start="{start}"' if start else ''}>'
                  f'<div class="zustimmen"><button class="play" type="button" aria-label="Video laden und abspielen">{PLAY}</button>'
                  '<p>Erst mit dem Klick lädt das Video von YouTube. Dabei erhält Google unter anderem deine IP-Adresse. '
                  'Mehr dazu in der <a href="/datenschutz.html#videos">Datenschutzerklärung</a>.</p></div></div>'
                  f'<p class="klein"><a href="https://www.youtube.com/watch?v={e(a["video"])}{f"&amp;t={start}s" if start else ""}" target="_blank" rel="noopener">Auf YouTube ansehen</a></p>')
    else:
        # Ohne Video-ID keine Kachel, die Seite verlinkt dann nur die YouTube-Suche unter den Schritten.
        return ''
    return f'''    <div class="t s1 video">
      <span class="eyebrow">Video</span>
      <h2 style="font-size:26px;margin:6px 0 0">{e(a.get('video_titel', 'Lieber zuschauen?'))}</h2>
      {f'<p style="margin-top:6px">{e(a["video_text"])}</p>' if a.get('video_text') else ''}
      {player}
    </div>
'''


def anleitung_seite(a, alle):
    pfad = f'/anleitungen/{a["slug"]}/'
    nav, brot = krumen([('Radgarage', '/'), ('Anleitungen', '/anleitungen/'), (a['h1'], pfad)])
    werkzeug_summe = sum(p for _, p in a['werkzeug'])
    howto = {
        '@context': 'https://schema.org', '@type': 'HowTo',
        'name': a['h1'], 'description': a['beschreibung'], 'inLanguage': 'de',
        'totalTime': f'PT{a["minuten"]}M', 'dateModified': a.get('stand', STAND),
        'tool': [{'@type': 'HowToTool', 'name': n} for n, _ in a['werkzeug']],
        'step': [
            {'@type': 'HowToStep', 'position': i + 1, 'name': t, 'text': x, 'url': f'{SEITE}{pfad}#schritt-{i + 1}'}
            for i, (t, x) in enumerate(a['schritte'])
        ],
        'publisher': {'@type': 'Organization', '@id': f'{SEITE}/#org', 'name': 'Radgarage', 'url': SEITE + '/'},
        'author': {'@type': 'Organization', '@id': f'{SEITE}/#org', 'name': 'Radgarage', 'url': SEITE + '/'},
    }
    if werkzeug_summe:
        howto['estimatedCost'] = {'@type': 'MonetaryAmount', 'currency': 'EUR', 'value': werkzeug_summe}
    if a['video']:
        howto['video'] = {
            '@type': 'VideoObject', 'name': f'Video: {a["h1"]}', 'description': a['beschreibung'],
            'embedUrl': f'https://www.youtube-nocookie.com/embed/{a["video"]}',
            'contentUrl': f'https://www.youtube.com/watch?v={a["video"]}',
            'thumbnailUrl': f'https://i.ytimg.com/vi/{a["video"]}/hqdefault.jpg',
            'uploadDate': STAND,
        }
    out = [kopf(a['titel'] + ' | Radgarage' if len(a['titel']) < 50 else a['titel'], a['beschreibung'], pfad, [howto, brot]), nav]
    out.append('  <main>\n  <article class="bento anl">\n')
    out.append(f'''    <div class="t {a["farbe"]} kopf">
      <span class="eyebrow">Anleitung · {e(a["teil"])}</span>
      <h1>{e(a["h1"])}</h1>
      <p class="lead">{e(a["lead"])}</p>
    </div>
    <div class="daten">
      <div class="t s2"><span class="eyebrow">Schwierigkeit</span><div class="wert">{e(a["level"])}</div></div>
      <div class="t s2"><span class="eyebrow">Dauer</span><div class="wert">{e(a["zeit"])}</div></div>
      <div class="t s2"><span class="eyebrow">In der Werkstatt</span><div class="wert">{e(a["werkstatt"])}</div></div>
    </div>
    <div class="t s1 wann">
      <span class="eyebrow">Wann ist es fällig?</span>
      <ul class="punkte">{"".join(f"<li>{e(x)}</li>" for x in a["wann"])}</ul>
    </div>
''')
    if a['werkzeug']:
        liste = ''.join(f'<li><span>{e(n)}</span><span>{euro(p)}</span></li>' for n, p in a['werkzeug'])
        out.append(f'''    <div class="t s2 werkzeug">
      <span class="eyebrow">Werkzeug</span>
      <ul class="liste">{liste}</ul>
      <p class="klein">Einmal gekauft, hält gutes Werkzeug viele Jahre. Zusammen etwa {werkzeug_summe} €.</p>
    </div>
''')
    else:
        out.append('''    <div class="t s2 werkzeug">
      <span class="eyebrow">Werkzeug</span>
      <p style="margin-top:8px">Je nach Rad unterschiedlich. Prüfe vorher, welches System verbaut ist, und leg dir das passende Werkzeug bereit.</p>
    </div>
''')
    schritte = ''.join(
        f'<li id="schritt-{i + 1}"><span><h3>{e(t)}</h3><p>{e(x)}</p></span></li>' for i, (t, x) in enumerate(a['schritte'])
    )
    out.append(f'''    <section class="t s1 schritte{"" if a["video"] else " ohne-video"}" aria-labelledby="schritte-titel">
      <span class="eyebrow">Schritt für Schritt</span>
      <h2 id="schritte-titel" style="font-size:30px;margin:6px 0 0">So geht's</h2>
      <ol class="steps">{schritte}</ol>
      {"" if a["video"] else f'<p class="klein"><a href="{e(youtube_suche(a))}" target="_blank" rel="noopener">Lieber zuschauen? Videos auf YouTube suchen</a></p>'}
    </section>
''')
    out.append(video_kachel(a))
    out.append(f'''    <div class="t dark tipp">
      <span class="eyebrow">Tipp aus der Werkstatt</span>
      <p style="margin-top:8px;font-size:18px">{e(a["tipp"])}</p>
    </div>
''')
    if a['fragen']:
        fr = ''.join(f'<details><summary>{e(q)}</summary><p>{e(x)}</p></details>' for q, x in a['fragen'])
        out.append(f'''    <section class="t s2 fragen" aria-labelledby="fragen-titel">
      <span class="eyebrow">Häufige Fragen</span>
      <h2 id="fragen-titel" style="font-size:30px;margin:6px 0 8px">Gut zu wissen</h2>
      {fr}
    </section>
''')
    out.append(f'''    <aside class="t k4 app">
      <div>
        <span class="eyebrow">Die App zur Anleitung</span>
        <h2 style="margin:6px 0 8px">Welches Teil passt an dein Rad?</h2>
        <p>{e(a["app"])}</p>
      </div>
      <div class="actions"><a class="pill" href="/#anmelden">Testplatz sichern</a><a class="pill ghost" href="/">Mehr zur App</a></div>
    </aside>
''')
    verwandt = [x for s in a['verwandt'] for x in alle if x['slug'] == s]
    out.append(f'''    <section class="t mehr" aria-labelledby="mehr-titel">
      <h2 id="mehr-titel" style="font-size:30px;margin:14px 0 12px">Weitere Anleitungen</h2>
      <div class="karten">{"".join(karte(x) for x in verwandt)}</div>
    </section>
  </article>
  <p class="hinweis">Diese Anleitung ersetzt nicht die Anleitung des Herstellers. Drehmomente und Verschleißgrenzen deiner Teile stehen dort oder auf dem Bauteil. Arbeiten an Bremsen und Lenkung sind sicherheitsrelevant: Wenn du unsicher bist, lass sie von einer Fachwerkstatt machen. Von der Radgarage, Stand: {monat(a.get("stand", STAND))}. <a href="/so-pruefen-wir/">So prüfen wir</a> · <a href="/ueber-uns/">Über uns</a></p>
  </main>
''')
    if a['video']:
        out.append('<script src="/anleitungen/video.js?v=2" defer></script>\n')
    out.append(FUSS)
    return ''.join(out)


def uebersicht(alle):
    pfad = '/anleitungen/'
    nav, brot = krumen([('Radgarage', '/'), ('Anleitungen', pfad)])
    liste = {
        '@context': 'https://schema.org', '@type': 'ItemList', 'name': 'Fahrrad-Anleitungen',
        'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'url': f'{SEITE}/anleitungen/{a["slug"]}/', 'name': a['h1']}
            for i, a in enumerate(alle)
        ],
    }
    titel = 'Fahrrad-Wartung selbst machen: Anleitungen | Radgarage'
    beschr = 'Fahrrad selbst warten: Kette wechseln und ölen, Bremsbeläge, Schaltung einstellen, Reifen und mehr. Anleitungen mit Werkzeug, Dauer und Werkstattpreis.'
    out = [kopf(titel, beschr, pfad, [liste, brot]), nav]
    out.append(f'''  <main>
  <div class="bento uebersicht">
    <div class="t k3 kopf">
      <span class="eyebrow">Anleitungen</span>
      <h1>Dein Rad, selbst gewartet</h1>
      <p class="lead">Die häufigsten Arbeiten am Fahrrad, Schritt für Schritt erklärt: mit Werkzeugliste, Dauer und was die Werkstatt ungefähr kostet. Aus der Werkstatt-Ansicht der Radgarage-App.</p>
    </div>
  </div>
  <section aria-label="Alle Anleitungen" style="margin-top:14px">
    <div class="karten">{"".join(karte(a, 'h2') for a in alle)}</div>
  </section>
  <section aria-labelledby="wissen-titel" style="margin-top:14px">
    <h2 id="wissen-titel" class="zwischen">Rechner und Wissen</h2>
    <div class="karten">{wissen_karten()}</div>
    <p class="mehr-link"><a class="pfeil" href="/wissen/">Alles unter Wissen</a></p>
  </section>
  <div class="bento anl" style="margin-top:14px">
    <aside class="t k4 app">
      <div>
        <span class="eyebrow">Radgarage</span>
        <h2 style="margin:6px 0 8px">Wann ist was fällig?</h2>
        <p>Die Radgarage kennt die Teile an deinem Fahrrad, zählt die Kilometer mit und sagt dir, wann du prüfen oder tauschen solltest. Die Anleitungen hast du in der App gleich dabei.</p>
      </div>
      <div class="actions"><a class="pill" href="/#anmelden">Testplatz sichern</a></div>
    </aside>
  </div>
  <p class="hinweis">Die Anleitungen ersetzen nicht die Anleitung des Herstellers. Arbeiten an Bremsen und Lenkung sind sicherheitsrelevant: Wenn du unsicher bist, lass sie von einer Fachwerkstatt machen.</p>
  </main>
''')
    out.append(FUSS)
    return ''.join(out)


def schreiben(pfad, text):
    voll = os.path.join(WURZEL, pfad)
    os.makedirs(os.path.dirname(voll), exist_ok=True)
    with open(voll, 'w', encoding='utf-8') as f:
        f.write(text)
