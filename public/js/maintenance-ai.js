// Dashboard "Maintenance" page: AI triage of a request (suggested priority, next steps, reply to the tenant).
(function() {
  var body = document.getElementById('maintenanceBody');
  var box = document.getElementById('triageBox');
  if (!body || !box) return;
  var BADGE = { emergency: 'badge-red', high: 'badge-yellow', normal: 'badge-green', low: 'badge-gray' };

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function api(path, method, payload) {
    return fetch('/api' + path, { method: method, headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function(res) { return res.json().then(function(d) { if (!res.ok) throw new Error(d.error || 'Request failed'); return d; }); });
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  body.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-ai-triage]');
    if (!btn) return;
    var id = Number(btn.getAttribute('data-ai-triage'));
    var row = btn.closest('tr');
    box.style.display = 'block';
    box.innerHTML = '<p style="color:var(--gray)">Triaging...</p>';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    api('/ai/maintenance-triage', 'POST', { requestId: id }).then(function(t) {
      var change = t.priority !== t.current_priority;
      box.innerHTML =
        '<h3 style="font-size:1rem;color:var(--primary);margin-bottom:0.5rem">AI triage</h3>' +
        '<p style="margin-bottom:0.4rem">Suggested priority: <span class="badge ' + (BADGE[t.priority] || 'badge-gray') + '">' + esc(t.priority) + '</span>' + (t.category ? ' · ' + esc(t.category) : '') + (change ? ' <button class="btn btn-sm" id="triageApply">Set priority to ' + esc(t.priority) + '</button>' : ' <small style="color:var(--gray)">(same as now)</small>') + '</p>' +
        (t.why ? '<p style="font-size:0.9rem;margin-bottom:0.4rem">' + esc(t.why) + '</p>' : '') +
        (t.next_steps.length ? '<ul style="margin:0 0 0.6rem 1.2rem;font-size:0.9rem">' + t.next_steps.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '') +
        '<label style="font-weight:600;font-size:0.9rem">Reply to the tenant</label><textarea id="triageReply" rows="4" style="width:100%;font:inherit;padding:0.6rem;border:1px solid #d1d5db;border-radius:8px;margin-top:0.25rem">' + esc(t.tenant_reply) + '</textarea>' +
        '<p style="color:var(--gray);font-size:0.8rem;margin:0.4rem 0 0.6rem">Suggested by AI. For gas smells, fire or flooding, the tenant should call 911 or the utility first.</p>' +
        '<button class="btn btn-sm btn-secondary" id="triageCopy">Copy reply</button> <button class="btn btn-sm btn-secondary" id="triageClose">Close</button> <span id="triageMsg" style="font-size:0.85rem"></span>';
      document.getElementById('triageClose').onclick = function() { box.style.display = 'none'; };
      document.getElementById('triageCopy').onclick = function() { var b = this; try { navigator.clipboard.writeText(document.getElementById('triageReply').value); b.textContent = 'Copied'; setTimeout(function() { b.textContent = 'Copy reply'; }, 1500); } catch (err) { document.getElementById('triageReply').select(); } };
      var apply = document.getElementById('triageApply');
      if (apply) apply.onclick = function() {
        apply.disabled = true;
        api('/maintenance/' + id, 'PUT', { priority: t.priority }).then(function() {
          var badge = row && row.querySelector('td:nth-child(4) .badge');
          if (badge) { badge.className = 'badge ' + (BADGE[t.priority] || 'badge-gray'); badge.textContent = t.priority; }
          document.getElementById('triageMsg').textContent = 'Priority updated.';
          apply.remove();
        }).catch(function(err) { apply.disabled = false; document.getElementById('triageMsg').textContent = err.message; });
      };
    }).catch(function(err) { box.innerHTML = '<p style="color:#991b1b">' + esc(err.message) + '</p>'; });
  });
})();
