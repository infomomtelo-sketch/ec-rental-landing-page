// Dashboard "Documents" page: fill in a template from a property, preview it, save, print and share with a tenant.
(function() {
  var body = document.getElementById('documentsBody');
  if (!body || !window.ECDocs) return;
  var D = window.ECDocs, esc = D.esc;
  var editor = document.getElementById('docEditor');
  var state = { id: null, type: null, data: null, tenancyId: null, signStatus: null };
  var SIGN_BADGES = { awaiting_tenant: ['badge-yellow', 'Waiting for tenant to sign'], awaiting_landlord: ['badge-yellow', 'Ready for your signature'], completed: ['badge-green', 'Signed'] };
  var cache = { properties: [], tenancies: [], listings: [], user: null };
  var REMEMBER_KEY = 'ec_doc_landlord';

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function api(path, method, payload) {
    var opts = { method: method || 'GET', headers: { 'Authorization': 'Bearer ' + token() } };
    if (payload) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(payload); }
    return fetch('/api' + path, opts).then(function(res) { return res.json().catch(function() { return {}; }).then(function(d) { if (!res.ok) throw new Error(d.error || 'Request failed'); return d; }); });
  }
  function remembered() { try { return JSON.parse(localStorage.getItem(REMEMBER_KEY) || '{}'); } catch (e) { return {}; } }
  function remember(d) { try { var r = remembered(); ['landlord_address', 'landlord_phone', 'pay_address'].forEach(function(k) { if (d[k]) r[k] = d[k]; }); if (d.pay_phone && !r.landlord_phone) r.landlord_phone = d.pay_phone; localStorage.setItem(REMEMBER_KEY, JSON.stringify(r)); } catch (e) {} }
  function date(s) { return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function attr(s) { return esc(s); }
  function msg(text, ok) { var m = document.getElementById('docMsg'); m.textContent = text || ''; m.style.color = ok ? '#166534' : '#991b1b'; m.style.display = text ? 'block' : 'none'; }

  function loadRefs() {
    return Promise.all([api('/properties').catch(function() { return []; }), api('/tenancies').catch(function() { return []; }), api('/listings').catch(function() { return []; }), api('/me').catch(function() { return {}; })]).then(function(r) {
      cache.properties = Array.isArray(r[0]) ? r[0] : []; cache.tenancies = Array.isArray(r[1]) ? r[1] : []; cache.listings = Array.isArray(r[2]) ? r[2] : []; cache.user = r[3].user || null;
    });
  }

  function loadList() {
    if (!token()) return;
    api('/documents').then(function(list) {
      if (!list.length) { body.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="icon"><svg class="ico" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg></div>No documents yet. Click "New Document" to make a lease, notice, invoice or receipt.</td></tr>'; return; }
      body.innerHTML = list.map(function(doc) {
        var t = D.types[doc.doc_type];
        return '<tr><td><strong>' + esc(doc.title) + '</strong><br><small style="color:var(--gray)">' + esc(t ? t.label : doc.doc_type) + '</small></td><td>' + esc(doc.property_address || '—') + '</td><td>' + (doc.shared_with ? '<span class="badge badge-green">Shared</span><br><small style="color:var(--gray)">' + esc(doc.shared_with) + '</small>' : '<span style="color:var(--gray)">Not shared</span>') + (SIGN_BADGES[doc.sign_status] ? '<br><span class="badge ' + SIGN_BADGES[doc.sign_status][0] + '">' + SIGN_BADGES[doc.sign_status][1] + '</span>' : '') + '</td><td>' + date(doc.updated_at) + '</td><td style="white-space:nowrap"><button class="btn btn-sm" data-open="' + doc.id + '">Open</button> <a class="btn btn-sm btn-secondary" href="/document?id=' + doc.id + '" target="_blank" rel="noopener">Print</a>' + (doc.sign_status ? '' : ' <button class="btn btn-sm btn-danger" data-del="' + doc.id + '">Delete</button>') + '</td></tr>';
      }).join('');
    }).catch(function(err) { body.innerHTML = '<tr><td colspan="5" class="empty-state">' + esc(err.message) + '</td></tr>'; });
  }

  // Step 1: choose a type.
  function chooseType() {
    state = { id: null, type: null, data: null, tenancyId: null, signStatus: null };
    editor.style.display = 'block';
    editor.innerHTML = '<div class="data-card-header" style="padding:0 0 1rem"><h2>What do you want to make?</h2><button class="btn btn-sm btn-secondary" data-close>Cancel</button></div><div class="doc-types">' +
      D.order.map(function(k) { var t = D.types[k]; return '<button type="button" class="doc-type" data-type="' + k + '"><strong>' + esc(t.label) + '</strong><span>' + esc(t.blurb) + '</span></button>'; }).join('') + '</div>';
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function propertyOptions(selected) {
    return '<option value="">No property (fill in by hand)</option>' + cache.properties.map(function(p) { return '<option value="' + p.id + '"' + (String(p.id) === String(selected || '') ? ' selected' : '') + '>' + esc(p.address + (p.city ? ', ' + p.city : '')) + '</option>'; }).join('');
  }
  function contextFor(propertyId) {
    var p = cache.properties.filter(function(x) { return String(x.id) === String(propertyId); })[0] || null;
    var l = p ? cache.listings.filter(function(x) { return String(x.property_id) === String(p.id); })[0] : null;
    return D.context({ property: p, user: cache.user, listing: l, origin: location.origin });
  }

  function fieldHtml(f, val) {
    var id = 'docf_' + f.k, input;
    if (f.type === 'textarea') input = '<textarea id="' + id + '" data-k="' + f.k + '" rows="3">' + esc(val) + '</textarea>';
    else if (f.type === 'select') input = '<select id="' + id + '" data-k="' + f.k + '">' + f.opts.map(function(o) { return '<option value="' + attr(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'check') return '<div class="form-group doc-full"><label class="doc-check"><input type="checkbox" id="' + id + '" data-k="' + f.k + '"' + (val ? ' checked' : '') + ' /> ' + esc(f.label) + '</label>' + (f.hint ? '<small class="doc-hint">' + esc(f.hint) + '</small>' : '') + '</div>';
    else if (f.type === 'items') {
      input = '<div class="doc-items" data-items="' + f.k + '">' + (val || []).map(function(r, i) { return '<div class="doc-item"><input placeholder="Description" data-row="' + i + '" data-col="desc" value="' + attr(r.desc) + '" /><input placeholder="Amount" inputmode="decimal" data-row="' + i + '" data-col="amount" value="' + attr(r.amount) + '" /><button type="button" class="btn btn-sm btn-secondary" data-remove-row="' + i + '" aria-label="Remove line">✕</button></div>'; }).join('') + '<button type="button" class="btn btn-sm btn-secondary" data-add-row>+ Add line</button></div>';
    } else input = '<input id="' + id + '" data-k="' + f.k + '" type="' + (f.type === 'date' ? 'date' : 'text') + '"' + (f.type === 'money' || f.type === 'number' ? ' inputmode="decimal"' : '') + ' value="' + attr(val) + '" />';
    return '<div class="form-group' + (f.full ? ' doc-full' : '') + '"><label for="' + id + '">' + esc(f.label) + '</label>' + input + (f.hint ? '<small class="doc-hint">' + esc(f.hint) + '</small>' : '') + '</div>';
  }

  // Step 2: the editor with live preview.
  function openEditor(type, data, opts) {
    opts = opts || {};
    var t = D.types[type];
    state.type = type; state.data = data; state.id = opts.id || null; state.tenancyId = opts.tenancyId || null; state.signStatus = opts.signStatus || null;
    editor.style.display = 'block';
    editor.innerHTML = '<div class="data-card-header" style="padding:0 0 1rem"><h2>' + esc(t.label) + '</h2><button class="btn btn-sm btn-secondary" data-close>Close</button></div>' +
      '<p class="doc-note">These templates follow California rules but are not legal advice. Read the document before you use it, and talk to a lawyer about anything unusual.</p>' +
      (t.warn ? '<p class="doc-warn">' + esc(t.warn) + '</p>' : '') +
      '<div class="doc-layout"><div class="doc-form"><div class="doc-fields">' +
      '<div class="form-group doc-full"><label for="docProperty">Property</label><select id="docProperty">' + propertyOptions(opts.propertyId) + '</select>' + (state.id ? '' : '<small class="doc-hint">Picking a property fills in the address, tenant and rent.</small>') + '</div>' +
      '<div class="form-group doc-full"><label for="docTitle">Document name</label><input id="docTitle" value="' + attr(opts.title || t.title(data)) + '" /></div>' +
      t.fields.map(function(f) { return fieldHtml(f, data[f.k]); }).join('') +
      '</div><p id="docMsg" style="display:none;font-size:0.85rem;margin:0.5rem 0;overflow-wrap:anywhere"></p>' +
      (state.signStatus ? '<p class="doc-warn">' + (state.signStatus === 'completed' ? 'This document is signed, so it is locked. Make a new document to change anything.' : 'This document is out for signature, so it is locked. Cancel the signature request below to change it.') + '</p>' : '') +
      '<div class="doc-actions">' + (state.signStatus ? '' : '<button class="btn" data-save>Save</button>') + '<button class="btn btn-secondary" data-print>Print or save PDF</button></div>' +
      '<div class="doc-share" id="docShare"></div></div>' +
      '<div class="doc-preview"><div class="doc-preview-label">Preview</div><div id="docPreview"></div></div></div>';
    state.titleTouched = !!opts.title;
    renderShare(); preview();
    if (state.signStatus) editor.querySelectorAll('.doc-fields input, .doc-fields select, .doc-fields textarea, .doc-fields button, #docProperty, #docTitle').forEach(function(x) { x.disabled = true; });
  }

  function preview() { var el = document.getElementById('docPreview'); if (el) el.innerHTML = D.render(state.type, state.data); }

  function renderShare() {
    var box = document.getElementById('docShare'); if (!box) return;
    var propId = document.getElementById('docProperty').value;
    var options = cache.tenancies.filter(function(t) { return t.status !== 'ended' && (!propId || String(t.property_id) === propId); });
    if (!state.id) { box.innerHTML = '<p class="doc-hint">Save to share this document with a tenant in their portal.</p>'; return; }
    if (state.signStatus) {
      var open = '<a class="btn btn-sm" href="/document?id=' + state.id + '" target="_blank" rel="noopener">';
      box.innerHTML = '<label>E-signature</label>' + (state.signStatus === 'completed' ? '<p class="doc-hint">Signed by you and your tenant. Both of you got the signed copy by email.</p>' + open + 'Open signed copy</a>'
        : state.signStatus === 'awaiting_landlord' ? '<p class="doc-hint">Your tenant signed. Countersign to finish.</p>' + open + 'Countersign now</a> <button class="btn btn-sm btn-secondary" data-cancel-sign>Cancel signature request</button>'
        : '<p class="doc-hint">Sent for signature. Waiting for your tenant to sign in their portal.</p>' + open + 'Open document</a> <button class="btn btn-sm btn-secondary" data-cancel-sign>Cancel signature request</button>');
      return;
    }
    if (!options.length) { box.innerHTML = '<p class="doc-hint">To share this in a tenant\'s portal, invite the tenant from the Tenants page first.</p>'; return; }
    box.innerHTML = '<label for="docShareSel">Share with tenant</label><div class="doc-share-row"><select id="docShareSel"><option value="">Not shared</option>' + options.map(function(t) { return '<option value="' + t.id + '"' + (String(t.id) === String(state.tenancyId || '') ? ' selected' : '') + '>' + esc((t.tenant_name ? t.tenant_name + ' · ' : '') + t.email + (t.status === 'invited' ? ' (invited)' : '')) + '</option>'; }).join('') + '</select><button class="btn btn-sm" data-share>Update sharing</button></div>' +
      (state.tenancyId ? '<div style="margin-top:0.75rem"><button class="btn btn-sm" data-request-sign>Ask tenant to sign</button><small class="doc-hint">Your tenant signs in their portal by typing their name, then you countersign. The document locks once it is sent.</small></div>' : '<small class="doc-hint">Share it with a tenant to ask them to sign it online.</small>');
  }

  function collect() {
    var t = D.types[state.type], d = {};
    t.fields.forEach(function(f) {
      if (f.type === 'items') { var rows = []; editor.querySelectorAll('[data-items="' + f.k + '"] .doc-item').forEach(function(row) { rows.push({ desc: row.querySelector('[data-col="desc"]').value, amount: row.querySelector('[data-col="amount"]').value }); }); d[f.k] = rows; return; }
      var el = editor.querySelector('[data-k="' + f.k + '"]'); if (!el) return;
      d[f.k] = f.type === 'check' ? el.checked : el.value;
    });
    state.data = d;
    if (!state.titleTouched) document.getElementById('docTitle').value = t.title(d);
    return d;
  }

  function save() {
    if (state.signStatus) return Promise.resolve({ id: state.id });
    var d = collect(); remember(d);
    var payload = { doc_type: state.type, title: document.getElementById('docTitle').value, property_id: document.getElementById('docProperty').value || null, data: d };
    return (state.id ? api('/documents/' + state.id, 'PUT', payload) : api('/documents', 'POST', payload)).then(function(res) { var isNew = !state.id; state.id = res.id; if (isNew) renderShare(); loadList(); return res; });
  }

  editor.addEventListener('click', function(e) {
    var el = e.target.closest('button'); if (!el) return;
    if (el.hasAttribute('data-close')) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
    var type = el.getAttribute('data-type');
    if (type) { loadRefs().then(function() { var ctx = contextFor(''); openEditor(type, D.initial(type, ctx, remembered()), {}); }); return; }
    if (el.hasAttribute('data-add-row')) { collect(); var k = el.parentNode.getAttribute('data-items'); state.data[k].push({ desc: '', amount: '' }); openEditor(state.type, state.data, { id: state.id, propertyId: document.getElementById('docProperty').value, title: state.titleTouched ? document.getElementById('docTitle').value : '', tenancyId: state.tenancyId }); return; }
    if (el.hasAttribute('data-remove-row')) { collect(); var key = el.closest('[data-items]').getAttribute('data-items'); state.data[key].splice(+el.getAttribute('data-remove-row'), 1); if (!state.data[key].length) state.data[key].push({ desc: '', amount: '' }); openEditor(state.type, state.data, { id: state.id, propertyId: document.getElementById('docProperty').value, title: state.titleTouched ? document.getElementById('docTitle').value : '', tenancyId: state.tenancyId }); return; }
    if (el.hasAttribute('data-save')) { el.disabled = true; save().then(function() { msg('Saved.', true); }).catch(function(err) { msg(err.message); }).then(function() { el.disabled = false; }); return; }
    if (el.hasAttribute('data-print')) {
      // Open the tab now so the browser doesn't block it as a popup, then point it at the saved document.
      var w = window.open('about:blank', '_blank');
      save().then(function(res) { if (w) w.location = '/document?id=' + res.id + '&print=1'; else location.href = '/document?id=' + res.id + '&print=1'; }).catch(function(err) { if (w) w.close(); msg(err.message); });
      return;
    }
    if (el.hasAttribute('data-request-sign')) {
      if (!confirm('Send this document to your tenant to sign? It locks so it can\'t change while it is being signed.')) return;
      el.disabled = true;
      save().then(function() { return api('/documents/' + state.id + '/signing', 'POST'); }).then(function(res) {
        reopen().then(function() { msg(res.tenant_ready ? 'Sent. Your tenant can sign it in their portal now' + (res.emailed ? ' and we emailed them.' : '.') : 'Sent. Your tenant can sign once they accept their portal invite' + (res.emailed ? '. We emailed them.' : '.'), true); });
      }).catch(function(err) { msg(err.message); el.disabled = false; });
      return;
    }
    if (el.hasAttribute('data-cancel-sign')) {
      if (!confirm('Cancel the signature request? Any signature already made on it is removed and you can edit the document again.')) return;
      el.disabled = true;
      api('/documents/' + state.id + '/signing', 'DELETE').then(function() { return reopen(); }).then(function() { msg('Signature request cancelled. You can edit the document again.', true); }).catch(function(err) { msg(err.message); el.disabled = false; });
      return;
    }
    if (el.hasAttribute('data-share')) {
      var tid = document.getElementById('docShareSel').value; el.disabled = true;
      save().then(function() { return api('/documents/' + state.id + '/share', 'POST', { tenancy_id: tid || null }); }).then(function(res) {
        state.tenancyId = tid || null; renderShare();
        msg(!res.shared ? 'This document is no longer shared.' : res.tenant_ready ? 'Shared. It is in your tenant\'s portal now' + (res.emailed ? ' and we emailed them.' : '.') : 'Shared. Your tenant will see it once they accept their portal invite.', true);
        loadList();
      }).catch(function(err) { msg(err.message); }).then(function() { el.disabled = false; });
    }
  });

  editor.addEventListener('input', function(e) {
    if (e.target.id === 'docTitle') { state.titleTouched = true; return; }
    if (e.target.id === 'docProperty' || !state.type) return;
    collect(); preview();
  });
  editor.addEventListener('change', function(e) {
    if (e.target.id !== 'docProperty') { if (state.type && e.target.type === 'checkbox') { collect(); preview(); } return; }
    // Refill from the newly chosen property, keeping anything typed into fields the property doesn't cover.
    var current = collect(), ctx = contextFor(e.target.value), fresh = D.initial(state.type, ctx, remembered());
    D.types[state.type].fields.forEach(function(f) { if (!f.prefill) fresh[f.k] = current[f.k]; });
    openEditor(state.type, fresh, { id: state.id, propertyId: e.target.value, title: state.titleTouched ? document.getElementById('docTitle').value : '', tenancyId: state.tenancyId });
  });

  function openDoc(id) {
    return loadRefs().then(function() { return api('/documents/' + id); }).then(function(doc) { openEditor(doc.doc_type, doc.data, { id: doc.id, propertyId: doc.property_id, title: doc.title, tenancyId: doc.tenancy_id, signStatus: doc.sign_status }); });
  }
  // Reload the open document after a signing change so the editor shows its lock state.
  function reopen() { loadList(); return openDoc(state.id); }

  body.addEventListener('click', function(e) {
    var open = e.target.getAttribute('data-open'), del = e.target.getAttribute('data-del');
    if (open) openDoc(open).then(function() { editor.scrollIntoView({ behavior: 'smooth', block: 'start' }); }).catch(function(err) { alert(err.message); });
    if (del && confirm('Delete this document? If it was shared, your tenant will no longer see it.')) api('/documents/' + del, 'DELETE').then(function() { if (String(state.id) === del) { editor.style.display = 'none'; editor.innerHTML = ''; } loadList(); }).catch(function(err) { alert(err.message); });
  });

  document.getElementById('newDocBtn').addEventListener('click', chooseType);
  var nav = document.querySelector('[data-page="documents"]');
  if (nav) nav.addEventListener('click', loadList);
  var view = document.getElementById('dashboardView');
  if (view && window.MutationObserver) new MutationObserver(function() { if (view.style.display !== 'none') loadList(); }).observe(view, { attributes: true, attributeFilter: ['style'] });
  loadList();
})();
