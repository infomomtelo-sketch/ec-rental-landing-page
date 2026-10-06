// Home page motion: scroll reveals, scroll progress bar and the 3D Tello card fan.
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bar = document.getElementById('scrollProgress');
  var fan = document.getElementById('fan');

  if (!reduce && 'IntersectionObserver' in window) {
    var groups = ['.services-grid', '.pricing-cards', '.contact-grid', '.about-content', '.tello-inner'];
    groups.forEach(function (sel) {
      var parent = document.querySelector(sel);
      if (!parent) return;
      Array.prototype.forEach.call(parent.children, function (el, i) {
        el.setAttribute('data-reveal', '');
        el.style.setProperty('--d', Math.min(i, 6) * 90 + 'ms');
      });
    });
    document.querySelectorAll('.section-title, .tax-table-wrap, .launch-bonus, .stats').forEach(function (el) {
      el.setAttribute('data-reveal', '');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      // Anything already on screen shows right away instead of waiting for a scroll.
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.94 && r.bottom > 0) el.classList.add('in');
      else io.observe(el);
    });
    root.classList.add('motion-ready');
  }

  var ticking = false;
  function update() {
    ticking = false;
    var max = root.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    if (fan && !reduce) {
      var r = fan.getBoundingClientRect();
      // 0 while the fan sits at the bottom of the screen, 1 once it reaches the upper third.
      var p = (window.innerHeight - r.top) / (window.innerHeight * 0.7);
      fan.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
    }
  }
  function onScroll() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
