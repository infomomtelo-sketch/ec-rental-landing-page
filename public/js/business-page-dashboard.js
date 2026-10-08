// "Your business page" card on the Settings page: edit the landlord's public page at /rentals/<slug>
// (src/business-pages.ts) and read the latest messages visitors sent from it.
(function () {
  var view = document.getElementById('dashboardView');
  var settingsPage = document.getElementById('page-settings');
  if (!view || !settingsPage) return;
  var loaded = false;

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function call(method, body) {
    return fetch('/api/business-page', { method: method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.'); return d; }); });
  }
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  function slugify(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, ''); }

  function field(label, input, hint) {
    var g = el('div', { class: 'form-group' });
    var l = el('label', null, label); g.appendChild(l); g.appendChild(input);
    if (hint) g.appendChild(el('p', { style: 'color:var(--gray);font-size:0.8rem;margin-top:0.3rem' }, hint));
    return g;
  }

  function card(d) {
    var c = document.getElementById('businessPageCard');
    if (!c) {
      c = el('div', { class: 'data-card', id: 'businessPageCard', style: 'padding:2rem;' });
      var account = document.getElementById('settingsName');
      var before = account ? account.closest('.data-card') : settingsPage.querySelector('.data-card');
      settingsPage.insertBefore(c, before);
    }
    c.innerHTML = '';
    var p = d.page;
    c.appendChild(el('h2', { style: 'color:var(--primary);margin-bottom:0.5rem;' }, 'Your business page'));
    c.appendChild(el('p', { style: 'color:var(--gray);margin-bottom:1rem' }, 'Your own website under your business name. It shows your active listings, a contact form, and a tenant login. Share the link on cards, signs and social media.'));

    var linkRow = el('div', { style: 'display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:1.25rem;background:#f0f7f3;border-radius:10px;padding:0.75rem 1rem' });
    var link = el('a', { href: d.url, target: '_blank', rel: 'noopener', style: 'font-weight:700;word-break:break-all;flex:1;min-width:200px' }, d.url.replace(/^https?:\/\//, ''));
    linkRow.appendChild(link);
    linkRow.appendChild(el('span', { class: 'badge ' + (d.live ? 'badge-green' : 'badge-gray') }, d.live ? 'Live' : (p.published ? 'Not live: needs an active plan' : 'Hidden')));
    var copy = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, 'Copy link');
    copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(d.url).then(done, function () { prompt('Copy your page link:', d.url); });
      else prompt('Copy your page link:', d.url);
    });
    linkRow.appendChild(copy);
    c.appendChild(linkRow);

    var name = el('input', { type: 'text', maxlength: '80' }); name.value = p.business_name;
    var slug = el('input', { type: 'text', maxlength: '50', autocapitalize: 'none', spellcheck: 'false' }); slug.value = p.slug;
    var tagline = el('input', { type: 'text', maxlength: '140', placeholder: 'Clean, well-kept homes with fast repairs' }); tagline.value = p.tagline;
    var area = el('input', { type: 'text', maxlength: '120', placeholder: 'e.g. Sacramento and nearby' }); area.value = p.service_area;
    var phone = el('input', { type: 'tel', maxlength: '30' }); phone.value = p.phone;
    var email = el('input', { type: 'email', maxlength: '200' }); email.value = p.email;
    var about = el('textarea', { rows: '4', maxlength: '3000', placeholder: 'Who you are, how long you have been renting homes, what tenants can expect.' }); about.value = p.about;
    var published = el('input', { type: 'checkbox', style: 'width:auto;margin-right:0.5rem' }); published.checked = !!p.published;
    // Suggest an address from the name until the landlord edits the address themselves.
    var slugEdited = false;
    slug.addEventListener('input', function () { slugEdited = true; });
    name.addEventListener('input', function () { if (!slugEdited && p.slug === slugify(p.business_name)) slug.value = slugify(name.value); });

    var row1 = el('div', { class: 'form-row' }); row1.appendChild(field('Business name', name)); row1.appendChild(field('Page address', slug, 'ecrentalpm.com/rentals/' + p.slug));
    slug.addEventListener('input', function () { slug.nextSibling.textContent = 'ecrentalpm.com/rentals/' + (slug.value || '...'); });
    c.appendChild(row1);
    c.appendChild(field('Tagline', tagline));
    var row2 = el('div', { class: 'form-row' }); row2.appendChild(field('Area you serve', area)); row2.appendChild(field('Public phone', phone)); c.appendChild(row2);
    c.appendChild(field('Public email (messages go here)', email));
    c.appendChild(field('About your business', about));
    var pub = el('label', { style: 'display:flex;align-items:center;font-weight:600;font-size:0.9rem;margin-bottom:1rem' }); pub.appendChild(published); pub.appendChild(document.createTextNode('Show my page to the public'));
    c.appendChild(pub);

    var note = el('p', { style: 'font-size:0.85rem;margin-top:0.5rem', role: 'status' });
    var save = el('button', { class: 'btn', type: 'button' }, 'Save business page');
    save.addEventListener('click', function () {
      save.disabled = true; note.style.color = 'var(--gray)'; note.textContent = 'Saving...';
      call('PUT', { business_name: name.value, slug: slug.value.trim().toLowerCase(), tagline: tagline.value, service_area: area.value, phone: phone.value, email: email.value, about: about.value, published: published.checked })
        .then(function (r) { card({ page: r.page, url: r.url, live: r.live, messages: d.messages }); var n = document.getElementById('businessPageNote'); if (n) { n.style.color = '#166534'; n.textContent = 'Saved.'; } })
        .catch(function (err) { save.disabled = false; note.style.color = '#991b1b'; note.textContent = err.message; });
    });
    note.id = 'businessPageNote';
    c.appendChild(save); c.appendChild(note);

    c.appendChild(el('h3', { style: 'color:var(--primary);margin:1.5rem 0 0.5rem;font-size:1rem' }, 'Messages from your page'));
    if (!d.messages || !d.messages.length) { c.appendChild(el('p', { style: 'color:var(--gray);font-size:0.9rem' }, 'No messages yet. They are also emailed to you.')); return; }
    d.messages.forEach(function (m) {
      var box = el('div', { style: 'border:1px solid #e5e7eb;border-radius:10px;padding:0.75rem 1rem;margin-bottom:0.5rem' });
      var head = el('div', { style: 'display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:space-between;font-size:0.85rem' });
      var who = el('strong', null, m.name); head.appendChild(who);
      head.appendChild(el('span', { style: 'color:var(--gray)' }, fmtDate(m.created_at)));
      box.appendChild(head);
      var contact = el('div', { style: 'font-size:0.85rem;margin:0.2rem 0' });
      var mail = el('a', { href: 'mailto:' + m.email }, m.email); contact.appendChild(mail);
      if (m.phone) { contact.appendChild(document.createTextNode(' · ')); contact.appendChild(el('a', { href: 'tel:' + m.phone.replace(/[^\d+]/g, '') }, m.phone)); }
      box.appendChild(contact);
      box.appendChild(el('p', { style: 'white-space:pre-line;font-size:0.9rem' }, m.message));
      c.appendChild(box);
    });
  }

  function start() {
    if (view.style.display === 'none') { loaded = false; var old = document.getElementById('businessPageCard'); if (old) old.remove(); return; }
    if (loaded || !token()) return; loaded = true;
    call('GET').then(card).catch(function () { loaded = false; });
  }
  new MutationObserver(start).observe(view, { attributes: true, attributeFilter: ['style'] });
  start();
})();
