/* The tello.live chat, shared by the front page (mode 'page') and the floating bubble (mode 'bubble').
   TelloChat.mount(rootEl, { mode, starters, greeting, onChatting(bool), onStatus(text), speakTyped(), voiceHost() })
   Streams replies from /api/public/tello-hub/chat, renders safe markdown (DOM nodes only; model text never goes through
   innerHTML), keeps the last 30 messages in sessionStorage (text only, shared by page and bubble), and offers attach,
   mic + voice mode, Stop, Retry and per-reply Copy / Share / Play / thumbs / Regenerate.
   Needs /js/tello-talk.js (mic and voice) and /js/tello-orb.js (the orb); both are optional at runtime.
   A business's own chat (public/b.html) mounts it with { chatUrl, storageKey, allowHost, voice, feedback: false, config: false,
   placeholder, logLabel } so it talks to that business's assistant, keeps its own conversation and links to its website. */
(function () {
  if (window.TelloChat) return;
  var API = '/api/public/tello-hub', KEY = 'tello_hub_chat', VOICE_KEY = 'tello_hub_voice', MAX_KEEP = 30, MAX_TEXT = 4000, MAX_FILES = 3;
  var IMG_MAX_SIDE = 1600, IMG_MAX = 4 * 1024 * 1024, PDF_MAX = 8 * 1024 * 1024, PDF_PAGES = 30;
  var HOSTS = /^(www\.)?(tello\.live|ecrentalpm\.com|ownsite\.app)$/i;
  var EXTRA = ''; // a business chat's own website host (one chat per page), also turned into links
  function hostOk(host) { host = String(host || '').toLowerCase(); return HOSTS.test(host) || (!!EXTRA && host.replace(/^www\./, '') === EXTRA); }
  function escRe(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  var css = document.createElement('style');
  css.textContent = ''
    + '.tc{--tc-ink:#16181b;--tc-body:#2b2f33;--tc-muted:#5d636a;--tc-line:#e4dfd6;--tc-card:#fff;--tc-input:#fff;--tc-gold:#ffc61a;--tc-goldInk:#1a1400;--tc-link:#7a5800;--tc-ok:#1f7a45;--tc-err-bg:#fde8e8;--tc-err:#7a1a1a;--tc-hover:#f5f1e8;--tc-ring:rgba(255,198,26,.5);color:var(--tc-ink);font-family:Inter,system-ui,sans-serif;line-height:1.5}'
    + '.tc *{box-sizing:border-box}.tc button{font:inherit;color:inherit;cursor:pointer}'
    + '.tc :focus-visible{outline:2px solid #b88700;outline-offset:2px}'
    + '.tc-log{display:flex;flex-direction:column;gap:1rem}.tc-log:empty{display:none}'
    + '.tc-me{align-self:flex-end;max-width:88%;background:var(--tc-gold);color:var(--tc-goldInk);font-weight:500;padding:.6rem .95rem;border-radius:18px 18px 6px 18px;white-space:pre-wrap;overflow-wrap:anywhere}'
    + '.tc-me .tc-fileref{display:block;font-size:.8rem;opacity:.8;margin-top:.2rem}'
    + '.tc-ai{align-self:stretch;max-width:100%;color:var(--tc-body);overflow-wrap:anywhere}'
    + '.tc-text>*+*{margin-top:.6rem}.tc-text p{margin:0}.tc-text ul,.tc-text ol{margin:0;padding-left:1.3rem}.tc-text li+li{margin-top:.25rem}'
    + '.tc-text strong{color:var(--tc-ink);font-weight:700}.tc-text code{font-family:ui-monospace,Menlo,monospace;font-size:.88em;background:var(--tc-hover);border:1px solid var(--tc-line);padding:.05rem .3rem;border-radius:5px}'
    + '.tc a{color:var(--tc-link)}'
    + '.tc-caret{display:inline-block;width:.5em;height:1.05em;margin-left:2px;vertical-align:-.15em;background:var(--tc-gold);border-radius:2px;animation:tcBlink 1s steps(2,start) infinite}'
    + '@keyframes tcBlink{to{visibility:hidden}}'
    + '.tc-dots{display:inline-flex;gap:5px;padding:.4rem 0}.tc-dots span{width:7px;height:7px;border-radius:50%;background:var(--tc-muted);animation:tcDot 1.2s ease-in-out infinite}.tc-dots span:nth-child(2){animation-delay:.15s}.tc-dots span:nth-child(3){animation-delay:.3s}'
    + '@keyframes tcDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}'
    + '.tc-status{display:flex;flex-direction:column;gap:.2rem;margin-bottom:.4rem}.tc-status:empty{display:none}'
    + '.tc-st{display:flex;align-items:center;gap:.4rem;font-size:.85rem;color:var(--tc-muted)}'
    + '.tc-st.run span{background:linear-gradient(90deg,var(--tc-muted) 0%,var(--tc-ink) 50%,var(--tc-muted) 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:tcShimmer 1.6s linear infinite}'
    + '@keyframes tcShimmer{to{background-position:-200% 0}}'
    + '.tc-st svg{flex:none}.tc-st.ok svg{color:var(--tc-ok)}'
    + '.tc-notice{font-size:.85rem;color:var(--tc-muted);margin-bottom:.4rem}'
    + '.tc-src{display:flex;flex-wrap:wrap;gap:.3rem .8rem;margin-top:.6rem;font-size:.8rem;color:var(--tc-muted)}.tc-src a{color:var(--tc-muted);text-decoration:underline}'
    + '.tc-acts{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.7rem}'
    + '.tc-act{display:inline-flex;align-items:center;min-height:40px;background:var(--tc-ink);color:var(--tc-card)!important;text-decoration:none;border-radius:999px;padding:.4rem 1rem;font-size:.88rem;font-weight:600}'
    + '.tc-tools{display:flex;flex-wrap:wrap;gap:.1rem;margin-top:.35rem;margin-left:-.6rem}'
    + '.tc-tool{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:0;background:transparent;border-radius:12px;color:var(--tc-muted)!important}'
    + '.tc-tool:hover{background:var(--tc-hover);color:var(--tc-ink)!important}.tc-tool[aria-pressed="true"]{color:var(--tc-ink)!important}.tc-tool:disabled{opacity:.4;cursor:default}'
    + '.tc-sugg{display:flex;flex-wrap:wrap;gap:.45rem}'
    + '.tc-chip{min-height:40px;background:var(--tc-card);border:1px solid var(--tc-line);border-radius:999px;padding:.45rem .9rem;font-size:.88rem;font-weight:600;text-align:left}'
    + '.tc-chip:hover{border-color:#b88700}.tc-chip.primary{background:var(--tc-gold);border-color:var(--tc-gold);color:var(--tc-goldInk)!important}'
    + '.tc-err{align-self:stretch;background:var(--tc-err-bg);color:var(--tc-err);border-radius:14px;padding:.6rem .9rem;display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;justify-content:space-between}'
    + '.tc-err button{min-height:40px;border:1px solid currentColor;background:transparent;border-radius:999px;padding:.3rem .9rem;font-weight:600;color:inherit!important}'
    + '.tc-box{display:flex;flex-direction:column;gap:.4rem;background:var(--tc-input);border:1px solid var(--tc-line);border-radius:22px;padding:.55rem .55rem .55rem .6rem;transition:box-shadow .15s,border-color .15s}'
    + '.tc-box:focus-within{border-color:var(--tc-gold);box-shadow:0 0 0 4px var(--tc-ring)}'
    + '.tc-row{display:flex;align-items:flex-end;gap:.35rem}'
    + '.tc-box textarea{flex:1;min-width:0;width:auto;min-height:0;margin:0;resize:none;border:0!important;border-radius:0;box-shadow:none!important;outline:none!important;background:transparent!important;color:var(--tc-ink);font:inherit;font-size:1rem;line-height:1.45;padding:.45rem .3rem;max-height:calc(1.45em * 8 + .9rem);outline:none}'
    + '.tc-box textarea::placeholder{color:var(--tc-muted);opacity:1}'
    + '.tc-ibtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;border:0;background:transparent;color:var(--tc-muted)!important}'
    + '.tc-ibtn:hover{background:var(--tc-hover);color:var(--tc-ink)!important}'
    + '.tc-send{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;border:0;background:var(--tc-gold);color:var(--tc-goldInk)!important}'
    + '.tc-send:disabled{opacity:.45;cursor:default}.tc-send.stop{background:var(--tc-ink);color:var(--tc-card)!important}'
    + '.tc-mic{display:contents}.tc-mic button.tt-mic{width:44px!important;min-width:44px!important;height:44px!important;border:0!important;color:var(--tc-muted)!important;opacity:1}'
    + '.tc-mic button.tt-mic:hover{background:var(--tc-hover)!important;color:var(--tc-ink)!important}'
    + '.tc-files{display:flex;flex-wrap:wrap;gap:.4rem}.tc-files:empty{display:none}'
    + '.tc-file{display:inline-flex;align-items:center;gap:.4rem;max-width:100%;background:var(--tc-hover);border:1px solid var(--tc-line);border-radius:12px;padding:.25rem .25rem .25rem .3rem;font-size:.82rem}'
    + '.tc-file img{width:36px;height:36px;object-fit:cover;border-radius:8px}.tc-file .pdf{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:var(--tc-card);font-weight:700;font-size:.7rem}'
    + '.tc-file span.n{max-width:11rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.tc-file button{width:32px;height:32px;border:0;background:transparent;border-radius:50%;font-size:1.1rem;line-height:1;color:var(--tc-muted)!important}'
    + '.tc-attwrap{position:relative;flex:none}'
    + '.tc-menu{position:absolute;bottom:52px;left:0;z-index:5;min-width:180px;background:var(--tc-card);border:1px solid var(--tc-line);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:.3rem}'
    + '.tc-menu[hidden]{display:none}.tc-menu button{display:flex;align-items:center;gap:.6rem;width:100%;min-height:44px;border:0;background:transparent;border-radius:10px;padding:.4rem .7rem;text-align:left;font-weight:600;font-size:.92rem}'
    + '.tc-menu button:hover,.tc-menu button:focus-visible{background:var(--tc-hover)}'
    + '.tc-attnote,.tc-filemsg{font-size:.75rem;color:var(--tc-muted);margin:0 .4rem .1rem}.tc-filemsg{margin-top:.35rem}.tc-filemsg{color:var(--tc-err)}.tc-filemsg:empty{display:none}'
    + '.tc-starters{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.8rem}'
    + '.tc-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}'
    // Voice mode: always dark.
    + '.tc-voice{position:fixed;inset:0;z-index:9500;background:#0d0c0b;color:#f6f1e6;display:flex;flex-direction:column;padding:max(14px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));font-family:Inter,system-ui,sans-serif}'
    + '.tc-voice.in-panel{position:absolute;border-radius:inherit}'
    + '.tc-voice button{font:inherit;cursor:pointer}.tc-voice :focus-visible{outline:2px solid #ffc61a;outline-offset:2px}'
    + '.tc-vtop{display:flex;align-items:center;justify-content:space-between;gap:.6rem}'
    + '.tc-vx{width:44px;height:44px;border-radius:50%;border:1px solid #3a352a;background:#1b1a17;color:#f6f1e6;display:inline-flex;align-items:center;justify-content:center}'
    + '.tc-vpriv{font-size:.78rem;color:#a39c8e;text-align:right}'
    + '.tc-vmid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;text-align:center;min-height:0}'
    + '.tc-vorb{border:0;background:transparent;padding:0;border-radius:50%}'
    + '.tc-vlabel{color:#ffc61a;font-weight:700;font-size:1.05rem}'
    + '.tc-vbars{display:flex;gap:5px;height:28px;align-items:center}.tc-vbars span{width:5px;height:100%;border-radius:3px;background:#ffc61a;transform:scaleY(.25);opacity:.5}'
    + '.tc-voice[data-state="listening"] .tc-vbars span{opacity:1;animation:tcBar .9s ease-in-out infinite}.tc-vbars span:nth-child(2){animation-delay:.12s!important}.tc-vbars span:nth-child(3){animation-delay:.24s!important}.tc-vbars span:nth-child(4){animation-delay:.36s!important}.tc-vbars span:nth-child(5){animation-delay:.48s!important}'
    + '@keyframes tcBar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}'
    + '.tc-vtext{font-size:clamp(1.3rem,5vw,1.8rem);font-weight:600;line-height:1.3;max-width:34rem;min-height:2.6em;overflow-wrap:anywhere}'
    + '.tc-vreply{font-size:1rem;color:#c9c1b0;max-width:34rem;max-height:30vh;overflow-y:auto;white-space:pre-wrap}.tc-vreply:empty{display:none}'
    + '.tc-vbot{display:flex;align-items:center;justify-content:space-between;gap:.6rem}'
    + '.tc-vbot .side{min-height:44px;min-width:44px;border:1px solid #3a352a;background:#1b1a17;color:#f6f1e6;border-radius:999px;padding:.4rem .9rem;font-weight:600;font-size:.88rem}'
    + '.tc-vsend{width:72px;height:72px;border-radius:50%;border:0;background:#ffc61a;color:#1a1400;display:inline-flex;align-items:center;justify-content:center}'
    + '.tc-vsend:disabled{opacity:.45;cursor:default}'
    + '@media (prefers-reduced-motion:reduce){.tc-caret,.tc-dots span,.tc-st.run span,.tc-vbars span{animation:none!important}.tc-st.run span{color:var(--tc-muted);background:none}.tc-box{transition:none}}';
  document.head.appendChild(css);

  var I = {
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    stop: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor"/></svg>',
    plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    photo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
    file: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>',
    copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/></svg>',
    share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>',
    play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
    pstop: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
    up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11H3V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7"/></svg>',
    down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V3h4v11zM17 14l-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17"/></svg>',
    again: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, icon, label) { var b = h('button', cls); b.type = 'button'; b.innerHTML = icon; b.setAttribute('aria-label', label); b.title = label; return b; }

  /* ───────── storage (text only, last 30 messages, this tab only) ───────── */
  function load(key) { try { var d = JSON.parse(sessionStorage.getItem(key || KEY) || 'null'); return d && Array.isArray(d.msgs) ? d.msgs : []; } catch (e) { return []; } }
  function store(msgs, key) {
    try {
      var keep = msgs.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).slice(-MAX_KEEP).map(function (m) {
        return { role: m.role, content: String(m.content || '').slice(0, 9000), files: m.files, links: m.links, suggestions: m.suggestions, sources: m.sources, vote: m.vote };
      });
      sessionStorage.setItem(key || KEY, JSON.stringify({ v: 1, msgs: keep }));
    } catch (e) {}
  }
  function voicePref() { try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch (e) { return true; } }
  function setVoicePref(on) { try { localStorage.setItem(VOICE_KEY, on ? 'on' : 'off'); } catch (e) {} }

  /* ───────── safe markdown: DOM nodes only ───────── */
  function safeHref(url, sources) {
    url = String(url || '').trim();
    if (/^mailto:support@tello\.live$/i.test(url)) return 'mailto:support@tello.live';
    if (/^\/(?!\/)[A-Za-z0-9-]*$/.test(url)) return url; // a page on this site
    if (sources && sources.some(function (s) { return s.url === url; })) return url;
    try { var u = new URL(url, location.href); if ((u.protocol === 'https:' || u.protocol === 'http:') && hostOk(u.hostname)) return u.href; } catch (e) {}
    return null;
  }
  var INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()"]*[^\s<>()".,;:!?'])|(support@tello\.live)|((?:www\.)?(?:tello\.live|ecrentalpm\.com|ownsite\.app)(?:\/[A-Za-z0-9][A-Za-z0-9-]*)*)/gi;
  function link(parent, text, href, external) {
    var a = h('a', null, text); a.href = href;
    if (external || !/^(https?:\/\/(www\.)?tello\.live|\/|mailto:)/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    parent.appendChild(a);
  }
  function inline(parent, s, sources) {
    var last = 0, m, re = new RegExp(INLINE.source + (EXTRA ? '|((?:www\\.)?' + escRe(EXTRA) + '(?:\\/[A-Za-z0-9][A-Za-z0-9_~-]*(?:\\.[A-Za-z0-9_~-]+)*)*)' : ''), 'gi'); // own copy: bold text recurses into inline()
    while ((m = re.exec(s))) {
      var before = s.charAt(m.index - 1);
      if ((m[6] || m[7]) && /[\w.@\/-]/.test(before)) continue; // part of a longer word or address
      if (m.index > last) parent.appendChild(document.createTextNode(s.slice(last, m.index)));
      last = re.lastIndex;
      if (m[1]) parent.appendChild(h('code', null, m[1].slice(1, -1)));
      else if (m[2]) { var b = h('strong'); inline(b, m[2].slice(2, -2), sources); parent.appendChild(b); }
      else if (m[3]) {
        var mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(m[3]), href = safeHref(mm[2], sources);
        if (href) link(parent, mm[1], href, !!(sources && sources.some(function (x) { return x.url === mm[2]; })));
        else parent.appendChild(document.createTextNode(mm[1] + (/^https?:/i.test(mm[2]) ? ' (' + mm[2] + ')' : '')));
      }
      else if (m[4]) { var hr = safeHref(m[4], sources); if (hr) link(parent, m[4], hr, true); else parent.appendChild(document.createTextNode(m[4])); }
      else if (m[5]) link(parent, m[5], 'mailto:support@tello.live');
      else if (m[6]) link(parent, m[6], 'https://' + m[6].replace(/^www\./i, ''));
      else if (m[7]) link(parent, m[7], 'https://' + m[7], true);
    }
    if (last < s.length) parent.appendChild(document.createTextNode(s.slice(last)));
  }
  function markdown(el, text, sources) {
    el.textContent = '';
    var para = null, list = null, listType = '';
    function close() { para = null; list = null; listType = ''; }
    String(text || '').split('\n').forEach(function (line) {
      var ul = /^\s*[-*•]\s+(.*)$/.exec(line), ol = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line), hd = /^\s*#{1,6}\s+(.*)$/.exec(line);
      if (!line.trim()) { close(); return; }
      if (ul || ol) {
        var type = ul ? 'ul' : 'ol';
        if (!list || listType !== type) { list = h(type); if (ol && ol[1] !== '1') list.start = Number(ol[1]); el.appendChild(list); listType = type; para = null; }
        var li = h('li'); inline(li, ul ? ul[1] : ol[2], sources); list.appendChild(li); return;
      }
      if (hd) { close(); var p = h('p'), st = h('strong'); inline(st, hd[1].replace(/\*\*/g, ''), sources); p.appendChild(st); el.appendChild(p); return; }
      if (list && /^\s{2,}\S/.test(line)) { var lastLi = list.lastChild; lastLi.appendChild(document.createTextNode(' ')); inline(lastLi, line.trim(), sources); return; }
      list = null; listType = '';
      if (!para) { para = h('p'); el.appendChild(para); } else para.appendChild(h('br'));
      inline(para, line, sources);
    });
  }

  /* ───────── attachments ───────── */
  function readAs(file, how) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r[how](file); }); }
  function prepImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, hh = img.naturalHeight, k = Math.min(1, IMG_MAX_SIDE / Math.max(w, hh));
        var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k));
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var data = c.toDataURL('image/jpeg', 0.85), b64 = data.slice(data.indexOf(',') + 1);
        if (b64.length * 3 / 4 > IMG_MAX) { rej(new Error('That photo is too large. Please send a smaller one.')); return; }
        res({ name: file.name || 'photo.jpg', kind: 'image', data: b64, thumb: data });
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('That photo could not be opened. Please try a JPG or PNG.')); };
      img.src = url;
    });
  }
  function prepPdf(file) {
    if (file.size > PDF_MAX) return Promise.reject(new Error('That PDF is too large. Please send one under 8 MB.'));
    return readAs(file, 'readAsArrayBuffer').then(function (buf) {
      var head = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
      if (String.fromCharCode.apply(null, head) !== '%PDF-') throw new Error('That file is not a PDF.');
      var text = new TextDecoder('latin1').decode(buf), pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
      if (pages > PDF_PAGES) throw new Error('That PDF has more than ' + PDF_PAGES + ' pages. Please send a shorter one.');
      return readAs(file, 'readAsDataURL').then(function (d) { return { name: file.name || 'document.pdf', kind: 'pdf', data: String(d).slice(String(d).indexOf(',') + 1) }; });
    });
  }

  function mount(root, opts) {
    opts = opts || {};
    var skey = opts.storageKey || KEY, chatUrl = opts.chatUrl || API + '/chat', useVoice = opts.voice !== false;
    if (opts.allowHost) EXTRA = String(opts.allowHost).toLowerCase().replace(/^www\./, '');
    var page = opts.mode === 'page', msgs = load(skey), busy = false, ctrl = null, pending = [], lastFiles = [], caps = { attach: false };
    var voiceTurn = false, speakingBtn = null, vm = null;
    root.classList.add('tc', 'tc-' + (page ? 'page' : 'bubble'));
    root.textContent = '';
    var log = h('div', 'tc-log'), sr = h('div', 'tc-sr'); sr.setAttribute('aria-live', 'polite');
    log.setAttribute('role', 'log'); log.setAttribute('aria-label', opts.logLabel || 'Conversation with Tello');
    var form = h('form', 'tc-box'); form.setAttribute('autocomplete', 'off');
    var files = h('div', 'tc-files'), row = h('div', 'tc-row');
    var attWrap = h('div', 'tc-attwrap'), attBtn = btn('tc-ibtn', I.plus, 'Attach a photo or PDF'), menu = h('div', 'tc-menu');
    attBtn.setAttribute('aria-haspopup', 'true'); attBtn.setAttribute('aria-expanded', 'false'); menu.hidden = true; menu.setAttribute('role', 'menu');
    var inputs = {};
    [['camera', 'Camera', I.camera, 'image/*', true], ['photos', 'Photos', I.photo, 'image/*', false], ['files', 'Files', I.file, 'application/pdf,image/*', false]].forEach(function (o) {
      var inp = h('input'); inp.type = 'file'; inp.accept = o[3]; inp.hidden = true; inp.multiple = !o[4]; if (o[4]) inp.setAttribute('capture', 'environment');
      inp.addEventListener('change', function () { addFiles(inp.files); inp.value = ''; });
      var b = h('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.innerHTML = o[2]; b.appendChild(h('span', null, o[1]));
      b.addEventListener('click', function () { showMenu(false); inp.click(); });
      menu.appendChild(b); attWrap.appendChild(inp); inputs[o[0]] = inp;
    });
    attWrap.appendChild(attBtn); attWrap.appendChild(menu); attWrap.hidden = true;
    var ta = h('textarea'); ta.rows = 2; ta.maxLength = MAX_TEXT; ta.placeholder = opts.placeholder || 'Ask Tello anything'; ta.setAttribute('aria-label', 'Message Tello');
    var mic = h('span', 'tc-mic'), send = btn('tc-send', I.send, 'Send'); send.type = 'submit';
    row.appendChild(attWrap); row.appendChild(ta); row.appendChild(mic); row.appendChild(send);
    form.appendChild(files); form.appendChild(row);
    var fileMsg = h('p', 'tc-filemsg'); fileMsg.setAttribute('role', 'status');
    var attNote = h('p', 'tc-attnote', "Don't send IDs, card numbers, medical or health documents."); attNote.hidden = true;
    var starters = h('div', 'tc-starters');
    form.appendChild(attNote);
    root.appendChild(log); root.appendChild(form); root.appendChild(fileMsg); if (page) root.appendChild(starters); root.appendChild(sr);

    function showMenu(open) { menu.hidden = !open; attBtn.setAttribute('aria-expanded', String(open)); if (open) menu.querySelector('button').focus(); }
    attBtn.addEventListener('click', function () { showMenu(menu.hidden); });
    menu.addEventListener('keydown', function (e) {
      var items = [].slice.call(menu.querySelectorAll('button')), i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { showMenu(false); attBtn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i + items.length - 1) % items.length].focus(); }
    });
    document.addEventListener('click', function (e) { if (!menu.hidden && !attWrap.contains(e.target)) showMenu(false); });

    function paintFiles() {
      files.textContent = '';
      pending.forEach(function (f, i) {
        var chip = h('span', 'tc-file');
        if (f.thumb) { var im = h('img'); im.src = f.thumb; im.alt = ''; chip.appendChild(im); } else chip.appendChild(h('span', 'pdf', 'PDF'));
        chip.appendChild(h('span', 'n', f.name));
        var x = h('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + f.name);
        x.addEventListener('click', function () { pending.splice(i, 1); paintFiles(); ta.focus(); });
        chip.appendChild(x); files.appendChild(chip);
      });
      attNote.hidden = !caps.attach || !pending.length; // the warning shows once a file is picked
      fit();
    }
    function addFiles(list) {
      fileMsg.textContent = '';
      var arr = [].slice.call(list || []), room = MAX_FILES - pending.length;
      if (arr.length > room) { fileMsg.textContent = 'You can attach up to ' + MAX_FILES + ' files per message.'; arr = arr.slice(0, Math.max(0, room)); }
      arr.reduce(function (p, file) {
        return p.then(function () {
          var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
          if (!isPdf && !/^image\//.test(file.type || '')) throw new Error('Please attach a photo or a PDF.');
          return (isPdf ? prepPdf(file) : prepImage(file)).then(function (f) { pending.push(f); paintFiles(); });
        }).catch(function (err) { fileMsg.textContent = err && err.message ? err.message : 'That file could not be added.'; });
      }, Promise.resolve());
    }

    /* ───────── rendering ───────── */
    // The page scrolls the window; the bubble scrolls its message list.
    var near = function () { return page ? (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160) : (log.scrollHeight - log.scrollTop - log.clientHeight < 160); };
    function toEnd(force) {
      if (!force && !near()) return;
      if (page) window.scrollTo(0, document.documentElement.scrollHeight);
      else log.scrollTop = log.scrollHeight;
    }
    function chip(text, primary) {
      var c = h('button', 'tc-chip' + (primary ? ' primary' : ''), text); c.type = 'button';
      c.addEventListener('click', function () { submit(text); });
      return c;
    }
    function renderStarters() {
      starters.textContent = '';
      (opts.starters || []).forEach(function (s, i) { starters.appendChild(chip(s, i === 0 && opts.firstPrimary)); });
    }
    function lastAssistantIndex() { for (var i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant') return i; return -1; }
    function questionFor(i) { for (var j = i - 1; j >= 0; j--) if (msgs[j].role === 'user') return msgs[j].content; return ''; }
    function tools(m, i) {
      var bar = h('div', 'tc-tools'), last = i === lastAssistantIndex() && i === msgs.length - 1;
      var copy = btn('tc-tool', I.copy, 'Copy reply');
      copy.addEventListener('click', function () { copyText(m.content).then(function () { copy.title = 'Copied'; sr.textContent = 'Reply copied.'; }); });
      bar.appendChild(copy);
      var share = btn('tc-tool', I.share, 'Share reply');
      share.addEventListener('click', function () {
        if (navigator.share) navigator.share({ text: m.content }).catch(function () {});
        else copyText(m.content).then(function () { sr.textContent = 'Reply copied, ready to share.'; });
      });
      bar.appendChild(share);
      if (window.ECTelloTalk && useVoice) {
        var play = btn('tc-tool', I.play, 'Play reply aloud');
        play.addEventListener('click', function () {
          if (speakingBtn === play) { ECTelloTalk.stop(); return; }
          speakReply(m.content, play);
        });
        bar.appendChild(play);
      }
      var up = btn('tc-tool', I.up, 'Good reply'), down = btn('tc-tool', I.down, 'Bad reply');
      if (opts.feedback !== false) [[up, 1], [down, -1]].forEach(function (p) {
        p[0].setAttribute('aria-pressed', String(m.vote === p[1]));
        if (m.vote) p[0].disabled = true;
        p[0].addEventListener('click', function () {
          m.vote = p[1]; store(msgs, skey); up.disabled = down.disabled = true; p[0].setAttribute('aria-pressed', 'true'); sr.textContent = 'Thanks for the feedback.';
          fetch(API + '/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vote: p[1], question: questionFor(i).slice(0, MAX_TEXT), reply: String(m.content).slice(0, MAX_TEXT) }) }).catch(function () {});
        });
        bar.appendChild(p[0]);
      });
      if (last) {
        var again = btn('tc-tool', I.again, 'Regenerate reply');
        again.addEventListener('click', function () { if (busy) return; msgs.pop(); store(msgs, skey); render(); ask(); });
        bar.appendChild(again);
      }
      return bar;
    }
    function aiNode(m, i) {
      var d = h('div', 'tc-ai'), t = h('div', 'tc-text'); markdown(t, m.content, m.sources); d.appendChild(t);
      if (m.sources && m.sources.length) {
        var src = h('div', 'tc-src'); src.appendChild(h('span', null, 'Sources:'));
        m.sources.forEach(function (s) { link(src, s.title || s.url, s.url, true); });
        d.appendChild(src);
      }
      if (m.links && m.links.length) {
        var acts = h('div', 'tc-acts');
        m.links.forEach(function (l) { var href = safeHref(l.href); if (!href) return; var a = h('a', 'tc-act', l.label); a.href = href; if (/^https?:\/\/(?!(www\.)?tello\.live)/i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } acts.appendChild(a); });
        d.appendChild(acts);
      }
      d.appendChild(tools(m, i));
      return d;
    }
    function meNode(m) {
      var d = h('div', 'tc-me', m.content);
      if (m.files && m.files.length) d.appendChild(h('span', 'tc-fileref', m.files.map(function (f) { return (f.kind === 'pdf' ? 'PDF: ' : 'Photo: ') + f.name; }).join(', ')));
      return d;
    }
    function render() {
      log.textContent = '';
      if (!msgs.length && opts.greeting) { var g = h('div', 'tc-ai'), gt = h('div', 'tc-text'); markdown(gt, opts.greeting); g.appendChild(gt); log.appendChild(g); var s = h('div', 'tc-sugg'); (opts.starters || []).forEach(function (q, i) { s.appendChild(chip(q, i === 0 && opts.firstPrimary)); }); log.appendChild(s); }
      msgs.forEach(function (m, i) { log.appendChild(m.role === 'user' ? meNode(m) : aiNode(m, i)); });
      var last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant' && last.suggestions && last.suggestions.length && !busy) {
        var sg = h('div', 'tc-sugg'); last.suggestions.forEach(function (q) { sg.appendChild(chip(q)); }); log.appendChild(sg);
      }
      if (opts.onChatting) opts.onChatting(msgs.length > 0);
    }

    /* ───────── sending ───────── */
    function fit() { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; send.disabled = !busy && !ta.value.trim() && !pending.length; }
    function setBusy(b) {
      busy = b; send.classList.toggle('stop', b); send.innerHTML = b ? I.stop : I.send;
      send.setAttribute('aria-label', b ? 'Stop' : 'Send'); send.title = b ? 'Stop' : 'Send'; send.type = b ? 'button' : 'submit'; fit();
    }
    function state(s, text) { if (window.TelloOrb) TelloOrb.set(s); if (opts.onStatus) opts.onStatus(text || ''); }
    function submit(text, viaVoice) {
      text = String(text || '').trim().slice(0, MAX_TEXT);
      if (busy || (!text && !pending.length)) return;
      if (window.ECTelloTalk) ECTelloTalk.stop();
      if (window.TelloOrb) TelloOrb.unlock();
      if (!text) text = pending.length > 1 ? 'Please take a look at these.' : 'Please take a look at this.';
      voiceTurn = !!viaVoice;
      lastFiles = pending; pending = []; paintFiles(); fileMsg.textContent = '';
      msgs.push({ role: 'user', content: text, files: lastFiles.map(function (f) { return { name: f.name, kind: f.kind }; }) });
      store(msgs, skey); ta.value = ''; fit(); render(); toEnd(true); ask();
    }
    function payload() {
      var hist = msgs.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).slice(-MAX_KEEP).map(function (m) {
        var c = m.content;
        if (m.files && m.files.length) c += '\n' + m.files.map(function (f) { return '[' + (f.kind === 'pdf' ? 'PDF' : 'photo') + ': ' + f.name + ']'; }).join(' ');
        return { role: m.role, content: c };
      });
      return { messages: hist, attachments: lastFiles.map(function (f) { return { name: f.name, data: f.data }; }), stream: true };
    }
    function ask() {
      setBusy(true); state('thinking', 'Thinking…');
      var live = h('div', 'tc-ai'), status = h('div', 'tc-status'), textEl = h('div', 'tc-text'), dots = h('span', 'tc-dots');
      dots.innerHTML = '<span></span><span></span><span></span>'; dots.setAttribute('aria-label', 'Tello is typing');
      live.appendChild(status); live.appendChild(textEl); textEl.appendChild(dots); log.appendChild(live); toEnd(true);
      var text = '', stLines = {}, done = false, frame = 0, me = ctrl = new AbortController();
      function paint() { frame = 0; var stick = near(); markdown(textEl, text); textEl.appendChild(h('span', 'tc-caret')); if (stick) toEnd(true); }
      function schedule() { if (!frame) frame = (window.requestAnimationFrame || setTimeout)(paint); }
      function setStatus(d) {
        var el = stLines[d.id];
        if (!el) { el = stLines[d.id] = h('div', 'tc-st'); status.appendChild(el); }
        el.className = 'tc-st ' + (d.done ? (d.failed ? 'bad' : 'ok') : 'run');
        el.innerHTML = d.done ? (d.failed ? I.x : I.check) : ''; el.appendChild(h('span', null, d.text));
        if (!d.done) state('thinking', d.text);
      }
      function finish(d) {
        if (done) return; done = true; if (frame) { (window.cancelAnimationFrame || clearTimeout)(frame); frame = 0; }
        var m = { role: 'assistant', content: text.trim() || '…', links: d.links || [], suggestions: d.suggestions || [], sources: d.sources || [] };
        if (d.capabilities) applyCaps(d.capabilities);
        msgs.push(m); store(msgs, skey); ctrl = null; setBusy(false); render(); toEnd(false);
        sr.textContent = 'Tello: ' + m.content.slice(0, 400);
        var speakIt = voiceTurn || (page && opts.speakTyped && opts.speakTyped());
        if (vm && vm.active) vm.answered(m.content);
        else if (speakIt && useVoice && window.ECTelloTalk) speakReply(m.content, null);
        else state('idle');
      }
      function fail(msg, keepText) {
        if (done) return; done = true; ctrl = null;
        if (keepText && text.trim()) { finish({}); return; }
        live.remove(); setBusy(false);
        var e = h('div', 'tc-err'); e.setAttribute('role', 'alert'); e.appendChild(h('span', null, msg));
        var r = h('button', null, 'Retry'); r.type = 'button'; r.addEventListener('click', function () { e.remove(); ask(); });
        e.appendChild(r); log.appendChild(e); toEnd(true); state('idle');
        if (vm && vm.active) vm.failed(msg);
      }
      function handle(ev, d) {
        if (ev === 'delta') { if (dots.parentNode) dots.remove(); text += d.text; if (window.TelloOrb && TelloOrb.state !== 'thinking') TelloOrb.set('thinking'); if (opts.onStatus) opts.onStatus('Writing…'); schedule(); }
        else if (ev === 'status') setStatus(d);
        else if (ev === 'notice') status.appendChild(h('div', 'tc-notice', d.text));
        else if (ev === 'reset') { text = ''; status.textContent = ''; stLines = {}; textEl.textContent = ''; textEl.appendChild(dots); }
        else if (ev === 'done') finish(d);
        else if (ev === 'error') fail(d.error || 'Sorry, something went wrong.');
      }
      fetch(chatUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()), signal: me.signal })
        .then(function (res) {
          if (!/event-stream/.test(res.headers.get('Content-Type') || '')) {
            return res.json().catch(function () { return {}; }).then(function (j) {
              if (res.ok && j.reply) { text = j.reply; finish(j); } else fail(j.error || 'Sorry, something went wrong. Please try again.');
            });
          }
          var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
          return (function pump() {
            return reader.read().then(function (r) {
              if (r.done) { if (!done) fail('The connection was lost. Please try again.', true); return; }
              buf += dec.decode(r.value, { stream: true });
              var i; while ((i = buf.indexOf('\n\n')) >= 0) {
                var chunk = buf.slice(0, i), ev = 'message', data = ''; buf = buf.slice(i + 2);
                chunk.split('\n').forEach(function (l) { if (l.indexOf('event: ') === 0) ev = l.slice(7); else if (l.indexOf('data: ') === 0) data += l.slice(6); });
                try { handle(ev, JSON.parse(data)); } catch (e) {}
              }
              return pump();
            });
          })();
        })
        .catch(function () {
          if (me.signal.aborted) { if (text.trim()) finish({}); else { done = true; live.remove(); setBusy(false); state('idle'); sr.textContent = 'Stopped.'; } }
          else fail('I could not reach the server. Please try again.', false);
        });
    }
    function stop() { if (ctrl) ctrl.abort(); }
    function speakReply(text, playBtn) {
      if (!window.ECTelloTalk) { state('idle'); return; }
      if (speakingBtn) { speakingBtn.innerHTML = I.play; speakingBtn.setAttribute('aria-label', 'Play reply aloud'); }
      speakingBtn = playBtn;
      if (playBtn) { playBtn.innerHTML = I.pstop; playBtn.setAttribute('aria-label', 'Stop playing'); }
      state('speaking', 'Speaking…');
      ECTelloTalk.speak(text, '', {
        onStart: function (audio) { if (window.TelloOrb) TelloOrb.follow(audio); },
        onEnd: function () {
          if (playBtn) { playBtn.innerHTML = I.play; playBtn.setAttribute('aria-label', 'Play reply aloud'); }
          if (speakingBtn === playBtn) speakingBtn = null;
          if (!busy && !(vm && vm.active)) state('idle');
        }
      });
    }
    function copyText(t) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(fallback);
      return Promise.resolve(fallback());
      function fallback() { var x = h('textarea'); x.value = t; x.style.position = 'fixed'; x.style.opacity = '0'; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) {} x.remove(); }
    }
    function applyCaps(c) { caps = c || {}; attWrap.hidden = !caps.attach; attNote.hidden = !caps.attach || !pending.length; if (!caps.attach && pending.length) { pending = []; paintFiles(); } }

    form.addEventListener('submit', function (e) { e.preventDefault(); if (busy) stop(); else submit(ta.value); });
    send.addEventListener('click', function (e) { if (busy) { e.preventDefault(); stop(); } });
    ta.addEventListener('input', fit);
    // On a computer Enter sends and Shift+Enter adds a line; on a phone Enter adds a line and Send sends.
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) { e.preventDefault(); if (!busy) submit(ta.value); } });

    /* ───────── voice mode ───────── */
    function openVoice() {
      if (vm || !window.ECTelloTalk || !ECTelloTalk.supported) return;
      if (busy) stop();
      if (window.TelloOrb) TelloOrb.unlock();
      var host = (opts.voiceHost && opts.voiceHost()) || document.body, voiceOn = page && opts.getVoice ? opts.getVoice() : voicePref();
      var sheet = h('div', 'tc-voice' + (host === document.body ? '' : ' in-panel')); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Talk to Tello');
      var top = h('div', 'tc-vtop'), x = btn('tc-vx', I.close, 'Close voice mode'); top.appendChild(x); top.appendChild(h('span', 'tc-vpriv', 'Your browser turns speech into text. We never receive audio.'));
      var mid = h('div', 'tc-vmid'), orbBtn = h('button', 'tc-vorb'); orbBtn.type = 'button'; orbBtn.setAttribute('aria-label', 'Tap to talk');
      var orb = h('span'); orbBtn.appendChild(orb); if (window.TelloOrb) TelloOrb.mount(orb, { size: host === document.body ? 168 : 128 });
      var label = h('div', 'tc-vlabel', 'Listening…'), bars = h('div', 'tc-vbars'); bars.innerHTML = '<span></span><span></span><span></span><span></span><span></span>'; bars.setAttribute('aria-hidden', 'true');
      var said = h('div', 'tc-vtext'), reply = h('div', 'tc-vreply'); said.setAttribute('aria-live', 'polite');
      [orbBtn, label, bars, said, reply].forEach(function (n) { mid.appendChild(n); });
      var bot = h('div', 'tc-vbot'), typeBtn = h('button', 'side', 'Type instead'), sendBtn = btn('tc-vsend', I.send, 'Send'), vBtn = h('button', 'side');
      typeBtn.type = vBtn.type = 'button';
      function paintV() { vBtn.textContent = voiceOn ? 'Voice on' : 'Voice off'; vBtn.setAttribute('aria-pressed', String(voiceOn)); vBtn.setAttribute('aria-label', voiceOn ? "Tello's voice is on. Tap to turn it off" : "Tello's voice is off. Tap to turn it on"); }
      paintV(); bot.appendChild(typeBtn); bot.appendChild(sendBtn); bot.appendChild(vBtn);
      sheet.appendChild(top); sheet.appendChild(mid); sheet.appendChild(bot); host.appendChild(sheet);
      var rec = null, heard = '', started = 0, timer = 0, prevFocus = document.activeElement;
      function vstate(s, l) { sheet.setAttribute('data-state', s); if (window.TelloOrb) TelloOrb.set(s); label.textContent = l; }
      function listen() {
        if (!vm.active) return;
        ECTelloTalk.stop(); heard = ''; said.textContent = ''; started = started || Date.now(); vstate('listening', 'Listening…');
        clearTimeout(timer); timer = setTimeout(function () { if (!heard && rec) { rec.abort(); rec = null; pause(); } }, Math.max(500, 8000 - (Date.now() - started)));
        rec = ECTelloTalk.listen({
          onText: function (t) { heard = t; said.textContent = t; },
          onEnd: function (t) {
            rec = null; if (!vm || !vm.active) return;
            if (t) { clearTimeout(timer); go(t); }
            else if (Date.now() - started < 8000) listen();
            else pause();
          }
        });
      }
      function pause() { clearTimeout(timer); started = 0; vstate('idle', 'Paused. Tap the orb to talk.'); }
      function go(t) { started = 0; clearTimeout(timer); said.textContent = t; reply.textContent = ''; vstate('thinking', 'Thinking…'); submit(t, true); }
      vm = {
        active: true,
        answered: function (text) {
          reply.textContent = text.replace(/\*\*|`/g, '').replace(/^\s*[-*•]\s+/gm, '• ');
          if (voiceOn) {
            vstate('speaking', 'Speaking…');
            ECTelloTalk.speak(text, '', { onStart: function (a) { if (window.TelloOrb) TelloOrb.follow(a); }, onEnd: function () { if (vm && vm.active) listen(); } });
          } else listen();
        },
        failed: function (msg) { reply.textContent = msg; pause(); },
        close: close
      };
      function close() {
        if (!vm) return; vm.active = false; clearTimeout(timer);
        if (rec) { rec.abort(); rec = null; }
        ECTelloTalk.stop(); sheet.remove(); vm = null; state('idle');
        document.removeEventListener('keydown', onKey, true);
        try { (prevFocus && prevFocus.focus ? prevFocus : ta).focus(); } catch (e) {}
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        if (e.key === 'Tab') { var f = [x, orbBtn, typeBtn, sendBtn, vBtn], i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); vBtn.focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); x.focus(); } }
      }
      document.addEventListener('keydown', onKey, true);
      x.addEventListener('click', close);
      orbBtn.addEventListener('click', function () { if (busy) return; if (rec) rec.stop(); else listen(); });
      sendBtn.addEventListener('click', function () { if (rec) rec.stop(); else if (heard && !busy) go(heard); });
      typeBtn.addEventListener('click', function () { var t = heard; close(); if (t) { ta.value = t; fit(); } ta.focus(); });
      vBtn.addEventListener('click', function () { voiceOn = !voiceOn; if (page && opts.setVoice) opts.setVoice(voiceOn); else setVoicePref(voiceOn); if (!voiceOn) { ECTelloTalk.stop(); } paintV(); });
      x.focus(); listen();
    }
    if (window.ECTelloTalk && useVoice) ECTelloTalk.attach({ form: form, input: ta, placeIn: mic, onMic: openVoice, submit: function (t) { submit(t, true); } });

    function reset() {
      stop(); if (vm) vm.close(); if (window.ECTelloTalk) ECTelloTalk.stop();
      msgs = []; pending = []; lastFiles = []; store(msgs, skey); paintFiles(); fileMsg.textContent = ''; setBusy(false); render(); state('idle'); ta.value = ''; fit();
    }

    renderStarters(); render(); fit();
    if (opts.config !== false) fetch(API + '/config').then(function (r) { return r.json(); }).then(function (j) { applyCaps(j.capabilities); }).catch(function () {});
    return {
      el: root, reset: reset, stop: stop, focus: function () { ta.focus(); }, voice: openVoice,
      send: function (t) { submit(t); },
      setPrompt: function (t) { ta.value = t; fit(); ta.focus(); try { ta.setSelectionRange(t.length, t.length); } catch (e) {} },
      get chatting() { return msgs.length > 0; }
    };
  }
  window.TelloChat = { mount: mount };
})();
