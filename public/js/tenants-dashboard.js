// Dashboard "Tenants" page: invite tenants to the tenant portal and manage their access.
(function() {
  var body = document.getElementById('tenantsBody');
  if (!body) return;
  var form = document.getElementById('tenantInviteForm');
  var propSel = document.getElementById('tenantInviteProperty');
  var emailIn = document.getElementById('tenantInviteEmail');
  var msg = document.getElementById('tenantInviteMsg');
  var properties = [];

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function api(path, method, payload) {
    var opts = { method: method || 'GET', headers: { 'Authorization': 'Bearer ' + token() } };
    if (payload) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(payload); }
    return fetch('/api' + path, opts).then(function(res) { return res.json().then(function(d) { if (!res.ok) throw new Error(d.error || 'Request failed'); return d; }); });
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function date(s) { return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }

  // Show the invite link so it can be texted when email isn't set up or lands in spam.
  function showLink(res, email) {
    msg.style.color = '#166534';
    msg.innerHTML = (res.emailed ? 'Invite emailed to ' + esc(email) + '. You can also text them this link:' : 'Invite created. Email isn\'t set up yet, so text or email this link to your tenant:') + '<br><input readonly style="width:100%;margin-top:0.35rem" value="' + esc(res.invite_link) + '" onclick="this.select()">';
    msg.style.display = 'block';
  }

  function load() {
    if (!token()) return;
    api('/properties').then(function(list) {
      properties = list;
      propSel.innerHTML = '<option value="">Choose a property...</option>' + list.map(function(p) { return '<option value="' + p.id + '">' + esc(p.address) + '</option>'; }).join('');
    }).catch(function() {});
    api('/tenancies').then(function(list) {
      if (!list.length) { body.innerHTML = '<tr><td colspan="4" class="empty-state"><div class="icon">🔑</div>No tenants invited yet. Invite one above so they can see their lease and send maintenance requests.</td></tr>'; return; }
      body.innerHTML = list.map(function(t) {
        var status = t.status === 'active' ? '<span class="badge badge-green">Active</span><br><small style="color:var(--gray)">since ' + date(t.accepted_at) + '</small>' : '<span class="badge badge-yellow">Invited</span><br><small style="color:var(--gray)">link expires ' + date(t.invite_expires_at) + '</small>';
        var actions = (t.status === 'invited' ? '<button class="btn btn-sm" data-resend="' + t.id + '" data-email="' + esc(t.email) + '">Resend</button> ' : '') + '<button class="btn btn-sm btn-danger" data-end="' + t.id + '">Remove</button>';
        return '<tr><td>' + esc(t.address) + '</td><td>' + (t.tenant_name ? '<strong>' + esc(t.tenant_name) + '</strong><br>' : '') + '<small style="color:var(--gray)">' + esc(t.email) + '</small></td><td>' + status + '</td><td>' + actions + '</td></tr>';
      }).join('');
    }).catch(function(err) { body.innerHTML = '<tr><td colspan="4" class="empty-state">' + esc(err.message) + '</td></tr>'; });
  }

  propSel.addEventListener('change', function() {
    var p = properties.filter(function(x) { return String(x.id) === propSel.value; })[0];
    if (p && p.tenant_email && !emailIn.value) emailIn.value = p.tenant_email;
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault(); msg.style.display = 'none';
    var email = emailIn.value;
    api('/tenancies', 'POST', { property_id: propSel.value, email: email }).then(function(res) { form.reset(); showLink(res, email); load(); })
      .catch(function(err) { msg.style.color = '#991b1b'; msg.textContent = err.message; msg.style.display = 'block'; });
  });

  body.addEventListener('click', function(e) {
    var resend = e.target.getAttribute('data-resend'), end = e.target.getAttribute('data-end');
    if (resend) api('/tenancies/' + resend + '/resend', 'POST').then(function(res) { showLink(res, e.target.getAttribute('data-email')); load(); }).catch(function(err) { alert(err.message); });
    if (end && confirm('Remove this tenant\'s portal access? Their past requests stay in your Maintenance list.')) api('/tenancies/' + end, 'DELETE').then(load).catch(function(err) { alert(err.message); });
  });

  var nav = document.querySelector('[data-page="tenants"]');
  if (nav) nav.addEventListener('click', load);
  var view = document.getElementById('dashboardView');
  if (view && window.MutationObserver) new MutationObserver(function() { if (view.style.display !== 'none') load(); }).observe(view, { attributes: true, attributeFilter: ['style'] });
  load();
})();
