/* Floating "Ask Tello" chat for tello.live pages. Talks to the same assistant as the tello.live front page. */
(function () {
  if (window.__telloHub) return; window.__telloHub = 1;
  var css = document.createElement('style');
  css.textContent = '.th-btn{position:fixed;right:18px;bottom:18px;z-index:9000;display:flex;align-items:center;gap:.5rem;background:#ffd23f;color:#050505;border:0;border-radius:999px;padding:.75rem 1.1rem;font:700 .95rem Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35)}'
    + '.th-panel{position:fixed;right:18px;bottom:78px;z-index:9000;width:360px;max-width:calc(100vw - 24px);height:480px;max-height:calc(100vh - 100px);display:none;flex-direction:column;background:#0f2a22;color:#f2f2f2;border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.5);font:15px/1.45 Inter,system-ui,sans-serif;overflow:hidden}'
    + '.th-panel.on{display:flex}.th-head{padding:.7rem .9rem;font-weight:700;border-bottom:1px solid rgba(255,255,255,.12);display:flex;justify-content:space-between;align-items:center}'
    + '.th-x{background:none;border:0;color:inherit;font-size:1.4rem;line-height:1;cursor:pointer}'
    + '.th-log{flex:1;overflow-y:auto;padding:.8rem;display:flex;flex-direction:column;gap:.5rem}'
    + '.th-m{max-width:88%;padding:.5rem .75rem;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}.th-m.ai{background:rgba(255,255,255,.09);align-self:flex-start}.th-m.me{background:#ffd23f;color:#050505;font-weight:600;align-self:flex-end}'
    + '.th-m a{color:#ffd23f}.th-f{display:flex;gap:.4rem;padding:.6rem;border-top:1px solid rgba(255,255,255,.12)}'
    + '.th-f input{flex:1;min-width:0;font:inherit;padding:.55rem .7rem;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.25);color:inherit}'
    + '.th-f button{font:inherit;font-weight:700;background:#ffd23f;color:#050505;border:0;border-radius:10px;padding:0 .9rem;cursor:pointer}.th-f button:disabled{opacity:.55}'
    + '.th-note{font-size:.72rem;opacity:.7;padding:0 .8rem .55rem}.th-note a{color:#ffd23f}'
    + '.th-btn:focus-visible,.th-x:focus-visible,.th-f input:focus-visible,.th-f button:focus-visible{outline:2px solid #fff;outline-offset:2px}';
  document.head.appendChild(css);
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'th-btn'; btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>Ask Tello';
  var panel = document.createElement('div'); panel.className = 'th-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Ask Tello');
  panel.innerHTML = '<div class="th-head"><span>Ask Tello</span><button type="button" class="th-x" aria-label="Close chat">&times;</button></div><div class="th-log" aria-live="polite"></div><form class="th-f" autocomplete="off"><input maxlength="600" placeholder="Ask about plans or videos" aria-label="Your message" /><button type="submit">Send</button></form><div class="th-note">Tello is an AI and can be wrong. Chats are saved (<a href="/privacy">Privacy</a>). Please don\'t share card numbers, passwords or health details.</div>';
  document.body.appendChild(btn); document.body.appendChild(panel);
  var log = panel.querySelector('.th-log'), input = panel.querySelector('input'), send = panel.querySelector('.th-f button'), convo = [], busy = false, started = false;
  var talk = null;
  (function () {
    var form = panel.querySelector('form');
    function go() { talk = ECTelloTalk.attach({ form: form, input: input, submit: function (t) { input.value = t; form.dispatchEvent(new Event('submit', { cancelable: true })); } }); }
    if (window.ECTelloTalk) go(); else { var sc = document.createElement('script'); sc.src = '/js/tello-talk.js'; sc.onload = go; document.head.appendChild(sc); }
  })();
  var LINK = /(tello\.live\/[a-z-]+|ecrentalpm\.com|support@tello\.live)/g;
  function fill(el, text) { el.textContent = ''; text.split(LINK).forEach(function (part, i) { if (i % 2 === 1) { var a = document.createElement('a'); a.textContent = part; a.href = part.indexOf('@') > 0 ? 'mailto:' + part : 'https://' + part; el.appendChild(a); } else if (part) el.appendChild(document.createTextNode(part)); }); }
  function add(cls, text) { var d = document.createElement('div'); d.className = 'th-m ' + cls; fill(d, text); log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function toggle(open) { panel.classList.toggle('on', open); btn.setAttribute('aria-expanded', String(open)); if (open) { if (!started) { started = true; add('ai', "Hi, I'm Tello. Ask me what Tello does, what it costs, or how to make a video."); } input.focus(); } }
  btn.addEventListener('click', function () { toggle(!panel.classList.contains('on')); });
  panel.querySelector('.th-x').addEventListener('click', function () { toggle(false); btn.focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('on')) toggle(false); });
  panel.querySelector('.th-x').addEventListener('click', function () { if (talk) talk.stop(); });
  panel.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault(); var v = input.value.trim(); if (!v || busy) return;
    add('me', v); input.value = ''; convo.push({ role: 'user', content: v }); busy = true; send.disabled = true; var w = add('ai', '...');
    fetch('/api/public/tello-hub/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: convo.slice(-10) }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (x.ok && x.j.reply) { fill(w, x.j.reply); convo.push({ role: 'assistant', content: x.j.reply }); if (talk) talk.onReply(x.j.reply); } else { fill(w, x.j.error || 'Sorry, something went wrong. Please try again.'); convo.pop(); } })
      .catch(function () { w.textContent = 'I could not reach the server. Please try again.'; convo.pop(); })
      .then(function () { busy = false; send.disabled = false; input.focus(); log.scrollTop = log.scrollHeight; });
  });
})();
