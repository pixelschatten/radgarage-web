// Verschleißrechner auf /verschleissrechner/: Wechselabstände und Teilekosten aus Kilometern und Fahrprofil.
// Rechnet nur im Browser, speichert nichts. Quelle: _quellen/verschleiss.js, gebaut nach /js/verschleiss.js.
(function () {
  var box = document.querySelector('.verschleiss-rechner');
  if (!box) return;
  var teile = JSON.parse(box.getAttribute('data-teile'));
  // Schätzfaktoren: wie stark E-Bike, Nässe und Gelände die Richtwerte verkürzen
  var FAKTOR = {
    ebike: { kette: 0.6, kassette: 0.6, belaege: 0.6, reifen: 0.8 },
    nass: { kette: 0.75, kassette: 0.8, belaege: 0.6, reifen: 1 },
    gelaende: { kette: 0.8, kassette: 0.8, belaege: 0.7, reifen: 0.8 }
  };
  var regler = box.querySelector('#vr-km');
  var kmWert = box.querySelector('.vr-km-wert');
  var summe = box.querySelector('.vr-summe b');
  function tsd(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function euro(n) { return tsd(n) + ' €'; }
  function zeit(monate) {
    if (monate >= 24) return 'etwa alle ' + tsd(monate / 12) + ' Jahre';
    if (monate >= 1.5) return 'etwa alle ' + Math.round(monate) + ' Monate';
    return 'mehrmals im Monat';
  }
  function rechnen() {
    var km = parseInt(regler.value, 10);
    kmWert.textContent = tsd(km) + ' km';
    var gesamt = 0;
    teile.forEach(function (t) {
      var f = 1;
      Object.keys(FAKTOR).forEach(function (k) {
        if (box.querySelector('input[name=' + k + ']').checked) f *= FAKTOR[k][t.k];
      });
      var abstand = Math.max(250, Math.round(t.km * f / 250) * 250);
      var proJahr = t.preis * km / abstand;
      gesamt += proJahr;
      var zeile = box.querySelector('tr[data-teil=' + t.k + ']');
      zeile.querySelector('.v-km').textContent = 'etwa alle ' + tsd(abstand) + ' km';
      zeile.querySelector('.v-zeit').textContent = zeit(abstand / km * 12);
      zeile.querySelector('.v-euro').textContent = euro(proJahr);
    });
    summe.textContent = euro(gesamt);
  }
  box.addEventListener('input', rechnen);
  box.addEventListener('change', rechnen);
  box.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); });
  rechnen();
})();
