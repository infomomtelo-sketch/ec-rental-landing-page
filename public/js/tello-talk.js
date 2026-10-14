/* Talk to Tello: a mic button for any chat box. Tap it, say your question, and Tello answers out loud.
   Speech is turned into text by the browser itself (nothing is recorded or stored by us). The reply is spoken by Tello's voice.
   Usage: var talk = ECTelloTalk.attach({ form, input, submit: function (text) {...}, token: function () { return '...'; } });
          then call talk.onReply(replyText) after each answer.
   Optional: placeIn (put the mic inside this element instead of before the input), onMic (handle the tap yourself,
   for example to open a voice mode). ECTelloTalk.speak(text, token, { onStart(audio), onEnd() }) reports playback, and
   ECTelloTalk.listen({ onText(text), onEnd(text) }) runs one round of speech-to-text in the browser. */
(function () {
  if (window.ECTelloTalk) return;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var css = document.createElement('style');
  css.textContent = 'button.tt-mic{flex:none;display:inline-flex;align-items:center;justify-content:center;width:2.5rem;min-width:2.5rem;height:2.5rem;align-self:center;padding:0!important;border-radius:999px;border:1.5px solid currentColor!important;opacity:.8;background:transparent!important;color:inherit!important;cursor:pointer}'
    + 'button.tt-mic:hover{opacity:1}button.tt-mic.on{opacity:1;background:#ffd23f!important;color:#050505!important;border-color:#ffd23f!important;animation:ttpulse 1.2s ease-in-out infinite}'
    + 'button.tt-mic.talk{border-color:#ffd23f!important}'
    + '@keyframes ttpulse{50%{box-shadow:0 0 0 6px rgba(255,210,63,.25)}}@media (prefers-reduced-motion:reduce){button.tt-mic.on{animation:none}}'
    + 'button.tt-mic:focus-visible{outline:2px solid #ffd23f;outline-offset:2px}';
  document.head.appendChild(css);

  var player = null, run = 0, ending = null, SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  function clean(text) {
    return String(text || '').replace(/\[SHOW_[A-Z_]+\]/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[*_`#>]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function chunks(text) {
    var parts = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [text], out = [], cur = '';
    parts.forEach(function (p) { if ((cur + p).length > 280 && cur) { out.push(cur.trim()); cur = ''; } cur += p; });
    if (cur.trim()) out.push(cur.trim());
    return out.slice(0, 4);
  }
  function clip(t, token) {
    var shared = function () { return fetch('/api/public/video-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t.slice(0, 320) }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.audio ? d.audio : null; }).catch(function () { return null; }); };
    if (!token) return shared();
    return fetch('/api/tello/voice', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ text: t.slice(0, 320) }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.audio ? d.audio : shared(); }).catch(shared);
  }
  function done() { var f = ending; ending = null; if (f) try { f(); } catch (e) {} }
  function stopSpeaking() {
    run++; done();
    try { if (player) { player.pause(); player.onended = player.onerror = null; } } catch (e) {}
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }
  function robot(text, id) {
    try { var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.96; u.onend = u.onerror = function () { if (id === run) done(); }; window.speechSynthesis.speak(u); } catch (e) { done(); }
  }
  function speak(text, token, opts) {
    text = clean(text); if (!text) { if (opts && opts.onEnd) opts.onEnd(); return; }
    stopSpeaking(); var id = run; ending = opts && opts.onEnd || null;
    try { player = new Audio(); player.src = SILENT; var pr = player.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) { player = null; }
    var list = chunks(text).map(function (t) { return clip(t, token); }), i = 0;
    function next() {
      if (id !== run) return;
      if (i >= list.length) { done(); return; }
      list[i++].then(function (src) {
        if (id !== run) return;
        var first = i === 1, fail = function () { if (id !== run) return; if (first) robot(text, id); else done(); };
        if (!src || !player) { fail(); return; }
        player.onended = next; player.onerror = fail; player.src = src;
        if (first && opts && opts.onStart) try { opts.onStart(player); } catch (e) {}
        var p = player.play(); if (p && p.catch) p.catch(fail);
      });
    }
    next();
  }

  // Speaks while the answer is still being written: push(textSoFar) as it grows, end(fullText) when it is done.
  // Each finished sentence is recorded right away and queued, so the voice starts after the first sentence, not the last.
  function stream(token, opts) {
    opts = opts || {};
    stopSpeaking(); var id = run; ending = opts.onEnd || null;
    try { player = new Audio(); player.src = SILENT; var pr = player.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) { player = null; }
    var off = 0, q = [], playing = false, finished = false, started = false, count = 0, full = '';
    function enqueue(t) {
      t = clean(t); if (!t) return;
      chunks(t).forEach(function (c) { if (count < 6) { count++; q.push(clip(c, token)); } });
    }
    function pump() {
      if (id !== run || playing) return;
      if (!q.length) {
        if (!finished) return;
        if (!started) { robot(clean(full), id); return; }
        done(); return;
      }
      playing = true;
      q.shift().then(function (src) {
        if (id !== run) return;
        var next = function () { if (id !== run) return; playing = false; pump(); };
        if (!src || !player) { next(); return; }
        player.onended = next; player.onerror = next; player.src = src;
        if (!started) { started = true; if (opts.onStart) try { opts.onStart(player); } catch (e) {} }
        var p = player.play(); if (p && p.catch) p.catch(next);
      });
    }
    function take(text, last) {
      var m;
      while ((m = text.slice(off).match(/^[\s\S]*?(?:[.!?](?=\s)|\n)/))) { enqueue(m[0]); off += m[0].length; }
      if (last) { enqueue(text.slice(off)); off = text.length; }
    }
    return {
      push: function (text) { if (id !== run || finished) return; take(text, false); pump(); },
      end: function (text) { if (id !== run) return; full = text; finished = true; take(text, true); pump(); },
      stop: stopSpeaking
    };
  }

  var ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  function attach(o) {
    if (!SR || !o || !o.form || !o.input) return { onReply: function () {}, stop: stopSpeaking };
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tt-mic'; btn.innerHTML = ICON;
    btn.setAttribute('aria-label', 'Talk to Tello'); btn.title = 'Talk to Tello';
    var oldHolder = o.input.placeholder;
    if (o.placeIn) o.placeIn.appendChild(btn); else o.form.insertBefore(btn, o.input);
    if (o.onMic) { btn.addEventListener('click', function () { stopSpeaking(); o.onMic(); }); return { onReply: function () {}, stop: stopSpeaking, button: btn }; }
    var rec = null, listening = false, voiceMode = false, internal = false;
    function token() { return typeof o.token === 'function' ? o.token() : o.token || ''; }
    function setOn(on) { if (!on) o.input.placeholder = oldHolder; listening = on; btn.classList.toggle('on', on); btn.setAttribute('aria-label', on ? 'Stop listening' : 'Talk to Tello'); }
    // Typing a question turns off spoken replies; the mic turns them on.
    o.form.addEventListener('submit', function () { if (!internal) voiceMode = false; btn.classList.toggle('talk', voiceMode); }, true);
    btn.addEventListener('click', function () {
      if (listening && rec) { try { rec.stop(); } catch (e) {} return; }
      stopSpeaking();
      rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
      var heard = '';
      rec.onresult = function (e) {
        heard = ''; for (var i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
        o.input.value = heard;
      };
      rec.onerror = function () { setOn(false); };
      rec.onend = function () {
        setOn(false); heard = heard.trim(); if (!heard) return;
        voiceMode = true; btn.classList.add('talk'); internal = true;
        try { if (o.submit) o.submit(heard); else if (o.form.requestSubmit) o.form.requestSubmit(); } finally { internal = false; }
      };
      try { rec.start(); setOn(true); o.input.placeholder = 'Listening...'; } catch (e) { setOn(false); }
    });
    return { onReply: function (text) { if (voiceMode) speak(text, token()); }, stop: stopSpeaking };
  }
  // One round of listening: interim text as you speak, then onEnd with what was heard ('' if nothing).
  function listen(o) {
    if (!SR) { if (o.onEnd) o.onEnd(''); return { stop: function () {} }; }
    var rec = new SR(), heard = '', ended = false;
    rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onresult = function (e) { heard = ''; for (var i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript; if (o.onText) o.onText(heard); };
    rec.onend = rec.onerror = function () { if (ended) return; ended = true; if (o.onEnd) o.onEnd(heard.trim()); };
    try { rec.start(); } catch (e) { ended = true; if (o.onEnd) o.onEnd(''); }
    return { stop: function () { try { rec.stop(); } catch (e) {} }, abort: function () { ended = true; try { rec.abort(); } catch (e) {} } };
  }
  window.ECTelloTalk = { supported: !!SR, attach: attach, speak: speak, stream: stream, stop: stopSpeaking, listen: listen };
})();
