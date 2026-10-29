// Suche nach Rädern und Teilen. Lädt /suche.json beim ersten Tippen und sucht dann nur im Browser:
// Eingaben verlassen das Gerät nicht. Quelle: _quellen/suche.js, gebaut von bauen.py nach /js/suche.js.
(function () {
  if (window.radgarageSuche) return;
  window.radgarageSuche = true;

  var daten = null, laden = null;
  function holen() {
    if (!laden) {
      laden = fetch('/suche.json').then(function (r) {
        if (!r.ok) throw new Error('Suche nicht erreichbar');
        return r.json();
      }).then(function (d) {
        daten = {
          r: d.r.map(function (x) { return { name: x[0], jahr: x[1], art: x[2], url: x[3], text: norm(x[0] + ' ' + x[1] + ' ' + x[2]) + ' ' + x[4] }; }),
          t: d.t.map(function (x) { return { name: x[0], art: x[1], url: '/teile/' + x[2] + '/', text: norm(x[0] + ' ' + x[1]) + ' ' + norm(x[2]) }; })
        };
        return daten;
      });
      laden.catch(function () { laden = null; });
    }
    return laden;
  }

  function norm(s) {
    return String(s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[éè]/g, 'e')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Jedes Suchwort muss vorkommen. Treffer am Wortanfang zählen mehr, bei Rädern neuere Jahrgänge zuerst.
  function wertung(text, woerter) {
    var punkte = 0;
    for (var i = 0; i < woerter.length; i++) {
      var w = woerter[i], pos = text.indexOf(w);
      if (pos < 0) {
        // „cnm8100“ soll auch „cn m8100“ finden
        if (text.replace(/ /g, '').indexOf(w) < 0) return -1;
        punkte += 1;
        continue;
      }
      punkte += (pos === 0 || text.charAt(pos - 1) === ' ') ? 3 : 1;
    }
    return punkte;
  }

  function suchen(liste, woerter, anzahl, istRad) {
    var treffer = [];
    for (var i = 0; i < liste.length; i++) {
      var p = wertung(liste[i].text, woerter);
      if (p >= 0) treffer.push({ e: liste[i], p: p });
    }
    treffer.sort(function (a, b) {
      return b.p - a.p || (istRad ? b.e.jahr - a.e.jahr : 0) || a.e.name.localeCompare(b.e.name, 'de');
    });
    return treffer.slice(0, anzahl).map(function (t) { return t.e; });
  }

  function einrichten(form) {
    var art = form.getAttribute('data-art');
    var feld = form.querySelector('input');
    var liste = form.querySelector('.treffer');
    var info = form.querySelector('.suche-info');
    var aktiv = -1, eintraege = [];

    function schliessen() {
      liste.hidden = true;
      feld.setAttribute('aria-expanded', 'false');
      feld.removeAttribute('aria-activedescendant');
      aktiv = -1;
    }

    function markieren(i) {
      var el = liste.querySelectorAll('[role=option]');
      if (aktiv >= 0 && el[aktiv]) el[aktiv].removeAttribute('aria-selected');
      aktiv = i;
      if (aktiv >= 0 && el[aktiv]) {
        el[aktiv].setAttribute('aria-selected', 'true');
        feld.setAttribute('aria-activedescendant', el[aktiv].id);
        el[aktiv].scrollIntoView({ block: 'nearest' });
      }
    }

    function zeigen() {
      var woerter = norm(feld.value).split(' ').filter(Boolean);
      if (!woerter.length) { schliessen(); info.textContent = ''; return; }
      if (!daten) {
        info.textContent = 'Suche wird geladen …';
        holen().then(zeigen, function () { info.textContent = 'Die Suche ist gerade nicht erreichbar. Versuch es gleich noch einmal.'; });
        return;
      }
      var r = art === 'teile' ? [] : suchen(daten.r, woerter, art === 'alles' ? 6 : 8, true);
      var t = art === 'raeder' ? [] : suchen(daten.t, woerter, art === 'alles' ? 4 : 8, false);
      eintraege = r.map(function (x) { return { url: x.url, titel: x.name + ' (' + x.jahr + ')', zusatz: x.art }; })
        .concat(t.map(function (x) { return { url: x.url, titel: x.name, zusatz: x.art }; }));
      liste.innerHTML = '';
      eintraege.forEach(function (x, i) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.id = feld.id + '-' + i;
        var a = document.createElement('a');
        a.href = x.url;
        a.tabIndex = -1;
        var b = document.createElement('b');
        b.textContent = x.titel;
        var s = document.createElement('span');
        s.textContent = x.zusatz;
        a.appendChild(b);
        a.appendChild(s);
        li.appendChild(a);
        liste.appendChild(li);
      });
      if (!eintraege.length) {
        var leer = document.createElement('li');
        leer.className = 'leer';
        leer.innerHTML = 'Nichts gefunden. Fehlt dein Rad? <a href="/feedback/">Sag uns Bescheid</a>.';
        liste.appendChild(leer);
      }
      liste.hidden = false;
      feld.setAttribute('aria-expanded', 'true');
      aktiv = -1;
      info.textContent = eintraege.length ? eintraege.length + ' Vorschläge' : 'Keine Treffer';
    }

    feld.addEventListener('focus', function () { holen(); });
    feld.addEventListener('input', zeigen);
    feld.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' && eintraege.length) { ev.preventDefault(); if (liste.hidden) zeigen(); markieren(Math.min(aktiv + 1, eintraege.length - 1)); }
      else if (ev.key === 'ArrowUp' && eintraege.length) { ev.preventDefault(); markieren(Math.max(aktiv - 1, 0)); }
      else if (ev.key === 'Escape') { schliessen(); }
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var ziel = eintraege[aktiv >= 0 ? aktiv : 0];
      if (ziel && !liste.hidden) location.href = ziel.url;
      else zeigen();
    });
    document.addEventListener('click', function (ev) { if (!form.contains(ev.target)) schliessen(); });
  }

  // Lupe im Kopf: beim Öffnen gleich ins Feld, Escape oder Klick daneben schließt wieder
  function kopfsuche(d) {
    d.addEventListener('toggle', function () {
      if (d.open) { var f = d.querySelector('input'); if (f) f.focus(); }
    });
    d.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && d.open) { d.open = false; d.querySelector('summary').focus(); }
    });
    document.addEventListener('click', function (ev) { if (d.open && !d.contains(ev.target)) d.open = false; });
  }

  function start() {
    document.querySelectorAll('form.suche').forEach(einrichten);
    document.querySelectorAll('details.kopfsuche').forEach(kopfsuche);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
