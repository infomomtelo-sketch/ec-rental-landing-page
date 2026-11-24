// Turnstile bot check for the public inquiry forms (homepage chat + signup).
// The site key comes from /api/public/turnstile-key; until Eli creates the Turnstile widget
// and sets TURNSTILE_SITE_KEY, no widget renders and forms submit exactly as before.
(function () {
  var siteKey = null, keyChecked = false;

  function fetchKey() {
    if (keyChecked) return Promise.resolve(!!siteKey);
    keyChecked = true;
    return fetch('/api/public/turnstile-key').then(function (r) { return r.json(); }).then(function (d) { siteKey = d.siteKey || null; return !!siteKey; }).catch(function () { return false; });
  }

  function loadScript() {
    return new Promise(function (resolve) {
      if (window.turnstile) return resolve(true);
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true; s.defer = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  // Renders the widget into el (a [data-turnstile-slot] element). No-op when not configured.
  window.ECRenderTurnstile = function (el) {
    if (!el || el.getAttribute('data-turnstile-done')) return;
    fetchKey().then(function (ok) {
      if (!ok) return;
      loadScript().then(function (loaded) {
        if (!loaded || !window.turnstile) return;
        el.setAttribute('data-turnstile-done', '1');
        try { el._turnstileWidget = window.turnstile.render(el, { sitekey: siteKey }); } catch (e) { /* widget is optional */ }
      });
    });
  };

  // Current token for the form being submitted, or '' when no widget is active.
  window.ECTurnstileToken = function (form) {
    try {
      var slot = form ? form.querySelector('[data-turnstile-slot]') : null;
      if (!slot || slot._turnstileWidget === undefined || !window.turnstile) return '';
      return window.turnstile.getResponse(slot._turnstileWidget) || '';
    } catch (e) { return ''; }
  };

  // Auto-render any slots already on the page (the signup form).
  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-turnstile-slot]'), function (el) { window.ECRenderTurnstile(el); });
  });
})();
