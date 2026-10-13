/* The tello.live slide menu: the same menu as the front page, added to the header of every other tello.live page. */
(function () {
  if (window.__telloMenu) return; window.__telloMenu = 1;
  var host = document.querySelector('header .wrap'); if (!host) return;
  var I = function (d) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var chat = I('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'), vid = I('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>'),
    play = I('<path d="M8 5v14l11-7z"/>'), home = I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
    team = I('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15.5 14.3c2.8-.4 5.5 1.5 5.5 4.7"/>'),
    share = I('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>');
  var items = [
    ['Talk to Tello', [[chat, 'Ask Tello', '/ask', 'Free AI chat'], [team, 'Team meeting', '/meeting', 'Four Tellos, ask out loud']]],
    ['For your business', [[chat, 'Tello for your business', '/', 'Answers customers, takes leads. Free 7 days'], [I('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'), 'Pick your Tello', '/models', 'Gold Tello, Green Tello'], [I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>'), 'No website yet?', '/website', 'A website with Tello, or just the website']]],
    ['Create', [[vid, 'Make a video', '/make', 'Free'], [play, 'Sample videos', '/videos', ''], [share, 'Social media setup', '/social-setup', '']]],
    ['For landlords', [[home, 'Tello for landlords', 'https://ecrentalpm.com', 'EC Rental on ecrentalpm.com']]]
  ];
  var guides = [['AI chatbot for small business', '/ai-chatbot-for-small-business'], ['Free AI video maker', '/free-ai-video-maker'], ['Answering customers after hours', '/how-to-answer-customers-when-your-business-is-closed'], ['Small business FAQ page', '/small-business-website-faq-page'], ['Following up with new leads', '/how-to-follow-up-with-new-leads'], ['Making a short business video', '/how-to-make-a-short-business-video']];
  var here = location.pathname.replace(/\/$/, '') || '/';
  var html = '<div class="tm-head"><strong>Everything in Tello</strong><button type="button" class="tm-x" aria-label="Close menu">' + I('<path d="M6 6l12 12M18 6 6 18"/>') + '</button></div>';
  items.forEach(function (g) {
    html += '<h2>' + g[0] + '</h2>';
    g[1].forEach(function (a) { html += '<a class="tm-item"' + (a[2] === here ? ' aria-current="page"' : '') + ' href="' + a[2] + '">' + a[0] + '<span>' + a[1] + (a[3] ? '<small>' + a[3] + '</small>' : '') + '</span></a>'; });
  });
  html += '<h2>Guides</h2>' + guides.map(function (g) { return '<a class="tm-sub"' + (g[1] === here ? ' aria-current="page"' : '') + ' href="' + g[1] + '">' + g[0] + '</a>'; }).join('');
  html += '<p class="tm-legal"><a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:support@tello.live">support@tello.live</a></p>';

  var css = document.createElement('style');
  css.textContent = '.tm-btn{display:inline-flex;align-items:center;gap:.4rem;height:40px;padding:0 .8rem;margin-right:auto;background:transparent;color:inherit;border:1px solid rgba(128,128,128,.55);border-radius:12px;font:600 .9rem Inter,system-ui,sans-serif;cursor:pointer}'
    + '.tm-btn:hover{border-color:#b88700}header .wrap>.brand{white-space:nowrap}@media(max-width:640px){header .wrap>nav a{display:none}}header .wrap>.brand{margin-right:auto}header .wrap>.tm-btn+.brand{margin-right:auto;margin-left:.2rem}header .wrap>.tm-btn{margin-right:.2rem}'
    + '.tm-scrim{position:fixed;inset:0;background:rgba(20,16,8,.45);opacity:0;pointer-events:none;transition:opacity .2s;z-index:9100}'
    + 'body.tm-open .tm-scrim{opacity:1;pointer-events:auto}'
    + '#tm-menu{position:fixed;z-index:9200;top:0;bottom:0;left:0;width:min(86vw,340px);background:#fff;color:#16181b;border-right:1px solid #e4dfd6;transform:translateX(-102%);transition:transform .22s ease;overflow-y:auto;padding:.8rem 14px 2rem;visibility:hidden;font:15px/1.45 Inter,system-ui,sans-serif}'
    + 'body.tm-open #tm-menu{transform:none;visibility:visible}@media (prefers-reduced-motion:reduce){#tm-menu,.tm-scrim{transition:none}}'
    + '#tm-menu .tm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem}'
    + '#tm-menu .tm-x{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:#fff;color:#16181b;border:1px solid #e4dfd6;border-radius:12px;cursor:pointer}'
    + '#tm-menu h2{font:700 .72rem Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a6a00;margin:1.1rem 0 .35rem}'
    + '#tm-menu a.tm-item{display:flex;align-items:center;gap:.7rem;border-radius:10px;padding:.6rem .5rem;color:#16181b;text-decoration:none;font-weight:600}'
    + '#tm-menu a.tm-item:hover,#tm-menu a.tm-sub:hover{background:#f5f1e8}#tm-menu a.tm-item svg{flex:none;color:#b88700}#tm-menu a.tm-item small{display:block;font-weight:400;color:#5d636a;font-size:.8rem}'
    + '#tm-menu a.tm-sub{display:block;padding:.4rem .5rem .4rem 2.2rem;color:#5d636a;text-decoration:none;font-size:.9rem;border-radius:10px}'
    + '#tm-menu [aria-current=page]{background:#fbf3d6;color:#16181b}'
    + '#tm-menu .tm-legal{margin-top:1.4rem;font-size:.82rem;color:#5d636a;padding:0 .5rem}#tm-menu .tm-legal a{color:#7a5800}'
    + '.tm-btn:focus-visible,#tm-menu a:focus-visible,#tm-menu .tm-x:focus-visible{outline:2px solid #b88700;outline-offset:2px}';
  document.head.appendChild(css);
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tm-btn'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'tm-menu'); btn.setAttribute('aria-label', 'Open menu');
  btn.innerHTML = I('<path d="M4 7h16M4 12h16M4 17h16"/>') + '<span>Menu</span>';
  var scrim = document.createElement('div'); scrim.className = 'tm-scrim';
  var menu = document.createElement('nav'); menu.id = 'tm-menu'; menu.setAttribute('aria-label', 'Tello menu'); menu.setAttribute('aria-hidden', 'true'); menu.innerHTML = html;
  host.insertBefore(btn, host.firstChild); document.body.appendChild(scrim); document.body.appendChild(menu);
  function set(open) { document.body.classList.toggle('tm-open', open); btn.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-hidden', String(!open)); (open ? menu.querySelector('.tm-x') : btn).focus(); }
  btn.addEventListener('click', function () { set(true); });
  scrim.addEventListener('click', function () { set(false); });
  menu.querySelector('.tm-x').addEventListener('click', function () { set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('tm-open')) set(false); });
})();
