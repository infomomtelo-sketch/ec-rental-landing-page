// "Online rent payments" card on the Settings page: connect the landlord's own Stripe account so tenants can pay
// rent from their portal, and list recent online payments. Talks to /api/rent-payments (src/rent-payments.ts).
(function () {
  var view = document.getElementById('dashboardView');
  var settingsPage = document.getElementById('page-settings');
  if (!view || !settingsPage) return;
  var loaded = false;

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function call(path, method) {
    return fetch('/api' + path, { method: method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.'); return d; }); });
  }
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function money(cents) { return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function day(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  function month(p) { var m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? new Date(+m[1], +m[2] - 1, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''; }
  var STATUS = { paid: ['Paid', 'badge-green'], processing: ['Processing', 'badge-yellow'], failed: ['Failed', 'badge-red'] };
  var METHOD = { bank: 'Bank transfer', card: 'Card' };

  function connect(btn) {
    var label = btn.textContent; btn.disabled = true; btn.textContent = 'Opening Stripe...';
    call('/rent-payments/connect', 'POST').then(function (d) { location.href = d.url; })
      .catch(function (err) { btn.disabled = false; btn.textContent = label; alert(err.message); });
  }

  function card(d) {
    var c = document.getElementById('payoutsCard');
    if (!c) {
      c = el('div', { class: 'data-card', id: 'payoutsCard', style: 'padding:2rem;' });
      var billing = document.getElementById('billingCard');
      settingsPage.insertBefore(c, billing ? billing.nextSibling : settingsPage.querySelector('.data-card'));
    }
    c.innerHTML = '';
    c.appendChild(el('h2', { style: 'color:var(--primary);margin-bottom:0.5rem;' }, 'Online rent payments'));
    var p = function (text, style) { c.appendChild(el('p', { style: 'color:var(--gray);margin-bottom:0.75rem;' + (style || '') }, text)); };
    if (d.status === 'ready') {
      p('Ready. Tenants you invited see a "Pay rent online" button in their tenant portal. Paid rent is added to Transactions by itself and you get an email.' + (d.payoutsEnabled ? '' : ' Stripe still needs your bank details before it can pay out.'));
      var a = el('a', { class: 'btn btn-secondary btn-sm', href: 'https://dashboard.stripe.com', target: '_blank', rel: 'noopener' }, 'Open my Stripe dashboard');
      c.appendChild(a);
    } else {
      p('Let tenants pay rent from their tenant portal by bank transfer (ACH) or card. The money goes straight to your own Stripe account and bank; EC Rental never holds it. Stripe takes its fee from each payment (at Stripe\'s standard US rates, about 0.8% for a bank transfer, capped at $5, or 2.9% + 30¢ for a card).');
      if (d.status === 'pending') p('Stripe still needs a few details from you before tenants can pay.', 'color:#7a4b00');
      var btn = el('button', { class: 'btn btn-sm', type: 'button' }, d.status === 'pending' ? 'Finish Stripe setup' : 'Set up payouts with Stripe');
      btn.addEventListener('click', function () { connect(btn); });
      c.appendChild(btn);
    }
    if (d.payments && d.payments.length) {
      c.appendChild(el('h3', { style: 'font-size:1rem;color:var(--primary);margin:1.25rem 0 0.5rem' }, 'Recent online payments'));
      var wrap = el('div', { class: 'table-scroll' }), t = el('table', { class: 'data-table' });
      t.innerHTML = '<thead><tr><th>Date</th><th>Property</th><th>Tenant</th><th>For</th><th>Method</th><th class="num">Amount</th><th>Status</th></tr></thead>';
      var body = el('tbody');
      d.payments.forEach(function (x) {
        var tr = el('tr'), s = STATUS[x.status] || [x.status, ''];
        [day(x.paid_at || x.created_at), x.address, x.tenant_name, month(x.period), METHOD[x.method] || ''].forEach(function (v) { tr.appendChild(el('td', null, v)); });
        tr.appendChild(el('td', { class: 'num' }, money(x.amount_cents)));
        var st = el('td'); var badge = el('span', { class: 'badge ' + s[1] }, s[0]); if (x.failure) badge.title = x.failure; st.appendChild(badge); tr.appendChild(st);
        body.appendChild(tr);
      });
      t.appendChild(body); wrap.appendChild(t); c.appendChild(wrap);
    }
  }

  function render() { call('/rent-payments').then(function (d) { if (d.enabled) card(d); }).catch(function () {}); }

  function notice() {
    var q = new URLSearchParams(location.search).get('payouts');
    if (!q) return;
    history.replaceState(null, '', location.pathname);
    var nav = document.querySelector('[data-page="settings"]'); if (nav) nav.click();
    setTimeout(function () { var c = document.getElementById('payoutsCard'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }, 600);
  }

  function start() {
    if (view.style.display === 'none') { loaded = false; var old = document.getElementById('payoutsCard'); if (old) old.remove(); return; }
    if (loaded || !token()) return; loaded = true; render(); notice();
  }
  new MutationObserver(start).observe(view, { attributes: true, attributeFilter: ['style'] });
  start();
})();
