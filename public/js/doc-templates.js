// Document templates for landlords: field lists for the dashboard editor and the HTML each one
// prints as. Used by the dashboard (editing and preview), /document (printing) and the tenant portal.
// The text follows California rules; it is a starting point, not legal advice.
(function() {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function amount(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
  function money(v) { return '$' + amount(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function longDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return ''; return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ordinal(n) { n = parseInt(n, 10) || 1; var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function lines(s) { return String(s || '').split(/\n+/).map(function(x) { return x.trim(); }).filter(Boolean); }
  function nextMonthName() { var d = new Date(); d.setMonth(d.getMonth() + 1, 1); return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }

  // Filled value, or a blank line to write on when printed.
  function v(d, k, width) { var x = d[k]; return x ? '<strong>' + esc(x) + '</strong>' : '<span class="blank" style="min-width:' + (width || 10) + 'em"></span>'; }
  // Same, for a value that ends a sentence in the template, so "5:00 p.m." doesn't print as "p.m..".
  function vs(d, k, width) { var x = String(d[k] || '').replace(/\.\s*$/, ''); return x ? '<strong>' + esc(x) + '</strong>' : v(d, k, width); }
  function vd(d, k) { return d[k] ? '<strong>' + esc(longDate(d[k])) + '</strong>' : '<span class="blank" style="min-width:9em"></span>'; }
  function vm(d, k) { return d[k] ? '<strong>' + money(d[k]) + '</strong>' : '$<span class="blank" style="min-width:6em"></span>'; }
  function names(d, k) { var n = lines(d[k]); return n.length ? '<strong>' + n.map(esc).join(', ') + '</strong>' : '<span class="blank" style="min-width:16em"></span>'; }
  function itemsTable(rows, totalLabel) {
    rows = (rows || []).filter(function(r) { return r && (r.desc || r.amount); });
    var total = rows.reduce(function(t, r) { return t + amount(r.amount); }, 0);
    return '<table class="items"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function(r) { return '<tr><td>' + esc(r.desc) + '</td><td class="num">' + money(r.amount) + '</td></tr>'; }).join('') : '<tr><td>&nbsp;</td><td></td></tr><tr><td>&nbsp;</td><td></td></tr>') +
      '</tbody><tfoot><tr><th>' + esc(totalLabel || 'Total') + '</th><th class="num">' + (rows.length ? money(total) : '') + '</th></tr></tfoot></table>';
  }
  function sign(label, name) { return '<div class="sig"><div class="sig-line"></div><div class="sig-cap">' + esc(label) + (name ? ': ' + esc(name) : '') + '</div><div class="sig-line short"></div><div class="sig-cap">Date</div></div>'; }
  function party(d) { return d.landlord_company || d.landlord_name; }

  var MEGANS_LAW = 'Notice: Pursuant to Section 290.46 of the Penal Code, information about specified registered sex offenders is made available to the public via an Internet Web site maintained by the Department of Justice at www.meganslaw.ca.gov. Depending on an offender\'s criminal history, this information will include either the address at which the offender resides or the community of residence and ZIP Code in which he or she resides.';
  var TPA_COVERED = 'California law limits the amount your rent can be increased. See Section 1947.12 of the Civil Code for more information. California law also provides that after all of the tenants have continuously and lawfully occupied the property for 12 months or more or at least one of the tenants has continuously and lawfully occupied the property for 24 months or more, a landlord must provide a statement of cause in any notice to terminate a tenancy. See Section 1946.2 of the Civil Code for more information.';
  var TPA_EXEMPT = 'This property is not subject to the rent limits imposed by Section 1947.12 of the Civil Code and is not subject to the just cause requirements of Section 1946.2 of the Civil Code. This property meets the requirements of Sections 1947.12 (d)(5) and 1946.2 (e)(8) of the Civil Code and the owner is not any of the following: (1) a real estate investment trust, as defined by Section 856 of the Internal Revenue Code; (2) a corporation; or (3) a limited liability company in which at least one member is a corporation.';

  var LANDLORD_FIELDS = [
    { k: 'landlord_name', label: 'Landlord or owner name', prefill: 'landlord_name' },
    { k: 'landlord_company', label: 'Company (optional)', prefill: 'landlord_company' },
    { k: 'landlord_address', label: 'Landlord mailing address', remember: true },
    { k: 'landlord_phone', label: 'Landlord phone', remember: true },
    { k: 'landlord_email', label: 'Landlord email', prefill: 'landlord_email' }
  ];

  var TYPES = {
    lease: {
      label: 'Rental agreement',
      blurb: 'California residential lease or month-to-month agreement with the required disclosures.',
      fields: LANDLORD_FIELDS.concat([
        { k: 'tenant_names', label: 'Tenants (one per line)', type: 'textarea', prefill: 'tenant_name', full: true },
        { k: 'occupants', label: 'Other occupants, such as children (optional)', full: true },
        { k: 'premises', label: 'Rental address (with unit, city, ZIP)', prefill: 'premises', full: true },
        { k: 'included', label: 'Included appliances or furnishings', def: 'Stove, refrigerator', full: true },
        { k: 'term_type', label: 'Length of agreement', type: 'select', opts: [['fixed', 'Fixed term (lease)'], ['monthly', 'Month to month']], def: 'fixed' },
        { k: 'start_date', label: 'Start date', type: 'date', prefill: 'lease_start' },
        { k: 'end_date', label: 'End date (fixed term only)', type: 'date', prefill: 'lease_end' },
        { k: 'rent', label: 'Monthly rent', type: 'money', prefill: 'rent' },
        { k: 'due_day', label: 'Rent due on day', type: 'number', def: '1' },
        { k: 'pay_to', label: 'Pay rent to', prefill: 'landlord_display' },
        { k: 'pay_address', label: 'Where to deliver rent', remember: true },
        { k: 'pay_methods', label: 'Accepted payment methods', def: 'Check, money order or electronic transfer', full: true },
        { k: 'late_fee', label: 'Late fee (optional)', type: 'money', hint: 'Courts only enforce a late fee that is a reasonable estimate of your actual costs.' },
        { k: 'late_after', label: 'Late after how many days', type: 'number', def: '5' },
        { k: 'deposit', label: 'Security deposit', type: 'money', prefill: 'deposit', hint: 'Since July 2024 most California landlords may collect at most one month\'s rent (Civil Code 1950.5). Small landlords with 2 or fewer properties and 4 or fewer units may collect two.' },
        { k: 'utilities_tenant', label: 'Utilities the tenant pays', def: 'Electricity, gas, internet and cable', full: true },
        { k: 'utilities_landlord', label: 'Utilities the landlord pays', def: 'Water, sewer and trash', full: true },
        { k: 'pets', label: 'Pets', type: 'select', opts: [['none', 'No pets'], ['allowed', 'Pets allowed as listed below']], def: 'none' },
        { k: 'pets_detail', label: 'Allowed pets (if any)', full: true, hint: 'Service and support animals are not pets and can\'t be refused or charged a pet fee.' },
        { k: 'smoking', label: 'Smoking', type: 'select', opts: [['none', 'Not allowed anywhere on the property'], ['outside', 'Only outdoors in designated areas'], ['allowed', 'Allowed']], def: 'none' },
        { k: 'parking', label: 'Parking (optional)', full: true },
        { k: 'built_pre1978', label: 'Home was built before 1978 (adds the lead paint disclosure)', type: 'check', full: true },
        { k: 'tpa', label: 'Tenant Protection Act (AB 1482) notice', type: 'select', full: true, opts: [['covered', 'Covered: rent cap and just cause apply'], ['exempt', 'Exempt: single-family home or condo owned by individuals'], ['omit', 'Leave out']], def: 'covered', hint: 'Only use the exemption if the owner is not a corporation, REIT or LLC with a corporate member.' },
        { k: 'flood', label: 'Flood hazard disclosure', type: 'select', full: true, opts: [['none', 'Not in a known flood hazard area'], ['special', 'In a special flood hazard area (FEMA)'], ['potential', 'In an area of potential flooding']], def: 'none' },
        { k: 'extra_terms', label: 'Additional terms (optional)', type: 'textarea', full: true },
        { k: 'sign_date', label: 'Date prepared', type: 'date', def: today }
      ]),
      title: function(d) { return 'Rental agreement' + (d.premises ? ' · ' + d.premises : ''); },
      render: function(d) {
        var fixed = d.term_type !== 'monthly', n = 0, tenantNames = lines(d.tenant_names);
        function sec(title, body) { n++; return '<h3>' + n + '. ' + esc(title) + '</h3>' + body; }
        var flood = { special: 'The Premises are located in a special flood hazard area as designated by the Federal Emergency Management Agency (FEMA).', potential: 'The Premises are located in an area of potential flooding.', none: 'Landlord has no actual knowledge that the Premises are located in a special flood hazard area or an area of potential flooding.' }[d.flood || 'none'];
        return '<h1>Residential Rental Agreement</h1><p class="center">' + (fixed ? 'Fixed-term lease' : 'Month-to-month agreement') + '</p>' +
          sec('Parties', '<p>This agreement is between ' + v(d, 'landlord_name', 14) + (d.landlord_company ? ' of <strong>' + esc(d.landlord_company) + '</strong>' : '') + ' ("Landlord") and ' + names(d, 'tenant_names') + ' ("Tenant"). Each Tenant is responsible for the full amount owed under this agreement.</p>') +
          sec('Premises', '<p>Landlord rents to Tenant the home at ' + vs(d, 'premises', 22) + ' ("Premises"), including: ' + vs(d, 'included', 14) + '.' + (d.occupants ? ' Besides Tenant, only these people may live in the Premises: <strong>' + esc(d.occupants) + '</strong>.' : ' Only the people named as Tenant may live in the Premises.') + ' Guests may not stay longer than 14 days in a six-month period without Landlord\'s written consent.</p>') +
          sec('Term', fixed ? '<p>The lease starts on ' + vd(d, 'start_date') + ' and ends on ' + vd(d, 'end_date') + '. If Tenant stays after that with Landlord\'s consent, the tenancy continues month to month under the same terms until ended by written notice as California law requires.</p>' : '<p>The tenancy starts on ' + vd(d, 'start_date') + ' and continues month to month. Either party may end it with written notice as required by California law (Civil Code Sections 1946, 1946.1 and, where it applies, 1946.2).</p>') +
          sec('Rent', '<p>Tenant will pay ' + vm(d, 'rent') + ' per month, in advance, on the ' + esc(ordinal(d.due_day)) + ' day of each month. Rent for any partial first month is prorated. Rent is payable to ' + v(d, 'pay_to', 12) + (d.landlord_phone ? ' (phone <strong>' + esc(d.landlord_phone) + '</strong>)' : '') + ' at ' + v(d, 'pay_address', 18) + ' by: ' + vs(d, 'pay_methods', 14) + '. Rent delivered in person will be accepted on weekdays during normal business hours. Cash is not accepted unless Landlord agrees in writing.</p>') +
          (amount(d.late_fee) ? sec('Late charge', '<p>If rent is not received within ' + esc(d.late_after || '5') + ' days after it is due, Tenant will pay a late charge of ' + vm(d, 'late_fee') + '. The parties agree this is a reasonable estimate of the costs Landlord will have from late payment, which are hard to determine exactly. A $25 charge applies to any payment returned unpaid by the bank ($35 for each later one).</p>') : '') +
          sec('Security deposit', '<p>Tenant will pay a security deposit of ' + vm(d, 'deposit') + ' before moving in. It is not last month\'s rent. Landlord may use it only as allowed by Civil Code Section 1950.5: for unpaid rent, cleaning to return the home to its move-in level of cleanliness, and repairing damage beyond normal wear and tear. Tenant may ask for an inspection before moving out. Within 21 days after Tenant moves out, Landlord will return the deposit with an itemized statement of any deductions, with receipts where the law requires them.</p>') +
          sec('Utilities', '<p>Tenant pays for: ' + vs(d, 'utilities_tenant', 16) + '. Landlord pays for: ' + vs(d, 'utilities_landlord', 16) + '.</p>') +
          sec('Pets', d.pets === 'allowed' ? '<p>Tenant may keep only these pets: ' + vs(d, 'pets_detail', 16) + '. Tenant is responsible for any damage or nuisance they cause. Service and assistance animals are not pets under this agreement.</p>' : '<p>No pets are allowed without Landlord\'s written consent. Service and assistance animals are not pets under this agreement.</p>') +
          sec('Smoking', '<p>' + ({ none: 'Smoking of any substance, including vaping, is not allowed anywhere on the property.', outside: 'Smoking of any substance, including vaping, is allowed only outdoors in areas Landlord designates, and never inside the home.', allowed: 'Smoking is allowed. Tenant will pay for cleaning and repairs needed because of smoke beyond normal wear and tear.' }[d.smoking || 'none']) + '</p>') +
          (d.parking ? sec('Parking', '<p>' + esc(d.parking.replace(/\.\s*$/, '')) + '. Only operable, registered vehicles may be parked.</p>') : '') +
          sec('Condition and repairs', '<p>Tenant has inspected the Premises and agrees they are clean and in good condition, except as noted in a move-in checklist signed by both parties. Landlord will keep the Premises fit to live in as required by Civil Code Section 1941.1. Tenant will keep the Premises clean, use fixtures and appliances properly, report needed repairs and any water leaks or visible mold to Landlord in writing promptly, and pay for damage caused by Tenant or Tenant\'s guests or pets beyond normal wear and tear.</p>') +
          sec('Alterations', '<p>Tenant will not paint, remodel, install fixtures or change or add locks without Landlord\'s written consent, except as the law allows.</p>') +
          sec('Landlord entry', '<p>Landlord may enter the Premises as allowed by Civil Code Section 1954: to make repairs, inspect, or show the home, during normal business hours after giving at least 24 hours\' written notice (6 days if mailed). Landlord may enter without notice in an emergency.</p>') +
          sec('Subletting', '<p>Tenant may not sublet the Premises or assign this agreement without Landlord\'s prior written consent.</p>') +
          sec('Use and conduct', '<p>Tenant will use the Premises only as a residence, will follow all laws and any written rules Landlord provides, and will not disturb neighbors or commit waste or a nuisance.</p>') +
          sec('Insurance', '<p>Landlord\'s insurance does not cover the loss of Tenant\'s personal possessions. Landlord recommends that Tenant buy renter\'s insurance and consider flood insurance.</p>') +
          sec('Notices', '<p>Notices to Landlord, including legal process, may be delivered to ' + v(d, 'landlord_name', 12) + ' at ' + vs(d, 'landlord_address', 18) + (d.landlord_phone ? ', phone <strong>' + esc(d.landlord_phone) + '</strong>' : '') + '. Notices to Tenant may be delivered to the Premises.</p>') +
          sec('Moving out', '<p>When the tenancy ends, Tenant will return all keys and leave the Premises as clean as when Tenant moved in, less normal wear and tear.</p>') +
          sec('Disclosures', '<p><strong>Database disclosure.</strong> ' + MEGANS_LAW + '</p>' +
            (d.built_pre1978 ? '<p><strong>Lead-based paint.</strong> The Premises were built before 1978 and may contain lead-based paint. Landlord has given Tenant the federal Disclosure of Information on Lead-Based Paint form, signed by both parties and attached, and the EPA pamphlet "Protect Your Family From Lead in Your Home."</p>' : '') +
            '<p><strong>Bed bugs.</strong> Bed bugs are small, wingless, reddish-brown insects about the size of an apple seed that feed on blood, usually at night. They hide in mattress seams, furniture, cracks and clutter, and can live months without feeding. Their bites can look like other insect bites. Tenant should report any suspected bed bugs to Landlord in writing right away and should not try to treat them alone. Landlord will arrange inspection and treatment by a licensed pest control operator as Civil Code Section 1954.603 requires.</p>' +
            '<p><strong>Flood hazard.</strong> ' + flood + ' Information about hazards, including flood hazards, that may affect the Premises is available at myhazards.caloes.ca.gov. Landlord\'s insurance does not cover the loss of Tenant\'s personal possessions, and Landlord recommends that Tenant consider buying renter\'s insurance and flood insurance.</p>' +
            (d.tpa === 'covered' ? '<p><strong>Tenant Protection Act.</strong> ' + TPA_COVERED + '</p>' : d.tpa === 'exempt' ? '<p><strong>Tenant Protection Act.</strong> ' + TPA_EXEMPT + '</p>' : '')) +
          (d.extra_terms ? sec('Additional terms', '<p>' + esc(d.extra_terms).replace(/\n/g, '<br>') + '</p>') : '') +
          sec('Entire agreement', '<p>This document, with any signed attachments, is the entire agreement between Landlord and Tenant. If any part of it is found invalid, the rest still applies. Changes must be in writing and signed by both parties. Tenant acknowledges receiving a copy of this agreement.</p>') +
          '<div class="sigs">' + (tenantNames.length ? tenantNames : ['', '']).map(function(t) { return sign('Tenant', t); }).join('') + sign('Landlord', party(d)) + '</div>';
      }
    },

    notice_pay_or_quit: {
      label: '3-day notice to pay rent or quit',
      blurb: 'California notice for unpaid rent, with a proof of service section.',
      warn: 'Only list rent. California courts throw out 3-day notices that include late fees, utilities, deposits or more than 12 months of rent, or that overstate the amount owed. Fill in the payment details exactly; mistakes restart the clock.',
      fields: [
        { k: 'tenant_names', label: 'Tenants (one per line)', type: 'textarea', prefill: 'tenant_name', full: true },
        { k: 'premises', label: 'Rental address (with unit)', prefill: 'premises_street', full: true },
        { k: 'city', label: 'City', prefill: 'city' },
        { k: 'county', label: 'County', def: 'Fresno' },
        { k: 'zip', label: 'ZIP', prefill: 'zip' },
        { k: 'periods', label: 'Unpaid rent by period', type: 'items', full: true, prefill: 'rent_period' },
        { k: 'pay_to', label: 'Pay to (name)', prefill: 'landlord_display' },
        { k: 'pay_phone', label: 'Phone of person receiving rent', remember: 'landlord_phone' },
        { k: 'pay_address', label: 'Address where rent can be paid', remember: true, full: true },
        { k: 'pay_hours', label: 'Days and hours available to receive rent in person', def: 'Monday through Friday, 9:00 a.m. to 5:00 p.m.', full: true },
        { k: 'bank_name', label: 'Bank name (optional, for deposits)' },
        { k: 'bank_account', label: 'Bank account number (optional)' },
        { k: 'bank_address', label: 'Bank branch address (must be within 5 miles of the rental)', full: true },
        { k: 'eft', label: 'Tenant has paid by electronic transfer before (allow it here)', type: 'check', full: true },
        { k: 'notice_date', label: 'Date of notice', type: 'date', def: today },
        { k: 'signer', label: 'Signed by (landlord or agent)', prefill: 'landlord_name' }
      ],
      title: function(d) { return '3-day notice' + (d.premises ? ' · ' + d.premises : ''); },
      render: function(d) {
        return '<h1>Three-Day Notice to Pay Rent or Quit</h1>' +
          '<p>To: ' + names(d, 'tenant_names') + ', and all other tenants and subtenants in possession of the premises at:</p>' +
          '<p class="center">' + v(d, 'premises', 20) + ', ' + v(d, 'city', 8) + ', County of ' + v(d, 'county', 8) + ', California ' + v(d, 'zip', 5) + '</p>' +
          '<p>NOTICE IS GIVEN that the rent for the premises is past due. The amount of rent now due is:</p>' + itemsTable(d.periods, 'Total rent due') +
          '<p>WITHIN THREE (3) DAYS after service of this notice, not counting Saturdays, Sundays and other judicial holidays, you are required to pay the full amount of rent due, as stated above, or to deliver up possession of the premises. If you fail to do so, the landlord will begin legal proceedings to recover possession of the premises, the rent owed, and damages, and declares a forfeiture of your rental agreement.</p>' +
          '<p>Payment must be made to ' + v(d, 'pay_to', 12) + ', telephone ' + v(d, 'pay_phone', 8) + ', at ' + vs(d, 'pay_address', 18) + '. Payment in person will be accepted on these days and hours: ' + vs(d, 'pay_hours', 16) + '.</p>' +
          (d.bank_name || d.bank_account ? '<p>Payment may also be made by deposit to account number ' + v(d, 'bank_account', 8) + ' at ' + v(d, 'bank_name', 10) + ', ' + vs(d, 'bank_address', 14) + '.</p>' : '') +
          (d.eft ? '<p>Payment may also be made by electronic funds transfer, as previously established between you and the landlord.</p>' : '') +
          '<div class="sigs">' + sign('Landlord or agent', d.signer) + '</div><p>Date of notice: ' + vd(d, 'notice_date') + '</p>' +
          '<div class="pagebreak"></div><h2>Proof of Service</h2><p>I, the undersigned, am at least 18 years of age. I served this notice, of which this is a true copy, on the tenant(s) named above in the following way:</p>' +
          '<p class="box">&#9744; <strong>Personal delivery:</strong> I handed a copy to the tenant on <span class="blank" style="min-width:8em"></span> at <span class="blank" style="min-width:5em"></span>.</p>' +
          '<p class="box">&#9744; <strong>Substituted service:</strong> After trying to serve the tenant personally, I left a copy with <span class="blank" style="min-width:10em"></span>, a person of suitable age and discretion, at the tenant\'s &#9744; residence &#9744; business on <span class="blank" style="min-width:8em"></span>, and mailed a copy to the tenant at the tenant\'s residence on <span class="blank" style="min-width:8em"></span>.</p>' +
          '<p class="box">&#9744; <strong>Posting and mailing:</strong> After trying personal and substituted service, I posted a copy in a conspicuous place at the premises on <span class="blank" style="min-width:8em"></span> and mailed a copy to the tenant at the premises on <span class="blank" style="min-width:8em"></span>.</p>' +
          '<p>I declare under penalty of perjury under the laws of the State of California that the foregoing is true and correct.</p>' +
          '<div class="sigs">' + sign('Signature of person who served the notice', '') + '</div><p>Printed name: <span class="blank" style="min-width:16em"></span></p>';
      }
    },

    invoice: {
      label: 'Rent invoice',
      blurb: 'Bill a tenant for rent, utilities or other charges.',
      fields: LANDLORD_FIELDS.concat([
        { k: 'tenant_names', label: 'Bill to (tenants, one per line)', type: 'textarea', prefill: 'tenant_name', full: true },
        { k: 'tenant_email', label: 'Tenant email', prefill: 'tenant_email' },
        { k: 'premises', label: 'Rental address', prefill: 'premises', full: true },
        { k: 'invoice_no', label: 'Invoice number', def: function() { return 'INV-' + today().replace(/-/g, ''); } },
        { k: 'invoice_date', label: 'Invoice date', type: 'date', def: today },
        { k: 'due_date', label: 'Due date', type: 'date' },
        { k: 'items', label: 'Charges', type: 'items', full: true, prefill: 'rent_next' },
        { k: 'pay_instructions', label: 'How to pay', type: 'textarea', def: 'Pay by check, money order or electronic transfer. Write the invoice number on your payment.', full: true },
        { k: 'notes', label: 'Notes (optional)', type: 'textarea', full: true }
      ]),
      title: function(d) { return 'Invoice ' + (d.invoice_no || '') + (d.premises ? ' · ' + d.premises : ''); },
      render: function(d) {
        return '<div class="doc-head"><div><h1 class="left">Invoice</h1><p>' + v(d, 'invoice_no', 8) + '</p></div><div class="right"><strong>' + esc(party(d) || '') + '</strong><br>' + esc(d.landlord_address || '') + '<br>' + esc(d.landlord_phone || '') + (d.landlord_email ? '<br>' + esc(d.landlord_email) : '') + '</div></div>' +
          '<div class="doc-meta"><div><span class="lbl">Bill to</span>' + names(d, 'tenant_names') + (d.tenant_email ? '<br>' + esc(d.tenant_email) : '') + '</div><div><span class="lbl">Property</span>' + v(d, 'premises', 14) + '</div><div><span class="lbl">Invoice date</span>' + vd(d, 'invoice_date') + '</div><div><span class="lbl">Due date</span>' + vd(d, 'due_date') + '</div></div>' +
          itemsTable(d.items, 'Amount due') +
          (d.pay_instructions ? '<h3>How to pay</h3><p>' + esc(d.pay_instructions).replace(/\n/g, '<br>') + '</p>' : '') +
          (d.notes ? '<h3>Notes</h3><p>' + esc(d.notes).replace(/\n/g, '<br>') + '</p>' : '');
      }
    },

    receipt: {
      label: 'Rent receipt',
      blurb: 'Written receipt for a rent payment. Required in California for cash, and on request.',
      fields: LANDLORD_FIELDS.concat([
        { k: 'receipt_no', label: 'Receipt number', def: function() { return 'RCT-' + today().replace(/-/g, ''); } },
        { k: 'received_date', label: 'Date received', type: 'date', def: today },
        { k: 'received_from', label: 'Received from', prefill: 'tenant_name', full: true },
        { k: 'amount', label: 'Amount received', type: 'money', prefill: 'rent' },
        { k: 'method', label: 'Paid by', type: 'select', opts: [['Cash', 'Cash'], ['Check', 'Check'], ['Money order', 'Money order'], ['Cashier\'s check', 'Cashier\'s check'], ['Card', 'Card'], ['Bank transfer', 'Bank transfer'], ['Other', 'Other']], def: 'Check' },
        { k: 'method_ref', label: 'Check or reference number (optional)' },
        { k: 'for_desc', label: 'Payment for', def: function() { return 'Rent for ' + new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }, full: true },
        { k: 'premises', label: 'Rental address', prefill: 'premises', full: true },
        { k: 'balance', label: 'Balance still owed (optional)', type: 'money' },
        { k: 'received_by', label: 'Received by', prefill: 'landlord_name' }
      ]),
      title: function(d) { return 'Receipt ' + (d.receipt_no || '') + (d.received_from ? ' · ' + d.received_from : ''); },
      render: function(d) {
        return '<div class="doc-head"><div><h1 class="left">Rent Receipt</h1><p>' + v(d, 'receipt_no', 8) + '</p></div><div class="right"><strong>' + esc(party(d) || '') + '</strong><br>' + esc(d.landlord_address || '') + '<br>' + esc(d.landlord_phone || '') + '</div></div>' +
          '<p class="big">Received from ' + v(d, 'received_from', 14) + ' the sum of ' + vm(d, 'amount') + ' on ' + vd(d, 'received_date') + '.</p>' +
          '<table class="kv"><tr><th>Payment for</th><td>' + v(d, 'for_desc', 14) + '</td></tr><tr><th>Property</th><td>' + v(d, 'premises', 16) + '</td></tr><tr><th>Paid by</th><td>' + v(d, 'method', 6) + (d.method_ref ? ' #' + esc(d.method_ref) : '') + '</td></tr>' + (d.balance !== undefined && d.balance !== '' ? '<tr><th>Balance still owed</th><td>' + vm(d, 'balance') + '</td></tr>' : '') + '</table>' +
          '<div class="sigs">' + sign('Received by', d.received_by) + '</div>';
      }
    },

    application: {
      label: 'Rental application',
      blurb: 'Printable application for walk-ins and showings, with a link to apply online.',
      fields: LANDLORD_FIELDS.concat([
        { k: 'premises', label: 'Rental address', prefill: 'premises', full: true },
        { k: 'rent', label: 'Monthly rent', type: 'money', prefill: 'rent' },
        { k: 'deposit', label: 'Security deposit', type: 'money', prefill: 'deposit' },
        { k: 'app_fee', label: 'Application fee per adult (optional)', type: 'money', prefill: 'app_fee', hint: 'California caps screening fees and requires a receipt (Civil Code 1950.6). Don\'t charge one if no unit is available.' },
        { k: 'available', label: 'Available date', type: 'date', prefill: 'available' },
        { k: 'apply_url', label: 'Online application link', prefill: 'apply_url', full: true }
      ]),
      title: function(d) { return 'Rental application' + (d.premises ? ' · ' + d.premises : ''); },
      render: function(d) {
        function line(label, w) { return '<div class="fill"><span class="lbl">' + esc(label) + '</span><span class="blank" style="min-width:' + (w || 12) + 'em"></span></div>'; }
        return '<h1>Rental Application</h1><p class="center">' + esc(party(d) || '') + (d.landlord_phone ? ' · ' + esc(d.landlord_phone) : '') + (d.landlord_email ? ' · ' + esc(d.landlord_email) : '') + '</p>' +
          '<table class="kv"><tr><th>Property</th><td>' + v(d, 'premises', 16) + '</td></tr><tr><th>Rent</th><td>' + vm(d, 'rent') + ' per month</td></tr><tr><th>Security deposit</th><td>' + vm(d, 'deposit') + '</td></tr>' + (d.app_fee ? '<tr><th>Application fee</th><td>' + money(d.app_fee) + ' per adult applicant</td></tr>' : '') + (d.available ? '<tr><th>Available</th><td>' + esc(longDate(d.available)) + '</td></tr>' : '') + '</table>' +
          (d.apply_url ? '<p>Prefer to apply online? Go to <strong>' + esc(d.apply_url) + '</strong></p>' : '') +
          '<h3>Applicant</h3><div class="fills">' + line('Full name', 18) + line('Phone') + line('Email', 16) + line('Desired move-in date') + '</div>' +
          '<h3>Current residence</h3><div class="fills">' + line('Address', 24) + line('How long') + line('Monthly rent') + line('Landlord name') + line('Landlord phone') + line('Reason for moving', 20) + '</div>' +
          '<h3>Previous residence</h3><div class="fills">' + line('Address', 24) + line('How long') + line('Landlord name and phone', 18) + '</div>' +
          '<h3>Income</h3><div class="fills">' + line('Employer or income source', 18) + line('Position') + line('How long') + line('Monthly income before taxes') + line('Supervisor name and phone', 18) + '</div>' +
          '<h3>Household</h3><div class="fills">' + line('Other adults who will live here', 22) + line('Number of minors') + line('Pets (type, breed, weight)', 18) + line('Vehicles (make, model, plate)', 18) + '</div>' +
          '<h3>Emergency contact</h3><div class="fills">' + line('Name') + line('Relationship') + line('Phone') + '</div>' +
          '<h3>Authorization</h3><p>I certify that this information is true and complete. I authorize the landlord to verify it and to obtain a consumer credit report and rental history, including eviction records, through a tenant screening service. Each adult who will live in the home must complete an application. Applicants may request a copy of any consumer report the landlord obtains.</p>' +
          '<div class="sigs">' + sign('Applicant signature', '') + '</div>' +
          '<p class="small"><strong>Equal Housing Opportunity.</strong> We do not discriminate on the basis of race, color, religion, sex, gender identity, sexual orientation, national origin, familial status, disability, source of income (including housing assistance), or any other class protected by federal, California or local law. Reasonable accommodations are available on request.</p>';
      }
    },

    notice_of_entry: {
      label: 'Notice of entry',
      blurb: '24-hour written notice before entering for repairs, inspections or showings.',
      fields: [
        { k: 'tenant_names', label: 'Tenants (one per line)', type: 'textarea', prefill: 'tenant_name', full: true },
        { k: 'premises', label: 'Rental address', prefill: 'premises', full: true },
        { k: 'entry_date', label: 'Date of entry', type: 'date' },
        { k: 'time_from', label: 'Between', def: '9:00 a.m.' },
        { k: 'time_to', label: 'And', def: '12:00 p.m.' },
        { k: 'purpose', label: 'Purpose', type: 'select', opts: [['repairs', 'Make necessary or agreed repairs'], ['inspect', 'Inspect the premises'], ['show', 'Show the home to prospective tenants, buyers, lenders or contractors'], ['other', 'Other (explain below)']], def: 'repairs', full: true },
        { k: 'purpose_detail', label: 'Details (optional)', full: true },
        { k: 'notice_date', label: 'Date of notice', type: 'date', def: today },
        { k: 'signer', label: 'Signed by', prefill: 'landlord_name' },
        { k: 'landlord_phone', label: 'Phone for questions', remember: true }
      ],
      title: function(d) { return 'Notice of entry' + (d.premises ? ' · ' + d.premises : ''); },
      render: function(d) {
        var purpose = { repairs: 'Make necessary or agreed repairs', inspect: 'Inspect the premises', show: 'Show the home to prospective tenants, buyers, lenders or contractors', other: 'Other' }[d.purpose || 'repairs'];
        return '<h1>Notice of Intent to Enter Dwelling Unit</h1>' +
          '<p>To: ' + names(d, 'tenant_names') + ', and all other occupants of:</p><p class="center">' + v(d, 'premises', 22) + '</p>' +
          '<p>Under California Civil Code Section 1954, this is written notice that the landlord, or the landlord\'s agent or contractor, will enter the home on ' + vd(d, 'entry_date') + ' between ' + v(d, 'time_from', 5) + ' and ' + v(d, 'time_to', 5) + ' for this purpose:</p>' +
          '<p class="box"><strong>' + esc(purpose) + '</strong>' + (d.purpose_detail ? ': ' + esc(d.purpose_detail) : '') + '</p>' +
          '<p>This notice is given at least 24 hours before the entry (at least 6 days if mailed). You do not need to be home. If you have questions or would like a different time, please call ' + vs(d, 'landlord_phone', 8) + '.</p>' +
          '<div class="sigs">' + sign('Landlord or agent', d.signer) + '</div><p>Date of notice: ' + vd(d, 'notice_date') + '</p>';
      }
    }
  };

  // Values to prefill from the chosen property, tenancy, listing and the signed-in landlord.
  function context(opts) {
    var p = opts.property || {}, u = opts.user || {}, l = opts.listing || {}, origin = opts.origin || '';
    var street = p.address || '', cityLine = [p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    var rent = p.rent_amount || l.rent || '';
    return {
      landlord_name: u.name || '', landlord_company: u.company || '', landlord_email: u.email || '', landlord_display: u.company || u.name || '',
      tenant_name: p.tenant_name || '', tenant_email: p.tenant_email || '',
      premises: [street, cityLine].filter(Boolean).join(', '), premises_street: street, city: p.city || '', zip: p.zip || '',
      rent: rent ? String(rent) : '', lease_start: p.lease_start || '', lease_end: p.lease_end || '',
      deposit: l.deposit ? String(l.deposit) : '', app_fee: l.application_fee ? String(l.application_fee) : '', available: l.date_available || '',
      apply_url: l.id ? origin + '/apply?listing=' + l.id : (origin ? origin + '/listings' : ''),
      rent_period: rent ? [{ desc: 'Rent for ' + new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), amount: String(rent) }] : [{ desc: '', amount: '' }],
      rent_next: rent ? [{ desc: 'Rent for ' + nextMonthName(), amount: String(rent) }] : [{ desc: '', amount: '' }]
    };
  }

  // Starting data for a new document: defaults, then prefill, then remembered landlord details.
  function initial(type, ctx, remembered) {
    var t = TYPES[type], d = {};
    t.fields.forEach(function(f) {
      var val = typeof f.def === 'function' ? f.def() : f.def;
      if (f.prefill && ctx[f.prefill] !== undefined && ctx[f.prefill] !== '') val = ctx[f.prefill];
      if (f.remember && remembered) { var key = f.remember === true ? f.k : f.remember; if (remembered[key]) val = remembered[key]; }
      if (f.type === 'items') val = val || [{ desc: '', amount: '' }];
      if (f.type === 'check') val = !!val;
      d[f.k] = val === undefined ? '' : val;
    });
    return d;
  }

  function render(type, data) { var t = TYPES[type]; return t ? '<article class="ecdoc">' + t.render(data || {}) + '</article>' : '<p>Unknown document type.</p>'; }

  window.ECDocs = { types: TYPES, order: ['lease', 'notice_pay_or_quit', 'invoice', 'receipt', 'application', 'notice_of_entry'], context: context, initial: initial, render: render, esc: esc, money: money, amount: amount };
})();
