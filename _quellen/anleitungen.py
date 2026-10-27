"""Baut den Bereich /anleitungen/ (eine Seite pro Wartungsarbeit), dazu sitemap.xml.

Aufruf im Repo-Wurzelordner: python3 _quellen/anleitungen.py
Inhalte stammen aus den App-Anleitungen (src/data/anleitungen.ts im App-Repo), hier ausführlicher.
Ordner mit _ am Anfang veröffentlicht GitHub Pages nicht.

Video: Feld "video" mit der YouTube-ID füllen (der Teil nach watch?v=). Leer heißt: Link zur YouTube-Suche.
"""
import html
import json
import os

SEITE = 'https://radgarage.app'
STAND = '2026-10-27'
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
        'video': '',
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
        'video': '',
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
        'video': '',
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
        'video': '',
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
        'video': '',
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
        'video': '',
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
        'video': '',
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
        'video': '',
        'verwandt': ['kette-wechseln', 'kassette-wechseln', 'lenkerband-wickeln'],
    },
]

PLAY = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>'


def e(s):
    return html.escape(s, quote=True)


def euro(n):
    return f'ca. {n} €'


def kopf(titel, beschreibung, pfad, schema, bild='https://radgarage.app/img/werkstatt.jpg'):
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
<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="Radgarage">
<meta property="og:title" content="{e(titel)}">
<meta property="og:description" content="{e(beschreibung)}">
<meta property="og:image" content="{bild}">
<meta property="og:url" content="{url}">
<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/bricolage-latin-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/anleitungen/anleitungen.css?v=1">
<meta name="theme-color" content="#F2EDE2">
{daten}
</head>
<body>
<div class="wrap">
  <header>
    <a href="/" class="logo">Radgarage</a>
    <a class="pill" href="/#anmelden">Testzugang sichern</a>
  </header>
'''


FUSS = '''  <footer>
    <span>Gerade in Entwicklung. Ein Privatprojekt aus Leidenschaft fürs Rad.</span>
    <nav>
      <a href="/anleitungen/">Anleitungen</a>
      <a href="mailto:kontakt@radgarage.app">Für Shops und Partner: kontakt@radgarage.app</a>
      <a href="/impressum.html">Impressum</a>
      <a href="/datenschutz.html">Datenschutz</a>
    </nav>
  </footer>
</div>
</body>
</html>
'''


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


def video_kachel(a):
    titel = f'Video: {a["h1"]}'
    if a['video']:
        player = (f'<div class="player" data-video="{e(a["video"])}" data-titel="{e(titel)}">'
                  f'<div class="zustimmen"><button class="play" type="button" aria-label="Video laden und abspielen">{PLAY}</button>'
                  '<p>Erst mit dem Klick lädt das Video von YouTube. Dabei erhält Google unter anderem deine IP-Adresse. '
                  'Mehr dazu in der <a href="/datenschutz.html#videos">Datenschutzerklärung</a>.</p></div></div>'
                  f'<p class="klein"><a href="https://www.youtube.com/watch?v={e(a["video"])}" target="_blank" rel="noopener">Auf YouTube ansehen</a></p>')
    else:
        such = 'https://www.youtube.com/results?search_query=' + a['suche'].replace(' ', '+')
        player = ('<div class="player"><div class="zustimmen"><span class="play">' + PLAY + '</span>'
                  '<p>Das passende Video suchen wir gerade aus.</p></div></div>'
                  f'<p class="klein"><a href="{e(such)}" target="_blank" rel="noopener">Videos auf YouTube suchen</a></p>')
    return f'''    <div class="t s1 video">
      <span class="eyebrow">Video</span>
      <h2 style="font-size:26px;margin:6px 0 0">Lieber zuschauen?</h2>
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
        'totalTime': f'PT{a["minuten"]}M', 'dateModified': STAND,
        'tool': [{'@type': 'HowToTool', 'name': n} for n, _ in a['werkzeug']],
        'step': [
            {'@type': 'HowToStep', 'position': i + 1, 'name': t, 'text': x, 'url': f'{SEITE}{pfad}#schritt-{i + 1}'}
            for i, (t, x) in enumerate(a['schritte'])
        ],
        'publisher': {'@type': 'Organization', 'name': 'Radgarage', 'url': SEITE + '/'},
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
    out.append(f'''    <section class="t s1 schritte" aria-labelledby="schritte-titel">
      <span class="eyebrow">Schritt für Schritt</span>
      <h2 id="schritte-titel" style="font-size:30px;margin:6px 0 0">So geht's</h2>
      <ol class="steps">{schritte}</ol>
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
  <p class="hinweis">Diese Anleitung ersetzt nicht die Anleitung des Herstellers. Drehmomente und Verschleißgrenzen deiner Teile stehen dort oder auf dem Bauteil. Arbeiten an Bremsen und Lenkung sind sicherheitsrelevant: Wenn du unsicher bist, lass sie von einer Fachwerkstatt machen. Stand: Oktober 2026.</p>
  </main>
''')
    if a['video']:
        out.append('<script src="/anleitungen/video.js?v=1" defer></script>\n')
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
    beschr = 'Fahrrad selbst warten: Kette, Bremsbeläge, Kassette, Reifen und mehr wechseln. Kurze Anleitungen mit Werkzeug, Dauer und Werkstattpreis.'
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


def sitemap(alle):
    pfade = [('/', '1.0'), ('/anleitungen/', '0.8')] + [(f'/anleitungen/{a["slug"]}/', '0.7') for a in alle] + [
        ('/datenschutz.html', '0.2'), ('/impressum.html', '0.2'), ('/konto-loeschen.html', '0.2')]
    zeilen = ''.join(f'  <url><loc>{SEITE}{p}</loc><lastmod>{STAND}</lastmod><priority>{pr}</priority></url>\n' for p, pr in pfade)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{zeilen}</urlset>\n'


def schreiben(pfad, text):
    voll = os.path.join(WURZEL, pfad)
    os.makedirs(os.path.dirname(voll), exist_ok=True)
    with open(voll, 'w', encoding='utf-8') as f:
        f.write(text)


if __name__ == '__main__':
    basis = open(os.path.join(WURZEL, '_quellen/basis.css'), encoding='utf-8').read()
    extra = open(os.path.join(WURZEL, '_quellen/anleitungen-extra.css'), encoding='utf-8').read()
    schreiben('anleitungen/anleitungen.css', basis + '\n' + extra)
    schreiben('anleitungen/index.html', uebersicht(ANLEITUNGEN))
    for a in ANLEITUNGEN:
        schreiben(f'anleitungen/{a["slug"]}/index.html', anleitung_seite(a, ANLEITUNGEN))
    schreiben('sitemap.xml', sitemap(ANLEITUNGEN))
    print(f'{len(ANLEITUNGEN)} Anleitungen gebaut.')
