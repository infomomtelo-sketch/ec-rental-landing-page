/* Short how-to videos inside the dashboard. Any element with data-help-video="key" becomes a "Watch" button,
   and #helpVideos gets a row of video cards. Videos open in a player; phones get the vertical version. */
(function () {
  var VIDEOS = {
    start: { title: 'Getting started in 5 steps', len: '54 sec', file: 'guide-getting-started' },
    tello: { title: 'A day with Tello', len: '57 sec', file: 'tello-day' },
    tax: { title: 'How Tax Reports work', len: '48 sec', file: 'guide-tax-reports' },
    inspect: { title: 'How AI inspections work', len: '39 sec', file: 'guide-ai-inspections' }
  };
  var PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var css = document.createElement('style');
  css.textContent = '.hv-btn{display:inline-flex;align-items:center;gap:0.4rem;background:#fff;color:#123a30;border:1.5px solid #123a30;border-radius:999px;padding:0.45rem 0.9rem;font:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;margin-top:0.6rem}'
    + '.hv-btn:hover{background:#123a30;color:#fff}'
    + '.hv-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:0.75rem;margin-bottom:1.5rem;max-width:760px}'
    + '.hv-card{position:relative;border:none;padding:0;border-radius:12px;overflow:hidden;cursor:pointer;background:#123a30;text-align:left;font:inherit;aspect-ratio:16/10}'
    + '.hv-card img{width:100%;height:100%;object-fit:cover;display:block;opacity:0.85}'
    + '.hv-card span{position:absolute;left:0;right:0;bottom:0;padding:0.5rem 0.65rem;background:linear-gradient(transparent,rgba(0,0,0,0.75));color:#fff;font-size:0.82rem;font-weight:600;line-height:1.25}'
    + '.hv-card span small{display:block;font-weight:400;opacity:0.8}'
    + '.hv-card i{position:absolute;top:0.5rem;left:0.5rem;width:30px;height:30px;border-radius:50%;background:#e8a23d;color:#123a30;display:flex;align-items:center;justify-content:center}'
    + '.hv-title{font-size:0.8rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;margin:0 0 0.5rem}'
    + '.hv-back{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:1rem}'
    + '.hv-back video{max-width:min(100%,1100px);max-height:calc(100vh - 5rem);border-radius:12px;background:#000}'
    + '.hv-close{position:fixed;top:0.75rem;right:0.75rem;width:44px;height:44px;border-radius:50%;border:none;background:#fff;color:#123a30;font-size:1.6rem;line-height:1;cursor:pointer}';
  document.head.appendChild(css);
  var phone = function () { return window.matchMedia('(max-width: 768px)').matches; };
  function src(v) { return '/media/' + v.file + (phone() ? '-vertical' : '') + '.mp4'; }
  function open(key) {
    var v = VIDEOS[key]; if (!v) return;
    var back = document.createElement('div'); back.className = 'hv-back'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-label', v.title);
    back.innerHTML = '<button type="button" class="hv-close" aria-label="Close video">&times;</button><video controls autoplay playsinline poster="/media/' + v.file + '-poster.jpg"></video>';
    var video = back.querySelector('video'); video.src = src(v);
    function close() { video.pause(); back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('.hv-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
  }
  function init() {
    document.querySelectorAll('[data-help-video]').forEach(function (el) {
      var v = VIDEOS[el.getAttribute('data-help-video')]; if (!v || el.dataset.ready) return; el.dataset.ready = '1';
      el.innerHTML = '<button type="button" class="hv-btn">' + PLAY + ' Watch: ' + v.title + ' (' + v.len + ')</button>';
      el.querySelector('button').addEventListener('click', function () { open(el.getAttribute('data-help-video')); });
    });
    var row = document.getElementById('helpVideos');
    if (row && !row.dataset.ready) {
      row.dataset.ready = '1';
      row.innerHTML = '<p class="hv-title">How-to videos</p><div class="hv-row">' + ['start', 'tello', 'tax', 'inspect'].map(function (k) {
        var v = VIDEOS[k]; return '<button type="button" class="hv-card" data-key="' + k + '"><img src="/media/' + v.file + '-poster.jpg" alt="" loading="lazy" /><i>' + PLAY + '</i><span>' + v.title + '<small>' + v.len + '</small></span></button>';
      }).join('') + '</div>';
      row.querySelectorAll('.hv-card').forEach(function (b) { b.addEventListener('click', function () { open(b.getAttribute('data-key')); }); });
    }
  }
  window.ECHelpVideo = { open: open, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
