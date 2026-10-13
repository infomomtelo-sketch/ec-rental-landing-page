/* Tello's "Today" briefing (GET /api/tello/briefing): what needs the landlord's attention, most urgent first.
   Used on the dashboard Overview and at the top of Ask Tello. ECTelloBrief.render(el, data, onNav) */
(function () {
  var P = {
    rent: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    lease: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    maintenance: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17c1.5-2 2.5-2 3 0s1.5 2 3 0"/>',
    application: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    inquiry: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    tenant: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85"/>',
    listing: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
    billing: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    start: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
    clear: '<path d="M20 6 9 17l-5-5"/>'
  };
  function icon(kind) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[kind] || P.start) + '</svg>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var LABEL = { now: 'Today', soon: 'Soon', info: 'FYI' };

  var css = document.createElement('style');
  css.textContent = '.tb{background:#fff;border:1px solid #e7e3d8;border-radius:14px;padding:0.9rem;color:#1a1a1a}'
    + '.tb-head{display:flex;align-items:baseline;justify-content:space-between;gap:0.5rem;margin-bottom:0.6rem}'
    + '.tb-head strong{font-size:1rem;color:#123a30}.tb-head span{font-size:0.75rem;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280}'
    + '.tb-list{display:flex;flex-direction:column;gap:0.5rem}'
    + '.tb-item{display:flex;gap:0.7rem;align-items:flex-start;width:100%;text-align:left;background:#fbfaf6;border:1px solid #ece8dd;border-radius:12px;padding:0.65rem 0.75rem;font:inherit;color:inherit;cursor:pointer}'
    + '.tb-item:hover{border-color:#123a30}.tb-ico{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e8efe9;color:#123a30}'
    + '.tb-item.now .tb-ico{background:#fdf0dc;color:#b45309}.tb-item.info .tb-ico{background:#f1f1ee;color:#6b7280}'
    + '.tb-t{font-weight:650;font-size:0.92rem;line-height:1.3}.tb-d{font-size:0.83rem;color:#4b5563;line-height:1.4;margin-top:0.15rem}'
    + '.tb-tag{display:inline-block;font-size:0.68rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-right:0.35rem;color:#6b7280}.tb-item.now .tb-tag{color:#b45309}'
    + '.tb-more{background:none;border:none;color:#123a30;font:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;padding:0.4rem 0 0}'
    + '.tb-listen{display:inline-flex;align-items:center;gap:0.35rem;background:#fff;color:#123a30;border:1.5px solid #123a30;border-radius:999px;padding:0.3rem 0.8rem;font:inherit;font-size:0.82rem;font-weight:700;cursor:pointer}.tb-listen:hover{background:#123a30;color:#fff}'
    + '.tb-mail{display:flex;align-items:center;gap:0.5rem;margin-top:0.7rem;font-size:0.83rem;color:#4b5563}.tb-mail input{width:18px;height:18px;accent-color:#123a30}';
  document.head.appendChild(css);


  // Tello's voice: the browser's own text-to-speech. Nothing is recorded or sent anywhere.
  var synth = window.speechSynthesis, canSpeak = !!synth && 'SpeechSynthesisUtterance' in window, speakingNow = false, canVoice = canSpeak || typeof Audio !== 'undefined';
  function voiceOn() { try { return localStorage.getItem('ec_tello_voice') !== 'off'; } catch (e) { return true; } }
  function setVoice(on) { try { localStorage.setItem('ec_tello_voice', on ? 'on' : 'off'); } catch (e) {} }
  function pickVoice() {
    var vs = synth.getVoices().filter(function (v) { return /^en(-|_)US/i.test(v.lang); });
    var nice = vs.filter(function (v) { return /Samantha|Google US English|Aria|Jenny|Zira|Ava|Allison|Female/i.test(v.name); })[0];
    return nice || vs[0] || null;
  }
  function stop() { runId++; try { if (player) { player.pause(); player.onended = player.onerror = null; } } catch (e) {} if (canSpeak) { synth.cancel(); } speakingNow = false; document.querySelectorAll('.tb-listen').forEach(function (b) { b.textContent = 'Listen'; }); }
  function speech(data) {
    var items = (data && data.items) || [], hello = (data && data.name ? 'Good ' + partOfDay() + ', ' + data.name + '. ' : 'Good ' + partOfDay() + '. ') + "It's Tello. ";
    if (!items.length) return hello + "You're all caught up. Nothing needs you today.";
    var n = items.filter(function (i) { return i.urgency !== 'info'; }).length;
    var out = hello + (n ? (n === 1 ? "Here's the one thing that needs you today. " : "Here's what needs you today. ") : "Nothing urgent today, just a few notes. ");
    items.slice(0, 4).forEach(function (it) { out += it.title.replace(/[.!?]+$/, '') + '. ' + (it.detail ? it.detail.replace(/[.!?]*\s*$/, '') + '. ' : ''); });
    if (items.length > 4) out += 'And ' + (items.length - 4) + ' more on your dashboard.';
    return out;
  }
  // Natural voice first: the same Workers AI voice the video maker uses, one short chunk at a time.
  // If it is unavailable or blocked, fall back to the browser's own voice so Tello is never silent.
  var player = null, runId = 0, SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  function chunks(text) {
    var parts = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [text], out = [], cur = '';
    parts.forEach(function (p) {
      if ((cur + p).length > 280 && cur) { out.push(cur.trim()); cur = ''; }
      cur += p;
    });
    if (cur.trim()) out.push(cur.trim());
    return out.slice(0, 8);
  }
  var voiceToken = '';
  function fetchClip(t) {
    var shared = function () { return fetch('/api/public/video-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t.slice(0, 320) }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.audio ? d.audio : null; }).catch(function () { return null; }); };
    if (!voiceToken) return shared();
    return fetch('/api/tello/voice', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + voiceToken }, body: JSON.stringify({ text: t.slice(0, 320) }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.audio ? d.audio : shared(); }).catch(shared);
  }
  function robotSay(text) {
    if (!canSpeak || !text) return;
    synth.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.96; u.pitch = 1.03; var v = pickVoice(); if (v) u.voice = v;
    u.onend = u.onerror = function () { stop(); };
    speakingNow = true; synth.speak(u);
  }
  function say(text) {
    if (!text) return;
    var id = ++runId; speakingNow = true;
    try { if (player) player.pause(); player = new Audio(); player.src = SILENT; var pr = player.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) { player = null; }
    var clips = chunks(text).map(fetchClip);
    var i = 0;
    function next() {
      if (id !== runId) return;
      if (i >= clips.length) { stop(); return; }
      clips[i++].then(function (src) {
        if (id !== runId) return;
        if (!src || !player) { if (i === 1) { robotSay(text); } else { stop(); } return; }
        player.onended = next; player.onerror = function () { if (i === 1) robotSay(text); else stop(); };
        player.src = src;
        var p = player.play(); if (p && p.catch) p.catch(function () { if (i === 1) robotSay(text); else stop(); });
      });
    }
    next();
  }
  function listen(data, btn) { if (speakingNow) { stop(); return; } say(speech(data)); if (btn) btn.textContent = 'Stop'; }
  // Called right after the landlord signs in with the login button (a tap, so the browser allows sound).
  function greet(token) { if (!canVoice || !voiceOn()) return; load(token).then(function (d) { if (voiceOn()) say(speech(d)); }).catch(function () {}); }

  function render(el, data, onNav, opts) {
    opts = opts || {};
    var items = (data && data.items) || [], limit = opts.limit || 5, hello = data && data.name ? 'Good ' + partOfDay() + ', ' + esc(data.name) + '.' : 'Good ' + partOfDay() + '.';
    var urgent = items.filter(function (i) { return i.urgency !== 'info'; }).length;
    var html = '<div class="tb"><div class="tb-head"><strong>' + hello + '</strong>' + (canVoice ? '<button type="button" class="tb-listen" aria-label="Listen to Tello read your briefing">Listen</button>' : '<span>What needs you</span>') + '</div><div class="tb-list">';
    if (!items.length) html += '<div class="tb-item info" style="cursor:default"><span class="tb-ico">' + icon('clear') + '</span><span><span class="tb-t">All clear. Nothing needs you today.</span><span class="tb-d" style="display:block">Rent, leases, repairs and applications are all up to date.</span></span></div>';
    items.forEach(function (it, n) {
      html += '<button type="button" class="tb-item ' + esc(it.urgency) + '" data-page="' + esc(it.page) + '"' + (n >= limit ? ' hidden' : '') + '><span class="tb-ico">' + icon(it.kind) + '</span><span><span class="tb-t"><span class="tb-tag">' + LABEL[it.urgency] + '</span>' + esc(it.title) + '</span><span class="tb-d" style="display:block">' + esc(it.detail) + '</span></span></button>';
    });
    html += '</div>';
    if (items.length > limit) html += '<button type="button" class="tb-more">Show all ' + items.length + '</button>';
    if (opts.onMail) html += '<label class="tb-mail"><input type="checkbox"' + (data.morning_email ? ' checked' : '') + ' /> Email me this every morning' + (urgent ? '' : ' (only on days something needs you)') + '</label>';
    if (canVoice && opts.onMail) html += '<label class="tb-mail"><input type="checkbox" class="tb-voice"' + (voiceOn() ? ' checked' : '') + ' /> Tello speaks my briefing when I sign in</label>';
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll('.tb-item[data-page]').forEach(function (b) { b.addEventListener('click', function () { if (onNav) onNav(b.getAttribute('data-page')); }); });
    var more = el.querySelector('.tb-more');
    if (more) more.addEventListener('click', function () { el.querySelectorAll('.tb-item[hidden]').forEach(function (b) { b.hidden = false; }); more.remove(); });
    var lb = el.querySelector('.tb-listen'); if (lb) lb.addEventListener('click', function () { listen(data, lb); });
    var vb = el.querySelector('.tb-voice'); if (vb) vb.addEventListener('change', function () { setVoice(vb.checked); if (!vb.checked) stop(); });
    var box = el.querySelector('.tb-mail input:not(.tb-voice)');
    if (box) box.addEventListener('change', function () { opts.onMail(box.checked, function (ok) { if (!ok) box.checked = !box.checked; }); });
  }
  function partOfDay() { var h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
  function load(token) {
    voiceToken = token || voiceToken;
    return fetch('/api/tello/briefing', { headers: { Authorization: 'Bearer ' + token } }).then(function (r) { if (!r.ok) throw new Error('briefing ' + r.status); return r.json(); });
  }
  function setMorningEmail(token, on, done) {
    fetch('/api/tello/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ morning_email: on }) })
      .then(function (r) { done(r.ok); }).catch(function () { done(false); });
  }
  window.ECTelloBrief = { render: render, load: load, setMorningEmail: setMorningEmail, greet: greet, stop: stop };
})();
