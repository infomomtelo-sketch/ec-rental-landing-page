// Site owner admin page (/admin). Uses the dashboard's sign-in token; the server only answers admins.
(function() {
  var token = null; try { token = localStorage.getItem('ec_token'); } catch (e) { /* storage blocked */ }
  var PLANS = [['solo', 'Solo Landlord', 29], ['manager', 'Property Manager', 79], ['portfolio', 'Portfolio', 199]];
  var LEAD_TYPES = { tenant_application: 'Renter inquiry', maintenance_request: 'Maintenance', rent_review: 'Rent review' };
  var accounts = [], listings = [], leads = [];

  function api(path, method, body) {
    var headers = { 'Content-Type': 'application/json' }; if (token) headers.Authorization = 'Bearer ' + token;
    return fetch('/api' + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function(res) { return res.json().catch(function() { return {}; }).then(function(data) { return { status: res.status, data: data }; }); });
  }
  function esc(v) { if (v === undefined || v === null) return ''; var d = document.createElement('div'); d.textContent = String(v); return d.innerHTML; }
  function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function date(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function empty(body, cols, text) { body.innerHTML = '<tr><td colspan="' + cols + '" class="empty">' + text + '</td></tr>'; }
  function gate(title, text, button) { if (button) document.getElementById('gateBtn').textContent = button; document.getElementById('app').style.display = 'none'; document.getElementById('gateTitle').textContent = title; document.getElementById('gateText').textContent = text; document.getElementById('gate').style.display = 'block'; }

  // Tabs
  var tabs = document.querySelectorAll('.tabs button');
  function showTab(name) {
    tabs.forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    document.querySelectorAll('.page').forEach(function(p) { p.classList.toggle('active', p.id === 'page-' + name); });
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ }
  }
  tabs.forEach(function(t) { t.addEventListener('click', function() { showTab(this.getAttribute('data-tab')); }); });

  function loadOverview() {
    return api('/admin/overview').then(function(r) {
      var o = r.data;
      var cards = [
        ['Landlord accounts', o.landlords, (o.newAccounts7 || 0) + ' new this week, ' + (o.newAccounts30 || 0) + ' this month'],
        ['Tenants', o.tenants, 'Tenant portal accounts'],
        ['Properties', o.properties, 'Across all landlords'],
        ['Listings', o.listings, (o.activeListings || 0) + ' active'],
        ['Applications', o.applications, (o.newApplications || 0) + ' waiting for review'],
        ['Leads', o.leads, (o.newLeads || 0) + ' new'],
        ['Open maintenance', o.openMaintenance, 'Requests not yet resolved'],
        ['Plan value / mo', money(o.planValue), 'At list price, not billed yet'],
      ];
      document.getElementById('statCards').innerHTML = cards.map(function(c) { return '<div class="stat-card"><div class="label">' + esc(c[0]) + '</div><div class="value">' + esc(c[1] === undefined ? 0 : c[1]) + '</div><div class="note">' + esc(c[2]) + '</div></div>'; }).join('');
      document.getElementById('planBody').innerHTML = PLANS.map(function(p) { var n = (o.byPlan && o.byPlan[p[0]]) || 0; return '<tr><td>' + esc(p[1]) + '</td><td>' + n + '</td><td>' + money(p[2]) + '/mo</td><td>' + money(n * p[2]) + '</td></tr>'; }).join('');
      document.getElementById('overviewSub').textContent = 'Everything across EC Rental, all accounts. Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '.';
    });
  }

  function planSelect(a) {
    if (a.role === 'admin') return '<span class="badge badge-gold">Admin</span>';
    return '<select onchange="ecAdminSetPlan(' + Number(a.id) + ', this)">' + PLANS.map(function(p) { return '<option value="' + p[0] + '"' + (p[0] === a.plan ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + '</select>';
  }
  function renderAccounts() {
    var q = document.getElementById('accountSearch').value.trim().toLowerCase();
    var rows = accounts.filter(function(a) { return !q || [a.name, a.email, a.company].join(' ').toLowerCase().indexOf(q) !== -1; });
    document.getElementById('accountsTitle').textContent = 'Accounts (' + rows.length + ')';
    var body = document.getElementById('accountsBody');
    if (!rows.length) return empty(body, 6, accounts.length ? 'No accounts match your search.' : 'No landlord accounts yet.');
    body.innerHTML = rows.map(function(a) {
      var limit = Number(a.property_limit) >= 999999 ? 'unlimited' : a.property_limit;
      return '<tr><td><strong>' + esc(a.name) + '</strong>' + (a.company ? '<br><span class="muted">' + esc(a.company) + '</span>' : '') + '</td>' +
        '<td><a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a>' + (a.phone ? '<br><a href="tel:' + esc(a.phone) + '">' + esc(a.phone) + '</a>' : '') + (a.unit_count ? '<br><span class="muted">Said ' + esc(a.unit_count) + ' units at sign up</span>' : '') + '</td>' +
        '<td>' + planSelect(a) + '</td><td>' + esc(a.properties) + ' <span class="muted">of ' + esc(limit) + '</span></td><td>' + esc(a.listings) + '</td><td>' + date(a.created_at) + '</td></tr>';
    }).join('');
  }
  function loadAccounts() { return api('/admin/users').then(function(r) { accounts = Array.isArray(r.data) ? r.data : []; renderAccounts(); }); }
  window.ecAdminSetPlan = function(id, sel) {
    sel.disabled = true;
    api('/admin/users/' + id, 'PUT', { plan: sel.value }).then(function(r) {
      sel.disabled = false;
      if (!r.data.success) { alert(r.data.error || 'Could not change the plan.'); return loadAccounts(); }
      var a = accounts.filter(function(x) { return x.id === id; })[0]; if (a) a.plan = sel.value;
      loadAccounts(); loadOverview();
    });
  };
  document.getElementById('accountSearch').addEventListener('input', renderAccounts);

  function renderListings() {
    var q = document.getElementById('listingSearch').value.trim().toLowerCase();
    var rows = listings.filter(function(l) { return !q || [l.street, l.unit, l.city, l.owner_name, l.owner_email].join(' ').toLowerCase().indexOf(q) !== -1; });
    document.getElementById('listingsTitle').textContent = 'Listings (' + rows.length + ')';
    var body = document.getElementById('listingsBody');
    if (!rows.length) return empty(body, 6, listings.length ? 'No listings match your search.' : 'No listings yet.');
    body.innerHTML = rows.map(function(l) {
      var badge = l.status === 'active' ? 'badge-green' : l.status === 'draft' ? 'badge-gray' : 'badge-yellow';
      var home = esc(l.street) + (l.unit ? ' #' + esc(l.unit) : '') + '<br><span class="muted">' + esc(l.city) + ' · ' + esc(l.bedrooms) + ' bd</span>';
      return '<tr><td>' + (l.status === 'active' ? '<a href="/listing?id=' + Number(l.id) + '" target="_blank" rel="noopener">' + home + '</a>' : home) + '</td>' +
        '<td>' + esc(l.owner_name || 'Unknown') + '<br><span class="muted">' + esc(l.owner_email || '') + '</span></td><td>' + money(l.rent) + '</td>' +
        '<td><span class="badge ' + badge + '">' + esc(l.status) + '</span>' + (l.syndicate_zillow ? '<br><span class="muted">On Zillow feed</span>' : '') + '</td><td>' + esc(l.applications) + '</td><td>' + date(l.created_at) + '</td></tr>';
    }).join('');
  }
  function loadListings() { return api('/admin/listings').then(function(r) { listings = Array.isArray(r.data) ? r.data : []; renderListings(); }); }
  document.getElementById('listingSearch').addEventListener('input', renderListings);

  function leadDetails(l) {
    var d = l.details || {}; var parts = [];
    if (l.type === 'maintenance_request') { parts.push(d.address, d.description, d.priority ? 'Priority: ' + d.priority : ''); }
    else if (l.type === 'rent_review') { parts.push([d.street, d.city, d.zip].filter(Boolean).join(', '), d.bedrooms ? d.bedrooms + ' bd' : '', d.current_rent ? 'Now ' + money(d.current_rent) : '', d.message); }
    else { parts.push(d.area, d.source === 'zillow' ? 'From Zillow' : '', d.bedrooms ? d.bedrooms + ' bd' : '', d.budget ? 'Budget ' + d.budget : '', d.moveIn ? 'Move-in ' + d.moveIn : '', d.message); }
    return parts.filter(Boolean).map(esc).join('<br>') || '<span class="muted">No details</span>';
  }
  function renderLeads() {
    var f = document.getElementById('leadFilter').value;
    var rows = leads.filter(function(l) { return !f || l.status === f; });
    document.getElementById('leadsTitle').textContent = 'Leads (' + rows.length + ')';
    var body = document.getElementById('leadsBody');
    if (!rows.length) return empty(body, 5, leads.length ? 'No leads with this status.' : 'No leads yet.');
    body.innerHTML = rows.map(function(l) {
      var from = '<strong>' + esc(l.name) + '</strong>' + (l.email ? '<br><a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '') + (l.phone ? '<br><a href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a>' : '');
      var status = '<select onchange="ecAdminLeadStatus(' + Number(l.id) + ', this)">' + [['pending', 'New'], ['contacted', 'Contacted'], ['closed', 'Closed']].map(function(o) { return '<option value="' + o[0] + '"' + (o[0] === l.status ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
      return '<tr><td>' + date(l.created_at) + '</td><td>' + esc(LEAD_TYPES[l.type] || l.type) + '</td><td>' + from + '</td><td>' + leadDetails(l) + '</td><td>' + status + '</td></tr>';
    }).join('');
  }
  function loadLeads() { return api('/leads').then(function(r) { leads = Array.isArray(r.data) ? r.data : []; renderLeads(); }); }
  window.ecAdminLeadStatus = function(id, sel) {
    api('/leads/' + id, 'PUT', { status: sel.value }).then(function(r) {
      if (!r.data.success) alert(r.data.error || 'Could not update the lead.');
      var l = leads.filter(function(x) { return x.id === id; })[0]; if (l && r.data.success) l.status = sel.value;
      renderLeads(); loadOverview();
    });
  };
  document.getElementById('leadFilter').addEventListener('change', renderLeads);

  if (!token) return gate('Sign in first', 'Sign in to your EC Rental dashboard, then open the Admin page from the menu.');
  api('/admin/overview').then(function(r) {
    if (r.status === 401) return gate('Sign in first', 'Your session has ended. Sign in to your EC Rental dashboard, then open the Admin page from the menu.');
    if (r.status === 403) return gate('Admins only', 'This page is only for the EC Rental site owner. Your account can keep using the dashboard as usual.', 'Back to dashboard');
    document.getElementById('app').style.display = 'block';
    var start = (location.hash || '').slice(1); if (['overview', 'accounts', 'listings', 'leads'].indexOf(start) !== -1) showTab(start);
    loadOverview(); loadAccounts(); loadListings(); loadLeads();
  }).catch(function() { gate('Something went wrong', 'The admin page could not load. Please refresh and try again.'); });
})();
