/* "Continue with Google" buttons and the results the Worker sends back in the URL fragment (src/google.ts). */
(function() {
  var G_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  /** Reads and clears google_token / google_error / google_signup from the URL fragment. */
  function readHash() {
    var out = {};
    if (!/google_(token|error|signup)=/.test(location.hash)) return out;
    var p = new URLSearchParams(location.hash.slice(1));
    ['token', 'error', 'signup'].forEach(function(k) { var v = p.get('google_' + k); if (v) out[k] = v; });
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return out;
  }

  /** Fills every [data-google-signin] element with a button, shown only when Google sign-in is configured. */
  function initButtons(from) {
    var slots = document.querySelectorAll('[data-google-signin]');
    if (!slots.length) return;
    fetch('/api/auth/google/status').then(function(r) { return r.json(); }).then(function(d) {
      if (!d.enabled) return;
      Array.prototype.forEach.call(slots, function(slot) {
        slot.innerHTML = '<a class="google-btn" href="/api/auth/google/start?from=' + encodeURIComponent(slot.getAttribute('data-google-signin') || from) + '">' + G_ICON + '<span>' + (slot.getAttribute('data-label') || 'Continue with Google') + '</span></a><p class="google-or">or</p>';
        slot.style.display = '';
      });
    }).catch(function() {});
  }

  var css = document.createElement('style');
  css.textContent = '.google-btn{display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;box-sizing:border-box;padding:0.7rem 1rem;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#1f2937;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.google-btn:hover{background:#f9fafb}.google-or{text-align:center;color:#6b7280;font-size:0.85rem;margin:0.75rem 0}';
  document.head.appendChild(css);

  window.ECGoogle = { readHash: readHash, initButtons: initButtons };
})();
