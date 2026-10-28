// Unterhalt-Rechner auf den Radseiten: Teilekosten pro Jahr für die eingestellten Kilometer.
// Rechnet nur im Browser, speichert nichts. Quelle: _quellen/rechner.js, gebaut nach /raeder/rechner.js.
(function () {
  function tsd(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  document.querySelectorAll('.rechner').forEach(function (box) {
    var je1000 = parseFloat(box.getAttribute('data-je1000'));
    var regler = box.querySelector('input[type=range]');
    var km = box.querySelector('.rechner-km');
    var euro = box.querySelector('.rechner-euro');
    function rechnen() {
      var wert = parseInt(regler.value, 10);
      km.textContent = tsd(wert) + ' km';
      euro.textContent = tsd(je1000 * wert / 1000) + ' €';
    }
    regler.addEventListener('input', rechnen);
    rechnen();
  });
})();
