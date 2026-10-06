// Home page navigation (mobile menu, active section, back to top) and the hero effects.
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var header = document.getElementById('siteHeader');
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('mnav');
  var backdrop = document.getElementById('mnavBackdrop');
  var links = document.getElementById('navLinks');
  var ink = links && links.querySelector('.nav-ink');
  var toTop = document.getElementById('toTop');

  // Mobile menu
  function setMenu(open) {
    if (!menu) return;
    menu.hidden = !open;
    backdrop.hidden = !open;
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) {
      Array.prototype.forEach.call(menu.querySelectorAll('.mnav-item'), function (el, i) { el.style.animationDelay = i * 35 + 'ms'; });
    }
  }
  if (toggle) toggle.addEventListener('click', function () { setMenu(menu.hidden); });
  if (backdrop) backdrop.addEventListener('click', function () { setMenu(false); });
  if (menu) menu.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    setMenu(false);
    if (a.classList.contains('mnav-cta')) {
      // Same as the header Sign Up button: open the sign-up form.
      var cta = document.querySelector('.nav-cta');
      if (cta) { e.preventDefault(); cta.click(); }
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu && !menu.hidden) { setMenu(false); toggle.focus(); } });
  window.addEventListener('resize', function () { if (window.innerWidth > 900 && menu && !menu.hidden) setMenu(false); });

  // Active section: highlight the matching link and slide the underline to it.
  var ids = ['tello', 'services', 'tax-reporting', 'subscribe', 'about', 'contact'];
  var sections = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var current = null;
  function moveInk(a) {
    if (!ink) return;
    if (!a) { ink.style.opacity = '0'; return; }
    ink.style.width = a.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    ink.style.opacity = '1';
  }
  function setActive(id) {
    if (id === current) return;
    current = id;
    document.querySelectorAll('.nav-links a, .mnav-item').forEach(function (a) {
      a.classList.toggle('active', !!id && a.getAttribute('href') === '#' + id);
    });
    moveInk(id && links ? links.querySelector('a[href="#' + id + '"]') : null);
  }
  function spy() {
    var line = window.innerHeight * 0.35;
    var found = null;
    sections.forEach(function (s) {
      var r = s.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) found = s.id;
    });
    setActive(found);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;
      if (header) header.classList.toggle('scrolled', y > 10);
      if (toTop) toTop.classList.toggle('show', y > window.innerHeight * 1.2);
      spy();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { var c = current; current = null; setActive(c); onScroll(); });
  onScroll();

  // Count the stats up the first time they come into view.
  var counters = document.querySelectorAll('[data-count]');
  if (!reduce && counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        var el = e.target, end = +el.getAttribute('data-count'), t0 = null;
        function step(t) {
          if (t0 === null) t0 = t;
          var k = Math.min(1, (t - t0) / 1200);
          el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
          if (k < 1) window.requestAnimationFrame(step);
        }
        el.textContent = '0';
        window.requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  // Hero: a soft network of points that drifts and links up around the cursor or finger.
  var hero = document.querySelector('.hero');
  var canvas = document.getElementById('heroNet');
  var fx = hero && hero.querySelector('.hero-fx');
  var spot = document.getElementById('heroSpot');
  if (reduce || !hero || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, pts = [], pointer = { x: -9999, y: -9999, on: false }, visible = true, raf = null;

  function size() {
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(Math.min(90, Math.max(28, W * H / 16000)));
    pts = [];
    for (var i = 0; i < n; i++) {
      pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: Math.random() * 1.6 + 0.8, g: Math.random() < 0.22 });
    }
  }
  function frame() {
    raf = null;
    if (!visible) return;
    ctx.clearRect(0, 0, W, H);
    var link = Math.min(140, W / 7), i, j, p, q, dx, dy, d;
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      if (pointer.on) {
        dx = pointer.x - p.x; dy = pointer.y - p.y; d = Math.sqrt(dx * dx + dy * dy);
        if (d < 180 && d > 1) { p.vx += dx / d * 0.012; p.vy += dy / d * 0.012; }
      }
      p.vx *= 0.99; p.vy *= 0.99;
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (sp < 0.12) { p.vx += (Math.random() - 0.5) * 0.04; p.vy += (Math.random() - 0.5) * 0.04; }
      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
    }
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      for (j = i + 1; j < pts.length; j++) {
        q = pts[j]; dx = p.x - q.x; dy = p.y - q.y; d = dx * dx + dy * dy;
        if (d < link * link) {
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.16 * (1 - Math.sqrt(d) / link)).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      if (pointer.on) {
        dx = p.x - pointer.x; dy = p.y - pointer.y; d = Math.sqrt(dx * dx + dy * dy);
        if (d < 170) {
          ctx.strokeStyle = 'rgba(232,201,90,' + (0.5 * (1 - d / 170)).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
        }
      }
      ctx.fillStyle = p.g ? 'rgba(232,201,90,0.9)' : 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    raf = window.requestAnimationFrame(frame);
  }
  function kick() { if (!raf && visible) raf = window.requestAnimationFrame(frame); }
  function point(e) {
    var r = hero.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    if (!t) return;
    pointer.x = t.clientX - r.left; pointer.y = t.clientY - r.top; pointer.on = true;
    if (spot) { spot.style.left = pointer.x + 'px'; spot.style.top = pointer.y + 'px'; }
    if (fx) fx.classList.add('live');
  }
  function leave() { pointer.on = false; if (fx) fx.classList.remove('live'); }
  hero.addEventListener('pointermove', point, { passive: true });
  hero.addEventListener('touchmove', point, { passive: true });
  hero.addEventListener('pointerleave', leave);
  hero.addEventListener('touchend', leave);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; kick(); }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { visible = !document.hidden; kick(); });
  var rt;
  // Phones fire resize when the address bar hides, so only rebuild when the hero really changes size.
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (Math.abs(hero.clientWidth - W) > 2 || Math.abs(hero.clientHeight - H) > 80) size(); }, 150); });
  size();
  kick();
})();
