/* Tello's "Today" briefing (GET /api/tello/briefing): what needs the landlord's attention, most urgent first.
   Used on the dashboard Overview and at the top of Ask Tello. ECTelloBrief.render(el, data, onNav) */
(function () {
  var P = {
    rent: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    lease: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    maintenance: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17c1.5-2 2.5-2 3 0s1.5 2 3 0"/>',
    application: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    inquiry: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    tenant: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85"/>',
    listing: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
    billing: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    start: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
    clear: '<path d="M20 6 9 17l-5-5"/>'
  };
  function icon(kind) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[kind] || P.start) + '</svg>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var LABEL = { now: 'Today', soon: 'Soon', info: 'FYI' };

  var css = document.createElement('style');
  css.textContent = '.tb{background:#fff;border:1px solid #e7e3d8;border-radius:14px;padding:0.9rem;color:#1a1a1a}'
    + '.tb-head{display:flex;align-items:baseline;justify-content:space-between;gap:0.5rem;margin-bottom:0.6rem}'
    + '.tb-head strong{font-size:1rem;color:#123a30}.tb-head span{font-size:0.75rem;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280}'
    + '.tb-list{display:flex;flex-direction:column;gap:0.5rem}'
    + '.tb-item{display:flex;gap:0.7rem;align-items:flex-start;width:100%;text-align:left;background:#fbfaf6;border:1px solid #ece8dd;border-radius:12px;padding:0.65rem 0.75rem;font:inherit;color:inherit;cursor:pointer}'
    + '.tb-item:hover{border-color:#123a30}.tb-ico{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e8efe9;color:#123a30}'
    + '.tb-item.now .tb-ico{background:#fdf0dc;color:#b45309}.tb-item.info .tb-ico{background:#f1f1ee;color:#6b7280}'
    + '.tb-t{font-weight:650;font-size:0.92rem;line-height:1.3}.tb-d{font-size:0.83rem;color:#4b5563;line-height:1.4;margin-top:0.15rem}'
    + '.tb-tag{display:inline-block;font-size:0.68rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-right:0.35rem;color:#6b7280}.tb-item.now .tb-tag{color:#b45309}'
    + '.tb-more{background:none;border:none;color:#123a30;font:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;padding:0.4rem 0 0}'
    + '.tb-mail{display:flex;align-items:center;gap:0.5rem;margin-top:0.7rem;font-size:0.83rem;color:#4b5563}.tb-mail input{width:18px;height:18px;accent-color:#123a30}';
  document.head.appendChild(css);

  function render(el, data, onNav, opts) {
    opts = opts || {};
    var items = (data && data.items) || [], limit = opts.limit || 5, hello = data && data.name ? 'Good ' + partOfDay() + ', ' + esc(data.name) + '.' : 'Good ' + partOfDay() + '.';
    var urgent = items.filter(function (i) { return i.urgency !== 'info'; }).length;
    var html = '<div class="tb"><div class="tb-head"><strong>' + hello + '</strong><span>What needs you</span></div><div class="tb-list">';
    if (!items.length) html += '<div class="tb-item info" style="cursor:default"><span class="tb-ico">' + icon('clear') + '</span><span><span class="tb-t">All clear. Nothing needs you today.</span><span class="tb-d" style="display:block">Rent, leases, repairs and applications are all up to date.</span></span></div>';
    items.forEach(function (it, n) {
      html += '<button type="button" class="tb-item ' + esc(it.urgency) + '" data-page="' + esc(it.page) + '"' + (n >= limit ? ' hidden' : '') + '><span class="tb-ico">' + icon(it.kind) + '</span><span><span class="tb-t"><span class="tb-tag">' + LABEL[it.urgency] + '</span>' + esc(it.title) + '</span><span class="tb-d" style="display:block">' + esc(it.detail) + '</span></span></button>';
    });
    html += '</div>';
    if (items.length > limit) html += '<button type="button" class="tb-more">Show all ' + items.length + '</button>';
    if (opts.onMail) html += '<label class="tb-mail"><input type="checkbox"' + (data.morning_email ? ' checked' : '') + ' /> Email me this every morning' + (urgent ? '' : ' (only on days something needs you)') + '</label>';
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll('.tb-item[data-page]').forEach(function (b) { b.addEventListener('click', function () { if (onNav) onNav(b.getAttribute('data-page')); }); });
    var more = el.querySelector('.tb-more');
    if (more) more.addEventListener('click', function () { el.querySelectorAll('.tb-item[hidden]').forEach(function (b) { b.hidden = false; }); more.remove(); });
    var box = el.querySelector('.tb-mail input');
    if (box) box.addEventListener('change', function () { opts.onMail(box.checked, function (ok) { if (!ok) box.checked = !box.checked; }); });
  }
  function partOfDay() { var h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
  function load(token) {
    return fetch('/api/tello/briefing', { headers: { Authorization: 'Bearer ' + token } }).then(function (r) { if (!r.ok) throw new Error('briefing ' + r.status); return r.json(); });
  }
  function setMorningEmail(token, on, done) {
    fetch('/api/tello/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ morning_email: on }) })
      .then(function (r) { done(r.ok); }).catch(function () { done(false); });
  }
  window.ECTelloBrief = { render: render, load: load, setMorningEmail: setMorningEmail };
})();
