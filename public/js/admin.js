// Site owner admin page (/admin). Uses the dashboard's sign-in token; the server only answers admins.
(function() {
  var token = null; try { token = localStorage.getItem('ec_token'); } catch (e) { /* storage blocked */ }
  var PLANS = [['solo', 'Solo Landlord', 29], ['manager', 'Property Manager', 79], ['portfolio', 'Portfolio', 199]];
  var LEAD_TYPES = { tenant_application: 'Renter inquiry', maintenance_request: 'Maintenance', rent_review: 'Rent review', ai_inspection: 'Tello Inspect' };
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
        ['Paying in Stripe', o.paying, (o.trialing || 0) + ' on the intro offer or a free trial'],
        ['Plan value / mo', money(o.planValue), 'All accounts at list price'],
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
  var BILLING = { active: ['Paying', 'badge-green'], trialing: ['Intro or trial', 'badge-gold'], past_due: ['Payment failed', 'badge-yellow'], unpaid: ['Unpaid', 'badge-yellow'], canceled: ['Canceled', 'badge-gray'] };
  function billingBadge(status) { var b = BILLING[status]; return '<br><span class="badge ' + (b ? b[1] : 'badge-gray') + '" style="margin-top:0.35rem;">' + esc(b ? b[0] : 'No subscription') + '</span>'; }
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
        '<td>' + planSelect(a) + (a.role === 'admin' ? '' : billingBadge(a.billing_status)) + '</td><td>' + esc(a.properties) + ' <span class="muted">of ' + esc(limit) + '</span></td><td>' + esc(a.listings) + '</td><td>' + date(a.created_at) + '</td></tr>';
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
    else if (l.type === 'ai_inspection') { parts.push(d.address, d.overall ? 'Overall: ' + d.overall : '', d.photos ? d.photos + ' photos, ' + (d.repairs || 0) + ' repairs flagged' : '', d.notes); }
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

  // Visitors
  var PAGE_NAMES = { '/': 'Home page', '/listings': 'Rentals', '/listing': 'A listing', '/apply': 'Rental application', '/rent-review': 'Free rent review', '/tello-inspect': 'Tello Inspect', '/ai-inspection': 'Tello Inspect (old link)', '/tello': 'Tello full screen', '/features/': 'Features', '/privacy': 'Privacy', '/terms': 'Terms' };
  function pageName(p) { var k = p.replace(/\.html$/, '').replace(/\/index$/, '/'); return PAGE_NAMES[k] || (k.indexOf('/features/') === 0 ? 'Features: ' + k.slice(10) : k); }
  function loadVisits() {
    var days = parseInt(document.getElementById('visitDays').value, 10) || 30;
    return api('/admin/visits?days=' + days).then(function(r) {
      var v = r.data || {}; var res = v.results || {};
      var phone = 0, all = 0; (v.devices || []).forEach(function(d) { all += d.visitors; if (d.device === 'phone') phone += d.visitors; });
      var cards = [
        ['Visitors', v.visitors || 0, (v.visitors7 || 0) + ' in the last 7 days'],
        ['Page views', v.views || 0, (v.visitors ? (v.views / v.visitors).toFixed(1) : '0') + ' pages per visitor'],
        ['On a phone', all ? Math.round(phone * 100 / all) + '%' : '-', 'The rest on a computer'],
        ['New accounts', res.accounts || 0, v.visitors ? ((res.accounts || 0) * 100 / v.visitors).toFixed(1) + '% of visitors signed up' : 'Sign-ups in this range'],
        ['Rental applications', res.applications || 0, 'Sent from listings'],
        ['Free tools used', (res.aiChecks || 0) + (res.rentReviews || 0), (res.aiChecks || 0) + ' Tello Inspect reports, ' + (res.rentReviews || 0) + ' rent reviews'],
      ];
      document.getElementById('visitCards').innerHTML = cards.map(function(c) { return '<div class="stat-card"><div class="label">' + esc(c[0]) + '</div><div class="value">' + esc(c[1]) + '</div><div class="note">' + esc(c[2]) + '</div></div>'; }).join('');
      // One bar per day, including days with no visits.
      var byDay = {}; (v.daily || []).forEach(function(d) { byDay[d.day] = d; });
      var series = [], max = 1;
      for (var i = days - 1; i >= 0; i--) { var key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); var n = byDay[key] ? byDay[key].visitors : 0; series.push([key, n, byDay[key] ? byDay[key].views : 0]); if (n > max) max = n; }
      document.getElementById('visitChart').innerHTML = series.map(function(d) { return '<div class="bar" style="height:' + Math.max(2, Math.round(d[1] * 100 / max)) + '%" title="' + esc(date(d[0] + 'T12:00:00') + ': ' + d[1] + ' visitors, ' + d[2] + ' views') + '"></div>'; }).join('');
      document.getElementById('visitAxis').innerHTML = '<span>' + esc(date(series[0][0] + 'T12:00:00')) + '</span><span>Today</span>';
      var srcMax = 1; (v.sources || []).forEach(function(s) { if (s.visitors > srcMax) srcMax = s.visitors; });
      var sb = document.getElementById('sourceBody');
      if (!(v.sources || []).length) empty(sb, 2, 'No visits counted yet.');
      else sb.innerHTML = v.sources.map(function(s) { return '<tr><td>' + esc(s.source) + '<div class="meter"><i style="width:' + Math.round(s.visitors * 100 / srcMax) + '%"></i></div></td><td>' + s.visitors + '</td></tr>'; }).join('');
      var pb = document.getElementById('pageBody');
      if (!(v.pages || []).length) empty(pb, 2, 'No visits counted yet.');
      else pb.innerHTML = v.pages.map(function(p) { return '<tr><td>' + esc(pageName(p.path)) + '</td><td>' + p.views + '</td></tr>'; }).join('');
    });
  }
  document.getElementById('visitDays').addEventListener('change', loadVisits);

  if (!token) return gate('Sign in first', 'Sign in to your EC Rental dashboard, then open the Admin page from the menu.');
  api('/admin/overview').then(function(r) {
    if (r.status === 401) return gate('Sign in first', 'Your session has ended. Sign in to your EC Rental dashboard, then open the Admin page from the menu.');
    if (r.status === 403) return gate('Admins only', 'This page is only for the EC Rental site owner. Your account can keep using the dashboard as usual.', 'Back to dashboard');
    document.getElementById('app').style.display = 'block';
    var start = (location.hash || '').slice(1); if (['overview', 'visitors', 'accounts', 'listings', 'leads'].indexOf(start) !== -1) showTab(start);
    try { localStorage.setItem('ec_notrack', '1'); } catch (e) { /* storage blocked */ }
    loadOverview(); loadVisits(); loadAccounts(); loadListings(); loadLeads();
  }).catch(function() { gate('Something went wrong', 'The admin page could not load. Please refresh and try again.'); });
})();
