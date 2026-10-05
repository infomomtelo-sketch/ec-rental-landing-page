// "Rent reminders" card on the Settings page: switch automatic rent reminder emails on or off and pick the due day
// and timing. Talks to /api/rent-reminders (src/rent-reminders.ts).
(function () {
  var view = document.getElementById('dashboardView');
  var settingsPage = document.getElementById('page-settings');
  if (!view || !settingsPage) return;
  var loaded = false;

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function call(method, body) {
    return fetch('/api/rent-reminders', { method: method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.'); return d; }); });
  }
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function select(id, from, to, value, label) {
    var sel = el('select', { id: id, class: 'form-control' });
    for (var i = from; i <= to; i++) { var o = el('option', { value: String(i) }, label(i)); if (i === value) o.selected = true; sel.appendChild(o); }
    return sel;
  }
  function field(text, input) { var g = el('div', { class: 'form-group', style: 'margin-bottom:0.75rem;' }); g.appendChild(el('label', { for: input.id }, text)); g.appendChild(input); return g; }

  function card(d) {
    var c = document.getElementById('remindersCard');
    if (!c) {
      c = el('div', { class: 'data-card', id: 'remindersCard', style: 'padding:2rem;' });
      var after = document.getElementById('payoutsCard') || document.getElementById('billingCard');
      settingsPage.insertBefore(c, after ? after.nextSibling : settingsPage.querySelector('.data-card'));
    }
    c.innerHTML = '';
    c.appendChild(el('h2', { style: 'color:var(--primary);margin-bottom:0.5rem;' }, 'Rent reminders'));
    c.appendChild(el('p', { style: 'color:var(--gray);margin-bottom:1rem;' }, 'Email your tenants a reminder before rent is due, and a friendly notice if a month\'s rent isn\'t recorded a few days after. Tenants need to have accepted their portal invite. Rent you add in Transactions as Rent Collected, or rent paid online, stops the reminders for that month.'));
    if (d.planOk === false) {
      c.appendChild(el('p', { style: 'color:#7a4b00;' }, 'Rent reminders come with an EC Rental plan. Start your free trial in Plan & Billing above, then come back here.'));
      return;
    }
    var on = el('input', { type: 'checkbox', id: 'remEnabled' }); on.checked = !!d.enabled;
    var onLabel = el('label', { for: 'remEnabled', style: 'display:flex;align-items:center;gap:0.5rem;font-weight:700;margin-bottom:1rem;cursor:pointer;' });
    onLabel.appendChild(on); onLabel.appendChild(document.createTextNode('Send rent reminders automatically'));
    c.appendChild(onLabel);
    c.appendChild(field('Rent is due on the', select('remDue', 1, 28, d.due_day || 1, function (i) { return ordinal(i) + ' of the month'; })));
    c.appendChild(field('Send the reminder', select('remBefore', 1, 10, d.days_before || 3, function (i) { return i + (i === 1 ? ' day' : ' days') + ' before'; })));
    c.appendChild(field('Send a late notice if unpaid', select('remLate', 1, 15, d.late_after || 5, function (i) { return i + (i === 1 ? ' day' : ' days') + ' after the due date'; })));
    var btn = el('button', { class: 'btn btn-sm', type: 'button' }, 'Save reminders');
    var msg = el('span', { style: 'margin-left:0.75rem;color:var(--gray);font-size:0.9rem;' });
    btn.addEventListener('click', function () {
      btn.disabled = true; msg.textContent = 'Saving...';
      call('PUT', { enabled: on.checked, due_day: +document.getElementById('remDue').value, days_before: +document.getElementById('remBefore').value, late_after: +document.getElementById('remLate').value })
        .then(function (r) { msg.textContent = r.enabled ? 'Saved. Reminders are on.' : 'Saved. Reminders are off.'; })
        .catch(function (err) { msg.textContent = err.message; })
        .then(function () { btn.disabled = false; });
    });
    c.appendChild(btn); c.appendChild(msg);
  }

  function start() {
    if (view.style.display === 'none') { loaded = false; var old = document.getElementById('remindersCard'); if (old) old.remove(); return; }
    if (loaded || !token()) return; loaded = true;
    // Wait a moment so the billing and payouts cards are placed first.
    setTimeout(function () { call('GET').then(card).catch(function () {}); }, 300);
  }
  new MutationObserver(start).observe(view, { attributes: true, attributeFilter: ['style'] });
  start();
})();
