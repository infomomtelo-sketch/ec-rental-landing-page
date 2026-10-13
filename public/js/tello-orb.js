/* Tello's living orb: Tello's own mark (the Aurora T from /brand) inside a soft gold glow, used on the tello.live front page, the chat bubble header and voice mode.
   TelloOrb.mount(el, { size }) turns an element into an orb; TelloOrb.set('idle' | 'thinking' | 'speaking' | 'listening')
   changes every orb on the page. Only transforms and opacity animate. Reduced motion shows the state by colour alone,
   and animations pause while the tab is hidden. While Tello speaks, TelloOrb.follow(audioElement) makes the orb pulse
   with the voice (Web Audio AnalyserNode) when the browser allows it; otherwise a gentle 1 s pulse. */
(function () {
  if (window.TelloOrb) return;
  var css = document.createElement('style');
  css.textContent = ''
    + '.t-orb{display:block;position:relative;flex:none;width:var(--orb-size,132px);height:var(--orb-size,132px)}'
    + '.t-orb>*{position:absolute;border-radius:50%;pointer-events:none}'
    + '.t-orb .t-glow{inset:-22%;background:radial-gradient(circle,rgba(255,198,26,.5) 0%,rgba(255,198,26,0) 66%);opacity:.6}'
    + '.t-orb .t-ring{inset:0;border:1.5px solid rgba(255,198,26,.6);opacity:0}'
    + '.t-orb .t-arc{inset:-9%;border:2.5px solid transparent;border-top-color:#ffc61a;border-right-color:rgba(255,198,26,.35);opacity:0}'
    + '.t-orb .t-body{inset:0}'
    + '.t-orb .t-core{position:absolute;inset:8%;transform:scale(calc(1 + var(--orb-lvl,0) * .16))}'
    + '.t-orb .t-core img{display:block;width:100%;height:100%}'
    + '.t-orb[data-state="idle"] .t-body{animation:tOrbBreath 4.5s ease-in-out infinite}'
    + '.t-orb[data-state="idle"] .t-glow{animation:tOrbGlow 4.5s ease-in-out infinite}'
    + '.t-orb[data-state="idle"] .t-ring{animation:tOrbDrift 9s ease-out infinite}.t-orb[data-state="idle"] .t-ring.r2{animation-delay:4.5s}'
    + '.t-orb[data-state="thinking"] .t-arc{opacity:1;animation:tOrbSpin 1.1s linear infinite}'
    + '.t-orb[data-state="thinking"] .t-body{animation:tOrbBreath 2.4s ease-in-out infinite}'
    + '.t-orb[data-state="speaking"]:not(.t-live) .t-body{animation:tOrbPulse 1s ease-in-out infinite}'
    + '.t-orb[data-state="speaking"] .t-glow{opacity:.95}'
    + '.t-orb[data-state="listening"] .t-body{animation:tOrbListen .7s ease-in-out infinite}'
    + '.t-orb[data-state="listening"] .t-ring{animation:tOrbRipple 1.8s ease-out infinite}.t-orb[data-state="listening"] .t-ring.r2{animation-delay:.6s}.t-orb[data-state="listening"] .t-ring.r3{animation-delay:1.2s}'
    + '@keyframes tOrbBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}'
    + '@keyframes tOrbGlow{0%,100%{opacity:.45}50%{opacity:.85}}'
    + '@keyframes tOrbDrift{0%{transform:scale(1);opacity:.45}100%{transform:scale(1.55);opacity:0}}'
    + '@keyframes tOrbRipple{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.7);opacity:0}}'
    + '@keyframes tOrbSpin{to{transform:rotate(360deg)}}'
    + '@keyframes tOrbPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}'
    + '@keyframes tOrbListen{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}'
    + '.t-orb-paused .t-orb *{animation-play-state:paused!important}'
    + '@media (prefers-reduced-motion:reduce){.t-orb *{animation:none!important}.t-orb .t-core{transform:none!important}'
    + '.t-orb[data-state="thinking"] .t-arc{opacity:1}'
    + '.t-orb[data-state="listening"] .t-ring{opacity:1;border-color:#5fd38a;border-width:3px}'
    + '.t-orb[data-state="speaking"] .t-ring{opacity:1;border-width:3px}}';
  document.head.appendChild(css);

  var orbs = [], state = 'idle', LABEL = { idle: 'Tello', thinking: 'Tello is thinking', speaking: 'Tello is speaking', listening: 'Tello is listening' };
  function mount(el, o) {
    o = o || {};
    el.classList.add('t-orb'); el.setAttribute('role', 'img'); el.setAttribute('aria-label', LABEL[state]);
    if (o.size) el.style.setProperty('--orb-size', o.size + 'px');
    el.innerHTML = '<span class="t-glow"></span><span class="t-ring"></span><span class="t-ring r2"></span><span class="t-ring r3"></span><span class="t-arc"></span>'
      + '<span class="t-body"><span class="t-core"><picture><source srcset="/brand/tello-mark-static.svg" media="(prefers-reduced-motion: reduce)"><img src="/brand/tello-mark.svg" alt="" width="512" height="512"></picture></span></span>';
    el.setAttribute('data-state', state);
    orbs.push(el);
    return el;
  }
  function set(s) {
    if (!LABEL[s]) s = 'idle';
    state = s;
    orbs.forEach(function (el) { el.setAttribute('data-state', s); el.setAttribute('aria-label', LABEL[s]); });
    if (s !== 'speaking') stopFollow();
  }

  // Voice-driven pulse. The AudioContext must be created inside a tap (unlock), or browsers keep it suspended.
  var ctx = null, raf = 0, wired = typeof WeakSet === 'function' ? new WeakSet() : null, analyser = null, buf = null;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function unlock() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || reduce) return;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }
  function level(v) { orbs.forEach(function (el) { el.style.setProperty('--orb-lvl', String(Math.max(0, Math.min(1, v)))); }); }
  function stopFollow() { if (raf) cancelAnimationFrame(raf); raf = 0; level(0); orbs.forEach(function (el) { el.classList.remove('t-live'); }); }
  function follow(audio) {
    stopFollow();
    if (!audio || !ctx || ctx.state !== 'running' || !wired || document.hidden) return;
    try {
      if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.connect(ctx.destination); buf = new Uint8Array(analyser.fftSize); }
      if (!wired.has(audio)) { ctx.createMediaElementSource(audio).connect(analyser); wired.add(audio); }
    } catch (e) { return; }
    orbs.forEach(function (el) { el.classList.add('t-live'); });
    (function tick() {
      analyser.getByteTimeDomainData(buf);
      var sum = 0; for (var i = 0; i < buf.length; i++) { var d = (buf[i] - 128) / 128; sum += d * d; }
      level(Math.sqrt(sum / buf.length) * 4);
      raf = state === 'speaking' && !document.hidden ? requestAnimationFrame(tick) : 0;
      if (!raf) stopFollow();
    })();
  }
  document.addEventListener('visibilitychange', function () {
    document.documentElement.classList.toggle('t-orb-paused', document.hidden);
    if (document.hidden) stopFollow();
  });
  window.TelloOrb = { mount: mount, set: set, follow: follow, unlock: unlock, get state() { return state; } };
})();
