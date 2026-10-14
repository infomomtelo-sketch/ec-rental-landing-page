/* Sharing helpers for a business's Tello (done page and private manage page):
   TelloShare.qr(url) draws a QR code for the chat link, and TelloShare.emailForm(token) lets the owner email the
   website snippet and steps to whoever builds their site. Needs /vendor/qrcode-generator/qrcode.js loaded first. */
(function () {
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function qr(url) {
    var box = el('div'); box.style.cssText = 'display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin:.6rem 0';
    if (typeof qrcode !== 'function') return box;
    var q = qrcode(0, 'M'); q.addData(url); q.make();
    var svgText = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    var pic = el('div'); pic.innerHTML = svgText; pic.style.cssText = 'width:140px;height:140px;background:#fff;border-radius:8px;padding:4px;flex:none';
    pic.setAttribute('role', 'img'); pic.setAttribute('aria-label', 'QR code for your Tello chat link');
    var side = el('div'); side.style.minWidth = '12rem';
    side.appendChild(el('p', 'small-note', 'Customers point their phone camera at this to open your chat. Print it or put it on a sign, a card or a window.'));
    var dl = el('a', 'btn small ghost', 'Download QR code'); dl.download = 'tello-chat-qr.svg';
    dl.href = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    side.appendChild(dl); box.appendChild(pic); box.appendChild(side); return box;
  }
  function emailForm(token) {
    var f = el('form'); f.style.cssText = 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.4rem 0';
    var i = el('input'); i.type = 'email'; i.required = true; i.maxLength = 200; i.placeholder = 'Your web person\'s email'; i.autocomplete = 'off'; i.style.flex = '1'; i.style.minWidth = '12rem'; i.setAttribute('aria-label', 'Web person email');
    var b = el('button', 'btn small', 'Email this to my web person'); b.type = 'submit';
    var m = el('p', 'small-note', ''); m.setAttribute('role', 'status'); m.style.flexBasis = '100%';
    f.appendChild(i); f.appendChild(b); f.appendChild(m);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); m.textContent = ''; b.disabled = true;
      fetch('/api/biz/manage/email-steps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, to: i.value }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.'); return j; }); })
        .then(function (j) { b.disabled = false; m.textContent = j.message || 'Sent.'; i.value = ''; })
        .catch(function (err) { b.disabled = false; m.textContent = err.message; });
    });
    return f;
  }
  window.TelloShare = { qr: qr, emailForm: emailForm };
})();
