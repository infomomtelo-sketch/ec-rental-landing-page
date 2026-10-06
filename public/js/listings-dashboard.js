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
  var shown = {};

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
      if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="icon"><svg class="ico" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></div>No listings yet. Click "+ New Listing" to advertise a vacancy.</td></tr>'; return; }
      shown = {};
      body.innerHTML = list.map(function(l) {
        var badge = l.status === 'active' ? 'badge-green' : l.status === 'rented' ? 'badge-gray' : 'badge-yellow';
        var issues = l.zillow_issues || [];
        var zillow = !l.syndicate_zillow ? '<span class="badge badge-gray">Zillow off</span>' : !issues.length ? '<span class="badge badge-green">On Zillow feed</span>' : '<span class="badge badge-yellow" title="' + esc(issues.join('; ')) + '">Not on Zillow yet</span><br><small style="color:var(--gray)">' + esc(issues[0]) + (issues.length > 1 ? ' +' + (issues.length - 1) + ' more' : '') + '</small>';
        var addr = esc(l.street) + (l.unit ? ' #' + esc(l.unit) : '') + '<br><small style="color:var(--gray)">' + esc(l.city) + ', ' + esc(l.state) + '</small>';
        shown[l.id] = l;
        var view = l.status === 'active' ? ' <a class="btn btn-sm btn-secondary" href="/listing?id=' + l.id + '" target="_blank" rel="noopener">View</a> <button class="btn btn-sm btn-secondary" data-share-listing="' + l.id + '">Share</button>' : '';
        return '<tr><td>' + addr + '</td><td>' + money(l.rent) + '/mo</td><td>' + (Number(l.bedrooms) ? l.bedrooms + ' bd' : 'Studio') + ' / ' + l.full_baths + (l.half_baths ? '.5' : '') + ' ba</td><td>' + (l.photos || []).length + '</td><td><span class="badge ' + badge + '">' + esc(l.status) + '</span> ' + zillow + '</td><td><button class="btn btn-sm" data-edit-listing="' + l.id + '">Edit</button>' + view + ' <button class="btn btn-sm btn-danger" data-delete-listing="' + l.id + '">Delete</button></td></tr>';
      }).join('');
    }).catch(function(err) { body.innerHTML = '<tr><td colspan="6" class="empty-state">' + esc(err.message) + '</td></tr>'; });
  }

  var leadsBody = document.getElementById('listingLeadsBody');
  var LEAD_TYPES = { question: 'Question', tourRequest: 'Tour request', applicationRequest: 'Application request' };
  function loadLeads() {
    if (!leadsBody || !token()) return;
    api('/listings/leads').then(function(list) {
      if (!list.length) { leadsBody.innerHTML = '<tr><td colspan="7" class="empty-state">No inquiries yet. Questions from your listing pages and from Zillow show up here and are emailed to the listing contact.</td></tr>'; return; }
      leadsBody.innerHTML = list.map(function(l) {
        var from = (l.source === 'zillow' ? '<span class="badge badge-green">Zillow</span>' : '<span class="badge badge-gray">Website</span>') + (LEAD_TYPES[l.leadType] ? '<br><small style="color:var(--gray)">' + LEAD_TYPES[l.leadType] + '</small>' : '');
        var contact = '<strong>' + esc(l.name) + '</strong><br><a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' + (l.phone ? '<br><a href="tel:' + esc(String(l.phone).replace(/[^\d+]/g, '')) + '">' + esc(l.phone) + '</a>' : '');
        return '<tr><td>' + new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</td><td>' + from + '</td><td>' + contact + '</td><td>' + esc(l.home) + '</td><td>' + esc(l.moveIn || '—') + '</td><td style="max-width:260px;white-space:normal">' + esc(l.message) + '</td><td><button class="btn btn-sm btn-secondary" data-ai-reply="' + l.id + '" data-email="' + esc(l.email) + '" data-name="' + esc(l.name) + '">Draft reply</button></td></tr>';
      }).join('');
    }).catch(function(err) { leadsBody.innerHTML = '<tr><td colspan="7" class="empty-state">' + esc(err.message) + '</td></tr>'; });
  }

  // AI-drafted reply to a renter inquiry. The landlord edits it, then sends from their own email.
  var replyBox = document.getElementById('leadReplyBox'), replyText = document.getElementById('leadReplyText'), replySend = document.getElementById('leadReplySend');
  var replyTo = { email: '', subject: '' };
  function updateMailto() { replySend.href = 'mailto:' + encodeURIComponent(replyTo.email) + '?subject=' + encodeURIComponent(replyTo.subject) + '&body=' + encodeURIComponent(replyText.value); }
  if (leadsBody && replyBox) {
    leadsBody.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-ai-reply]');
      if (!btn) return;
      replyTo = { email: btn.getAttribute('data-email'), subject: '' };
      document.getElementById('leadReplyTo').textContent = btn.getAttribute('data-name') || replyTo.email;
      replyText.value = 'Writing a reply...'; replyText.disabled = true; replyBox.style.display = 'block';
      replyBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      api('/ai/inquiry-reply', 'POST', { leadId: Number(btn.getAttribute('data-ai-reply')) }).then(function(r) {
        replyText.value = r.reply; replyTo.subject = r.subject;
      }).catch(function(err) { replyText.value = err.message; }).then(function() { replyText.disabled = false; updateMailto(); });
    });
    replyText.addEventListener('input', updateMailto);
    document.getElementById('leadReplyCopy').addEventListener('click', function() { try { navigator.clipboard.writeText(replyText.value); this.textContent = 'Copied'; var b = this; setTimeout(function() { b.textContent = 'Copy'; }, 1500); } catch (err) { replyText.select(); } });
    document.getElementById('leadReplyClose').addEventListener('click', function() { replyBox.style.display = 'none'; });
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
    form.reset(); showMsg(''); if (aiMsg) aiMsg.textContent = ''; if (rentResult) rentResult.style.display = 'none';
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

  // Shows what still keeps a saved listing out of the Zillow feed.
  var zillowCheck = document.getElementById('listingZillowCheck');
  function renderZillowCheck() {
    if (!zillowCheck) return;
    if (!current) { zillowCheck.style.display = 'none'; return; }
    var issues = current.zillow_issues || [];
    zillowCheck.style.display = 'block';
    zillowCheck.style.background = issues.length ? '#fef9c3' : '#dcfce7';
    zillowCheck.style.color = issues.length ? '#854d0e' : '#166534';
    zillowCheck.innerHTML = issues.length ? '<strong>Not on Zillow yet.</strong> To get it there:<ul style="margin:0.3rem 0 0 1.2rem">' + issues.map(function(i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : '<strong>Ready.</strong> This listing is in the Zillow feed.';
  }

  function renderPhotos() {
    renderZillowCheck();
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

  function uploadPhotos(list) {
    var files = Array.prototype.slice.call(list || []).filter(function(f) { return /^image\//.test(f.type); });
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
  }
  photoInput.addEventListener('change', function() { uploadPhotos(photoInput.files); });
  var photoDrop = document.getElementById('listingPhotoDrop');
  if (photoDrop) {
    ['dragenter', 'dragover'].forEach(function(t) { photoDrop.addEventListener(t, function(e) { e.preventDefault(); photoDrop.style.borderColor = 'var(--primary)'; photoDrop.style.background = '#f0fdf4'; }); });
    ['dragleave', 'drop'].forEach(function(t) { photoDrop.addEventListener(t, function(e) { e.preventDefault(); photoDrop.style.borderColor = '#d1d5db'; photoDrop.style.background = ''; }); });
    photoDrop.addEventListener('drop', function(e) { uploadPhotos(e.dataTransfer && e.dataTransfer.files); });
  }

  photoGrid.addEventListener('click', function(e) {
    var id = e.target.getAttribute('data-delete-photo');
    if (!id || !current) return;
    api('/listings/' + current.id + '/photos/' + id, 'DELETE').then(refreshCurrent).catch(function(err) { photoStatus.textContent = err.message; });
  });

  // Writes the description from the details filled in above (and any notes already in the box).
  var aiBtn = document.getElementById('listingAiBtn'), aiMsg = document.getElementById('listingAiMsg');
  if (aiBtn) aiBtn.addEventListener('click', function() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function(el) { if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    if (current) data.id = current.id;
    aiBtn.disabled = true; aiMsg.style.color = 'var(--gray)'; aiMsg.textContent = current && (current.photos || []).length ? 'Looking at your photos and writing...' : 'Writing...';
    api('/ai/listing-description', 'POST', data).then(function(r) {
      form.elements.description.value = r.description;
      aiMsg.textContent = 'Written by AI from your details' + (r.photos_used ? ' and ' + r.photos_used + ' photo' + (r.photos_used > 1 ? 's' : '') : '') + '. Check it, edit anything, then Save Listing.';
    }).catch(function(err) { aiMsg.style.color = '#991b1b'; aiMsg.textContent = err.message; }).then(function() { aiBtn.disabled = false; });
  });

  // Writes a short headline from the same details.
  var titleBtn = document.getElementById('listingTitleAiBtn'), titleMsg = document.getElementById('listingTitleAiMsg');
  if (titleBtn) titleBtn.addEventListener('click', function() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function(el) { if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    titleBtn.disabled = true; titleMsg.style.color = 'var(--gray)'; titleMsg.textContent = 'Writing...';
    api('/ai/listing-title', 'POST', data).then(function(r) {
      form.elements.title.value = r.title;
      titleMsg.textContent = 'Written by AI. Click again for another option, or edit it.';
    }).catch(function(err) { titleMsg.style.color = '#991b1b'; titleMsg.textContent = err.message; }).then(function() { titleBtn.disabled = false; });
  });

  // Compares the rent with similar listings on EC Rental.
  var rentBtn = document.getElementById('listingRentBtn'), rentResult = document.getElementById('listingRentResult');
  if (rentBtn) rentBtn.addEventListener('click', function() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function(el) { if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    if (current) data.id = current.id;
    rentBtn.disabled = true; rentResult.style.display = 'block'; rentResult.textContent = 'Comparing...';
    api('/ai/rent-check', 'POST', data).then(function(r) {
      if (r.message) { rentResult.textContent = r.message; return; }
      rentResult.innerHTML = '<strong>' + r.count + ' similar listings in ' + esc(r.area) + ':</strong> typical ' + money(r.low) + ' to ' + money(r.high) + ', median ' + money(r.median) + '. Yours is ' + esc(r.position) + ' (' + (r.diff_percent > 0 ? '+' : '') + r.diff_percent + '%).' + (r.advice ? '<br>' + esc(r.advice) : '');
    }).catch(function(err) { rentResult.textContent = err.message; }).then(function() { rentBtn.disabled = false; });
  });

  // Rewrite / Fix spelling & grammar for the description or the inquiry reply.
  Array.prototype.forEach.call(document.querySelectorAll('[data-ai-polish]'), function(btn) {
    btn.addEventListener('click', function() {
      var isReply = btn.getAttribute('data-ai-target') === 'reply';
      var box = isReply ? replyText : form.elements.description;
      var note = isReply ? null : aiMsg;
      var label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Working...';
      if (note) { note.style.color = 'var(--gray)'; note.textContent = ''; }
      api('/ai/polish', 'POST', { text: box.value, mode: btn.getAttribute('data-ai-polish'), kind: isReply ? 'reply' : 'description' }).then(function(r) {
        box.value = r.text;
        if (isReply) updateMailto(); else if (note) note.textContent = 'Updated by AI. Check it before saving.';
      }).catch(function(err) { if (note) { note.style.color = '#991b1b'; note.textContent = err.message; } else alert(err.message); }).then(function() { btn.disabled = false; btn.textContent = label; });
    });
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

  // "Share" on an active listing: a ready-to-post caption for Facebook groups, Marketplace, Nextdoor or a text.
  var shareModal = document.getElementById('shareModal'), shareText = document.getElementById('shareText'), shareMsg = document.getElementById('shareMsg');
  var shareNative = document.getElementById('shareNative'), shareFacebook = document.getElementById('shareFacebook');
  var shareUrl = '';
  var TYPE_WORDS = { HOUSE: 'house', CONDO: 'condo', TOWNHOUSE: 'townhouse' };
  function availableText(d) {
    var t = Date.parse(d);
    if (!d || isNaN(t) || t <= Date.now()) return 'Available now';
    return 'Available ' + new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function shareCaption(l) {
    var baths = l.full_baths + (l.half_baths ? 0.5 : 0);
    var lines = ['For rent in ' + l.city + ': ' + (l.bedrooms ? l.bedrooms + ' bd' : 'Studio') + ' / ' + baths + ' ba ' + (TYPE_WORDS[l.property_type] || 'home') + ' · ' + money(l.rent) + '/mo'];
    var facts = [availableText(l.date_available)];
    if (l.square_feet) facts.push(Number(l.square_feet).toLocaleString('en-US') + ' sq ft');
    if (l.cats_allowed || l.small_dogs_allowed || l.large_dogs_allowed) facts.push('pets considered');
    if (l.laundry === 'in_unit') facts.push('in-unit laundry');
    if (l.bathroom === 'private' || l.bathroom === 'shared') facts.push(l.bathroom + ' bathroom');
    if (l.parking_type === 'garageAttached' || l.parking_type === 'garageLot') facts.push('garage');
    lines.push(l.street + ', ' + l.city + ' · ' + facts.join(' · '));
    if (l.title) lines.push(l.title);
    lines.push('See photos, ask questions any time and apply online: ' + shareUrl);
    lines.push('#' + String(l.city).replace(/[^A-Za-z]/g, '') + 'Rentals #ForRent #EqualHousingOpportunity');
    return lines.join('\n\n');
  }
  function openShare(l) {
    shareUrl = 'https://ecrentalpm.com/listing?id=' + l.id;
    shareText.value = shareCaption(l);
    shareFacebook.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl);
    shareNative.hidden = !navigator.share;
    shareMsg.style.display = 'none';
    shareModal.classList.add('open');
  }
  document.getElementById('shareModalClose').addEventListener('click', function() { shareModal.classList.remove('open'); });
  document.getElementById('shareCopy').addEventListener('click', function() {
    function done() { shareMsg.textContent = 'Copied. Paste it into your post.'; shareMsg.style.display = 'block'; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(shareText.value).then(done, function() { shareText.select(); document.execCommand('copy'); done(); });
    else { shareText.select(); document.execCommand('copy'); done(); }
  });
  shareNative.addEventListener('click', function() { navigator.share({ text: shareText.value }).catch(function() {}); });

  document.getElementById('addListingBtn').addEventListener('click', function() { open(null); });
  document.getElementById('listingModalClose').addEventListener('click', function() { modal.classList.remove('open'); });
  body.addEventListener('click', function(e) {
    var edit = e.target.getAttribute('data-edit-listing'), del = e.target.getAttribute('data-delete-listing');
    if (edit) api('/listings/' + edit).then(open);
    if (del && confirm('Delete this listing and its photos?')) api('/listings/' + del, 'DELETE').then(load);
    var share = e.target.getAttribute('data-share-listing');
    if (share && shown[share]) openShare(shown[share]);
  });
  var nav = document.querySelector('[data-page="listings"]');
  if (nav) nav.addEventListener('click', function() { load(); loadLeads(); });
  load();
  loadLeads();
})();
