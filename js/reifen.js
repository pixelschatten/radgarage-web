// Reifengrößen-Rechner auf /reifengroessen/: liest Angaben wie „28 x 1.75“, „700 x 32C“ oder „55-622“ und zeigt
// die ETRTO-Größe, passende Schläuche aus dem Katalog und wie viele Räder diese Größe haben.
// Rechnet nur im Browser, speichert nichts. Quelle: _quellen/reifen.js, gebaut nach /js/reifen.js.
(function () {
  var form = document.querySelector('.reifen-rechner');
  if (!form) return;
  var d = JSON.parse(form.getAttribute('data-daten'));
  var feld = form.querySelector('input');
  var aus = form.querySelector('.ergebnis');
  var ZOLL = { '29': 622, '28': 622, '700': 622, '27.5': 584, '650b': 584, '26': 559, '24': 507, '20': 406, '16': 305 };

  function lesen(text) {
    var s = text.toLowerCase().replace(/,/g, '.').replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
    var m = s.match(/(\d{2})\s*-\s*(\d{3})/);
    if (m && d.felgen[m[2]]) return { b: +m[1], f: +m[2], ca: false };
    m = s.match(/700\s*x\s*(\d{2})\s*c?/);
    if (m) return { b: +m[1], f: 622, ca: false };
    m = s.match(/(29|28|27\.5|26|24|20|16|650b)\s*(?:zoll|")?\s*x\s*(\d(?:\.\d{1,3})?)/);
    if (m) {
      var breite = parseFloat(m[2]);
      // „28 x 1 3/8“ und ähnliche Bruchangaben sind nicht eindeutig, deshalb nur Dezimalzahlen
      return { b: Math.round(breite * 25.4), f: ZOLL[m[1]], ca: true };
    }
    return null;
  }

  function el(tag, text) { var x = document.createElement(tag); if (text) x.textContent = text; return x; }

  function zeigen() {
    aus.textContent = '';
    var g = lesen(feld.value);
    if (!g) {
      aus.appendChild(el('p', 'Das kann ich nicht lesen. Probier es mit einer Angabe wie 28 x 1.75, 700 x 32C oder 55-622.'));
      return;
    }
    var etrto = g.b + '-' + g.f;
    var kopf = el('p');
    var b = el('b', (g.ca ? 'ca. ' : '') + etrto);
    kopf.appendChild(b);
    kopf.appendChild(document.createTextNode(' nach ETRTO: ' + (g.ca ? 'etwa ' : '') + g.b + ' mm breit, Felge ' + g.f + ' mm, im Laden meist ' + (d.felgen[g.f] || g.f + ' mm') + '.'));
    aus.appendChild(kopf);
    var zahl = d.groessen[etrto];
    if (zahl) aus.appendChild(el('p', zahl + (zahl === 1 ? ' Rad' : ' Räder') + ' im Katalog haben ab Werk diese Größe.'));
    var passend = d.schlaeuche.filter(function (s) { return s.felge === g.f && g.b >= s.von && g.b <= s.bis; });
    if (passend.length) {
      var p = el('p', 'Passende Schläuche: ');
      passend.forEach(function (s, i) {
        if (i) p.appendChild(document.createTextNode(', '));
        var a = el('a', s.name); a.href = s.url; p.appendChild(a);
      });
      p.appendChild(document.createTextNode('. Ventil und Ventillänge am Rad prüfen.'));
      aus.appendChild(p);
    }
  }
  form.addEventListener('submit', function (ev) { ev.preventDefault(); zeigen(); });
  feld.addEventListener('input', zeigen);
  zeigen();
})();
