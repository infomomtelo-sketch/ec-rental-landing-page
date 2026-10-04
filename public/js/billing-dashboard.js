// Plan & Billing card on the Settings page, plus a reminder banner when the account has no active plan.
// Talks to /api/billing (src/billing.ts). Does nothing until Stripe is switched on.
(function () {
  var view = document.getElementById('dashboardView');
  var settingsPage = document.getElementById('page-settings');
  if (!view || !settingsPage) return;
  var loaded = false;

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function call(path, method, body) {
    return fetch('/api' + path, { method: method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.'); return d; }); });
  }
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  var GOOD = ['active', 'trialing'];
  var STATUS_TEXT = { active: 'Active', trialing: 'Free trial', past_due: 'Payment failed', unpaid: 'Unpaid', canceled: 'Canceled', incomplete: 'Waiting for payment', incomplete_expired: 'Checkout expired', paused: 'Paused', none: 'Not started' };

  function go(path, body, btn) {
    var label = btn.textContent; btn.disabled = true; btn.textContent = 'Opening Stripe...';
    call(path, 'POST', body).then(function (d) {
      if (d.url) { location.href = d.url; return; }
      btn.disabled = false; btn.textContent = label; render();
    }).catch(function (err) { btn.disabled = false; btn.textContent = label; alert(err.message); });
  }

  function banner(b) {
    var old = document.getElementById('billingBanner'); if (old) old.remove();
    if (!b.enabled || b.exempt || GOOD.indexOf(b.status) !== -1) return;
    var msg = b.status === 'past_due' || b.status === 'unpaid' ? 'Your last payment didn’t go through. Update your card to keep your plan.'
      : b.status === 'canceled' ? 'Your plan has ended. Restart it any time to keep using EC Rental.'
      : 'Finish setting up your plan' + (b.trialDays ? ' to start your ' + b.trialDays + '-day free trial.' : '.');
    var box = el('div', { id: 'billingBanner', style: 'background:#fff7e6;border:1px solid #f0c36d;color:#7a4b00;border-radius:10px;padding:0.8rem 1rem;margin-bottom:1rem;display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap' });
    box.appendChild(el('span', { style: 'flex:1;min-width:200px' }, msg));
    var btn = el('button', { class: 'btn btn-sm', type: 'button' }, b.hasCustomer && (b.status === 'past_due' || b.status === 'unpaid') ? 'Update card' : 'Choose plan');
    btn.addEventListener('click', function () { if (b.hasCustomer && (b.status === 'past_due' || b.status === 'unpaid')) go('/billing/portal', null, btn); else { document.querySelector('[data-page="settings"]').click(); var c = document.getElementById('billingCard'); if (c) c.scrollIntoView({ behavior: 'smooth' }); } });
    box.appendChild(btn);
    var main = view.querySelector('.main'); main.insertBefore(box, main.firstChild);
  }

  function card(b) {
    var c = document.getElementById('billingCard');
    if (!c) { c = el('div', { class: 'data-card', id: 'billingCard', style: 'padding:2rem;' }); settingsPage.insertBefore(c, settingsPage.querySelector('.data-card')); }
    c.innerHTML = '';
    c.appendChild(el('h2', { style: 'color:var(--primary);margin-bottom:0.5rem;' }, 'Plan & Billing'));
    if (b.exempt) { c.appendChild(el('p', { style: 'color:var(--gray)' }, 'Admin account: no subscription needed.')); return; }
    var good = GOOD.indexOf(b.status) !== -1;
    var line = 'Status: ' + (STATUS_TEXT[b.status] || b.status);
    if (b.status === 'trialing' && b.trialEnd) line += ', first charge on ' + fmtDate(b.trialEnd);
    else if (good && b.periodEnd) line += b.cancelAtPeriodEnd ? ', ends on ' + fmtDate(b.periodEnd) : ', renews on ' + fmtDate(b.periodEnd);
    c.appendChild(el('p', { style: 'margin-bottom:1rem;color:var(--gray)' }, line));
    var grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0.75rem;margin-bottom:1rem' });
    b.plans.forEach(function (p) {
      var current = good && b.plan === p.id;
      var box = el('div', { style: 'border:1px solid ' + (current ? 'var(--primary)' : '#e5e7eb') + ';border-radius:10px;padding:1rem;' + (current ? 'background:#f0f7f3' : '') });
      box.appendChild(el('strong', null, p.name));
      box.appendChild(el('div', { style: 'font-size:1.4rem;font-weight:700;margin:0.3rem 0' }, '$' + p.price + '/mo'));
      if (current) box.appendChild(el('span', { class: 'badge badge-green' }, 'Your plan'));
      else {
        var btn = el('button', { class: 'btn btn-sm', type: 'button' }, good ? 'Switch' : (b.trialDays ? 'Start free trial' : 'Choose'));
        btn.addEventListener('click', function () {
          if (good && !confirm('Switch to ' + p.name + ' ($' + p.price + '/mo)? Stripe adjusts your next bill for the change.')) return;
          go(good ? '/billing/change' : '/billing/checkout', { plan: p.id }, btn);
        });
        box.appendChild(btn);
      }
      grid.appendChild(box);
    });
    c.appendChild(grid);
    if (b.hasCustomer) {
      var manage = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, 'Manage billing (card, invoices, cancel)');
      manage.addEventListener('click', function () { go('/billing/portal', null, manage); });
      c.appendChild(manage);
    }
    c.appendChild(el('p', { style: 'color:var(--gray);font-size:0.8rem;margin-top:0.75rem' }, 'Payments are handled securely by Stripe. EC Rental never sees your card number.'));
  }

  function render() {
    call('/billing').then(function (b) {
      if (!b.enabled) return;
      card(b); banner(b);
      var plan = b.plans.filter(function (p) { return p.id === b.plan; })[0];
      var label = document.getElementById('userPlan');
      if (plan && label && !b.exempt) label.textContent = plan.name + ' · ' + (STATUS_TEXT[b.status] || b.status);
    }).catch(function () {});
  }

  function notice() {
    var q = new URLSearchParams(location.search).get('billing');
    if (!q) return;
    history.replaceState(null, '', location.pathname);
    if (q === 'success') alert('Thanks! Your plan is set up. It can take a few seconds to show here.');
    // Stripe's webhook may land a moment after the redirect, so look again shortly.
    if (q === 'success' || q === 'portal') setTimeout(render, 4000);
  }

  function start() {
    if (view.style.display === 'none') { loaded = false; var old = document.getElementById('billingCard'); if (old) old.remove(); var bn = document.getElementById('billingBanner'); if (bn) bn.remove(); return; }
    if (loaded || !token()) return; loaded = true; render(); notice();
  }
  new MutationObserver(start).observe(view, { attributes: true, attributeFilter: ['style'] });
  start();
})();
