// Dashboard "Listings" page: create/edit rental listings, upload photos, publish to the site and Zillow.
(function() {
  var body = document.getElementById('listingsBody');
  if (!body) return;
  var modal = document.getElementById('listingModal');
  var form = document.getElementById('listingForm');
  var msg = document.getElementById('listingMsg');
  var photoSection = document.getElementById('listingPhotoSection');
  var photoGrid = document.getElementById('listingPhotoGrid');
  var photoInput = document.getElementById('listingPhotoInput');
  var photoStatus = document.getElementById('listingPhotoStatus');
  var current = null;

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function api(path, method, payload, rawType) {
    var headers = { 'Authorization': 'Bearer ' + token() };
    var opts = { method: method || 'GET', headers: headers };
    if (rawType) { headers['Content-Type'] = rawType; opts.body = payload; }
    else if (payload) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(payload); }
    return fetch('/api' + path, opts).then(function(res) { return res.json().then(function(data) { if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')')); return data; }); });
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function showMsg(text, ok) { msg.textContent = text; msg.style.color = ok ? '#166534' : '#991b1b'; msg.style.display = text ? 'block' : 'none'; }

  function load() {
    if (!token()) return;
    api('/listings').then(function(list) {
      if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="icon">📣</div>No listings yet. Click "+ New Listing" to advertise a vacancy.</td></tr>'; return; }
      body.innerHTML = list.map(function(l) {
        var badge = l.status === 'active' ? 'badge-green' : l.status === 'rented' ? 'badge-gray' : 'badge-yellow';
        var zillow = l.syndicate_zillow ? (l.status === 'active' ? '<span class="badge badge-green">In feed</span>' : '<span class="badge badge-gray">On (not active)</span>') : '<span class="badge badge-gray">Off</span>';
        var addr = esc(l.street) + (l.unit ? ' #' + esc(l.unit) : '') + '<br><small style="color:var(--gray)">' + esc(l.city) + ', ' + esc(l.state) + '</small>';
        var view = l.status === 'active' ? ' <a class="btn btn-sm btn-secondary" href="/listing?id=' + l.id + '" target="_blank" rel="noopener">View</a>' : '';
        return '<tr><td>' + addr + '</td><td>' + money(l.rent) + '/mo</td><td>' + l.bedrooms + ' bd / ' + l.full_baths + (l.half_baths ? '.5' : '') + ' ba</td><td>' + (l.photos || []).length + '</td><td><span class="badge ' + badge + '">' + esc(l.status) + '</span> ' + zillow + '</td><td><button class="btn btn-sm" data-edit-listing="' + l.id + '">Edit</button>' + view + ' <button class="btn btn-sm btn-danger" data-delete-listing="' + l.id + '">Delete</button></td></tr>';
      }).join('');
    }).catch(function(err) { body.innerHTML = '<tr><td colspan="6" class="empty-state">' + esc(err.message) + '</td></tr>'; });
  }

  var leadsBody = document.getElementById('listingLeadsBody');
  var LEAD_TYPES = { question: 'Question', tourRequest: 'Tour request', applicationRequest: 'Application request' };
  function loadLeads() {
    if (!leadsBody || !token()) return;
    api('/listings/leads').then(function(list) {
      if (!list.length) { leadsBody.innerHTML = '<tr><td colspan="6" class="empty-state">No inquiries yet. Questions from your listing pages and from Zillow show up here and are emailed to the listing contact.</td></tr>'; return; }
      leadsBody.innerHTML = list.map(function(l) {
        var from = (l.source === 'zillow' ? '<span class="badge badge-green">Zillow</span>' : '<span class="badge badge-gray">Website</span>') + (LEAD_TYPES[l.leadType] ? '<br><small style="color:var(--gray)">' + LEAD_TYPES[l.leadType] + '</small>' : '');
        var contact = '<strong>' + esc(l.name) + '</strong><br><a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' + (l.phone ? '<br><a href="tel:' + esc(String(l.phone).replace(/[^\d+]/g, '')) + '">' + esc(l.phone) + '</a>' : '');
        return '<tr><td>' + new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</td><td>' + from + '</td><td>' + contact + '</td><td>' + esc(l.home) + '</td><td>' + esc(l.moveIn || '—') + '</td><td style="max-width:260px;white-space:normal">' + esc(l.message) + '</td></tr>';
      }).join('');
    }).catch(function(err) { leadsBody.innerHTML = '<tr><td colspan="6" class="empty-state">' + esc(err.message) + '</td></tr>'; });
  }

  function fillProperties(selected) {
    var sel = form.elements.property_id;
    api('/properties').then(function(props) {
      sel.innerHTML = '<option value="">Not linked</option>' + props.map(function(p) { return '<option value="' + p.id + '">' + esc(p.address) + '</option>'; }).join('');
      sel.value = selected ? String(selected) : '';
    }).catch(function() {});
  }

  function open(listing) {
    current = listing || null;
    form.reset(); showMsg('');
    document.getElementById('listingModalTitle').textContent = listing ? 'Edit Listing' : 'New Listing';
    fillProperties(listing && listing.property_id);
    if (listing) {
      Array.prototype.forEach.call(form.elements, function(el) {
        if (!el.name || !(el.name in listing)) return;
        if (el.type === 'checkbox') el.checked = !!listing[el.name];
        else el.value = listing[el.name] == null ? '' : listing[el.name];
      });
    } else {
      api('/me').then(function(d) { if (d.user && !form.elements.contact_email.value) { form.elements.contact_email.value = d.user.email || ''; form.elements.contact_name.value = d.user.company || d.user.name || ''; } }).catch(function() {});
    }
    renderPhotos();
    modal.classList.add('open');
  }

  function renderPhotos() {
    if (!current) { photoSection.style.display = 'none'; return; }
    photoSection.style.display = 'block';
    var photos = current.photos || [];
    photoGrid.innerHTML = photos.length ? photos.map(function(p) { return '<div style="position:relative"><img src="' + esc(p.url) + '" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:8px"><button type="button" data-delete-photo="' + p.id + '" aria-label="Remove photo" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer">✕</button></div>'; }).join('') : '<p style="color:var(--gray);font-size:0.85rem;grid-column:1/-1">No photos yet. Zillow ranks listings with photos much higher.</p>';
  }

  function refreshCurrent() { return api('/listings/' + current.id).then(function(l) { current = l; renderPhotos(); load(); }); }

  // Shrink big phone photos before upload: max 1600px on the long side, JPEG.
  function resize(file) {
    return new Promise(function(resolve, reject) {
      var img = new Image(); var url = URL.createObjectURL(file);
      img.onload = function() {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function(b) { b ? resolve(b) : reject(new Error('Could not read photo')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Could not read ' + file.name)); };
      img.src = url;
    });
  }

  photoInput.addEventListener('change', function() {
    var files = Array.prototype.slice.call(photoInput.files || []);
    if (!files.length || !current) return;
    var done = 0, failed = [];
    photoStatus.textContent = 'Uploading 0 of ' + files.length + '...';
    files.reduce(function(chain, file) {
      return chain.then(function() { return resize(file).then(function(blob) { return api('/listings/' + current.id + '/photos', 'POST', blob, 'image/jpeg'); }).catch(function(err) { failed.push(err.message); }).then(function() { done++; photoStatus.textContent = 'Uploading ' + done + ' of ' + files.length + '...'; }); });
    }, Promise.resolve()).then(function() {
      photoInput.value = '';
      photoStatus.textContent = failed.length ? 'Some photos failed: ' + failed[0] : 'Photos uploaded.';
      return refreshCurrent();
    });
  });

  photoGrid.addEventListener('click', function(e) {
    var id = e.target.getAttribute('data-delete-photo');
    if (!id || !current) return;
    api('/listings/' + current.id + '/photos/' + id, 'DELETE').then(refreshCurrent).catch(function(err) { photoStatus.textContent = err.message; });
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var data = {};
    Array.prototype.forEach.call(form.elements, function(el) { if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    var wasNew = !current;
    var req = current ? api('/listings/' + current.id, 'PUT', data) : api('/listings', 'POST', data);
    req.then(function(res) {
      load();
      if (wasNew) { return api('/listings/' + res.id).then(function(l) { current = l; renderPhotos(); document.getElementById('listingModalTitle').textContent = 'Edit Listing'; showMsg('Saved. Now add photos below.', true); }); }
      return refreshCurrent().then(function() { showMsg('Saved.', true); });
    }).catch(function(err) { showMsg(err.message, false); });
  });

  document.getElementById('addListingBtn').addEventListener('click', function() { open(null); });
  document.getElementById('listingModalClose').addEventListener('click', function() { modal.classList.remove('open'); });
  body.addEventListener('click', function(e) {
    var edit = e.target.getAttribute('data-edit-listing'), del = e.target.getAttribute('data-delete-listing');
    if (edit) api('/listings/' + edit).then(open);
    if (del && confirm('Delete this listing and its photos?')) api('/listings/' + del, 'DELETE').then(load);
  });
  var nav = document.querySelector('[data-page="listings"]');
  if (nav) nav.addEventListener('click', function() { load(); loadLeads(); });
  load();
  loadLeads();
})();
