// Dashboard "Applications" page: review rental applications for your listings.
(function() {
  var body = document.getElementById('applicationsBody');
  if (!body) return;
  var modal = document.getElementById('applicationModal');
  var content = document.getElementById('applicationContent');
  var badgeEl = document.getElementById('applicationsCount');
  var STATUS = { new: ['New', 'badge-yellow'], reviewing: ['Reviewing', 'badge-yellow'], approved: ['Approved', 'badge-green'], denied: ['Denied', 'badge-red'], withdrawn: ['Withdrawn', 'badge-gray'] };
  var SCREEN = { not_started: 'Not started', invited: 'Invite sent', complete: 'Complete' };

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function api(path, method, payload) {
    var opts = { method: method || 'GET', headers: { 'Authorization': 'Bearer ' + token() } };
    if (payload) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(payload); }
    return fetch('/api' + path, opts).then(function(res) { return res.json().then(function(d) { if (!res.ok) throw new Error(d.error || 'Request failed'); return d; }); });
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function money(n) { return n ? '$' + Number(n).toLocaleString('en-US') : '—'; }
  function date(s) { return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
  function addr(a) { return esc(a.street) + (a.unit ? ' #' + esc(a.unit) : ''); }
  function ratio(a) { return a.monthly_income && a.rent ? (a.monthly_income / a.rent).toFixed(1) + '× rent' : ''; }

  function load() {
    if (!token()) return;
    api('/applications').then(function(list) {
      var fresh = list.filter(function(a) { return a.status === 'new'; }).length;
      if (badgeEl) badgeEl.textContent = fresh ? fresh : '';
      if (!list.length) { body.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="icon">📝</div>No applications yet. Renters can apply from any Active listing.</td></tr>'; return; }
      body.innerHTML = list.map(function(a) {
        var s = STATUS[a.status] || [a.status, 'badge-gray'];
        return '<tr><td>' + date(a.created_at) + '</td><td><strong>' + esc(a.first_name + ' ' + a.last_name) + '</strong><br><small style="color:var(--gray)">' + esc(a.email) + '</small></td><td>' + addr(a) + '</td><td>' + money(a.monthly_income) + '<br><small style="color:var(--gray)">' + ratio(a) + '</small></td><td>' + (a.move_in_date || '—') + '</td><td><span class="badge ' + s[1] + '">' + s[0] + '</span><br><small style="color:var(--gray)">Screening: ' + (SCREEN[a.screening_status] || a.screening_status) + '</small></td><td><button class="btn btn-sm" data-open-app="' + a.id + '">Review</button></td></tr>';
      }).join('');
    }).catch(function(err) { body.innerHTML = '<tr><td colspan="7" class="empty-state">' + esc(err.message) + '</td></tr>'; });
  }

  function row(label, value) { return value === '' || value == null ? '' : '<div style="display:flex;gap:1rem;padding:0.35rem 0;border-bottom:1px solid #f0f0f0"><div style="width:42%;color:var(--gray);font-size:0.85rem">' + label + '</div><div style="flex:1;font-size:0.9rem">' + value + '</div></div>'; }
  function section(title, html) { return html ? '<h3 style="font-size:0.95rem;color:var(--primary);margin:1rem 0 0.25rem">' + title + '</h3>' + html : ''; }

  function open(id) {
    api('/applications/' + id).then(function(a) {
      var phone = function(p) { return p ? '<a href="tel:' + esc(String(p).replace(/[^\d+]/g, '')) + '">' + esc(p) + '</a>' : ''; };
      content.innerHTML =
        '<p style="color:var(--gray);font-size:0.85rem">APP-' + String(a.id).padStart(5, '0') + ' · ' + date(a.created_at) + ' · for ' + addr(a) + ', ' + esc(a.city) + ' (' + money(a.rent) + '/mo)</p>' +
        section('Applicant', row('Name', esc(a.first_name + ' ' + a.last_name)) + row('Email', '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a>') + row('Phone', phone(a.phone)) + row('Move-in', esc(a.move_in_date)) + row('People living here', esc(a.occupants))) +
        section('Current home', row('Address', esc(a.current_address)) + row('Rent', a.current_rent ? money(a.current_rent) : '') + row('Time there', esc(a.time_at_address)) + row('Landlord', esc(a.current_landlord_name)) + row('Landlord phone', phone(a.current_landlord_phone)) + row('Reason for moving', esc(a.reason_for_moving))) +
        section('Income', row('Employer', esc(a.employer)) + row('Job title', esc(a.job_title)) + row('Employer phone', phone(a.employer_phone)) + row('Employed for', esc(a.employment_length)) + row('Monthly income', a.monthly_income ? money(a.monthly_income) + (ratio(a) ? ' (' + ratio(a) + ')' : '') : '') + row('Other income', esc(a.other_income))) +
        section('Other', row('Pets', esc(a.pets)) + row('Vehicles', esc(a.vehicles)) + row('Notes from applicant', esc(a.additional_info))) +
        section('Signature', row('Signed as', esc(a.signature_name)) + row('Signed at', new Date(a.signed_at).toLocaleString('en-US'))) +
        '<h3 style="font-size:0.95rem;color:var(--primary);margin:1.25rem 0 0.5rem">Your review</h3>' +
        '<div class="form-row"><div class="form-group"><label>Decision</label><select id="appStatus">' + Object.keys(STATUS).map(function(k) { return '<option value="' + k + '"' + (a.status === k ? ' selected' : '') + '>' + STATUS[k][0] + '</option>'; }).join('') + '</select></div><div class="form-group"><label>Screening</label><select id="appScreening">' + Object.keys(SCREEN).map(function(k) { return '<option value="' + k + '"' + (a.screening_status === k ? ' selected' : '') + '>' + SCREEN[k] + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="form-group"><label>Private notes</label><textarea id="appNotes" rows="3">' + esc(a.landlord_notes) + '</textarea></div>' +
        '<p style="font-size:0.8rem;color:var(--gray);margin-bottom:0.75rem">Apply the same criteria to every applicant. If you deny or add conditions based on a credit or background report, you must send the applicant an adverse action notice.</p>' +
        '<button class="btn" id="appSave">Save review</button> <span id="appSaved" style="font-size:0.85rem;color:#166534"></span>';
      document.getElementById('appSave').addEventListener('click', function() {
        api('/applications/' + a.id, 'PUT', { status: document.getElementById('appStatus').value, screening_status: document.getElementById('appScreening').value, landlord_notes: document.getElementById('appNotes').value })
          .then(function() { document.getElementById('appSaved').textContent = 'Saved.'; load(); })
          .catch(function(err) { document.getElementById('appSaved').textContent = err.message; });
      });
      modal.classList.add('open');
    });
  }

  body.addEventListener('click', function(e) { var id = e.target.getAttribute('data-open-app'); if (id) open(id); });
  document.getElementById('applicationModalClose').addEventListener('click', function() { modal.classList.remove('open'); });
  var nav = document.querySelector('[data-page="applications"]');
  if (nav) nav.addEventListener('click', load);
  // Refresh the "new" badge once the dashboard appears after sign-in.
  var view = document.getElementById('dashboardView');
  if (view && window.MutationObserver) new MutationObserver(function() { if (view.style.display !== 'none') load(); }).observe(view, { attributes: true, attributeFilter: ['style'] });
  load();
})();
