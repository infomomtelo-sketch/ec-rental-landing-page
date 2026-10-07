// "Book in-person inspection" on the dashboard Inspections page (the first one is a free launch bonus once the
// plan is paid), plus an "In-Person Inspection Requests" card on the admin Chat Leads page. Talks to
// /api/inspection-requests (src/inspection-requests.ts) and /api/leads.
(function () {
  var page = document.getElementById('page-inspections');
  if (!page) return;
  var TYPES = { move_in: 'Move-in', move_out: 'Move-out', routine: 'Routine', annual: 'Annual' };

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function api(path, method, body) {
    return fetch('/api' + path, { method: method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.'); return d; }); });
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

  // Button next to "+ New Inspection"
  var newBtn = document.getElementById('newInspectionBtn');
  var bookBtn = document.createElement('button');
  bookBtn.className = 'btn btn-secondary'; bookBtn.type = 'button'; bookBtn.id = 'bookInspectionBtn';
  bookBtn.textContent = 'Book in-person inspection';
  var btnWrap = document.createElement('div'); btnWrap.className = 'header-actions'; btnWrap.style.cssText = 'display:flex;gap:0.5rem;flex-wrap:wrap';
  newBtn.parentNode.insertBefore(btnWrap, newBtn); btnWrap.appendChild(bookBtn); btnWrap.appendChild(newBtn);

  // Launch bonus banner + the landlord's requests
  var promo = document.createElement('div');
  promo.id = 'inspPromo'; promo.style.display = 'none';
  promo.style.cssText += ';background:#f0f7f3;border:1px solid #b7dcc6;color:#14532d;border-radius:10px;padding:0.9rem 1rem;margin-bottom:1rem;display:none;gap:0.75rem;align-items:center;flex-wrap:wrap';
  promo.innerHTML = '<span style="flex:1;min-width:220px"><strong>Launch bonus:</strong> your first in-person inspection by a certified home inspector is <strong>free</strong> (Fresno &amp; Clovis area). We schedule it after your first monthly payment.</span>';
  var promoBtn = document.createElement('button'); promoBtn.className = 'btn btn-sm'; promoBtn.type = 'button'; promoBtn.textContent = 'Book it';
  promo.appendChild(promoBtn);
  var header = page.querySelector('.main-header'); header.parentNode.insertBefore(promo, header.nextSibling);
  var mineCard = document.createElement('div'); mineCard.className = 'data-card'; mineCard.style.display = 'none';
  mineCard.innerHTML = '<div class="data-card-header"><h2>In-person inspection requests</h2></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Requested</th><th>Property</th><th>Type</th><th>Preferred dates</th><th>Status</th></tr></thead><tbody id="inspReqBody"></tbody></table></div>';
  page.appendChild(mineCard);

  // Request form (modal)
  var modal = document.createElement('div'); modal.className = 'modal-overlay'; modal.id = 'inspReqModal';
  modal.innerHTML = '<div class="modal" style="max-width:520px;"><button class="modal-close" type="button" data-req-close>✕</button><h2>Book an in-person inspection</h2>' +
    '<p style="color:var(--gray);font-size:0.9rem;margin:0.4rem 0 1rem">A certified home inspector visits the property (Fresno &amp; Clovis area) and we call you to confirm a time. <span id="inspReqFree"></span></p>' +
    '<form id="inspReqForm"><div class="form-group"><label>Property *</label><select name="property_id" required></select></div>' +
    '<div class="form-row"><div class="form-group"><label>Type *</label><select name="type"><option value="move_in">Move-in</option><option value="move_out">Move-out</option><option value="routine">Routine</option><option value="annual">Annual</option></select></div>' +
    '<div class="form-group"><label>Your phone *</label><input type="tel" name="phone" required placeholder="(559) 555-1234" /></div></div>' +
    '<div class="form-group"><label>Preferred days and times</label><input type="text" name="preferred_dates" maxlength="300" placeholder="e.g. weekday mornings, after Oct 15" /></div>' +
    '<div class="form-group"><label>Notes (gate code, tenant contact, anything we should know)</label><textarea name="notes" rows="3" maxlength="1000"></textarea></div>' +
    '<p id="inspReqMsg" style="font-size:0.85rem;margin-bottom:0.75rem"></p><button type="submit" class="btn">Send request</button></form></div>';
  document.body.appendChild(modal);
  var form = modal.querySelector('form'), msg = modal.querySelector('#inspReqMsg');
  var state = { freeAvailable: false };

  function closeModal() { modal.classList.remove('open'); }
  modal.querySelector('[data-req-close]').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  function openForm() {
    form.reset(); msg.textContent = ''; msg.style.color = '';
    document.getElementById('inspReqFree').textContent = state.freeAvailable ? 'This first one is free with your plan.' : 'We’ll quote the price when we call.';
    api('/properties').then(function (props) {
      var sel = form.elements.property_id;
      if (!props.length) { sel.innerHTML = '<option value="">Add a property first</option>'; return; }
      sel.innerHTML = props.map(function (p) { return '<option value="' + p.id + '">' + esc(p.address) + (p.city ? ', ' + esc(p.city) : '') + '</option>'; }).join('');
    }).catch(function () {});
    modal.classList.add('open');
  }
  bookBtn.addEventListener('click', openForm); promoBtn.addEventListener('click', openForm);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    var data = {}; new FormData(form).forEach(function (v, k) { data[k] = v; });
    api('/inspection-requests', 'POST', data).then(function (r) {
      btn.disabled = false;
      msg.style.color = '#166534';
      msg.textContent = r.free ? 'Request sent! This one is your free launch bonus. We’ll call you to set a time.' : 'Request sent! We’ll call you to confirm a time and price.';
      setTimeout(closeModal, 2500); load();
    }).catch(function (err) { btn.disabled = false; msg.style.color = '#b91c1c'; msg.textContent = err.message; });
  });

  function load() {
    if (!token()) return;
    api('/inspection-requests').then(function (d) {
      state.freeAvailable = !!d.freeAvailable;
      promo.style.display = d.freeAvailable ? 'flex' : 'none';
      var rows = d.requests || [];
      mineCard.style.display = rows.length ? '' : 'none';
      var st = { pending: 'Received', contacted: 'Scheduling', closed: 'Done' };
      document.getElementById('inspReqBody').innerHTML = rows.map(function (r) {
        return '<tr><td>' + fmt(r.created_at) + '</td><td>' + esc(r.address) + '</td><td>' + esc(TYPES[r.type] || r.type) + (r.free ? ' <span class="badge badge-green">Free</span>' : '') + '</td><td>' + esc(r.preferred_dates || '—') + '</td><td>' + esc(st[r.status] || r.status) + '</td></tr>';
      }).join('');
    }).catch(function () {});
  }
  var nav = document.querySelector('[data-page="inspections"]'); if (nav) nav.addEventListener('click', load);
  var view = document.getElementById('dashboardView');
  if (view) new MutationObserver(function () { if (view.style.display !== 'none') load(); }).observe(view, { attributes: true, attributeFilter: ['style'] });
  load();

  // Admin: requests on the Chat Leads page
  var leadsPage = document.getElementById('page-leads');
  if (!leadsPage) return;
  var adminCard = document.createElement('div'); adminCard.className = 'data-card';
  adminCard.innerHTML = '<div class="data-card-header"><h2>In-Person Inspection Requests</h2></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Received</th><th>Landlord</th><th>Contact</th><th>Property</th><th>Type</th><th>Preferred</th><th>Notes</th><th>Status</th></tr></thead><tbody id="inspLeadsBody"><tr><td colspan="8" class="empty-state">Loading...</td></tr></tbody></table></div>';
  var firstCard = leadsPage.querySelector('.data-card'); leadsPage.insertBefore(adminCard, firstCard);
  function loadAdmin() {
    api('/leads').then(function (data) {
      if (!Array.isArray(data)) return;
      var rows = data.filter(function (l) { return l.type === 'inspection_request'; });
      document.getElementById('inspLeadsBody').innerHTML = rows.length === 0 ? '<tr><td colspan="8" class="empty-state"><div class="icon"><svg class="ico" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>No in-person inspection requests yet. Landlords book them from their Inspections page.</td></tr>' : rows.map(function (l) {
        var d = l.details || {};
        var contact = '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' + (l.phone ? '<br><a href="tel:' + esc(String(l.phone).replace(/[^\d+]/g, '')) + '">' + esc(l.phone) + '</a>' : '');
        var type = esc(TYPES[d.type] || d.type || '') + (d.free ? '<br><span class="badge badge-green">Free bonus</span>' : '') + '<br><small>Plan: ' + esc(d.billing_status || 'none') + '</small>';
        var sel = '<select class="status-select" onchange="updateLeadStatus(' + l.id + ', this.value)">' + [['pending', 'New'], ['contacted', 'Contacted'], ['closed', 'Closed']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === l.status ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
        return '<tr><td>' + fmt(l.created_at) + '</td><td>' + esc(l.name) + '</td><td>' + contact + '</td><td>' + esc(d.address || '') + '</td><td>' + type + '</td><td>' + esc(d.preferred_dates || '—') + '</td><td style="max-width:220px;white-space:normal">' + esc(d.notes || '—') + '</td><td>' + sel + '</td></tr>';
      }).join('');
    }).catch(function () {});
  }
  var leadsNav = document.querySelector('[data-page="leads"]'); if (leadsNav) leadsNav.addEventListener('click', loadAdmin);
})();
