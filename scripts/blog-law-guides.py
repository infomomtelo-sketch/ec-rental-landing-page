"""California landlord-tenant guides for /blog/ (added October 2026). Loaded by scripts/build-blog.py.

Each guide has the article body plus `slides` (the summary cards at the top of the page, also the video's slides)
and `voice` (the video narration: one intro line, one line per slide, one closing line). Video files live in
public/media/guides/<slug>.mp4 with a -poster.jpg; the page shows the player only when the file exists.
Facts were checked in October 2026. Re-check every January 1 and July 1, when most new rental laws take effect.
"""

CCP = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CCP&amp;sectionNum="
END_LINE = "Run your rentals with E C Rental. Start for three dollars at E C rental P M dot com. Want a video like this for your business? Visit tello dot live."

LAW_ARTICLES = [
 dict(
  slug="california-landlord-tenant-rights",
  tag="California law",
  title="California landlord and tenant rights: who is responsible for what",
  desc="A plain-English map of California landlord and tenant rights: habitability, privacy and entry, deposits, rent rules, fair housing, evictions and repairs, with links to the law.",
  lede="Both sides of a California rental have rights and duties. Here is who is responsible for what, in one place, with links to the deeper guides and the law itself.",
  minutes=8,
  legal=True,
  date="2026-10-14",
  tools=["tello", "docs"],
  slides=[
   ("A safe, livable home", ["Heat, hot water, plumbing, power", "Working locks, no pests, no serious mold", "A stove and refrigerator for leases from 2026"], "Civil Code 1941.1"),
   ("Privacy and entry", ["24 hours' written notice to enter", "Normal business hours, for a valid reason", "Emergencies need no notice"], "Civil Code 1954"),
   ("Deposits", ["Most landlords: one month's rent at most", "Back within 21 days, itemized", "Deductions only for rent, damage, cleaning"], "Civil Code 1950.5"),
   ("Rent and increases", ["AB 1482 cap: 5% + inflation, max 10%", "30 or 90 days' written notice", "Late fees must be reasonable"], "Civil Code 1947.12"),
   ("Fair housing and retaliation", ["No discrimination, vouchers included", "No rent hikes or evictions to punish complaints", "No lockouts or utility shutoffs"], "Civil Code 1942.5, 789.3"),
   ("The landlord's side", ["Rent paid on time, as the lease says", "Tenant keeps it clean and pays for damage", "Evict through court for a legal reason"], "Civil Code 1941.2"),
  ],
  voice=[
   "California rentals come with rights and duties on both sides. Here's who is responsible for what.",
   "First, the home must be safe and livable. Heat, hot water, plumbing and power. Working locks, no pests, no serious mold. And for leases signed from 2026, a working stove and refrigerator.",
   "Tenants have a right to privacy. A landlord gives twenty-four hours' written notice to enter, during normal business hours, for a real reason. Emergencies are the exception.",
   "Most landlords can collect a deposit of one month's rent at most, and must return it within twenty-one days, with an itemized list of any deductions.",
   "Under A B fourteen eighty-two, many rent increases are capped at five percent plus inflation, never more than ten percent, with thirty or ninety days' written notice.",
   "Fair housing law protects tenants from discrimination, including for using a housing voucher. And landlords can't raise rent, evict, lock someone out or shut off utilities to punish a complaint.",
   "Landlords have rights too. Rent paid on time, a tenant who keeps the home clean and pays for damage they cause, and the right to end a tenancy through the court, for a legal reason.",
   END_LINE,
  ],
  body="""
<p>California rental law is spread across the Civil Code, the Code of Civil Procedure, fair housing law and many city ordinances. This guide is the map. Each section says who is responsible for what and links to a deeper guide or to the law itself.</p>
<div class="callout"><p><strong>Check your city, too.</strong> Los Angeles, San Francisco, Oakland, Berkeley, San Jose and many other cities add stricter rent control and eviction rules on top of state law. When a city rule is stricter, it usually applies.</p></div>

<h2>A safe, livable home</h2>
<p>Every California rental comes with a duty to keep the home habitable (<a href="{leginfo}1941.1" rel="noopener">Civil Code 1941.1</a>). That means, among other things:</p>
<ul>
<li>Weatherproofing: a roof and walls that keep out rain and wind, unbroken windows and doors</li>
<li>Working plumbing and gas, hot and cold running water, and a working sewage system</li>
<li>Heat, and electrical wiring and outlets that are safe and working</li>
<li>Clean, sanitary buildings and grounds, free of trash, rodents and insects, with trash cans</li>
<li>Floors, stairs and railings in good repair, and working locks on doors and windows</li>
<li>Smoke alarms and carbon monoxide alarms</li>
<li>For leases signed, renewed or amended on or after January 1, 2026, a working stove and refrigerator (AB 628). The tenant can agree in the lease to bring and maintain their own refrigerator. A recalled stove or refrigerator has to be fixed or replaced within 30 days of notice.</li>
</ul>
<p>Our <a href="/blog/california-rental-repairs-and-damage">repairs and damage guide</a> covers how repair requests work and what happens when the landlord doesn't act.</p>

<h2>Privacy and entry</h2>
<p>A tenant has the right to quiet enjoyment of the home. The landlord may enter only for a valid reason, such as repairs, an agreed inspection, a showing to buyers or new tenants, or a court order, and generally must give <strong>24 hours' written notice</strong> (6 days if mailed), during normal business hours (<a href="{leginfo}1954" rel="noopener">Civil Code 1954</a>). In an emergency, no notice is needed.</p>

<h2>Security deposits</h2>
<p>Since July 1, 2024, most landlords can collect at most <strong>one month's rent</strong> as a deposit. Some small landlords can collect two. The deposit must come back within <strong>21 days</strong> of move-out with an itemized statement, and since 2026 it generally goes back electronically if the tenant paid electronically (AB 414). The full rules, including required photos, are in our <a href="/blog/california-security-deposit-rules">security deposit guide</a>.</p>

<h2>Rent, increases and late fees</h2>
<ul>
<li><strong>Rent caps.</strong> Under AB 1482, many rentals can raise rent at most 5% plus regional inflation, never more than 10%, in any 12 months (<a href="{leginfo}1947.12" rel="noopener">Civil Code 1947.12</a>). Some homes are exempt. See our <a href="/blog/california-rent-increase-limits-ab-1482">AB 1482 guide</a> or try the <a href="/california-rent-increase-calculator">rent increase calculator</a>.</li>
<li><strong>Notice.</strong> 30 days' written notice for an increase of 10% or less, 90 days for more (<a href="{leginfo}827" rel="noopener">Civil Code 827</a>).</li>
<li><strong>Late fees.</strong> Allowed only if the lease says so and the amount is a reasonable estimate of the landlord's cost. See our <a href="/blog/california-rent-late-fees">late fee guide</a>.</li>
</ul>

<h2>Fair housing</h2>
<p>Landlords can't refuse to rent, set different terms or advertise a preference based on race, color, religion, sex, gender identity, sexual orientation, marital or familial status, national origin, ancestry, disability, age, military or veteran status, genetic information or <strong>source of income</strong>, which includes Section 8 and other housing vouchers. Tenants with disabilities can ask for reasonable accommodations, such as an assistance animal in a no-pets building. Our <a href="/blog/california-pets-in-rentals">pets guide</a> covers assistance animals.</p>

<h2>No retaliation, no lockouts</h2>
<ul>
<li><strong>Retaliation.</strong> Raising rent, cutting services or starting an eviction within 180 days after a tenant complains about conditions or uses a legal right is presumed retaliatory (<a href="{leginfo}1942.5" rel="noopener">Civil Code 1942.5</a>).</li>
<li><strong>Self-help eviction.</strong> Changing locks, removing doors or windows, taking belongings or shutting off utilities to force a tenant out is illegal, with penalties for every day it continues (<a href="{leginfo}789.3" rel="noopener">Civil Code 789.3</a>).</li>
</ul>

<h2>The landlord's rights</h2>
<p>The law protects landlords too. A landlord can:</p>
<ul>
<li>Collect rent on the date and in the way the lease says, and serve a notice when it isn't paid</li>
<li>Expect the tenant to keep the home clean, use appliances properly and not damage it (<a href="{leginfo}1941.2" rel="noopener">Civil Code 1941.2</a>)</li>
<li>Charge the tenant for damage beyond normal wear and tear</li>
<li>Screen applicants using written, consistent criteria, and set a pet policy</li>
<li>Enter with proper notice for repairs and inspections</li>
<li>End a tenancy for a legal reason, through the court if the tenant doesn't leave. See <a href="/blog/california-eviction-reasons">legal reasons for eviction</a> and the <a href="/blog/california-eviction-process">eviction process</a>.</li>
</ul>

<h2>Put it in writing</h2>
<p>Most disputes start with something nobody wrote down. A clear lease, dated move-in photos, written repair requests and written notices protect both sides. Our <a href="/blog/california-lease-agreement-checklist">lease checklist</a> lists what a California lease should cover.</p>
""",
 ),
 dict(
  slug="california-eviction-process",
  tag="California law",
  title="The California eviction process, step by step (2026)",
  desc="How an eviction works in California: the right notice, serving it, filing an unlawful detainer, the tenant's 10 court days to respond, trial, the writ of possession and the sheriff.",
  lede="In California, only a court can evict a tenant. Here is every step, from the first notice to the sheriff, and the mistakes that send landlords back to the start.",
  minutes=9,
  legal=True,
  date="2026-10-14",
  tools=["docs", "tello"],
  slides=[
   ("Step 1: the right notice", ["3-day notice to pay rent or quit", "3-day notice to fix a lease violation", "30, 60 or 90 days for no-fault endings"], "CCP 1161, Civil Code 1946.1"),
   ("Step 2: serve it correctly", ["Hand it to the tenant, or", "Leave it with an adult and mail a copy, or", "Post it and mail a copy"], "CCP 1162"),
   ("Step 3: file in court", ["Wait for the notice to run out", "File a summons and unlawful detainer complaint", "Have someone else serve the tenant"], "CCP 1166"),
   ("Step 4: the tenant responds", ["10 court days to respond, since 2025", "No response: ask for a default judgment", "Response: request a trial"], "CCP 1167"),
   ("Step 5: judgment and sheriff", ["Win, and the clerk issues a writ of possession", "The sheriff posts a 5-day notice to vacate", "Only the sheriff removes the tenant"], "CCP 715.010"),
   ("Never do this", ["No lockouts or changed locks", "No shutting off utilities", "No removing belongings"], "Civil Code 789.3"),
  ],
  voice=[
   "In California, only a court can evict a tenant. Here's the process, step by step.",
   "Step one is the right written notice. Three days to pay rent or move out. Three days to fix a lease violation. Or thirty, sixty or ninety days to end a tenancy without fault.",
   "Step two, serve it correctly. Hand it to the tenant, or leave it with an adult at the home and mail a copy, or post it on the door and mail a copy.",
   "Step three. When the notice runs out, file a summons and an unlawful detainer complaint at the superior court. Someone other than you serves the tenant.",
   "Step four. Since twenty twenty-five, the tenant has ten court days to respond. If they don't, you can ask for a default judgment. If they do, either side can request a trial.",
   "Step five. If you win, the clerk issues a writ of possession, and the sheriff posts a five-day notice to vacate. Only the sheriff can remove the tenant.",
   "And never change the locks, shut off utilities or remove belongings yourself. That's illegal in California, with daily penalties.",
   END_LINE,
  ],
  body="""
<p>An eviction in California is a court case called an <strong>unlawful detainer</strong>. It moves faster than most lawsuits, but every step has strict rules. A small mistake in the notice can get the case dismissed, and the landlord has to start over.</p>
<div class="callout"><p><strong>First, check whether you need a legal reason.</strong> Many tenants who have lived in a unit for 12 months or more are covered by California's just cause rules (AB 1482), and many cities have stricter rules. The notice must state a reason that the law allows. See <a href="/blog/california-eviction-reasons">legal reasons for eviction in California</a>.</p></div>

<h2>Step 1: Give the right written notice</h2>
<div class="table-wrap"><table>
<thead><tr><th>Situation</th><th>Notice</th></tr></thead>
<tbody>
<tr><td>Unpaid rent</td><td>3-day notice to pay rent or quit (<a href="{ccp}1161" rel="noopener">CCP 1161(2)</a>)</td></tr>
<tr><td>A lease violation the tenant can fix</td><td>3-day notice to perform covenants or quit (<a href="{ccp}1161" rel="noopener">CCP 1161(3)</a>)</td></tr>
<tr><td>Serious violations that can't be fixed, like nuisance or illegal activity</td><td>3-day notice to quit (<a href="{ccp}1161" rel="noopener">CCP 1161(4)</a>)</td></tr>
<tr><td>Ending a month-to-month tenancy (where no just cause is needed)</td><td>30 days if the tenant has lived there less than a year, 60 days if a year or more (<a href="{leginfo}1946.1" rel="noopener">Civil Code 1946.1</a>)</td></tr>
<tr><td>Some government-assisted tenancies</td><td>Often 90 days, under federal rules</td></tr>
</tbody></table></div>
<p><strong>Three-day notices count only court days.</strong> Saturdays, Sundays and court holidays don't count. A 3-day notice to pay rent or quit must state the exact rent owed, with no late fees or other charges added, and the name, address and phone number of the person to pay, plus how payment can be made. After a 2025 appellate decision (<em>Eshagian v. Cepeda</em>), many attorneys also recommend that the notice state when it was served and when the notice period ends.</p>

<h2>Step 2: Serve the notice correctly</h2>
<p>Under <a href="{ccp}1162" rel="noopener">CCP 1162</a>, a notice can be served by:</p>
<ol>
<li><strong>Personal delivery</strong> to the tenant.</li>
<li><strong>Substituted service:</strong> leaving it with a person of suitable age at the home or workplace, and mailing a copy.</li>
<li><strong>Post and mail:</strong> if neither works, posting it in a visible place at the property, giving a copy to someone living there if possible, and mailing a copy.</li>
</ol>
<p>Write down who served it, how, when and where. You will need it in court.</p>

<h2>Step 3: Wait, then file in court</h2>
<p>If the tenant pays the full amount or fixes the problem within the notice period, the matter ends. If not, you file a <strong>Summons (form SUM-130)</strong> and <strong>Complaint, Unlawful Detainer (form UD-100)</strong> with the superior court in the county where the property is, and pay the filing fee. The court's free <a href="https://selfhelp.courts.ca.gov/eviction" rel="noopener">self-help eviction guide</a> lists the forms.</p>
<p>The summons and complaint must be served on each tenant by someone 18 or older who is not part of the case, such as a registered process server or the sheriff.</p>

<h2>Step 4: The tenant's response</h2>
<p>Since January 1, 2025, a tenant has <strong>10 court days</strong> to respond after being served (<a href="{ccp}1167" rel="noopener">CCP 1167</a>, as changed by AB 2347). Weekends and court holidays don't count.</p>
<ul>
<li><strong>No response:</strong> the landlord can ask the clerk to enter a default and ask for a judgment.</li>
<li><strong>A response:</strong> either side can request a trial. The trial is usually set within 20 days of the request (<a href="{ccp}1170.5" rel="noopener">CCP 1170.5</a>).</li>
</ul>
<p>Many courts offer mediation on the trial day, and many cases settle with a move-out date and a payment plan.</p>

<h2>Step 5: Judgment, writ and sheriff</h2>
<p>If the landlord wins, the court enters judgment and the clerk issues a <strong>writ of possession</strong>. The landlord takes it to the county sheriff. The sheriff posts a <strong>notice to vacate</strong> giving the occupants <strong>5 days</strong> to leave (<a href="{ccp}715.010" rel="noopener">CCP 715.010</a>), then returns to restore possession to the landlord. Any belongings left behind must be stored and handled under the law's notice rules before they can be sold or thrown away.</p>

<h2>What landlords must never do</h2>
<ul>
<li>Change the locks, remove doors or windows, or take the tenant's belongings to force them out</li>
<li>Shut off water, power, gas or other utilities</li>
<li>Threaten, harass or retaliate against a tenant for complaining or using a legal right</li>
</ul>
<p>These are illegal in California, with penalties for every day they continue (<a href="{leginfo}789.3" rel="noopener">Civil Code 789.3</a>, <a href="{leginfo}1942.5" rel="noopener">1942.5</a>).</p>

<h2>How long it takes</h2>
<p>An uncontested case can be over in a few weeks after the notice runs out. A contested case often takes longer, depending on the court's calendar. An eviction is a serious legal matter for both sides, so many landlords use a California landlord-tenant attorney, especially when the tenant responds or a city ordinance applies.</p>
""",
 ),
 dict(
  slug="california-eviction-reasons",
  tag="California law",
  title="Legal reasons for eviction in California (just cause under AB 1482)",
  desc="The at-fault and no-fault reasons California allows for ending a tenancy under AB 1482's just cause rules, who is covered, relocation payments, and the 2024 SB 567 changes.",
  lede="Once a tenant has lived in a covered unit for a year, a California landlord needs a reason the law lists. Here are the at-fault and no-fault reasons, and what each requires.",
  minutes=8,
  legal=True,
  date="2026-10-14",
  tools=["tello", "docs"],
  slides=[
   ("Who is covered", ["Tenants in the unit 12 months or more", "Many homes 15+ years old", "Some single-family homes and condos are exempt"], "Civil Code 1946.2"),
   ("At-fault reasons", ["Not paying rent", "Breaking a lease term after a warning", "Nuisance, damage or criminal activity"], "Civil Code 1946.2(b)(1)"),
   ("More at-fault reasons", ["Refusing a similar new lease", "Refusing lawful entry", "Illegal subletting or use"], "Civil Code 1946.2(b)(1)"),
   ("No-fault reasons", ["Owner or close family moves in", "Leaving the rental market", "Government order, demolition or major remodel"], "Civil Code 1946.2(b)(2)"),
   ("No-fault means relocation pay", ["One month's rent, or", "Waive the final month's rent", "The notice must say so"], "Civil Code 1946.2(d)"),
   ("Stricter since 2024", ["Owner must move in within 90 days", "And live there 12 months", "Remodels need permits and 30+ days of work"], "SB 567"),
  ],
  voice=[
   "In much of California, a landlord needs a legal reason to end a tenancy. Here's what counts.",
   "These just cause rules cover tenants who have lived in a unit for twelve months or more, in many homes over fifteen years old. Some single-family homes and condos are exempt, if the lease says so.",
   "At-fault reasons include not paying rent, breaking an important lease term after a written warning, nuisance, serious damage, or criminal activity.",
   "Others include refusing to sign a similar new lease, refusing lawful entry, or subletting or using the home illegally.",
   "No-fault reasons include an owner or close family member moving in, leaving the rental market, a government order, or demolition or a major remodel.",
   "A no-fault ending requires relocation help of one month's rent, either paid or waived from the final month, and the notice has to say so.",
   "Since twenty twenty-four, an owner who moves in must do so within ninety days and stay a year, and remodels need permits and at least thirty days of work.",
   END_LINE,
  ],
  body="""
<p>The Tenant Protection Act of 2019, known as AB 1482, says that once a tenant has lived in a covered unit for a while, the landlord can end the tenancy only for a <strong>just cause</strong> listed in the law (<a href="{leginfo}1946.2" rel="noopener">Civil Code 1946.2</a>). SB 567 tightened the rules in April 2024. Many cities have their own, stricter lists.</p>

<h2>Who is covered</h2>
<p>The just cause rules apply after the tenant has lawfully lived in the unit for <strong>12 months</strong>, or 24 months if another adult tenant joined the lease before the first 12 months were up. Common exemptions include:</p>
<ul>
<li>Housing built in the last 15 years</li>
<li>Single-family homes and condos owned by individuals (not corporations or REITs), <strong>if the lease includes the exact exemption notice</strong> the law requires</li>
<li>A duplex where the owner lives in the other unit</li>
<li>Rooms in the owner's own home where the tenant shares a bathroom or kitchen with the owner</li>
<li>Deed-restricted affordable housing, hotels, dorms and certain care facilities</li>
</ul>
<p>The same exemptions mostly match the rent cap rules in our <a href="/blog/california-rent-increase-limits-ab-1482">AB 1482 guide</a>.</p>

<h2>At-fault just causes</h2>
<p>These are reasons based on what the tenant did:</p>
<ul>
<li>Not paying rent</li>
<li>Breaking a material term of the lease, after a written notice giving the tenant a chance to fix it</li>
<li>Maintaining or allowing a nuisance</li>
<li>Committing waste, meaning serious damage to the property</li>
<li>Refusing, after the lease ends, to sign a new lease with similar terms when asked in writing</li>
<li>Criminal activity on the property, or criminal threats directed at the owner or agent</li>
<li>Assigning or subletting in violation of the lease</li>
<li>Refusing the landlord lawful entry</li>
<li>Using the home for an unlawful purpose</li>
<li>An employee, agent or licensee not leaving after their job ends</li>
<li>Not leaving after the tenant gave written notice of moving out</li>
</ul>
<p>At-fault cases still go through the normal <a href="/blog/california-eviction-process">eviction process</a>, starting with the right notice.</p>

<h2>No-fault just causes</h2>
<ul>
<li><strong>Owner move-in.</strong> The owner, or their spouse, domestic partner, children, grandchildren, parents or grandparents, intends to live there. For leases signed on or after July 1, 2020, the lease must allow this, or the tenant must agree in writing.</li>
<li><strong>Withdrawing the unit from the rental market.</strong></li>
<li><strong>A government or court order</strong> requiring the tenant to leave.</li>
<li><strong>Demolition or substantial remodel.</strong> The work must replace or significantly modify major systems or abate hazardous materials, need permits, and be impossible to do safely with the tenant there for at least 30 days.</li>
</ul>

<h2>Relocation assistance for no-fault endings</h2>
<p>For a no-fault ending, the landlord must either pay the tenant <strong>one month's rent</strong> as relocation assistance within 15 days of serving the notice, or <strong>waive the final month's rent</strong> in writing. The notice must tell the tenant about this right. Some cities require more.</p>

<h2>The 2024 changes (SB 567)</h2>
<ul>
<li><strong>Owner move-in:</strong> the owner or relative must move in within <strong>90 days</strong> after the tenant leaves and live there as their primary residence for at least <strong>12 months</strong>. If not, the owner must offer the unit back to the tenant at the same rent and terms and pay reasonable moving costs.</li>
<li><strong>Remodels:</strong> the notice must describe the work, include copies of the permits, give the expected completion date, and explain the tenant's right to come back if the work doesn't happen.</li>
<li><strong>Penalties:</strong> a landlord who violates the rules can owe actual damages, attorney's fees and, for willful violations, up to three times the damages. The Attorney General and city attorneys can enforce the law.</li>
</ul>

<h2>Tenants who aren't covered</h2>
<p>If a tenant has lived there less than a year, or the unit is exempt, a month-to-month tenancy can usually end with 30 or 60 days' notice without a stated reason. It can never be for a discriminatory or retaliatory reason, and city rules may still require just cause.</p>
""",
 ),
 dict(
  slug="california-lease-agreement-checklist",
  tag="California law",
  title="What a California lease agreement should include (2026 checklist)",
  desc="A checklist for California residential leases: rent and payment terms, deposits, late fees, pets, repairs, entry, the AB 1482 exemption notice, required disclosures and the 2026 stove and refrigerator rule.",
  lede="A clear lease prevents most landlord-tenant disputes. Here is what a California lease should cover, the disclosures the law requires, and what changed for 2026.",
  minutes=8,
  legal=True,
  date="2026-10-14",
  tools=["docs", "tello"],
  slides=[
   ("The basics", ["Every adult tenant named", "Term: fixed or month-to-month", "Rent, due date and how to pay"], "Civil Code 1947.3"),
   ("Money terms", ["Deposit within the legal cap", "A reasonable late fee, if any", "Who pays which utilities"], "Civil Code 1950.5"),
   ("House rules", ["Pets and pet deposit", "Repairs and who handles what", "Entry, guests, smoking, parking"], "Civil Code 1954"),
   ("Required disclosures", ["Lead paint for pre-1978 homes", "Mold, bed bugs, pesticides", "Megan's Law notice, flood risk"], "State and federal law"),
   ("If the home is exempt", ["AB 1482 exemption notice", "Exact wording, in the lease", "Without it, the exemption may not apply"], "Civil Code 1947.12"),
   ("New for 2026", ["Working stove and refrigerator", "Deposit back electronically if paid that way", "Translation if negotiated in another language"], "AB 628, AB 414, Civil Code 1632"),
  ],
  voice=[
   "A clear lease prevents most rental disputes. Here's what a California lease should cover.",
   "Start with the basics. Name every adult tenant, set the term, and state the rent, the due date, and how to pay.",
   "Spell out the money. A deposit within the legal cap, a reasonable late fee if you use one, and who pays which utilities.",
   "Set the house rules: pets, repairs, entry, guests, smoking and parking.",
   "Include the required disclosures, like lead paint for older homes, mold, bed bugs, pesticides, the Megan's Law notice, and flood risk.",
   "If a single-family home or condo is exempt from A B fourteen eighty-two, put the exact exemption notice in the lease. Without it, the exemption may not apply.",
   "New for twenty twenty-six: a working stove and refrigerator, and deposits returned electronically when they were paid that way. And if you negotiated in Spanish, Chinese, Tagalog, Vietnamese or Korean, offer a translation.",
   END_LINE,
  ],
  body="""
<p>California doesn't require a written lease for every rental, but a month-to-month agreement is still a contract, and a lease of more than a year must be in writing. A written lease that covers the points below protects both sides and makes every later conversation easier.</p>

<h2>The basics</h2>
<ul>
<li><strong>Parties:</strong> the landlord or manager, and every adult who will live there. Each adult should sign.</li>
<li><strong>Property:</strong> address, unit number, parking spaces, storage, and any furniture or appliances included.</li>
<li><strong>Term:</strong> a fixed term with start and end dates, or month-to-month.</li>
<li><strong>Rent:</strong> the amount, the due date, and where and how to pay. A landlord must allow at least one way to pay that isn't cash or electronic transfer, and can require cash only in limited cases after a bounced payment (<a href="{leginfo}1947.3" rel="noopener">Civil Code 1947.3</a>).</li>
<li><strong>Manager and notices:</strong> the name and address of the person authorized to manage the property and receive notices and rent (<a href="{leginfo}1962" rel="noopener">Civil Code 1962</a>).</li>
</ul>

<h2>Money terms</h2>
<ul>
<li><strong>Security deposit</strong> within the legal cap, refundable, with how it will be returned. See our <a href="/blog/california-security-deposit-rules">deposit guide</a>.</li>
<li><strong>Late fee,</strong> if any, written as a reasonable estimate of the landlord's costs. See our <a href="/blog/california-rent-late-fees">late fee guide</a>.</li>
<li><strong>Returned payment fee</strong> within the legal limit.</li>
<li><strong>Utilities:</strong> which ones the tenant pays, and a disclosure if meters are shared with other units (<a href="{leginfo}1940.9" rel="noopener">Civil Code 1940.9</a>).</li>
</ul>

<h2>Rules for living there</h2>
<ul>
<li><strong>Pets:</strong> allowed or not, limits, pet deposit and pet rent, and a note that assistance animals are handled separately. See our <a href="/blog/california-pets-in-rentals">pets guide</a>.</li>
<li><strong>Repairs and maintenance:</strong> how to request repairs, who handles yard care, filters and smoke alarm batteries.</li>
<li><strong>Entry:</strong> the landlord's right to enter with notice under <a href="{leginfo}1954" rel="noopener">Civil Code 1954</a>.</li>
<li><strong>Occupancy and subletting:</strong> who may live there and whether subletting needs written consent.</li>
<li><strong>Smoking:</strong> multi-unit buildings must state where smoking is and isn't allowed (<a href="{leginfo}1947.5" rel="noopener">Civil Code 1947.5</a>).</li>
<li><strong>Owner move-in:</strong> for covered units, if you might ever need the home back for yourself or family, the lease should say so. See <a href="/blog/california-eviction-reasons">legal reasons for eviction</a>.</li>
</ul>

<h2>Required disclosures</h2>
<p>Depending on the property, California and federal law require disclosures such as:</p>
<ul>
<li>Lead-based paint, for homes built before 1978 (federal law)</li>
<li>Known mold that exceeds permissible limits</li>
<li>Bed bug information (<a href="{leginfo}1954.603" rel="noopener">Civil Code 1954.603</a>)</li>
<li>Pesticide use by a licensed pest control operator</li>
<li>The Megan's Law database notice (<a href="{leginfo}2079.10a" rel="noopener">Civil Code 2079.10a</a>)</li>
<li>Whether the property is in a special flood hazard area, if known (Government Code 8589.45)</li>
<li>Demolition permits that have been applied for</li>
<li>Former military ordnance locations nearby, if known</li>
<li>A death in the unit within the past three years, if asked (<a href="{leginfo}1710.2" rel="noopener">Civil Code 1710.2</a>)</li>
</ul>

<h2>The AB 1482 exemption notice</h2>
<p>A single-family home or condo owned by an individual can be exempt from the state rent cap and just cause rules, but only if the lease includes the exact notice the law requires (<a href="{leginfo}1947.12" rel="noopener">Civil Code 1947.12</a>). For leases signed since July 1, 2020, it must be in the lease itself. Without it, the home is treated as covered.</p>

<h2>What's new for 2026</h2>
<ul>
<li><strong>Stove and refrigerator (AB 628).</strong> For leases signed, renewed or amended on or after January 1, 2026, the landlord must provide a working stove and refrigerator. The tenant can agree when signing to supply their own refrigerator.</li>
<li><strong>Deposit refunds (AB 414).</strong> If the tenant paid the deposit or rent electronically, the refund generally goes back electronically unless both agree otherwise in writing.</li>
<li><strong>Translation.</strong> If you negotiated the lease mainly in Spanish, Chinese, Tagalog, Vietnamese or Korean, you must offer a translation in that language before signing (<a href="{leginfo}1632" rel="noopener">Civil Code 1632</a>).</li>
</ul>
<p>Your city may require more, such as a rent registry number or a notice of tenant rights. Many landlords start from a current California association form and have an attorney review any custom terms.</p>
""",
 ),
 dict(
  slug="california-rent-late-fees",
  tag="California law",
  title="California late fees and late rent: what landlords can charge",
  desc="California rules on rent late fees, grace periods, bounced payment fees, payment methods and the 3-day notice to pay rent or quit, with links to the law.",
  lede="California has no fixed cap on late fees, but courts throw out fees that work as penalties. Here is how to set a late fee that holds up, and what to do when rent is late.",
  minutes=6,
  legal=True,
  date="2026-10-14",
  tools=["docs", "tello"],
  slides=[
   ("No fixed cap, but limits", ["Late fee must be in the lease", "A reasonable estimate of real costs", "Not a penalty"], "Civil Code 1671"),
   ("Grace periods", ["None required by state law", "The lease sets it", "Many leases use 3 to 5 days"], "Your lease"),
   ("Bounced payments", ["Up to $25 the first time", "Up to $35 after that", "Cash-only only after notice"], "Civil Code 1719, 1947.3"),
   ("When rent is late", ["Send a friendly reminder first", "Then a 3-day notice to pay or quit", "Rent only, no late fees in it"], "CCP 1161"),
   ("Get the notice right", ["Exact rent owed", "Who to pay, where and how", "Court days only, dates stated"], "CCP 1161(2)"),
  ],
  voice=[
   "Late rent happens. Here's what California landlords can charge, and how to handle it.",
   "California has no fixed cap on late fees. But the fee must be in the lease, and it must be a reasonable estimate of what late payment really costs you. Courts throw out fees that work as penalties.",
   "State law doesn't require a grace period. The lease sets it, and many leases use three to five days.",
   "For a bounced payment, the fee can be up to twenty-five dollars the first time and thirty-five after that. Requiring cash only is allowed only after a bounced payment, with written notice.",
   "When rent is late, start with a friendly reminder. If it still isn't paid, serve a three-day notice to pay rent or quit. It must ask for rent only, not late fees.",
   "State the exact rent owed, who to pay and how, and count court days only. A notice with the wrong amount can sink the whole case.",
   END_LINE,
  ],
  body="""
<p>Late rent is the most common problem landlords face. California law lets you charge a late fee, but only within limits set by court decisions rather than a fixed number. Here is how to set one and what to do when the rent doesn't arrive.</p>

<h2>Late fees: no fixed cap, but real limits</h2>
<p>California has no statute that sets a maximum late fee for residential rent. Instead, a late fee is treated as <strong>liquidated damages</strong> under <a href="{leginfo}1671" rel="noopener">Civil Code 1671</a>. In residential leases, such a fee is generally void unless it was a reasonable estimate of the landlord's actual losses from late payment, at a time when those losses would be hard to calculate. In <em>Orozco v. Casimiro</em> (2004), a court refused to enforce a late fee that the landlord couldn't show was based on a reasonable estimate.</p>
<p>In practice:</p>
<ul>
<li>Put the late fee in the written lease. You can't add one later without the tenant's agreement.</li>
<li>Keep it modest and tied to real costs, such as the time spent following up, bank charges and the cost of your money arriving late.</li>
<li>Write the lease clause as an estimate of those costs, and avoid daily fees that keep growing.</li>
<li>Never include late fees in a 3-day notice to pay rent or quit.</li>
</ul>

<h2>Grace periods</h2>
<p>State law doesn't require a grace period. The lease decides when rent is late. Many California leases give 3 to 5 days before a late fee applies. Some cities have their own rules, so check locally.</p>

<h2>Bounced payments and payment methods</h2>
<ul>
<li><strong>Returned payment fee:</strong> up to $25 for the first bounced check and $35 for each one after that (<a href="{leginfo}1719" rel="noopener">Civil Code 1719</a>).</li>
<li><strong>Payment methods:</strong> a landlord must let tenants pay by at least one method other than cash or electronic funds transfer. Cash-only can be required for up to three months after a payment bounces, with written notice (<a href="{leginfo}1947.3" rel="noopener">Civil Code 1947.3</a>).</li>
<li><strong>Receipts:</strong> give a receipt when rent is paid in cash.</li>
</ul>

<h2>When rent is late</h2>
<ol>
<li><strong>Reach out first.</strong> A short, friendly reminder the day after the grace period ends often solves it. Automatic reminders help.</li>
<li><strong>Talk about a plan.</strong> If the tenant has a short-term problem, a written payment plan can cost less than an eviction.</li>
<li><strong>Serve a 3-day notice to pay rent or quit</strong> if it remains unpaid. Then follow the <a href="/blog/california-eviction-process">eviction process</a> only if needed.</li>
</ol>

<h2>Getting the 3-day notice right</h2>
<p>Under <a href="{ccp}1161" rel="noopener">CCP 1161(2)</a>, the notice must:</p>
<ul>
<li>State the <strong>exact amount of rent</strong> due, with no late fees, utilities or other charges added unless the lease defines them as rent. Many attorneys recommend demanding only the past 12 months of rent.</li>
<li>Give the <strong>name, phone number and address</strong> of the person to pay, and the days and hours they accept payment in person, or bank details, or the electronic payment method already in use.</li>
<li>Count <strong>3 court days</strong>, not counting Saturdays, Sundays or court holidays.</li>
<li>Following the 2025 <em>Eshagian v. Cepeda</em> decision, state when the notice was served and when the period ends.</li>
</ul>
<p>An overstated or vague notice can get an eviction case dismissed, so double-check every number.</p>
""",
 ),
 dict(
  slug="california-pets-in-rentals",
  tag="California law",
  title="Pets in California rentals: rules for landlords and tenants",
  desc="California rules on pets in rentals: pet policies, pet deposits and the deposit cap, pet rent, assistance animals and emotional support animals, declawing, and pet damage.",
  lede="California landlords can set a pet policy, but assistance animals are not pets, and pet deposits count toward the deposit cap. Here is how it all fits together.",
  minutes=6,
  legal=True,
  date="2026-10-14",
  tools=["inspections", "docs"],
  slides=[
   ("Pet policies", ["Landlords can allow or limit pets", "Put the rules in a pet addendum", "Apply them the same way to everyone"], "Your lease"),
   ("Pet deposits", ["They count toward the deposit cap", "One month's rent total, for most", "Fully refundable, like any deposit"], "Civil Code 1950.5"),
   ("Assistance animals aren't pets", ["Service and support animals", "No pet deposit, pet rent or pet fees", "Tenant still pays for damage"], "Fair housing law"),
   ("Support animal letters", ["Can ask for proof if not obvious", "California letters need a 30-day relationship", "Can deny for a direct threat"], "AB 468"),
   ("No declawing rules", ["Can't require declawing or devocalizing", "Can't advertise against it", "Up to $1,000 per ad"], "Civil Code 1942.7"),
  ],
  voice=[
   "Pets are one of the biggest questions in California rentals. Here's how the rules fit together.",
   "Landlords can allow pets, limit them, or say no. Put the rules in a pet addendum, and apply them the same way to every tenant.",
   "A pet deposit counts toward the deposit cap. For most landlords, that's one month's rent in total, and it's refundable like any deposit.",
   "Service animals and emotional support animals are not pets. No pet deposit, pet rent or pet fees, even in a no-pets building, though the tenant still pays for any damage.",
   "If a disability isn't obvious, you can ask for reliable documentation. In California, support animal letters need at least a thirty-day relationship with the provider.",
   "And landlords can't require a tenant to declaw or devocalize a pet, or advertise that way.",
   END_LINE,
  ],
  body="""
<p>Many renters have pets, so a clear pet policy helps you fill vacancies and avoid disputes. California lets landlords set that policy, with important exceptions for assistance animals.</p>

<h2>Setting a pet policy</h2>
<p>State law doesn't require landlords to accept pets. You can allow them, limit them by type, size or number, or say no. Bills to limit no-pet policies have been proposed in Sacramento, so check for new laws each year. Whatever you choose:</p>
<ul>
<li>Put it in writing in the lease or a <strong>pet addendum</strong>: allowed animals, number, vaccinations and licensing, waste cleanup, noise, leash rules, and responsibility for damage.</li>
<li>Apply the same policy to every applicant and tenant.</li>
<li>Check HOA rules and your insurance, which may restrict certain animals.</li>
</ul>

<h2>Pet deposits and pet rent</h2>
<ul>
<li>A <strong>pet deposit</strong> is part of the security deposit. Since July 2024, the total of all deposits is capped at one month's rent for most landlords (<a href="{leginfo}1950.5" rel="noopener">Civil Code 1950.5</a>). You can't add a pet deposit on top of a full deposit. See our <a href="/blog/california-security-deposit-rules">deposit guide</a>.</li>
<li>Deposits are always refundable. A "non-refundable pet fee" is not allowed.</li>
<li><strong>Pet rent</strong>, a monthly charge, is generally allowed under state law if it's in the lease. For units covered by AB 1482, raising it later counts toward the rent cap.</li>
</ul>

<h2>Assistance animals are not pets</h2>
<p>Under the federal Fair Housing Act and California's Fair Employment and Housing Act, a tenant with a disability can ask for a reasonable accommodation to keep a <strong>service animal or emotional support animal</strong>, even in a building with no pets.</p>
<ul>
<li>No pet deposit, pet rent or pet fee can be charged for an assistance animal.</li>
<li>The tenant is still responsible for any damage the animal causes, which can come out of the regular deposit.</li>
<li>If the disability or the need isn't obvious, the landlord can ask for reliable documentation, but not for medical records or a diagnosis.</li>
<li>A request can be denied in narrow cases, such as when the specific animal poses a direct threat to others' safety that can't be reduced, or would cause substantial damage.</li>
</ul>

<h2>Emotional support animal letters in California</h2>
<p>Since 2022, a California health care practitioner who writes documentation for an emotional support dog must have a client relationship with the person for at least 30 days and complete a clinical evaluation first (AB 468). Instant online letters that skip those steps may not meet California's rules. Handle every request promptly, in writing, and the same way each time, and get advice if you're unsure.</p>

<h2>No declawing or devocalizing</h2>
<p>A landlord who allows animals can't require a tenant to declaw a cat or devocalize a dog, can't refuse to rent because an animal hasn't been, and can't advertise that way. Violations can bring a civil penalty of up to $1,000 per advertisement (<a href="{leginfo}1942.7" rel="noopener">Civil Code 1942.7</a>).</p>

<h2>Pet damage at move-out</h2>
<p>Scratched floors, chewed trim, stained carpet and odors beyond normal wear and tear can be deducted from the deposit, with an itemized statement and receipts. Dated move-in and move-out photos are what make those deductions stick. Our <a href="/blog/move-in-inspection-checklist">move-in inspection checklist</a> shows how.</p>
""",
 ),
 dict(
  slug="california-rental-repairs-and-damage",
  tag="California law",
  title="Repairs and damage in California rentals: who pays for what",
  desc="Who pays for repairs in a California rental: the landlord's habitability duties, the tenant's duty of care, repair requests, repair and deduct, wear and tear versus damage, and deposit deductions.",
  lede="Landlords keep a California rental livable. Tenants pay for damage they cause. Here is where the line falls, how repair requests should work, and what happens when they don't.",
  minutes=7,
  legal=True,
  date="2026-10-14",
  tools=["maintenance", "inspections"],
  slides=[
   ("The landlord's job", ["Keep it habitable", "Heat, water, power, locks, no pests", "Fix problems in a reasonable time"], "Civil Code 1941.1"),
   ("The tenant's job", ["Keep it clean and sanitary", "Use fixtures and appliances properly", "Pay for damage they or guests cause"], "Civil Code 1941.2"),
   ("Repair requests", ["Ask in writing, with photos", "Landlord enters with 24 hours' notice", "Emergencies first"], "Civil Code 1954"),
   ("If repairs don't happen", ["Repair and deduct, after notice", "Up to one month's rent", "At most twice in 12 months"], "Civil Code 1942"),
   ("Wear and tear vs. damage", ["Faded paint, worn carpet: wear", "Holes, burns, broken fixtures: damage", "Only damage comes out of the deposit"], "Civil Code 1950.5"),
  ],
  voice=[
   "Who pays when something breaks in a California rental? Here's where the line falls.",
   "The landlord keeps the home habitable. Heat, water, power, working locks, no pests, and repairs done in a reasonable time.",
   "The tenant keeps it clean, uses fixtures and appliances properly, and pays for damage that they or their guests cause.",
   "Repair requests work best in writing, with photos. The landlord gives twenty-four hours' notice to enter, and emergencies come first.",
   "If a serious problem isn't fixed after written notice and a reasonable time, a tenant may repair it and deduct up to one month's rent, at most twice a year.",
   "And at move-out, normal wear and tear like faded paint or worn carpet can't come out of the deposit. Holes, burns and broken fixtures can.",
   END_LINE,
  ],
  body="""
<p>Most repair disputes come down to two questions: is this the landlord's job to fix, and did the tenant cause it? California law answers both, and good records settle the rest.</p>

<h2>What the landlord must fix</h2>
<p>The landlord must keep the home fit to live in (<a href="{leginfo}1941" rel="noopener">Civil Code 1941</a> and <a href="{leginfo}1941.1" rel="noopener">1941.1</a>). That covers weatherproofing, plumbing and gas, hot and cold water, heat, electrical systems, a clean building free of pests and trash, safe floors and stairs, working locks, smoke and carbon monoxide alarms, and, for leases from January 1, 2026, a working stove and refrigerator. Serious mold and pest problems count too.</p>
<p>Repairs should happen within a reasonable time. For problems that threaten health or safety, like no heat in winter, a gas leak, no water or a broken lock, that means right away.</p>

<h2>What the tenant must do</h2>
<p>Under <a href="{leginfo}1941.2" rel="noopener">Civil Code 1941.2</a>, the tenant must:</p>
<ul>
<li>Keep their part of the home clean and sanitary, and dispose of trash properly</li>
<li>Use gas, electrical and plumbing fixtures properly, and keep them as clean as their condition allows</li>
<li>Not damage the home, or let anyone else do so</li>
<li>Use rooms only for their intended purpose</li>
</ul>
<p>If the tenant or their guests caused the problem, such as a clogged toilet from improper use, a broken window or a hole in the wall, the tenant can be charged for the repair. A tenant who breaks these duties also loses the right to use repair and deduct for that problem.</p>

<h2>How repair requests should work</h2>
<ol>
<li><strong>The tenant reports it in writing,</strong> with photos, as soon as they notice it.</li>
<li><strong>The landlord responds</strong> and schedules the repair, giving 24 hours' written notice to enter, unless it's an emergency (<a href="{leginfo}1954" rel="noopener">Civil Code 1954</a>).</li>
<li><strong>Both keep records:</strong> the request, replies, invoices and before-and-after photos.</li>
</ol>
<p>A shared request log, where every message and photo is dated, prevents most arguments about who said what and when.</p>

<h2>If the landlord doesn't repair</h2>
<ul>
<li><strong>Repair and deduct.</strong> After written notice and a reasonable time (30 days is presumed reasonable, less for emergencies), a tenant may pay for a habitability repair and deduct the cost from rent, up to one month's rent, no more than twice in 12 months (<a href="{leginfo}1942" rel="noopener">Civil Code 1942</a>).</li>
<li><strong>Other remedies.</strong> Tenants may also report to local code enforcement, and in court, serious habitability problems can reduce the rent owed.</li>
<li><strong>No retaliation.</strong> A landlord can't raise rent, cut services or evict to punish a repair complaint (<a href="{leginfo}1942.5" rel="noopener">Civil Code 1942.5</a>).</li>
</ul>

<h2>Normal wear and tear versus damage</h2>
<div class="table-wrap"><table>
<thead><tr><th>Normal wear and tear (landlord's cost)</th><th>Damage (tenant's cost)</th></tr></thead>
<tbody>
<tr><td>Faded or lightly scuffed paint</td><td>Large holes, crayon or unapproved paint colors</td></tr>
<tr><td>Carpet worn along walkways</td><td>Burns, pet stains, tears</td></tr>
<tr><td>A few small nail holes</td><td>Broken doors, windows or blinds</td></tr>
<tr><td>Loose door handles from normal use</td><td>Missing fixtures or appliances damaged by misuse</td></tr>
<tr><td>Minor grout wear in a shower</td><td>Water damage from ignored or hidden leaks</td></tr>
</tbody></table></div>

<h2>Charging for damage</h2>
<p>A landlord can bill the tenant during the tenancy or deduct the cost from the deposit at move-out. Deductions need an itemized statement within 21 days, with receipts or invoices for work over $125, and photos taken at move-in and at move-out before and after the repairs (<a href="{leginfo}1950.5" rel="noopener">Civil Code 1950.5</a>). See our <a href="/blog/california-security-deposit-rules">deposit guide</a> for the details.</p>
""",
 ),
]

for _a in LAW_ARTICLES:
    _a["body"] = _a["body"].replace("{ccp}", CCP)
