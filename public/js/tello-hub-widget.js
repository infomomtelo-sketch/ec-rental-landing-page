/* Floating "Ask Tello" chat for tello.live pages. Same assistant and same chat as the tello.live front page
   (public/js/tello-chat.js), in a light panel. It loads the chat, orb and voice scripts itself the first time it opens. */
(function () {
  if (window.__telloHub) return; window.__telloHub = 1;
  var STARTERS = ['Try Tello on my website', 'What can Tello do for my business?', 'How much does it cost?', 'Can Tello make me a video?', "I'm a landlord"];
  var NOTE = 'Tello is an AI and can be wrong. Chats aren’t stored unless you leave your email or rate a reply (<a href="/privacy">Privacy</a>). Don’t share card numbers, passwords, IDs or health details. Not for health care businesses.';
  var css = document.createElement('style');
  css.textContent = ''
    + '.th-btn{position:fixed;right:18px;bottom:max(18px,env(safe-area-inset-bottom));z-index:9000;display:flex;align-items:center;gap:.55rem;min-height:48px;background:#ffd23f;color:#050505;border:0;border-radius:999px;padding:.45rem 1.1rem .45rem .5rem;font:700 .95rem Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.3)}'
    + '.th-btn .th-dot{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#fff8dc 0%,#ffe27a 20%,#ffc61a 52%,#b37a00 100%);box-shadow:0 0 0 2px rgba(0,0,0,.08)}'
    + '.th-panel{position:fixed;right:18px;bottom:78px;z-index:9001;width:400px;max-width:calc(100vw - 24px);height:640px;max-height:calc(100vh - 100px);display:none;flex-direction:column;background:#faf8f4;color:#16181b;border:1px solid #e4dfd6;border-radius:20px;box-shadow:0 14px 44px rgba(0,0,0,.35);font:15px/1.5 Inter,system-ui,sans-serif;overflow:hidden}'
    + '.th-panel.on{display:flex}'
    + '.th-head{display:flex;align-items:center;gap:.6rem;padding:.55rem .55rem .55rem .8rem;border-bottom:1px solid #e4dfd6;background:#fff}'
    + '.th-title{display:flex;flex-direction:column;line-height:1.2;margin-right:auto;min-width:0}.th-title b{font-size:1rem}'
    + '.th-status{font-size:.78rem;color:#5d636a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.th-new{min-height:44px;border:1px solid #e4dfd6;background:#fff;border-radius:999px;padding:0 .85rem;font:600 .82rem Inter,system-ui,sans-serif;color:#16181b;cursor:pointer}'
    + '.th-x{width:44px;height:44px;border:0;background:transparent;border-radius:50%;color:#16181b;font-size:1.5rem;line-height:1;cursor:pointer}'
    + '.th-new:hover,.th-x:hover{background:#f5f1e8}'
    + '.th-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:.8rem .8rem .5rem}'
    + '.th-body .tc-log{flex:1;min-height:0;overflow-y:auto;padding:.1rem .1rem .8rem;display:flex!important}'
    + '.th-note{font-size:.72rem;color:#5d636a;padding:0 .9rem .6rem}.th-note a{color:#7a5800}'
    + '.th-btn:focus-visible,.th-x:focus-visible,.th-new:focus-visible{outline:2px solid #b88700;outline-offset:2px}'
    + '@media (max-width:520px){.th-panel{inset:0;width:auto;max-width:none;height:auto;max-height:none;border-radius:0;border:0;padding-bottom:env(safe-area-inset-bottom)}}';
  document.head.appendChild(css);

  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'th-btn'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-haspopup', 'dialog');
  btn.innerHTML = '<span class="th-dot" aria-hidden="true"></span>Ask Tello';
  var panel = document.createElement('div'); panel.className = 'th-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Ask Tello');
  panel.innerHTML = '<div class="th-head"><span class="th-orb"></span><div class="th-title"><b>Tello</b><span class="th-status" aria-live="polite">Online · Tello is an AI</span></div>'
    + '<button type="button" class="th-new">New chat</button><button type="button" class="th-x" aria-label="Close chat">&times;</button></div>'
    + '<div class="th-body"></div><div class="th-note">' + NOTE + '</div>';
  document.body.appendChild(btn); document.body.appendChild(panel);
  var body = panel.querySelector('.th-body'), status = panel.querySelector('.th-status'), chat = null, loading = null;

  function script(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function load() {
    if (loading) return loading;
    loading = (window.ECTelloTalk ? Promise.resolve() : script('/js/tello-talk.js').catch(function () {}))
      .then(function () { return window.TelloOrb ? null : script('/js/tello-orb.js').catch(function () {}); })
      .then(function () { return window.TelloChat ? null : script('/js/tello-chat.js'); })
      .then(function () {
        if (window.TelloOrb) TelloOrb.mount(panel.querySelector('.th-orb'), { size: 34 });
        chat = TelloChat.mount(body, {
          mode: 'bubble', starters: STARTERS, firstPrimary: true,
          greeting: "Hi, I'm Tello. Ask me anything, or pick a question below.",
          onStatus: function (t) { status.textContent = t || 'Online · Tello is an AI'; },
          voiceHost: function () { return window.matchMedia && matchMedia('(min-width: 600px)').matches ? panel : null; }
        });
      });
    return loading;
  }
  function toggle(open) {
    panel.classList.toggle('on', open); btn.setAttribute('aria-expanded', String(open));
    btn.style.display = open && window.matchMedia && matchMedia('(max-width: 520px)').matches ? 'none' : '';
    if (open) load().then(function () { chat.focus(); }).catch(function () { body.textContent = 'Tello could not load. Please refresh the page.'; });
    else { if (window.ECTelloTalk) ECTelloTalk.stop(); btn.style.display = ''; }
  }
  btn.addEventListener('click', function () { toggle(!panel.classList.contains('on')); });
  panel.querySelector('.th-x').addEventListener('click', function () { toggle(false); btn.focus(); });
  panel.querySelector('.th-new').addEventListener('click', function () { if (chat) { chat.reset(); chat.focus(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('on') && !document.querySelector('.tc-voice')) { toggle(false); btn.focus(); } });
})();
