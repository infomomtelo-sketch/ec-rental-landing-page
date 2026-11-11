// Dashboard "Inspections" page: start an inspection, drop in photos room by room (the AI pre-fills each
// photo's condition and notes) or talk through what you see (a voice note is transcribed into the
// notes), correct them, turn repairs into maintenance requests, then finish. Finishing writes a
// summary and a move-out vs move-in comparison; the AI then writes the full room-by-room report,
// which the inspector edits as one document and signs. The signed report is the printable report.
(function() {
  var body = document.getElementById('inspectionsBody');
  if (!body) return;
  var newModal = document.getElementById('inspNewModal'), newForm = document.getElementById('inspNewForm');
  var workModal = document.getElementById('inspWorkModal'), work = document.getElementById('inspWork');
  var ROOMS = ['Exterior front', 'Exterior back', 'Entry', 'Living room', 'Dining room', 'Kitchen', 'Hallway', 'Primary bedroom', 'Bedroom 2', 'Bedroom 3', 'Bedroom 4', 'Primary bathroom', 'Bathroom 2', 'Laundry', 'Garage', 'Yard', 'Roof', 'HVAC / water heater', 'Other'];
  var TYPES = { move_in: 'Move-in', move_out: 'Move-out', routine: 'Routine', annual: 'Annual' };
  var COND_BADGE = { good: 'badge-green', fair: 'badge-yellow', poor: 'badge-red', damaged: 'badge-red' };
  var OVERALL_BADGE = { 'Good': 'badge-green', 'Fair': 'badge-yellow', 'Needs Attention': 'badge-red' };
  var list = [], current = null, imageUrls = {};
  var recorder = null, voiceChunks = [], voiceBtn = null, voiceMsg = null, voiceItemId = null;
  // Scanning effect while the AI reads a photo (and a shimmer while it writes the report): pure CSS,
  // shown only while the AI is genuinely working, never as fake progress.
  var scanCss = document.createElement('style');
  scanCss.textContent = [
    '.insp-scan{position:relative}',
    '.insp-scanline{position:absolute;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#22c55e,transparent);box-shadow:0 0 12px 2px rgba(34,197,94,.8);animation:insp-scan 1.4s ease-in-out infinite alternate}',
    '@keyframes insp-scan{from{top:0}to{top:calc(100% - 3px)}}',
    '.insp-corner{position:absolute;width:18px;height:18px;border:2px solid #22c55e;pointer-events:none}',
    '.insp-tl{top:6px;left:6px;border-right:0;border-bottom:0}',
    '.insp-tr{top:6px;right:6px;border-left:0;border-bottom:0}',
    '.insp-bl{bottom:6px;left:6px;border-right:0;border-top:0}',
    '.insp-br{bottom:6px;right:6px;border-left:0;border-top:0}',
    '.insp-shimmer{position:relative;overflow:hidden;background:#e5e7eb;border-radius:8px}',
    '.insp-shimmer:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);animation:insp-shimmer 1.2s infinite}',
    '@keyframes insp-shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}',
    '@media (prefers-reduced-motion: reduce){.insp-scanline,.insp-shimmer:after{animation:none}}'
  ].join('\n');
  document.head.appendChild(scanCss);

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function api(path, method, payload, rawType) {
    var headers = { 'Authorization': 'Bearer ' + token() }, opts = { method: method || 'GET', headers: headers };
    if (rawType) { headers['Content-Type'] = rawType; opts.body = payload; }
    else if (payload) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(payload); }
    return fetch('/api' + path, opts).then(function(res) { return res.json().then(function(d) { if (!res.ok) throw new Error(d.error || ('Request failed (' + res.status + ')')); return d; }); });
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function close(id) { document.getElementById(id).classList.remove('open'); }
  document.querySelectorAll('[data-close]').forEach(function(b) { b.addEventListener('click', function() { close(b.getAttribute('data-close')); if (b.getAttribute('data-close') === 'inspWorkModal') load(); }); });

  function load() {
    if (!token()) return;
    api('/inspections').then(function(rows) {
      list = rows;
      if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="icon"><svg class="ico" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>No inspections yet. Click "+ New Inspection" to start one.</td></tr>'; return; }
      body.innerHTML = rows.map(function(i) {
        var cond = i.status === 'completed' ? '<span class="badge ' + (OVERALL_BADGE[i.overall_condition] || 'badge-gray') + '">' + esc(i.overall_condition || '-') + '</span>' : '<span class="badge badge-gray">In progress</span>';
        return '<tr><td>' + esc(i.property_address) + '</td><td>' + esc(TYPES[i.type] || 'Inspection') + '</td><td>' + esc(i.inspection_date) + '</td><td>' + cond + '</td><td>' + (i.item_count || 0) + '</td><td style="white-space:nowrap"><button class="btn btn-sm" data-open="' + i.id + '">Open</button> <a class="btn btn-sm btn-secondary" href="/inspection-report?id=' + i.id + '" target="_blank" rel="noopener">Report</a> <button class="btn btn-sm btn-danger" data-del="' + i.id + '">Delete</button></td></tr>';
      }).join('');
    }).catch(function(err) { body.innerHTML = '<tr><td colspan="6" class="empty-state">' + esc(err.message) + '</td></tr>'; });
  }
  window.ECInspections = { load: load };
  var nav = document.querySelector('[data-page="inspections"]');
  if (nav) nav.addEventListener('click', load);
  load();

  body.addEventListener('click', function(e) {
    var open = e.target.closest('[data-open]'), del = e.target.closest('[data-del]');
    if (open) openWork(Number(open.getAttribute('data-open')));
    if (del && confirm('Delete this inspection and its photos? This cannot be undone.')) api('/inspections/' + del.getAttribute('data-del'), 'DELETE').then(load).catch(function(err) { alert(err.message); });
  });

  // New inspection
  function refreshCompare() {
    var wrap = document.getElementById('inspCompareWrap'), sel = newForm.elements.compare_to;
    var pid = Number(newForm.elements.property_id.value);
    var moveIns = list.filter(function(i) { return i.property_id === pid && i.type === 'move_in'; });
    wrap.style.display = newForm.elements.type.value === 'move_out' ? 'block' : 'none';
    sel.innerHTML = '<option value="">Don\'t compare</option>' + moveIns.map(function(i) { return '<option value="' + i.id + '">Move-in on ' + esc(i.inspection_date) + '</option>'; }).join('');
    if (moveIns.length) sel.value = String(moveIns[0].id);
  }
  document.getElementById('newInspectionBtn').addEventListener('click', function() {
    newForm.reset(); document.getElementById('inspNewMsg').textContent = '';
    newForm.elements.inspection_date.value = new Date().toISOString().slice(0, 10);
    api('/properties').then(function(props) {
      newForm.elements.property_id.innerHTML = props.length ? props.map(function(p) { return '<option value="' + p.id + '">' + esc(p.address) + '</option>'; }).join('') : '<option value="">Add a property first</option>';
      refreshCompare();
    });
    newModal.classList.add('open');
  });
  newForm.elements.type.addEventListener('change', refreshCompare);
  newForm.elements.property_id.addEventListener('change', refreshCompare);
  newForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var data = {}; Array.prototype.forEach.call(newForm.elements, function(el) { if (el.name) data[el.name] = el.value; });
    api('/inspections', 'POST', data).then(function(r) { close('inspNewModal'); load(); openWork(r.id); }).catch(function(err) { document.getElementById('inspNewMsg').textContent = err.message; });
  });

  // Shrink phone photos to 1600px JPEG before upload.
  function resize(file) {
    return new Promise(function(resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function() {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function(b) { b ? resolve(b) : reject(new Error('Could not read ' + file.name)); }, 'image/jpeg', 0.85);
      };
      img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Could not read ' + file.name)); };
      img.src = url;
    });
  }
  // Inspection photos are private, so they're fetched with the sign-in token and shown as blob URLs.
  function loadImage(item, imgEl) {
    var key = current.inspection.id + '/' + item.id;
    if (imageUrls[key]) { imgEl.src = imageUrls[key]; return; }
    fetch('/api/inspections/' + current.inspection.id + '/items/' + item.id + '/image', { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function(r) { if (!r.ok) throw new Error(); return r.blob(); })
      .then(function(b) { imageUrls[key] = URL.createObjectURL(b); imgEl.src = imageUrls[key]; }).catch(function() {});
  }

  function openWork(id) {
    work.innerHTML = '<p style="color:var(--gray)">Loading...</p>'; workModal.classList.add('open');
    api('/inspections/' + id).then(function(d) { current = d; render(); }).catch(function(err) { work.innerHTML = '<p style="color:#991b1b">' + esc(err.message) + '</p>'; });
  }

  function itemCard(it) {
    if (it.reading) {
      return '<div class="insp-item" data-item="' + it.id + '" style="display:flex;gap:0.75rem;padding:0.75rem;background:var(--light);border-radius:10px;margin-bottom:0.6rem;flex-wrap:wrap">' +
        '<div class="insp-scan" style="width:150px;height:112px;flex:0 0 auto;border-radius:8px;overflow:hidden;background:#e5e7eb">' +
        '<img src="' + it.localUrl + '" alt="' + esc(it.room_area) + ' photo" style="width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in" data-zoom="1" />' +
        '<span class="insp-corner insp-tl"></span><span class="insp-corner insp-tr"></span><span class="insp-corner insp-bl"></span><span class="insp-corner insp-br"></span>' +
        '<span class="insp-scanline"></span></div>' +
        '<div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:0.4rem;justify-content:center"><strong style="font-size:0.9rem">AI reading photo…</strong><small style="color:var(--gray)">Checking condition, notes and repairs for ' + esc(it.room_area) + '.</small></div></div>';
    }
    return '<div class="insp-item" data-item="' + it.id + '" style="display:flex;gap:0.75rem;padding:0.75rem;background:var(--light);border-radius:10px;margin-bottom:0.6rem;flex-wrap:wrap">' +
      '<img alt="' + esc(it.room_area) + ' photo" style="width:150px;height:112px;object-fit:cover;border-radius:8px;background:#e5e7eb;flex:0 0 auto;cursor:zoom-in" data-zoom="1" />' +
      '<div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:0.4rem">' +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center"><select data-f="condition" style="padding:0.35rem;border:1px solid #d1d5db;border-radius:6px">' + ['', 'good', 'fair', 'poor', 'damaged'].map(function(c) { return '<option value="' + c + '"' + (it.condition === c ? ' selected' : '') + '>' + (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Not rated') + '</option>'; }).join('') + '</select>' +
      '<label style="font-size:0.85rem;font-weight:500"><input type="checkbox" data-f="repair_needed" style="width:auto"' + (it.repair_needed ? ' checked' : '') + ' /> Needs repair</label>' +
      '<input data-f="repair_item" placeholder="Repair (e.g. patch hole in wall)" value="' + esc(it.repair_item) + '" style="flex:1;min-width:160px;padding:0.35rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem' + (it.repair_needed ? '' : ';display:none') + '" /></div>' +
      '<textarea data-f="notes" rows="2" placeholder="Notes" style="width:100%;font:inherit;font-size:0.88rem;padding:0.4rem;border:1px solid #d1d5db;border-radius:6px">' + esc(it.notes) + '</textarea>' +
      '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center">' +
      (typeof window.MediaRecorder !== 'undefined' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="voice">🎤 Voice note</button>' : '') +
      (it.repair_needed ? (it.maintenance_id ? '<span class="badge badge-green">Maintenance request created</span>' : '<button type="button" class="btn btn-sm btn-secondary" data-act="maint">Create maintenance request</button>') : '') +
      '<button type="button" class="btn btn-sm btn-danger" data-act="del">Remove photo</button><small data-msg style="color:var(--gray)"></small></div></div></div>';
  }

  // The written report: the AI drafts it from the photos and voice notes, the inspector edits it
  // as one document and signs it. Editing or rewriting a signed report clears the signature.
  function reportHtml(rep) {
    var out = '<div id="inspReportBox" style="margin-top:1.25rem;padding:1rem;border-radius:10px;background:#fff;border:1px solid #e5e7eb"><h3 style="font-size:1rem;color:var(--primary);margin-bottom:0.25rem">Written report</h3>';
    if (!rep || !rep.text) {
      out += '<p style="font-size:0.9rem;color:var(--gray)">The AI writes the full room-by-room report from the photos and voice notes, so you don\'t have to type it. Read it, fix anything, then sign it.</p><div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem"><button type="button" class="btn" id="inspReportGen">Write the report</button><span id="inspReportMsg" style="font-size:0.85rem;color:var(--gray);align-self:center"></span></div>';
    } else {
      out += '<p style="font-size:0.85rem;color:var(--gray);margin-bottom:0.5rem">' + (rep.status === 'signed' ? 'Signed by ' + esc(rep.signed_by) + ' on ' + esc((rep.signed_at || '').slice(0, 10)) + '. Editing it again clears the signature.' : 'Draft — read it and fix anything before signing.') + '</p>';
      out += '<textarea id="inspReportText" rows="14" style="width:100%;font:inherit;font-size:0.9rem;padding:0.6rem;border:1px solid #d1d5db;border-radius:8px;white-space:pre-wrap">' + esc(rep.text) + '</textarea>';
      out += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem"><button type="button" class="btn" id="inspReportSave">Save edits</button>' + (rep.status === 'signed' ? '' : '<button type="button" class="btn btn-secondary" id="inspReportSign">Sign report</button>') + '<button type="button" class="btn btn-secondary" id="inspReportGen">Rewrite report</button><span id="inspReportMsg" style="font-size:0.85rem;color:var(--gray);align-self:center"></span></div>';
    }
    return out + '</div>';
  }

  function render() {
    var d = current, i = d.inspection, items = d.items, rooms = {};
    items.forEach(function(it) { (rooms[it.room_area] = rooms[it.room_area] || []).push(it); });
    var usedRooms = Object.keys(rooms);
    var html = '<h2 style="margin-bottom:0.25rem">' + esc(TYPES[i.type] || 'Inspection') + ' inspection</h2><p style="color:var(--gray);font-size:0.9rem;margin-bottom:1rem">' + esc(i.property_address) + ' · ' + esc(i.inspection_date) + (i.inspector_name ? ' · ' + esc(i.inspector_name) : '') + (d.compare_inspection ? ' · compared with move-in on ' + esc(d.compare_inspection.inspection_date) : '') + '</p>';
    html += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-bottom:0.5rem"><label style="font-weight:600;font-size:0.9rem">Room</label><select id="inspRoom" style="padding:0.45rem;border:1px solid #d1d5db;border-radius:8px">' + ROOMS.map(function(r) { return '<option>' + r + '</option>'; }).join('') + '</select><input id="inspRoomOther" placeholder="Room name" maxlength="60" style="display:none;padding:0.45rem;border:1px solid #d1d5db;border-radius:8px" /></div>';
    html += '<label id="inspDrop" style="display:block;border:2px dashed #d1d5db;border-radius:10px;padding:1rem;text-align:center;cursor:pointer;margin-bottom:0.5rem"><strong>Drag photos of this room here</strong> or click to choose<br><small style="color:var(--gray)">Add several at once (hold Command and click, or Command+A). The AI reads each photo and fills in the condition and notes.</small><input type="file" id="inspFiles" accept="image/jpeg,image/png,image/webp" multiple style="display:none" /></label><p id="inspUploadMsg" style="font-size:0.85rem;color:var(--gray);min-height:1.2em"></p>';
    if (!items.length && d.photos && d.photos.length) html += '<p style="font-size:0.85rem;color:var(--gray)">This inspection was made with the old version, which didn\'t keep photos. Its notes are on the report.</p>';
    usedRooms.forEach(function(r) { html += '<h3 style="font-size:1rem;color:var(--primary);margin:1rem 0 0.5rem">' + esc(r) + ' <small style="color:var(--gray);font-weight:400">(' + rooms[r].length + ')</small></h3>' + rooms[r].map(itemCard).join(''); });
    if (i.status === 'completed') {
      html += '<div style="margin-top:1.25rem;padding:1rem;border-radius:10px;background:#eef4ee"><strong>Overall: <span class="badge ' + (OVERALL_BADGE[i.overall_condition] || 'badge-gray') + '">' + esc(i.overall_condition) + '</span></strong><p style="font-size:0.9rem;margin-top:0.4rem">' + esc(i.summary) + '</p></div>';
      if (i.type === 'move_out' && i.compare_to) html += comparisonHtml(d.comparison);
      html += reportHtml(d.report);
    }
    html += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:1.25rem"><button type="button" class="btn" id="inspFinish">' + (i.status === 'completed' ? 'Update summary' : 'Finish & write summary') + '</button><a class="btn btn-secondary" href="/inspection-report?id=' + i.id + '" target="_blank" rel="noopener">Printable report</a><span id="inspFinishMsg" style="font-size:0.85rem;color:var(--gray);align-self:center"></span></div>';
    work.innerHTML = html;
    work.querySelectorAll('.insp-item').forEach(function(el) { var it = items.filter(function(x) { return String(x.id) === el.getAttribute('data-item'); })[0]; if (it && !it.reading) loadImage(it, el.querySelector('img')); });
    var roomSel = document.getElementById('inspRoom'), other = document.getElementById('inspRoomOther');
    var next = ROOMS.filter(function(r) { return usedRooms.indexOf(r) === -1 && r !== 'Other'; })[0];
    if (next) roomSel.value = next;
    roomSel.addEventListener('change', function() { other.style.display = roomSel.value === 'Other' ? '' : 'none'; if (roomSel.value === 'Other') other.focus(); });
    var drop = document.getElementById('inspDrop'), files = document.getElementById('inspFiles');
    files.addEventListener('change', function() { upload(files.files); });
    ['dragenter', 'dragover'].forEach(function(t) { drop.addEventListener(t, function(e) { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; drop.style.background = '#f0fdf4'; }); });
    ['dragleave', 'drop'].forEach(function(t) { drop.addEventListener(t, function(e) { e.preventDefault(); drop.style.borderColor = '#d1d5db'; drop.style.background = ''; }); });
    drop.addEventListener('drop', function(e) { upload(e.dataTransfer && e.dataTransfer.files); });
    document.getElementById('inspFinish').addEventListener('click', finish);
    var reportGen = document.getElementById('inspReportGen');
    if (reportGen) reportGen.addEventListener('click', function() {
      var msgEl = document.getElementById('inspReportMsg');
      if (current.report && current.report.status === 'signed' && !confirm('This report is signed. Rewriting it clears the signature. Continue?')) return;
      reportGen.disabled = true; if (msgEl) msgEl.textContent = 'Writing the report...';
      var box = document.getElementById('inspReportBox');
      if (box) { var sk = document.createElement('div'); sk.id = 'inspReportSkeleton'; sk.innerHTML = '<div class="insp-shimmer" style="height:14px;margin:0.7rem 0"></div><div class="insp-shimmer" style="height:14px;margin:0.7rem 0;width:85%"></div><div class="insp-shimmer" style="height:14px;margin:0.7rem 0;width:70%"></div>'; box.appendChild(sk); }
      api('/inspections/' + current.inspection.id + '/report', 'POST', {}).then(function(r) { current.report = r.report; render(); }).catch(function(err) { reportGen.disabled = false; var sk2 = document.getElementById('inspReportSkeleton'); if (sk2) sk2.remove(); if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#991b1b'; } });
    });
    var reportSave = document.getElementById('inspReportSave');
    if (reportSave) reportSave.addEventListener('click', function() {
      var ta = document.getElementById('inspReportText'), msgEl = document.getElementById('inspReportMsg');
      reportSave.disabled = true; if (msgEl) msgEl.textContent = 'Saving...';
      api('/inspections/' + current.inspection.id + '/report', 'PUT', { text: ta.value }).then(function(r) { current.report = r.report; render(); }).catch(function(err) { reportSave.disabled = false; if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#991b1b'; } });
    });
    var reportSign = document.getElementById('inspReportSign');
    if (reportSign) reportSign.addEventListener('click', function() {
      var msgEl = document.getElementById('inspReportMsg');
      reportSign.disabled = true; if (msgEl) msgEl.textContent = 'Signing...';
      api('/inspections/' + current.inspection.id + '/report/sign', 'POST', {}).then(function(r) { current.report = r.report; render(); }).catch(function(err) { reportSign.disabled = false; if (msgEl) { msgEl.textContent = err.message; msgEl.style.color = '#991b1b'; } });
    });
  }

  function comparisonHtml(rows) {
    var badge = { 'wear and tear': 'badge-green', 'possible damage': 'badge-red', 'unclear': 'badge-yellow' };
    var out = '<h3 style="font-size:1rem;color:var(--primary);margin:1.25rem 0 0.5rem">Move-out vs move-in</h3>';
    if (!rows || !rows.length) return out + '<p style="font-size:0.9rem">The AI found no meaningful changes between the two inspections.</p>';
    out += '<div class="table-scroll"><table class="data-table"><thead><tr><th>Room</th><th>Change</th><th>Looks like</th><th>Why</th></tr></thead><tbody>' + rows.map(function(c) { return '<tr><td>' + esc(c.room) + '</td><td>' + esc(c.change) + '</td><td><span class="badge ' + (badge[c.assessment] || 'badge-gray') + '">' + esc(c.assessment) + '</span></td><td>' + esc(c.note) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return out + '<p style="font-size:0.8rem;color:var(--gray);margin-top:0.5rem">AI draft for your review, not a legal decision. In California, ordinary wear and tear can\'t be deducted from the deposit, and the itemized statement is due within 21 days of move-out (Civil Code 1950.5).</p>';
  }

  function upload(fileList) {
    var all = Array.prototype.slice.call(fileList || []).filter(function(f) { return /^image\//.test(f.type); });
    if (!all.length) return;
    var roomSel = document.getElementById('inspRoom'), room = roomSel.value === 'Other' ? document.getElementById('inspRoomOther').value.trim() : roomSel.value;
    var msg = document.getElementById('inspUploadMsg');
    if (!room) { msg.textContent = 'Type the room name first.'; return; }
    var done = 0, failed = [], tempSeq = 0;
    msg.textContent = 'Reading photo 1 of ' + all.length + ' with AI...';
    all.reduce(function(chain, file) {
      return chain.then(function() {
        return resize(file).then(function(blob) {
          var tempId = 'reading-' + (++tempSeq);
          var url = URL.createObjectURL(blob);
          current.items.push({ id: tempId, room_area: room, reading: true, localUrl: url });
          render();
          var m = document.getElementById('inspUploadMsg');
          if (m) m.textContent = 'Reading photo ' + (done + 1) + ' of ' + all.length + ' with AI...';
          return api('/inspections/' + current.inspection.id + '/items?room=' + encodeURIComponent(room), 'POST', blob, 'image/jpeg')
            .then(function(r) {
              var idx = -1; current.items.forEach(function(x, k) { if (x.id === tempId) idx = k; });
              if (idx >= 0) current.items[idx] = r.item;
              var card = work.querySelector('.insp-item[data-item="' + tempId + '"]');
              if (card) { var wrap = document.createElement('div'); wrap.innerHTML = itemCard(r.item); var neo = wrap.firstChild; card.replaceWith(neo); loadImage(r.item, neo.querySelector('img')); }
              else render();
              URL.revokeObjectURL(url);
            })
            .catch(function(err) {
              failed.push(err.message);
              current.items = current.items.filter(function(x) { return x.id !== tempId; });
              var card = work.querySelector('.insp-item[data-item="' + tempId + '"]');
              if (card) card.remove();
              URL.revokeObjectURL(url);
            })
            .then(function() { done++; var m2 = document.getElementById('inspUploadMsg'); if (m2 && done < all.length) m2.textContent = 'Reading photo ' + (done + 1) + ' of ' + all.length + ' with AI...'; });
        });
      });
    }, Promise.resolve()).then(function() {
      current.inspection.status = 'in_progress';
      render();
      document.getElementById('inspUploadMsg').textContent = failed.length ? (all.length - failed.length) + ' added. Some failed: ' + failed[0] : all.length + ' photo' + (all.length > 1 ? 's' : '') + ' added to ' + room + '. Check the AI notes and fix anything that\'s off.';
    });
  }

  // Save edits as the inspector changes a field.
  work.addEventListener('change', function(e) {
    var f = e.target.getAttribute('data-f'), card = e.target.closest('.insp-item');
    if (!f || !card) return;
    var id = Number(card.getAttribute('data-item')), it = current.items.filter(function(x) { return x.id === id; })[0], msg = card.querySelector('[data-msg]');
    var val = e.target.type === 'checkbox' ? e.target.checked : e.target.value, payload = {}; payload[f] = val;
    api('/inspections/' + current.inspection.id + '/items/' + id, 'PUT', payload).then(function() {
      it[f] = f === 'repair_needed' ? (val ? 1 : 0) : val;
      if (f === 'repair_needed') { render(); } else { msg.textContent = 'Saved'; setTimeout(function() { msg.textContent = ''; }, 1200); }
    }).catch(function(err) { msg.textContent = err.message; msg.style.color = '#991b1b'; });
  });
  work.addEventListener('click', function(e) {
    var card = e.target.closest('.insp-item');
    if (e.target.getAttribute('data-zoom') && e.target.src) { window.open(e.target.src, '_blank'); return; }
    var act = e.target.getAttribute('data-act');
    if (!card || !act) return;
    var id = Number(card.getAttribute('data-item')), msg = card.querySelector('[data-msg]');
    if (act === 'voice') {
      if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
      if (typeof window.MediaRecorder === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'Voice notes need a browser with microphone access.'; return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        voiceChunks = []; voiceBtn = e.target; voiceMsg = msg; voiceItemId = id;
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = function(ev) { if (ev.data && ev.data.size) voiceChunks.push(ev.data); };
        recorder.onstop = function() {
          stream.getTracks().forEach(function(t) { t.stop(); });
          var type = recorder.mimeType || 'audio/webm';
          var blob = new Blob(voiceChunks, { type: type });
          if (voiceBtn) voiceBtn.textContent = '🎤 Voice note';
          if (voiceMsg) voiceMsg.textContent = 'Transcribing...';
          api('/inspections/' + current.inspection.id + '/items/' + voiceItemId + '/voice', 'POST', blob, type).then(function(r) {
            var it = current.items.filter(function(x) { return x.id === voiceItemId; })[0];
            if (it) it.notes = r.notes;
            var c = document.querySelector('.insp-item[data-item="' + voiceItemId + '"]');
            if (c) { var ta = c.querySelector('textarea[data-f="notes"]'); if (ta) ta.value = r.notes; }
            if (voiceMsg) voiceMsg.textContent = 'Voice note added.';
          }).catch(function(err) { if (voiceMsg) { voiceMsg.textContent = err.message; voiceMsg.style.color = '#991b1b'; } });
        };
        recorder.start();
        e.target.textContent = '⏹ Stop recording';
        msg.textContent = 'Recording — speak, then tap Stop.';
      }).catch(function() { msg.textContent = 'Microphone access was blocked. Allow it to record a voice note.'; });
      return;
    }
    if (act === 'del') {
      if (!confirm('Remove this photo?')) return;
      api('/inspections/' + current.inspection.id + '/items/' + id, 'DELETE').then(function() { current.items = current.items.filter(function(x) { return x.id !== id; }); render(); }).catch(function(err) { msg.textContent = err.message; });
    }
    if (act === 'maint') {
      e.target.disabled = true;
      api('/inspections/' + current.inspection.id + '/items/' + id + '/maintenance', 'POST', {}).then(function(r) {
        current.items.forEach(function(x) { if (x.id === id) x.maintenance_id = r.maintenance_id; });
        e.target.outerHTML = '<span class="badge badge-green">Maintenance request created</span>';
        if (typeof window.loadMaintenance === 'function') window.loadMaintenance();
      }).catch(function(err) { e.target.disabled = false; msg.textContent = err.message; });
    }
  });

  function finish() {
    var btn = document.getElementById('inspFinish'), msg = document.getElementById('inspFinishMsg');
    btn.disabled = true; msg.textContent = current.inspection.type === 'move_out' && current.inspection.compare_to ? 'Writing the summary and comparing with the move-in...' : 'Writing the summary...';
    api('/inspections/' + current.inspection.id + '/finish', 'POST', {}).then(function(r) {
      current.inspection.status = 'completed'; current.inspection.overall_condition = r.overall_condition; current.inspection.summary = r.summary; current.comparison = r.comparison;
      render(); load();
    }).catch(function(err) { btn.disabled = false; msg.textContent = err.message; msg.style.color = '#991b1b'; });
  }
})();
