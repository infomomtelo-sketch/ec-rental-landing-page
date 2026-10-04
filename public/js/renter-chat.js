// Renter chat bubble for /listings and /listing: asks the AI about the home on screen (or helps find one).
(function() {
  var m = location.pathname.match(/^\/listing\/?$/) ? new URLSearchParams(location.search).get('id') : null;
  var listingId = /^\d+$/.test(m || '') ? Number(m) : null;
  var history = [];

  var css = document.createElement('style');
  css.textContent =
    '.rc-toggle{position:fixed;bottom:1.25rem;right:1.25rem;z-index:50;background:var(--primary,#1a5632);color:#fff;border:none;border-radius:999px;padding:0.8rem 1.1rem;font:600 0.95rem/1 inherit;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer}' +
    '.rc-box{position:fixed;bottom:1.25rem;right:1.25rem;z-index:51;width:360px;max-width:calc(100vw - 2rem);height:500px;max-height:calc(100vh - 2rem);background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden}' +
    '.rc-box.open{display:flex}.rc-head{background:var(--primary,#1a5632);color:#fff;padding:0.8rem 1rem;display:flex;justify-content:space-between;align-items:center}' +
    '.rc-head strong{display:block;font-size:0.95rem}.rc-head small{opacity:.8;font-size:0.75rem}.rc-x{background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer}' +
    '.rc-msgs{flex:1;overflow-y:auto;padding:0.9rem;display:flex;flex-direction:column;gap:0.6rem;background:var(--light,#f7f9f7)}' +
    '.rc-m{max-width:85%;padding:0.6rem 0.85rem;border-radius:12px;font-size:0.9rem;line-height:1.45;white-space:pre-wrap}' +
    '.rc-bot{align-self:flex-start;background:#fff;border:1px solid #e5e7eb}.rc-me{align-self:flex-end;background:var(--primary,#1a5632);color:#fff}.rc-wait{color:#6b7280;font-style:italic}' +
    '.rc-acts{align-self:flex-start;display:flex;flex-wrap:wrap;gap:0.4rem}.rc-acts a,.rc-acts button{background:#eef4ee;border:1px solid #d1e7d8;color:var(--primary-dark,#0f3d22);border-radius:16px;padding:0.4rem 0.8rem;font:500 0.82rem inherit;text-decoration:none;cursor:pointer}' +
    '.rc-form{align-self:stretch;background:#fff;border:1px solid #d1e7d8;border-radius:12px;padding:0.75rem;display:flex;flex-direction:column;gap:0.4rem}.rc-form input{padding:0.5rem;border:1px solid #d1d5db;border-radius:6px;font:inherit;font-size:0.88rem}.rc-form button{background:var(--primary,#1a5632);color:#fff;border:none;border-radius:6px;padding:0.55rem;font-weight:600;cursor:pointer}' +
    '.rc-in{display:flex;gap:0.4rem;padding:0.7rem;border-top:1px solid #e5e7eb}.rc-in input{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:0.55rem 0.7rem;font:inherit;font-size:0.9rem}.rc-in button{background:var(--primary,#1a5632);color:#fff;border:none;border-radius:8px;padding:0 0.9rem;font-weight:600;cursor:pointer}' +
    '.rc-note{font-size:0.7rem;color:#6b7280;text-align:center;padding:0 0.7rem 0.5rem}' +
    '@media (max-width:600px){.rc-box{bottom:0;right:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}}';
  document.head.appendChild(css);

  var toggle = document.createElement('button');
  toggle.className = 'rc-toggle'; toggle.type = 'button';
  toggle.textContent = listingId ? '💬 Ask about this home' : '💬 Ask us anything';
  var box = document.createElement('div');
  box.className = 'rc-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Chat with EC Rental');
  box.innerHTML = '<div class="rc-head"><div><strong>EC Rental Assistant</strong><small>AI answers from the listing details</small></div><button class="rc-x" type="button" aria-label="Close chat">✕</button></div>' +
    '<div class="rc-msgs"></div><form class="rc-in"><input maxlength="1000" placeholder="Type your question..." aria-label="Your question" /><button type="submit">Send</button></form>' +
    '<p class="rc-note">AI can make mistakes. The landlord confirms all details.</p>';
  document.body.appendChild(toggle); document.body.appendChild(box);
  var msgs = box.querySelector('.rc-msgs'), form = box.querySelector('.rc-in'), input = form.querySelector('input');

  function add(cls, text) { var d = document.createElement('div'); d.className = 'rc-m ' + cls; d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; }
  function addNode(node) { msgs.appendChild(node); msgs.scrollTop = msgs.scrollHeight; }
  function suggestions(list) {
    var row = document.createElement('div'); row.className = 'rc-acts';
    list.forEach(function(q) { var b = document.createElement('button'); b.type = 'button'; b.textContent = q; b.onclick = function() { row.remove(); send(q); }; row.appendChild(b); });
    addNode(row);
  }

  function tourForm() {
    var f = document.createElement('form'); f.className = 'rc-form';
    f.innerHTML = '<strong style="font-size:0.88rem">Request a showing</strong><input name="name" required placeholder="Full name" autocomplete="name" /><input name="email" type="email" required placeholder="Email" autocomplete="email" /><input name="phone" type="tel" required placeholder="Phone" autocomplete="tel" /><input name="message" placeholder="Best days or times (optional)" /><button type="submit">Send request</button><small class="rc-fmsg"></small>';
    f.addEventListener('submit', function(e) {
      e.preventDefault(); var btn = f.querySelector('button'), out = f.querySelector('.rc-fmsg'); btn.disabled = true;
      var data = {}; new FormData(f).forEach(function(v, k) { data[k] = v; });
      var asked = history.filter(function(h) { return h.role === 'user'; }).map(function(h) { return h.content; }).slice(-3).join(' | ');
      data.message = [data.message, asked ? 'Asked in chat: ' + asked : ''].filter(Boolean).join('\n');
      fetch('/api/public/listings/' + listingId + '/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function(r) { return r.json(); }).then(function(d) {
          if (!d.success) throw new Error(d.error || 'Could not send.');
          f.remove(); add('rc-bot', 'Thanks, ' + data.name.split(' ')[0] + '! Your request was sent. We\'ll reply with showing times soon.');
        }).catch(function(err) { btn.disabled = false; out.textContent = err.message; out.style.color = '#991b1b'; });
    });
    addNode(f); f.querySelector('input').focus();
  }

  function actions(d) {
    var row = document.createElement('div'); row.className = 'rc-acts';
    (d.listings || []).forEach(function(l) { var a = document.createElement('a'); a.href = '/listing?id=' + l.id; a.textContent = '🏠 ' + l.label; row.appendChild(a); });
    if (listingId && d.tour) { var t = document.createElement('button'); t.type = 'button'; t.textContent = '📅 Request a showing'; t.onclick = function() { row.remove(); tourForm(); }; row.appendChild(t); }
    if (listingId && d.apply) { var a2 = document.createElement('a'); a2.href = '/apply?listing=' + listingId; a2.textContent = '📝 Apply now'; row.appendChild(a2); }
    if (row.children.length) addNode(row);
  }

  function send(text) {
    text = String(text || '').trim(); if (!text) return;
    add('rc-me', text); input.value = '';
    var wait = add('rc-bot rc-wait', 'Typing...'); form.querySelector('button').disabled = true;
    fetch('/api/public/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: history, listingId: listingId }) })
      .then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || 'Something went wrong.'); return d; }); })
      .then(function(d) {
        wait.remove(); add('rc-bot', d.reply);
        history.push({ role: 'user', content: text }, { role: 'assistant', content: d.reply }); history = history.slice(-8);
        actions(d);
      }).catch(function(err) { wait.remove(); add('rc-bot', err.message); })
      .then(function() { form.querySelector('button').disabled = false; input.focus(); });
  }

  var started = false;
  toggle.addEventListener('click', function() {
    box.classList.add('open'); toggle.style.display = 'none';
    if (!started) {
      started = true;
      if (listingId) { add('rc-bot', 'Hi! Ask me anything about this home: rent, pets, parking, move-in date, or setting up a showing.'); suggestions(['Is it still available?', 'Are pets allowed?', 'What does it cost to move in?', 'Can I schedule a showing?']); }
      else { add('rc-bot', 'Hi! Tell me what you\'re looking for, like "3 bedrooms under $1,800 with a garage", and I\'ll find matching homes.'); suggestions(['What\'s available now?', 'Anything that allows dogs?', 'Cheapest 2 bedroom?']); }
    }
    setTimeout(function() { input.focus(); }, 50);
  });
  box.querySelector('.rc-x').addEventListener('click', function() { box.classList.remove('open'); toggle.style.display = ''; });
  form.addEventListener('submit', function(e) { e.preventDefault(); send(input.value); });
})();
