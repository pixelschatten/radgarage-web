# Radgarage

Landingpage mit Warteliste für die App Radgarage (https://radgarage.app).

Statische Seite für GitHub Pages: `index.html`, `danke.html` (nach Bestätigung der Anmeldung), Schrift Manrope selbst gehostet (`fonts/`, SIL Open Font License), Screens in `img/`.

`werkbank/`: nicht verlinkte Katalogpflege für freigeschaltete Konten (Tabelle `katalog_helfer` in Supabase), mit `noindex`. Anmeldung mit E-Mail-Code oder Passwort (im Tab „Konto“ setzbar) plus zweitem Faktor (TOTP), Sitzung nur im Tab (sessionStorage). Nutzt die Server-Funktionen aus `supabase/katalog-helfer.sql` im App-Repo (`helfer_rolle`, `katalog_rad_erfassen`, `katalog_offen`, `katalog_freigeben`, `helfer_liste`, `helfer_setzen`, `katalog_aehnliche`, `rad_details`, `katalog_rad_ergaenzen`, `katalog_ergaenzungen_offen`, `katalog_ergaenzung_freigeben`, `katalog_teil_anlegen`, `katalog_teil_ean`, `katalog_teil_ean_weg`), die Rolle und zweiten Faktor selbst prüfen. `werkbank/supabase.js` ist supabase-js 2.118.0 (UMD, MIT), lokal abgelegt statt über ein CDN.
