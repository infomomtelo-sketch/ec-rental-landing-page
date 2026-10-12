/* Short how-to videos inside the dashboard. Any element with data-help-video="key" becomes a "Watch" button,
   and #helpVideos gets a row of video cards. Videos open in a player; phones get the vertical version. */
(function () {
  var VIDEOS = {
    start: { title: 'Getting started in 5 steps', len: '54 sec', file: 'guide-getting-started' },
    tello: { title: 'A day with Tello', len: '57 sec', file: 'tello-day' },
    tax: { title: 'How Tax Reports work', len: '48 sec', file: 'guide-tax-reports' },
    inspect: { title: 'How AI inspections work', len: '39 sec', file: 'guide-ai-inspections' },
    intro: { title: 'Meet Tello', len: '56 sec', file: 'intro' },
    story: { title: 'The 1-minute story', len: '63 sec', file: 'story', wideOnly: true },
    maint: { title: 'Maintenance with Tello', len: '44 sec', file: 'maintenance', wideOnly: true },
    insp: { title: 'Rental inspections', len: '48 sec', file: 'inspections', wideOnly: true }
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
    + '.hv-back{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:1rem}'
    + '.hv-back video{max-width:min(100%,1100px);max-height:calc(100vh - 5rem);border-radius:12px;background:#000}'
    + '.hv-offer{font-size:0.9rem;color:#4b5563;margin:-0.75rem 0 1.5rem;max-width:760px}'
    + '.hv-offer a{color:#123a30;font-weight:700}'
    + '.vr-form{position:relative;background:#fff;color:#13261f;border-radius:16px;padding:1.5rem;width:min(100%,560px);max-height:calc(100vh - 2rem);overflow:auto;display:flex;flex-direction:column;gap:0.75rem;text-align:left;font-size:0.95rem}'
    + '.vr-form h2{margin:0;font-size:1.35rem;color:#123a30}.vr-brand{margin:0;font-weight:800;letter-spacing:0.04em;color:#b07a1a;font-size:0.85rem}.vr-sub{margin:0;color:#4b5563;line-height:1.45}'
    + '.vr-form label{display:flex;flex-direction:column;gap:0.3rem;font-weight:600;font-size:0.85rem;color:#123a30}'
    + '.vr-form input,.vr-form select,.vr-form textarea{font:inherit;font-weight:400;font-size:1rem;padding:0.6rem 0.7rem;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;color:#13261f;width:100%;box-sizing:border-box}'
    + '.vr-two{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem}@media(max-width:560px){.vr-two{grid-template-columns:1fr}}'
    + '.vr-err{margin:0;color:#b91c1c;font-weight:600}.vr-send{background:#123a30;color:#fff;border:none;border-radius:999px;padding:0.8rem 1.2rem;font:inherit;font-weight:700;cursor:pointer}.vr-send:disabled{opacity:0.6}'
    + '.hv-close{position:fixed;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,.3);top:0.75rem;right:0.75rem;width:44px;height:44px;border-radius:50%;border:none;background:#fff;color:#123a30;font-size:1.6rem;line-height:1;cursor:pointer}';
  document.head.appendChild(css);
  var phone = function () { return window.matchMedia('(max-width: 768px)').matches; };
  function src(v) { return '/media/' + v.file + (phone() && !v.wideOnly ? '-vertical' : '') + '.mp4'; }
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
  // "Want a video like Tello's?" line. The Tello link plays the Tello video; Contact us opens the request form.
  function OFFER() {
    return '<p class="hv-offer">Want a marketing video like <a href="/media/tello-day.mp4" data-play-video="tello">Tello\'s</a> for your own site or app? Get one from <a href="/videos">ownsite.app</a>. <a href="mailto:info@ecrentalpm.com?subject=ownsite.app%20video" data-video-request>Contact us</a></p>';
  }
  var TYPES = ['Promo / story video', 'How-to / product guide', 'App or website demo', 'Social media clips', 'Other'];
  var BUDGETS = ['Under $500', '$500 to $1,500', '$1,500 to $5,000', 'Over $5,000', 'Not sure yet'];
  function opts(list, first) { return (first ? '<option value="">' + first + '</option>' : '') + list.map(function (t) { return '<option>' + t + '</option>'; }).join(''); }
  function requestForm() {
    var back = document.createElement('div'); back.className = 'hv-back'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-label', 'Request a marketing video');
    back.innerHTML = '<button type="button" class="hv-close" aria-label="Close">&times;</button><form class="vr-form" novalidate>'
      + '<p class="vr-brand">ownsite.app</p><h2>Request a marketing video</h2><p class="vr-sub">Like the Tello video: a short story about your business, with voice, music and captions. Tell us what you need and we will get back to you within 1 business day.</p>'
      + '<div class="vr-two"><label>Your name *<input name="name" required autocomplete="name" /></label><label>Email *<input name="email" type="email" required autocomplete="email" /></label></div>'
      + '<div class="vr-two"><label>Phone<input name="phone" type="tel" autocomplete="tel" /></label><label>Business or app name *<input name="business" required autocomplete="organization" /></label></div>'
      + '<label>Website or app link<input name="site_url" placeholder="yoursite.com" /></label>'
      + '<div class="vr-two"><label>Kind of video *<select name="video_type" required>' + opts(TYPES, 'Pick one') + '</select></label><label>Budget<select name="budget">' + opts(BUDGETS, 'Pick one (optional)') + '</select></label></div>'
      + '<label>Needed by<input name="deadline" placeholder="e.g. end of November" /></label>'
      + '<label>What should the video show? *<textarea name="details" rows="4" required placeholder="Who it is for, what your product does, and where you will post it."></textarea></label>'
      + '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px" />'
      + '<p class="vr-err" role="alert" hidden></p><button type="submit" class="vr-send">Send request</button></form>';
    var form = back.querySelector('form'), err = back.querySelector('.vr-err');
    function close() { back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('.hv-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var data = {}; new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); }); data.page = location.pathname;
      if (!data.name || !/^\S+@\S+\.\S+$/.test(data.email) || !data.business || !data.video_type || data.details.length < 10) { err.textContent = 'Please fill in the fields marked *, and tell us a little about the video.'; err.hidden = false; return; }
      var btn = form.querySelector('.vr-send'); btn.disabled = true; btn.textContent = 'Sending...';
      fetch('/api/public/video-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.j.success) throw new Error(res.j.error || 'Something went wrong.');
          form.innerHTML = '<p class="vr-brand">ownsite.app</p><h2>Thank you, we got it.</h2><p class="vr-sub">We will email you at ' + data.email.replace(/[<>&"]/g, '') + ' within 1 business day. Questions sooner? Email info@ecrentalpm.com.</p><button type="button" class="vr-send">Close</button>';
          form.querySelector('button').addEventListener('click', close);
        })
        .catch(function (x) { err.textContent = x.message || 'Something went wrong. Please email info@ecrentalpm.com.'; err.hidden = false; btn.disabled = false; btn.textContent = 'Send request'; });
    });
    document.body.appendChild(back); form.querySelector('input').focus();
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var a = e.target.closest('[data-play-video]');
    if (a && VIDEOS[a.getAttribute('data-play-video')]) { e.preventDefault(); open(a.getAttribute('data-play-video')); return; }
    if (e.target.closest('[data-video-request]')) { e.preventDefault(); requestForm(); }
  });
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
      }).join('') + '</div>' + OFFER();
      row.querySelectorAll('.hv-card').forEach(function (b) { b.addEventListener('click', function () { open(b.getAttribute('data-key')); }); });
    }
  }
  window.ECHelpVideo = { open: open, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
