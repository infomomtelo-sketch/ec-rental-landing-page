// Transactions table and modal (add, edit, delete, Schedule E expense categories) and the Tax Reports page
// (one tax year: rents, expenses by Schedule E line, net, month by month, CSV export and print).
// Talks to /api/transactions and /api/reports (src/finance.ts). The dashboard's inline script calls ECFinance.
window.ECFinance = (function () {
  var CATEGORIES = [
    ['repairs', 'Repairs'], ['cleaning_maintenance', 'Cleaning and maintenance'], ['utilities', 'Utilities'], ['insurance', 'Insurance'],
    ['taxes', 'Property taxes'], ['mortgage_interest', 'Mortgage interest'], ['other_interest', 'Other interest'], ['management_fees', 'Management fees'],
    ['legal_professional', 'Legal and professional fees'], ['advertising', 'Advertising'], ['supplies', 'Supplies'], ['auto_travel', 'Auto and travel'],
    ['commissions', 'Commissions'], ['other', 'Other']
  ];
  var LABEL = {}; CATEGORIES.forEach(function (c) { LABEL[c[0]] = c[1]; });
  var TYPE_LABEL = { rent: 'Rent', expense: 'Expense', fee: 'Mgmt fee', distribution: 'Owner draw' };
  var TYPE_BADGE = { rent: 'badge-green', expense: 'badge-red', fee: 'badge-yellow', distribution: 'badge-gray' };
  // A first guess from the description; the landlord can always change it.
  var GUESS = [
    [/plumb|repair|fix|leak|hvac|furnace|heater|roof|electric|appliance|handyman|patch/i, 'repairs'],
    [/clean|landscap|gardener|lawn|pest|janitor|carpet|pool/i, 'cleaning_maintenance'],
    [/water|sewer|trash|garbage|gas bill|pg&e|pge|electric bill|utility|utilities|internet/i, 'utilities'],
    [/insur/i, 'insurance'], [/property tax|tax bill|county tax/i, 'taxes'], [/mortgage|loan interest/i, 'mortgage_interest'],
    [/attorney|lawyer|legal|cpa|accountant|tax prep|bookkeep/i, 'legal_professional'], [/zillow|ad\b|ads\b|advertis|listing fee|sign/i, 'advertising'],
    [/home depot|lowe|supplies|paint|filter|bulb|smoke detector/i, 'supplies'], [/mileage|gas for|travel|uber|parking/i, 'auto_travel'],
    [/commission|leasing fee|finder/i, 'commissions'], [/management/i, 'management_fees']
  ];
  var year = null, txns = [];

  function token() { try { return localStorage.getItem('ec_token'); } catch (e) { return null; } }
  function api(path, method, body) {
    return fetch('/api' + path, { method: method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.'); return d; }); });
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { var v = Math.round((n || 0) * 100) / 100; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function csvCell(v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""') + '"' : s; }
  function download(name, rows) {
    var blob = new Blob([rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---- Transaction modal ----
  function categoryShown() { $('txnCategoryGroup').style.display = $('txnType').value === 'expense' ? 'block' : 'none'; }
  function setup() {
    if (setup.done || !$('transactionForm')) return; setup.done = true;
    $('txnCategory').innerHTML = CATEGORIES.map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + '</option>'; }).join('');
    $('txnType').addEventListener('change', categoryShown);
    $('txnDesc').addEventListener('input', function () {
      if ($('txnCategory').dataset.touched) return;
      var d = $('txnDesc').value; for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(d)) { $('txnCategory').value = GUESS[i][1]; return; }
    });
    $('txnCategory').addEventListener('change', function () { $('txnCategory').dataset.touched = '1'; });
    $('txnDeleteBtn').addEventListener('click', function () {
      var id = $('txnId').value; if (!id || !confirm('Delete this transaction? It will also come off your tax report.')) return;
      api('/transactions/' + id, 'DELETE').then(function () { $('transactionModal').classList.remove('open'); if (window.ECDashRefresh) window.ECDashRefresh(); }).catch(function (err) { alert(err.message); });
    });
  }
  function resetForm() {
    setup();
    $('transactionForm').reset(); $('txnId').value = ''; delete $('txnCategory').dataset.touched;
    $('txnModalTitle').textContent = 'Add Transaction'; $('txnDeleteBtn').style.display = 'none';
    $('txnDate').value = new Date().toISOString().split('T')[0];
    categoryShown();
  }
  function edit(id) {
    var t = txns.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    resetForm();
    Promise.resolve(window.ECPopulateProps && window.ECPopulateProps('txnProperty')).then(function () { $('txnProperty').value = String(t.property_id); });
    $('txnId').value = t.id; $('txnModalTitle').textContent = 'Edit Transaction'; $('txnDeleteBtn').style.display = 'inline-block';
    $('txnType').value = t.type; $('txnAmount').value = t.amount; $('txnDate').value = t.date; $('txnDesc').value = t.description || '';
    if (t.category) { $('txnCategory').value = t.category; $('txnCategory').dataset.touched = '1'; }
    categoryShown();
    $('transactionModal').classList.add('open');
  }
  function submit() {
    var id = $('txnId').value;
    var data = { property_id: parseInt($('txnProperty').value), type: $('txnType').value, amount: parseFloat($('txnAmount').value), date: $('txnDate').value, description: $('txnDesc').value, category: $('txnType').value === 'expense' ? $('txnCategory').value : null };
    return api(id ? '/transactions/' + id : '/transactions', id ? 'PUT' : 'POST', data).catch(function (err) { alert(err.message); throw err; });
  }

  // ---- Transactions table ----
  function loadTransactions() {
    setup();
    var body = $('transactionsBody'); if (!body) return;
    api('/transactions').then(function (data) {
      txns = data;
      if (!data.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state">No transactions yet. Add rent you collect and every expense, and your tax report fills in by itself.</td></tr>'; return; }
      body.innerHTML = data.map(function (t) {
        var kind = '<span class="badge ' + (TYPE_BADGE[t.type] || 'badge-gray') + '">' + esc(TYPE_LABEL[t.type] || t.type) + '</span>' + (t.type === 'expense' ? '<br><small style="color:var(--gray)">' + esc(t.category ? LABEL[t.category] || t.category : 'Needs a category') + '</small>' : '');
        return '<tr><td>' + esc(t.date) + '</td><td>' + esc(t.property_address) + '</td><td>' + kind + '</td><td>' + esc(t.description) + '</td><td style="text-align:right">' + money(t.amount) + '</td><td><button class="btn btn-sm btn-secondary" type="button" data-edit-txn="' + t.id + '">Edit</button></td></tr>';
      }).join('');
    }).catch(function () {});
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-edit-txn]'); if (b) edit(parseInt(b.getAttribute('data-edit-txn'))); });
  // Opening Tax Reports always shows the latest numbers.
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-page="reports"]')) loadReports(); });

  // ---- Tax report ----
  function loadReports() {
    var box = $('taxReport'); if (!box) return;
    api('/reports' + (year ? '?year=' + year : '')).then(function (r) { year = r.year; render(box, r); }).catch(function (err) { box.innerHTML = '<div class="data-card" style="padding:1.5rem">' + esc(err.message) + '</div>'; });
  }
  function render(box, r) {
    var used = r.categories.filter(function (c) { return r.totals.expenses[c.id]; });
    var head = '<div class="data-card tax-controls" style="padding:1rem 1.25rem;display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center">'
      + '<label style="font-weight:600;display:flex;gap:0.5rem;align-items:center">Tax year <select id="taxYear" style="padding:0.45rem 0.6rem;border:1px solid #d1d5db;border-radius:8px;font:inherit">' + r.years.map(function (y) { return '<option' + (y === r.year ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select></label>'
      + '<span style="flex:1"></span><button class="btn btn-sm" type="button" id="taxCsvBtn">Export for my tax preparer (CSV)</button><button class="btn btn-sm btn-secondary" type="button" id="taxPrintBtn">Print / Save PDF</button></div>';
    var warn = r.totals.uncategorized ? '<div class="data-card" style="padding:0.9rem 1.25rem;background:#fff7e6;border:1px solid #f0c36d;color:#7a4b00">' + r.totals.uncategorized + (r.totals.uncategorized === 1 ? ' expense has' : ' expenses have') + ' no category yet, so ' + (r.totals.uncategorized === 1 ? 'it is' : 'they are') + ' counted under Other. Open Transactions and tap Edit to pick one.</div>' : '';
    var summary = '<div class="stat-cards">' + [['Rents received', r.totals.rent], ['Total expenses', r.totals.expenses_total], ['Net income', r.totals.net], ['Owner draws', r.totals.distributions]].map(function (s) { return '<div class="stat-card"><div class="label">' + s[0] + '</div><div class="value">' + money(s[1]) + '</div></div>'; }).join('') + '</div>';
    var cols = r.properties.length > 1 ? r.properties.concat([{ address: 'Total', total: true }]) : r.properties;
    function cell(p, key) { var src = p.total ? r.totals : p; return money(key === 'rent' ? src.rent : key === 'total' ? src.expenses_total : key === 'net' ? src.net : src.expenses[key] || 0); }
    var table = !r.properties.length ? '<div class="data-card" style="padding:1.5rem">Add a property first, then record rent and expenses in Transactions.</div>'
      : '<div class="data-card"><div class="data-card-header"><h2>Schedule E summary, ' + r.year + '</h2></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Line</th><th>Item</th>' + cols.map(function (p) { return '<th class="num">' + esc(p.address) + '</th>'; }).join('') + '</tr></thead><tbody>'
        + '<tr><td>3</td><td><strong>Rents received</strong></td>' + cols.map(function (p) { return '<td class="num">' + cell(p, 'rent') + '</td>'; }).join('') + '</tr>'
        + used.map(function (c) { return '<tr><td>' + c.line + '</td><td>' + esc(c.label) + '</td>' + cols.map(function (p) { return '<td class="num">' + cell(p, c.id) + '</td>'; }).join('') + '</tr>'; }).join('')
        + '<tr><td>20</td><td><strong>Total expenses</strong></td>' + cols.map(function (p) { return '<td class="num">' + cell(p, 'total') + '</td>'; }).join('') + '</tr>'
        + '<tr style="font-weight:700;background:#eef4ee;color:#0f3d22"><td></td><td>Income before depreciation</td>' + cols.map(function (p) { return '<td class="num">' + cell(p, 'net') + '</td>'; }).join('') + '</tr>'
        + '</tbody></table></div></div>';
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var monthly = '<div class="data-card"><div class="data-card-header"><h2>Month by month</h2></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Month</th><th class="num">Rent</th><th class="num">Expenses</th><th class="num">Net</th></tr></thead><tbody>'
      + r.months.map(function (m) { return '<tr><td>' + MONTHS[m.month - 1] + ' ' + r.year + '</td><td class="num">' + money(m.rent) + '</td><td class="num">' + money(m.expenses) + '</td><td class="num">' + money(m.net) + '</td></tr>'; }).join('')
      + '</tbody></table></div></div>';
    var note = '<p class="tax-note" style="color:var(--gray);font-size:0.8rem;margin:0 0 1.5rem">Built from the transactions you recorded for ' + r.year + '. Owner draws are not expenses and are left out. Depreciation (line 18) is not included; your tax preparer adds it. This is a summary for your records, not tax advice.</p>';
    box.innerHTML = head + warn + summary + table + monthly + note;
    // Phone layout turns rows into cards, which need each cell's column name (see dashboard-mobile.js).
    Array.prototype.forEach.call(box.querySelectorAll('table.data-table'), function (t) {
      var names = Array.prototype.map.call(t.tHead.rows[0].cells, function (th) { return th.textContent.trim(); });
      Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) { Array.prototype.forEach.call(tr.cells, function (td, i) { td.setAttribute('data-label', names[i] || ''); }); });
    });
    $('taxYear').addEventListener('change', function () { year = parseInt(this.value); loadReports(); });
    $('taxPrintBtn').addEventListener('click', function () { window.print(); });
    $('taxCsvBtn').addEventListener('click', function () { exportCsv(r, used); });
  }
  function exportCsv(r, used) {
    var rows = [['EC Rental tax summary', 'Tax year ' + r.year], [], ['Schedule E line', 'Item'].concat(r.properties.map(function (p) { return [p.address, p.city, p.state].filter(Boolean).join(', '); })).concat(['Total'])];
    function line(no, label, pick) { rows.push([no, label].concat(r.properties.map(pick)).concat([pick(r.totals)])); }
    line(3, 'Rents received', function (p) { return p.rent.toFixed(2); });
    used.forEach(function (c) { line(c.line, c.label, function (p) { return (p.expenses[c.id] || 0).toFixed(2); }); });
    line(20, 'Total expenses', function (p) { return p.expenses_total.toFixed(2); });
    line('', 'Income before depreciation', function (p) { return p.net.toFixed(2); });
    line('', 'Owner draws (not an expense)', function (p) { return p.distributions.toFixed(2); });
    rows.push([], ['Transactions'], ['Date', 'Property', 'Type', 'Schedule E category', 'Description', 'Amount']);
    r.transactions.forEach(function (t) { rows.push([t.date, t.property_address, TYPE_LABEL[t.type] || t.type, t.category ? LABEL[t.category] || t.category : (t.type === 'expense' ? 'Other' : ''), t.description, t.amount.toFixed(2)]); });
    rows.push([], ['Depreciation is not included. Summary for your records, not tax advice.']);
    download('ec-rental-tax-summary-' + r.year + '.csv', rows);
  }

  return { loadTransactions: loadTransactions, loadReports: loadReports, resetForm: resetForm, submit: submit };
})();
