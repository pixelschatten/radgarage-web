// Rad-Finder auf /raeder/: Marke, Modell und Jahr auswählen und direkt zur Radseite springen.
// Lädt /suche.json erst nach der Wahl der Marke und sucht nur im Browser. Quelle: _quellen/finder.js.
(function () {
  var form = document.querySelector('.finder');
  if (!form) return;
  var marke = form.querySelector('[name=marke]'), modell = form.querySelector('[name=modell]'),
      jahr = form.querySelector('[name=jahr]'), knopf = form.querySelector('button');
  var raeder = null, laden = null;
  function holen() {
    if (!laden) {
      laden = fetch('/suche.json').then(function (r) { return r.json(); }).then(function (d) {
        raeder = d.r.map(function (x) { return { name: x[0], jahr: x[1], url: x[3] }; });
        return raeder;
      });
      laden.catch(function () { laden = null; });
    }
    return laden;
  }
  function optionen(sel, liste, leer) {
    sel.textContent = '';
    var o = document.createElement('option'); o.value = ''; o.textContent = leer; sel.appendChild(o);
    liste.forEach(function (x) { var p = document.createElement('option'); p.value = x[0]; p.textContent = x[1]; sel.appendChild(p); });
    sel.disabled = !liste.length;
  }
  function vonMarke() {
    var m = marke.value, name = marke.options[marke.selectedIndex].text;
    return (raeder || []).filter(function (r) { return r.url.indexOf('/raeder/' + m + '/') === 0; })
      .map(function (r) { return { modell: r.name.indexOf(name + ' ') === 0 ? r.name.slice(name.length + 1) : r.name, jahr: r.jahr, url: r.url }; });
  }
  marke.addEventListener('change', function () {
    optionen(modell, [], 'Modell'); optionen(jahr, [], 'Jahr'); knopf.disabled = true;
    if (!marke.value) return;
    holen().then(function () {
      var namen = {};
      vonMarke().forEach(function (r) { namen[r.modell] = 1; });
      optionen(modell, Object.keys(namen).sort(function (a, b) { return a.localeCompare(b, 'de'); }).map(function (n) { return [n, n]; }), 'Modell wählen');
    });
  });
  modell.addEventListener('change', function () {
    var jahre = vonMarke().filter(function (r) { return r.modell === modell.value; })
      .sort(function (a, b) { return b.jahr - a.jahr; }).map(function (r) { return [r.url, String(r.jahr)]; });
    optionen(jahr, jahre, 'Jahr wählen');
    if (jahre.length === 1) jahr.value = jahre[0][0];
    knopf.disabled = !jahr.value;
  });
  jahr.addEventListener('change', function () { knopf.disabled = !jahr.value; });
  form.addEventListener('submit', function (ev) { ev.preventDefault(); if (jahr.value) location.href = jahr.value; });
})();
