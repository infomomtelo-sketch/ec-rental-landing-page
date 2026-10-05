// Phone layout for dashboard tables and the "Ask Tello" helper.
// On small screens each table row becomes a card, so every cell needs its column name; this copies the
// header text onto each cell as data-label whenever a table body is (re)drawn.
(function() {
  function labelTable(table) {
    if (!table.tHead || !table.tHead.rows[0]) return;
    var names = Array.prototype.map.call(table.tHead.rows[0].cells, function(th) { return th.textContent.trim(); });
    Array.prototype.forEach.call(table.tBodies, function(tbody) {
      Array.prototype.forEach.call(tbody.rows, function(tr) {
        var col = 0;
        Array.prototype.forEach.call(tr.cells, function(td) {
          var name = td.colSpan > 1 ? '' : (names[col] || '');
          td.setAttribute('data-label', name);
          td.classList.toggle('cell-actions', td.colSpan === 1 && (name === '' || name === 'Actions') && col > 0);
          col += td.colSpan || 1;
        });
      });
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('table.data-table'), function(table) {
    labelTable(table);
    Array.prototype.forEach.call(table.tBodies, function(tbody) {
      new MutationObserver(function() { labelTable(table); }).observe(tbody, { childList: true, subtree: true });
    });
  });

  // Phone menu: the button opens and closes it (its icon turns into an X), tapping outside or picking a page
  // closes it, and the page behind stays still while it is open.
  var sidebar = document.getElementById('sidebar'), menuBtn = document.getElementById('menuToggle'), backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar && menuBtn) {
    var menuIcon = menuBtn.querySelector('path');
    var setMenu = function(open) { sidebar.classList.toggle('open', open); };
    menuBtn.addEventListener('click', function() { setMenu(!sidebar.classList.contains('open')); });
    if (backdrop) backdrop.addEventListener('click', function() { setMenu(false); });
    sidebar.addEventListener('click', function(e) { if (e.target.closest('a[data-page]')) setMenu(false); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') setMenu(false); });
    new MutationObserver(function() {
      var open = sidebar.classList.contains('open');
      document.body.classList.toggle('menu-open', open);
      if (backdrop) backdrop.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (menuIcon) menuIcon.setAttribute('d', open ? 'M6 6l12 12M18 6 6 18' : 'M4 6h16M4 12h16M4 18h16');
    }).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  }

  // Ask Tello: floating button that opens the Tello helper in a panel.
  var btn = document.getElementById('telloFab'), panel = document.getElementById('telloPanel');
  if (!btn || !panel) return;
  var view = document.getElementById('dashboardView');
  function showFab() { var on = !view || view.style.display !== 'none'; btn.hidden = !on; if (!on) toggle(false); }
  function toggle(open) {
    if (open && !panel.querySelector('iframe')) {
      var f = document.createElement('iframe');
      f.src = '/tello?mode=dashboard&embed=1'; f.title = 'Ask Tello';
      panel.appendChild(f);
    }
    panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  }
  btn.addEventListener('click', function() { toggle(panel.hidden); });
  document.getElementById('telloClose').addEventListener('click', function() { toggle(false); });
  if (view) new MutationObserver(showFab).observe(view, { attributes: true, attributeFilter: ['style'] });
  showFab();
})();
