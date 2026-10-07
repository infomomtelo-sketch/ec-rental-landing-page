// Counts one page view for the site owner's admin page. No cookies; the browser only remembers today's date
// so the first page of the day counts as a new visitor. Visiting /admin turns counting off for that browser.
(function () {
  try {
    if (localStorage.getItem('ec_notrack') === '1') return;
    var today = new Date().toISOString().slice(0, 10), isNew = 0;
    if (localStorage.getItem('ec_seen') !== today) { localStorage.setItem('ec_seen', today); isNew = 1; }
    var utm = (location.search.match(/[?&]utm_source=([^&]+)/) || [])[1] || '';
    var data = JSON.stringify({ p: location.pathname, r: document.referrer || '', u: decodeURIComponent(utm), n: isNew });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/public/pv', new Blob([data], { type: 'application/json' }));
    else fetch('/api/public/pv', { method: 'POST', body: data, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch (e) { /* counting is optional */ }
})();
