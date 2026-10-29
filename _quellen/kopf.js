// Burger-Menü im Kopf: klappt bis 900 px Breite Hauptmenü und Knopf auf. Die Lupe schließt das Menü und umgekehrt.
(function () {
  var kopf = document.querySelector('header');
  var knopf = kopf && kopf.querySelector('.burger');
  var menue = document.getElementById('kopfmenue');
  if (!knopf || !menue) return;
  var suche = kopf.querySelector('.kopfsuche');

  function setzen(auf) {
    kopf.classList.toggle('offen', auf);
    knopf.setAttribute('aria-expanded', auf ? 'true' : 'false');
    knopf.setAttribute('aria-label', auf ? 'Menü schließen' : 'Menü öffnen');
    if (auf && suche) suche.open = false;
  }
  function offen() { return kopf.classList.contains('offen'); }

  knopf.addEventListener('click', function () { setzen(!offen()); });
  if (suche) suche.addEventListener('toggle', function () { if (suche.open) setzen(false); });
  menue.addEventListener('click', function (e) { if (e.target.closest('a')) setzen(false); });
  document.addEventListener('click', function (e) { if (offen() && !kopf.contains(e.target)) setzen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && offen()) { setzen(false); knopf.focus(); }
  });
  var breit = window.matchMedia('(min-width: 901px)');
  var wechsel = function () { if (breit.matches) setzen(false); };
  if (breit.addEventListener) breit.addEventListener('change', wechsel); else breit.addListener(wechsel);
})();
