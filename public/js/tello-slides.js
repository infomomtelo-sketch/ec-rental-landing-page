/* Swipeable slide decks for tello.live pages. Markup: <div class="ts-deck" aria-label="..."><div class="ts-track">
   <article class="ts-slide">...</article>...</div></div>. Adds Previous / Next buttons and dots. Swipe, scroll or use the
   buttons; every slide stays in the page, so search engines and screen readers see all of it. */
(function () {
  if (window.__telloSlides) return; window.__telloSlides = 1;
  var css = document.createElement('style');
  css.textContent = ''
    + '.ts-deck{position:relative}'
    + '.ts-track{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:4px 2px 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch}'
    + '.ts-track::-webkit-scrollbar{display:none}'
    + '.ts-slide{flex:0 0 min(86%,360px);scroll-snap-align:start;border-radius:22px;padding:1.4rem 1.3rem;min-height:250px;display:flex;flex-direction:column;gap:.5rem;background:#fff;border:1px solid #e4dfd6}'
    + '.ts-bar{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-top:.5rem}'
    + '.ts-dots{display:flex;gap:6px;flex-wrap:wrap}.ts-dots button{width:10px;height:10px;padding:0;border-radius:50%;border:0;background:#d6d0c4;cursor:pointer}'
    + '.ts-dots button[aria-current="true"]{background:#16181b;width:22px;border-radius:6px}'
    + '.ts-nav{display:flex;gap:.4rem}.ts-nav button{width:44px;height:44px;border-radius:50%;border:1px solid #e4dfd6;background:#fff;color:#16181b;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}'
    + '.ts-nav button:disabled{opacity:.35;cursor:default}.ts-nav button:focus-visible,.ts-dots button:focus-visible{outline:2px solid #b88700;outline-offset:2px}'
    + '@media (prefers-reduced-motion:reduce){.ts-track{scroll-behavior:auto}}';
  document.head.appendChild(css);
  var ARROW = function (d) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };
  function setup(deck) {
    var track = deck.querySelector('.ts-track'), slides = [].slice.call(track.children);
    if (!slides.length) return;
    var label = deck.getAttribute('aria-label') || 'Slides';
    deck.setAttribute('role', 'region'); deck.setAttribute('aria-roledescription', 'carousel');
    slides.forEach(function (s, i) { s.setAttribute('role', 'group'); s.setAttribute('aria-roledescription', 'slide'); s.setAttribute('aria-label', (i + 1) + ' of ' + slides.length); });
    var bar = document.createElement('div'); bar.className = 'ts-bar';
    var dots = document.createElement('div'); dots.className = 'ts-dots';
    var nav = document.createElement('div'); nav.className = 'ts-nav';
    var prev = document.createElement('button'), next = document.createElement('button');
    prev.type = next.type = 'button'; prev.innerHTML = ARROW('m15 6-6 6 6 6'); next.innerHTML = ARROW('m9 6 6 6-6 6');
    prev.setAttribute('aria-label', 'Previous slide'); next.setAttribute('aria-label', 'Next slide');
    nav.appendChild(prev); nav.appendChild(next);
    var dotEls = slides.map(function (s, i) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label + ': slide ' + (i + 1));
      b.addEventListener('click', function () { go(i); }); dots.appendChild(b); return b;
    });
    bar.appendChild(dots); bar.appendChild(nav); deck.appendChild(bar);
    function current() {
      var x = track.scrollLeft, best = 0, d = Infinity;
      slides.forEach(function (s, i) { var dd = Math.abs(s.offsetLeft - track.offsetLeft - x); if (dd < d) { d = dd; best = i; } });
      return best;
    }
    function go(i) { i = Math.max(0, Math.min(slides.length - 1, i)); track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    function paint() {
      var i = current(), end = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      dotEls.forEach(function (b, j) { b.setAttribute('aria-current', String(j === i)); });
      prev.disabled = track.scrollLeft <= 4; next.disabled = end;
    }
    prev.addEventListener('click', function () { go(current() - 1); });
    next.addEventListener('click', function () { go(current() + 1); });
    var t = 0; track.addEventListener('scroll', function () { cancelAnimationFrame(t); t = requestAnimationFrame(paint); }, { passive: true });
    window.addEventListener('resize', paint);
    paint();
  }
  function init() { [].forEach.call(document.querySelectorAll('.ts-deck'), setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
