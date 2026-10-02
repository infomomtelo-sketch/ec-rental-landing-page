// Shared helpers for the public rentals pages.
window.ECR = {
  esc: function(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; },
  money: function(n) { return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); },
  baths: function(l) { return l.full_baths + (l.half_baths ? '.5' : ''); },
  address: function(l) { return l.street + (l.unit ? ' #' + l.unit : '') + ', ' + l.city + ', ' + l.state + ' ' + l.zip; },
  available: function(l) { if (!l.date_available) return 'Available now'; var d = new Date(l.date_available + 'T00:00:00'); return d <= new Date() ? 'Available now' : 'Available ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); },
  pets: function(l) { var p = []; if (l.cats_allowed) p.push('Cats'); if (l.small_dogs_allowed) p.push('Small dogs'); if (l.large_dogs_allowed) p.push('Large dogs'); return p.length ? p.join(', ') + ' OK' : 'No pets'; }
};
