// Zwei-Klick-Video: Erst nach dem Klick lädt der Browser etwas von YouTube (youtube-nocookie.com).
document.querySelectorAll('.player[data-video]').forEach(function (box) {
  var knopf = box.querySelector('button');
  if (!knopf) return;
  knopf.addEventListener('click', function () {
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(box.dataset.video) + '?autoplay=1&rel=0'
      + (box.dataset.start ? '&start=' + encodeURIComponent(box.dataset.start) : '');
    f.title = box.dataset.titel || 'Video';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.allowFullscreen = true;
    box.innerHTML = '';
    box.appendChild(f);
  });
});
