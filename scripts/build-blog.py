#!/usr/bin/env python3
"""Builds the landlord guides in public/blog/ from the articles below.

Run from the repo root after editing:  python3 scripts/build-blog.py
Rules for articles: useful first, facts you can source (link the law), no invented stats, quotes or reviews,
no personal names. Legal articles say when they were last checked and that they are not legal advice.
Uses the feature pages' head/nav/footer so every page looks the same.
"""
import html, importlib.util, json, pathlib, re, sys

sys.dont_write_bytecode = True

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("features", ROOT / "scripts" / "build-feature-pages.py")
features = importlib.util.module_from_spec(spec)
spec.loader.exec_module(features)
head, nav, footer, icon, SITE = features.head, features.nav, features.footer, features.icon, features.SITE

OUT = ROOT / "public" / "blog"

# Calls to action that close each article: icon, title, text, button label, link.
TOOLS = {
    "inspect": ("camera", "Try Tello Inspect, free", "Send photos of each room from your phone. Tello reads every photo and you get a written condition report by email. No app, no account.", "Start a free Tello Inspect", "/tello-inspect"),
    "rent": ("dollar", "Get a free rent review", "Tell us about the home and we'll send back a suggested rent range based on comparable rentals.", "Get my free rent review", "/rent-review"),
    "inspections": ("clipboard", "Run inspections in EC Rental", "Room-by-room move-in and move-out inspections with dated photos, side-by-side comparison and a printable report.", "See inspections", "/features/inspections"),
    "listings": ("megaphone", "List it with EC Rental", "Tello writes the listing from a few facts, renters apply online, and the listing is ready for the Zillow feed.", "See listings", "/features/listings"),
}

ARTICLES = [
 dict(
  slug="move-in-inspection-checklist",
  tag="Inspections",
  title="Move-in inspection checklist for landlords, room by room",
  desc="A practical room-by-room move-in inspection checklist for landlords, plus how to photograph the unit so the record holds up when the tenant moves out.",
  lede="The move-in inspection is the record every deposit decision rests on. Here is what to check in each room, how to photograph it, and how to get the tenant's signature on it.",
  minutes=7,
  tools=["inspections", "inspect"],
  body="""
<p>Most deposit disputes come down to one question: what did the unit look like on day one? If you can't show it, it's your word against the tenant's. A good move-in inspection takes about an hour for a typical house and saves far more than that at move-out.</p>

<h2>Before you start</h2>
<ul>
<li><strong>Do it with the tenant if you can.</strong> Walking through together, then both signing, removes most arguments later. If they can't attend, give them a copy and a few days to add notes.</li>
<li><strong>Do it before furniture goes in.</strong> Empty rooms show floors and walls clearly.</li>
<li><strong>Use daylight and turn every light on.</strong> Dark photos are almost useless as evidence.</li>
<li><strong>Make sure photos are dated.</strong> Phone photos store the date. Keep the originals, not screenshots.</li>
</ul>

<h2>How to photograph each room</h2>
<ol>
<li>Stand in each corner and take one wide shot, so every wall is covered at least once.</li>
<li>Take one shot of the floor and one of the ceiling.</li>
<li>Take close-ups of anything that isn't perfect: scuffs, nail holes, stains, chips, cracked tiles, worn carpet. Put a coin or pen in the frame for scale.</li>
<li>Open appliances, cabinets and closets and photograph the inside.</li>
<li>Write one line per item: the room, what it is, the condition (good, fair, poor or damaged) and a short note.</li>
</ol>
<div class="callout"><p><strong>In California, photos are now required.</strong> For tenancies that begin on or after July 1, 2025, landlords must photograph the unit at or just before move-in, and must also take photos at move-out before and after any repairs or cleaning (<a href="{leginfo}1950.5" rel="noopener">Civil Code 1950.5</a>, as amended by AB 2801). See our <a href="/blog/california-security-deposit-rules">California security deposit guide</a>.</p></div>

<h2>Room-by-room checklist</h2>
<h3>Entry, living and dining areas</h3>
<ul>
<li>Front door, locks, deadbolt, peephole, doorbell</li>
<li>Walls and paint, baseboards, ceiling</li>
<li>Flooring: carpet stains and wear, hardwood scratches, tile cracks</li>
<li>Windows, screens, blinds or curtains, window locks</li>
<li>Light fixtures, switches and outlets (test each one)</li>
<li>Smoke alarm and carbon monoxide alarm (test and note the date)</li>
</ul>
<h3>Kitchen</h3>
<ul>
<li>Refrigerator inside and out, freezer, ice maker</li>
<li>Stove burners, oven, range hood and light</li>
<li>Dishwasher (run a short cycle if you can), garbage disposal</li>
<li>Sink, faucet, sprayer, under-sink plumbing for leaks</li>
<li>Countertops for chips, burns and stains; cabinets, drawers and hinges</li>
</ul>
<h3>Bathrooms</h3>
<ul>
<li>Toilet: flush, seat, base for leaks</li>
<li>Sink, faucet, drain speed, vanity</li>
<li>Tub and shower: caulking, grout, tiles, shower head, drain</li>
<li>Exhaust fan, mirror, towel bars, toilet paper holder</li>
<li>Signs of moisture: ceiling spots, peeling paint, soft floor near the toilet</li>
</ul>
<h3>Bedrooms</h3>
<ul>
<li>Doors and closet doors, closet rods and shelves</li>
<li>Walls, ceiling, flooring, windows and screens</li>
<li>Outlets, switches, ceiling fan</li>
</ul>
<h3>Laundry, garage and systems</h3>
<ul>
<li>Washer and dryer if provided, hookups, dryer vent</li>
<li>Water heater: age label, signs of rust or leaks</li>
<li>Heating and air conditioning: run both, note the filter date</li>
<li>Garage door and opener, remotes handed over</li>
<li>Electrical panel labeled and accessible</li>
</ul>
<h3>Outside</h3>
<ul>
<li>Yard, landscaping, irrigation, fences and gates</li>
<li>Exterior paint and siding, gutters, visible roof condition from the ground</li>
<li>Patio, driveway and walkways for cracks</li>
<li>Keys, mailbox key, gate codes: write down exactly what you handed over</li>
</ul>

<h2>Get it signed and stored</h2>
<p>When you're done, both of you sign and date the report. Give the tenant a copy the same day. Keep the report and the original photos together for the whole tenancy plus a few years after it ends. When the tenant moves out, inspect in the same order with the same rooms, so you can compare item by item.</p>

<h2>The move-out half</h2>
<p>At move-out you're comparing, not starting fresh. Ordinary wear and tear (light scuffs, carpet worn by normal use, small nail holes) usually can't come out of the deposit. Damage beyond that can, if your move-in record shows it wasn't there before. That's why the move-in photos matter so much.</p>
""",
 ),
 dict(
  slug="california-security-deposit-rules",
  tag="California law",
  title="California security deposit rules for landlords (2026)",
  desc="How much a California landlord can collect as a security deposit, the 21-day return rule, itemized statements, required photos, and the pre-move-out inspection, with links to the law.",
  lede="California tightened its deposit rules in 2024 and 2025. Here's what changed, what you can deduct, and the deadlines that matter, with links to the law itself.",
  minutes=8,
  legal=True,
  tools=["inspections", "inspect"],
  body="""
<p>Security deposits in California are governed by <a href="{leginfo}1950.5" rel="noopener">Civil Code section 1950.5</a>. Two recent laws changed it: AB 12, which capped deposits starting July 1, 2024, and AB 2801, which added photo requirements in 2025.</p>

<h2>How much you can collect</h2>
<div class="table-wrap"><table>
<thead><tr><th>Landlord</th><th>Maximum deposit</th></tr></thead>
<tbody>
<tr><td>Most landlords (since July 1, 2024)</td><td>One month's rent, furnished or unfurnished</td></tr>
<tr><td>Small landlords: a person, or an LLC whose members are all people, who owns no more than two residential rental properties with no more than four units in total</td><td>Up to two months' rent</td></tr>
<tr><td>Small landlord renting to a service member</td><td>One month's rent</td></tr>
</tbody></table></div>
<p>"Deposit" includes any upfront payment besides the first month's rent, whatever it's called (cleaning fee, move-in fee, last month's rent).</p>

<h2>What you can deduct</h2>
<ul>
<li>Unpaid rent.</li>
<li>Cleaning needed to return the unit to the same level of cleanliness it had at move-in.</li>
<li>Repair of damage beyond ordinary wear and tear caused by the tenant or their guests.</li>
<li>Restoring or replacing personal property or furniture, if the lease allows it, beyond ordinary wear and tear.</li>
</ul>
<p>Ordinary wear and tear can't be charged. Faded paint after a few years, carpet worn along walking paths and a few small nail holes are typical examples.</p>

<h2>The pre-move-out inspection</h2>
<p>When a tenant gives notice, you must tell them in writing that they can ask for an initial inspection and be present for it. That inspection happens no earlier than two weeks before move-out. Afterward you give them an itemized list of the repairs or cleaning you'd deduct for, so they have a chance to fix those things themselves. This step is easy to forget and it's required.</p>

<h2>Photos are now required</h2>
<ul>
<li><strong>From April 1, 2025:</strong> take photos of the unit within a reasonable time after the tenant moves out, before you do any repairs or cleaning, and again after the repairs or cleaning are done.</li>
<li><strong>For tenancies starting on or after July 1, 2025:</strong> take photos at or just before the start of the tenancy.</li>
</ul>
<p>Those photos go with the itemized statement you send the tenant. A dated, room-by-room inspection report with photos covers this. Our <a href="/blog/move-in-inspection-checklist">move-in inspection checklist</a> walks through it.</p>

<h2>The 21-day deadline</h2>
<p>Within 21 days after the tenant moves out, you must return the deposit, or send an itemized statement of deductions along with whatever balance is left. For repairs or cleaning of $125 or more, include copies of the receipts or invoices. If the work isn't finished within 21 days, send a good-faith estimate and follow up with receipts within 14 days of the work being done.</p>
<div class="callout"><p><strong>Getting it wrong is expensive.</strong> If a court finds a deposit was kept in bad faith, the landlord can owe up to twice the deposit amount on top of what was wrongly withheld.</p></div>

<h2>A simple process that keeps you compliant</h2>
<ol>
<li>Collect no more than the allowed amount.</li>
<li>Do a move-in inspection with dated photos and have the tenant sign it.</li>
<li>When notice comes in, offer the pre-move-out inspection in writing.</li>
<li>After move-out, photograph before and after any repairs or cleaning.</li>
<li>Compare against move-in, deduct only what goes beyond normal wear and tear, and send the statement with photos and receipts within 21 days.</li>
</ol>
""",
 ),
 dict(
  slug="california-rent-increase-limits-ab-1482",
  tag="California law",
  title="How much can you raise rent in California? AB 1482 explained",
  desc="California's statewide rent cap (AB 1482) explained for landlords: the 5% plus inflation limit, the 10% ceiling, which homes are exempt, notice periods, and just cause.",
  lede="California's Tenant Protection Act caps yearly rent increases on many rentals. Here is how to work out your limit, whether your property is exempt, and how much notice to give.",
  minutes=7,
  legal=True,
  tools=["rent"],
  body="""
<p>The Tenant Protection Act of 2019, usually called AB 1482, sets a statewide cap on rent increases (<a href="{leginfo}1947.12" rel="noopener">Civil Code 1947.12</a>) and requires just cause to end many tenancies (<a href="{leginfo}1946.2" rel="noopener">Civil Code 1946.2</a>). It runs through the end of 2029 unless the Legislature extends it. If your city has its own rent control, the stricter rule usually applies.</p>

<h2>The cap</h2>
<p>Over any 12-month period, rent can go up by no more than <strong>5% plus the change in the regional cost of living (CPI), or 10%, whichever is lower</strong>. The increase is measured from the lowest rent charged during the previous 12 months, and you can raise rent at most twice in that period.</p>
<p>The CPI figure comes from the consumer price index for your region, using the change from April of the prior year to April of the current year. Look up the current number for your area before you set an increase; it changes every year.</p>
<div class="callout"><p><strong>Example:</strong> if regional CPI rose 3%, the cap is 5% + 3% = 8%. On $2,000 rent, the most you could raise it is $160, to $2,160. If CPI rose 6%, 5% + 6% = 11%, but the 10% ceiling applies, so the most is $200.</p></div>

<h2>Is your property exempt?</h2>
<p>Common exemptions include:</p>
<ul>
<li><strong>Newer buildings:</strong> housing first issued a certificate of occupancy within the last 15 years. This is a rolling window, so a building eventually ages into the cap.</li>
<li><strong>Single-family homes and condos</strong> owned by individuals (not a REIT, a corporation, or an LLC with a corporate member), but only if the tenant was given the specific written exemption notice the law requires, usually in the lease.</li>
<li><strong>Owner-occupied duplexes</strong> where the owner lives in one unit as their main home since the start of the tenancy.</li>
<li>Deed-restricted affordable housing, dorms, and some other categories.</li>
</ul>
<p>The single-family exemption is the one landlords most often lose by mistake: without the notice in writing, the home is covered by the cap.</p>

<h2>How much notice to give</h2>
<ul>
<li><strong>30 days' written notice</strong> for an increase of 10% or less.</li>
<li><strong>90 days' written notice</strong> for an increase of more than 10% (possible only on exempt properties). This comes from <a href="{leginfo}827" rel="noopener">Civil Code 827</a>.</li>
</ul>

<h2>Just cause</h2>
<p>Once a tenant has lived in a covered unit for 12 months, you generally need a just cause to end the tenancy: either an at-fault reason (like nonpayment or a lease violation) or a no-fault reason (like the owner moving in or substantial remodeling). No-fault terminations require relocation help, usually one month's rent. The same exemptions apply in many cases.</p>

<h2>Setting the right rent for a new tenant</h2>
<p>AB 1482 limits increases on a current tenant. When a unit turns over, you can generally set the new rent at market. Pricing it right matters more than squeezing the last dollar, because every empty month costs about 8% of a year's rent. Our <a href="/blog/how-to-price-your-rental">pricing guide</a> shows a simple method.</p>
""",
 ),
 dict(
  slug="remote-home-inspection-photos",
  tag="Inspections",
  title="Remote home inspections: how to inspect a home with your phone",
  desc="How a remote, photo-based home inspection works, who it's for, how to take photos that make a useful report, what it can't see, and when to call an in-person inspector.",
  lede="A remote inspection turns photos you take on your phone into a written condition report. It won't replace a licensed inspector, but it's fast, free, and catches a lot.",
  minutes=6,
  tools=["inspect"],
  body="""
<p>You walk through the home with your phone, take photos room by room, and send them in. Each photo is reviewed for visible issues like stains, cracks, leaks, broken fixtures and wear, and you get a written report with what may need repair.</p>

<h2>Who it's for</h2>
<ul>
<li><strong>Landlords who live far from a rental.</strong> Have the tenant or a handyman take the photos during a routine check.</li>
<li><strong>Homeowners</strong> who want a quick read on what needs attention before calling contractors.</li>
<li><strong>Home buyers</strong> who want a first look before paying for a full inspection.</li>
<li><strong>Tenants</strong> documenting the condition of a unit at move-in or move-out.</li>
</ul>

<h2>How to take photos that make a useful report</h2>
<ol>
<li><strong>Go room by room</strong> and name each room as you go.</li>
<li><strong>Take one or two wide shots</strong> of each room from the corners.</li>
<li><strong>Get close-ups of anything that looks off:</strong> ceiling spots, cracked tile, a dripping faucet, worn carpet, a loose railing.</li>
<li><strong>Use light.</strong> Open blinds and turn on lights. Avoid shooting straight into a window.</li>
<li><strong>Don't forget the hidden places:</strong> under sinks, inside the water heater closet, the electrical panel door, the attic hatch, the garage.</li>
<li><strong>Outside,</strong> photograph each side of the house, the roof from the ground, gutters, fences and the driveway.</li>
</ol>

<h2>What a photo inspection can't see</h2>
<p>Be clear about the limits. A photo review can only describe what the camera shows. It can't:</p>
<ul>
<li>See inside walls, under floors, or inside the roof structure.</li>
<li>Test electrical circuits, gas lines, water pressure or the HVAC system.</li>
<li>Test for mold, asbestos, lead or radon.</li>
<li>Judge structural or foundation problems with certainty.</li>
</ul>
<p>It is not a licensed home inspection. If you're buying a home, signing off on a major repair, or you see signs of water damage, structural movement or electrical trouble, get an in-person inspection.</p>

<h2>When remote is the right call</h2>
<p>Remote works well for routine check-ups, move-in and move-out records, prioritizing repairs, and deciding whether something is worth a professional visit. It's a fast first step that makes the in-person visit, if you need one, shorter and more focused.</p>

<h2>How Tello Inspect works</h2>
<ol>
<li>Tell us who you are and what kind of check you need (move-in, move-out or routine).</li>
<li>Pick a room and take or upload photos, then move to the next room.</li>
<li>Get your condition report by email, with an overall rating, notes for each photo and a list of items that may need repair.</li>
</ol>
<p>It's free, there's no app to install and no account to create. Your photos are private and only visible through your report link.</p>
""",
 ),
 dict(
  slug="how-to-price-your-rental",
  tag="Leasing",
  title="How to price your rental: a simple 5-step method",
  desc="A simple, data-based way for landlords to set the right rent: find real comparables, adjust for differences, factor in vacancy cost, and adjust after the first week.",
  lede="Price too high and the home sits empty. Price too low and you leave money on the table every month. This five-step method gets you close to the right number.",
  minutes=6,
  tools=["rent"],
  body="""
<p>The right rent is the highest number that still gets a qualified tenant signed quickly. Here's how to find it without guessing.</p>

<h2>1. Find 5 to 10 real comparables</h2>
<p>Look for homes currently for rent, or rented in the last few months, that match yours as closely as possible:</p>
<ul>
<li>Same neighborhood, ideally within a mile</li>
<li>Same type (house, condo, apartment) and the same bedroom count</li>
<li>Similar size, within about 20% of your square footage</li>
</ul>
<p>Use the big rental sites, local property manager listings and recent leases you know about. Note the asking rent and, when you can, how long each one has been listed. A comp that's been sitting for 45 days is priced too high.</p>

<h2>2. Adjust for the differences</h2>
<p>No comp is identical. Adjust up or down for the things renters pay for:</p>
<ul>
<li>Garage or covered parking, in-unit laundry, central air</li>
<li>Updated kitchen and bathrooms, yard size, pets allowed</li>
<li>Utilities included, school district, distance to major employers</li>
</ul>
<p>Write the adjustment next to each comp, then look at the range. Your rent should sit inside it.</p>

<h2>3. Remember what a vacant month costs</h2>
<p>Each month empty costs about 8.3% of a year's rent. If a home at $2,000 sits one extra month because it was listed at $2,100, it would take 20 months at the higher rent just to break even. Starting slightly below the top of the range usually wins.</p>

<h2>4. Launch with great photos and a clear listing</h2>
<p>Price and presentation work together. A well-photographed home with complete details can rent at the top of the range; a dark, vague listing can't. See <a href="/blog/rental-listing-that-rents-fast">how to write a rental listing that rents fast</a>.</p>

<h2>5. Read the market after 7 to 10 days</h2>
<ul>
<li><strong>Lots of inquiries and several applications:</strong> you're priced right, or a bit low. Choose the best applicant.</li>
<li><strong>Inquiries but no applications:</strong> something in the showing or the listing is off. Check photos, details and condition.</li>
<li><strong>Few inquiries:</strong> the price is likely high. Lower it by a meaningful step (2% to 5%), not $10.</li>
</ul>
<div class="callout"><p><strong>Raising rent on a current tenant?</strong> Different rules apply. In California, many rentals are limited by AB 1482. Read <a href="/blog/california-rent-increase-limits-ab-1482">how much you can raise rent in California</a>.</p></div>
""",
 ),
 dict(
  slug="rental-listing-that-rents-fast",
  tag="Leasing",
  title="How to write a rental listing that rents fast",
  desc="What to put in a rental listing so the right tenants apply quickly: the headline, photos, the facts renters filter by, fair housing wording to avoid, and fast replies.",
  lede="Renters scroll fast and filter hard. A listing that answers their questions up front, with good photos and fair wording, gets more qualified applicants in less time.",
  minutes=6,
  tools=["listings"],
  body="""
<h2>Lead with what renters search for</h2>
<p>The headline and first two lines should carry the essentials: bedrooms and bathrooms, the type of home, the standout feature and the area. For example: "3 bed, 2 bath house with a garage and big backyard, near the park." Skip "Beautiful home!!!", which tells a renter nothing.</p>

<h2>Photos do most of the work</h2>
<ul>
<li>15 to 25 photos, horizontal, in daylight with every light on.</li>
<li>Lead with the best room, usually the living room or kitchen, not the front door.</li>
<li>Include every bedroom and bathroom, the kitchen, laundry, yard and parking.</li>
<li>Clean and declutter first. Take photos from the corner of each room at chest height.</li>
</ul>

<h2>Give the facts renters filter by</h2>
<p>Missing details mean fewer clicks and more repeat questions. Include:</p>
<ul>
<li>Monthly rent, deposit and any fees</li>
<li>Bedrooms, bathrooms and square footage</li>
<li>Date available and lease length</li>
<li>Pet policy, with any size limits and pet rent</li>
<li>Utilities included, parking, laundry, heating and cooling</li>
<li>How to apply and what you check (income, credit, rental history)</li>
</ul>

<h2>Use fair housing language</h2>
<p>Describe the property, not the person you imagine living there. Federal and state fair housing laws prohibit wording that shows a preference based on a protected class. Avoid phrases like:</p>
<ul>
<li>"Perfect for a young couple," "ideal for singles," "adults only," "no kids"</li>
<li>Anything about religion, national origin or disability, like "Christian home" or "must be able to climb stairs"</li>
<li>"No Section 8" or "no vouchers." In California, source of income, including housing vouchers, is protected.</li>
</ul>
<p>Instead say what the home has: "second-floor unit, 14 stairs, no elevator," or "quiet street, two blocks from the park."</p>

<h2>Reply fast</h2>
<p>The first landlord to reply often gets the tenant. Answer inquiries the same day, offer two or three showing times, and send the application link right away. An assistant that answers common questions at night helps a lot here.</p>

<h2>Put it where renters look</h2>
<p>Most renters search the big rental sites first. A listing that feeds those sites automatically, from one place, saves you from posting the same home five times. Pair a good listing with the <a href="/blog/how-to-price-your-rental">right price</a> and most homes rent quickly.</p>
""",
 ),
]

DATE = "2026-10-07"


def esc(s):
    return html.escape(str(s), quote=True)


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", text).lower()).strip("-")


def with_ids(body):
    """Gives every h2 an id and returns the body plus a table of contents."""
    toc = []
    def add(m):
        sid = slugify(m.group(1)); toc.append((sid, re.sub(r"<[^>]+>", "", m.group(1))))
        return f'<h2 id="{sid}">{m.group(1)}</h2>'
    body = re.sub(r"<h2>(.*?)</h2>", add, body)
    return body, toc


def tool_cta(key):
    i, t, d, b, href = TOOLS[key]
    return f'<div class="tool-cta"><div class="ic">{icon(i)}</div><div><h3>{esc(t)}</h3><p>{esc(d)}</p><a class="btn btn-gold" href="{href}">{esc(b)} →</a></div></div>'


def card(a, level="h3"):
    return f'<a class="post" href="/blog/{a["slug"]}"><span class="tag">{esc(a["tag"])}</span><{level}>{esc(a["title"])}</{level}><p>{esc(a["desc"])}</p><span class="read">{a["minutes"]} min read</span></a>'


def blog_head(title, desc, url, kind="website", image=None):
    h = head(title, desc, url).replace('<link rel="stylesheet" href="/css/feature.css" />', '<link rel="stylesheet" href="/css/feature.css" />\n  <link rel="stylesheet" href="/css/blog.css" />')
    if kind == "article":
        h = h.replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="article" />')
    if image:
        h = h.replace(f'content="{SITE}/og-image.png"', f'content="{image}"')
    return h


def article_page(a):
    url = f"{SITE}/blog/{a['slug']}"
    # Share image made by the social kit script; falls back to the site image.
    image = f"{SITE}/media/blog/{a['slug']}.png" if (ROOT / "public" / "media" / "blog" / f"{a['slug']}.png").exists() else f"{SITE}/og-image.png"
    body, toc = with_ids(a["body"].replace("{leginfo}", "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&amp;sectionNum="))
    toc_html = '<nav class="toc" aria-label="In this guide"><b>In this guide</b><ol>' + "".join(f'<li><a href="#{i}">{esc(t)}</a></li>' for i, t in toc) + "</ol></nav>"
    # Put the first tool after the second section, the rest at the end.
    tools = a["tools"]
    parts = body.split("<h2 ", 3)
    if len(parts) == 4:
        body = parts[0] + "<h2 " + parts[1] + "<h2 " + parts[2] + tool_cta(tools[0]) + "<h2 " + parts[3]
        end_tools = tools[1:]
    else:
        end_tools = tools
    note = ("<p class=\"note\">Last checked " + "October 2026" + ". This guide is general information, not legal advice. Laws change and local rules can be stricter, so check the current law or ask a California landlord-tenant attorney before acting.</p>") if a.get("legal") else ""
    related = [r for r in ARTICLES if r["slug"] != a["slug"]][:3]
    if a["tag"] != "California law":
        related = sorted([r for r in ARTICLES if r["slug"] != a["slug"]], key=lambda r: r["tag"] != a["tag"])[:3]
    ld = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": a["title"], "description": a["desc"], "url": url,
          "mainEntityOfPage": url, "datePublished": DATE, "dateModified": DATE, "image": image, "inLanguage": "en-US",
          "author": {"@type": "Organization", "name": "EC Rental Property Management", "url": SITE},
          "publisher": {"@type": "Organization", "name": "EC Rental Property Management", "url": SITE, "logo": {"@type": "ImageObject", "url": f"{SITE}/tello-512.png"}}}
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Landlord guides", "item": SITE + "/blog/"},
        {"@type": "ListItem", "position": 3, "name": a["title"], "item": url}]}
    ld_json = json.dumps([ld, crumbs]).replace("<", "\\u003c")
    return f'''{blog_head(a["title"] + " | EC Rental", a["desc"], url, "article", image)}
<body>
  {nav()}
  <main>
    <section class="bhero"><div class="glow g1"></div><div class="wrap">
      <div class="crumbs"><a href="/blog/">Landlord guides</a> / {esc(a["tag"])}</div>
      <h1>{esc(a["title"])}</h1>
      <p class="lede">{esc(a["lede"])}</p>
      <div class="bmeta"><span>By the EC Rental team</span><span>{a["minutes"]} min read</span><span>Updated October 7, 2026</span></div>
    </div></section>
    <article class="article">
      {toc_html}
      {body}
      {"".join(tool_cta(t) for t in end_tools)}
      {note}
    </article>
    <section class="band" style="padding-top:24px"><div class="wrap">
      <div class="kicker">Keep reading</div>
      <div class="posts">{"".join(card(r) for r in related)}</div>
    </div></section>
  </main>
  {footer()}
  <script type="application/ld+json">{ld_json}</script>
<script src="/js/track.js" defer></script>
</body>
</html>
'''


def index_page():
    url = f"{SITE}/blog/"
    title = "Landlord guides | EC Rental"
    desc = "Free, practical guides for landlords and property managers: inspections, security deposits, California rent rules, pricing and listings."
    ld = {"@context": "https://schema.org", "@type": "Blog", "name": "EC Rental landlord guides", "url": url, "description": desc,
          "publisher": {"@type": "Organization", "name": "EC Rental Property Management", "url": SITE},
          "blogPost": [{"@type": "BlogPosting", "headline": a["title"], "url": f"{SITE}/blog/{a['slug']}", "datePublished": DATE} for a in ARTICLES]}
    ld_json = json.dumps(ld).replace("<", "\\u003c")
    return f'''{blog_head(title, desc, url)}
<body>
  {nav()}
  <main>
    <section class="bhero"><div class="glow g1"></div><div class="glow g2"></div><div class="wrap" style="max-width:1160px">
      <span class="eyebrow">{icon("file")} Landlord guides</span>
      <h1>Run your rentals with <span class="grad">fewer surprises.</span></h1>
      <p class="lede">Plain-English guides for landlords and property managers: inspections, deposits, rent rules, pricing and listings. Free, no sign-up.</p>
    </div></section>
    <section class="band" style="padding-top:8px"><div class="wrap">
      <div class="posts">{"".join(card(a, "h2") for a in ARTICLES)}</div>
      <div class="ctaband" style="margin-top:64px"><h2>Free tools for <span class="grad">landlords and owners.</span></h2><p>Get a written condition report from your phone photos, or a suggested rent range for your home.</p>
      <div class="cta-row"><a class="btn btn-gold" href="/tello-inspect">Try Tello Inspect</a><a class="btn btn-ghost" href="/rent-review">Free rent review</a></div></div>
    </div></section>
  </main>
  {footer()}
  <script type="application/ld+json">{ld_json}</script>
<script src="/js/track.js" defer></script>
</body>
</html>
'''


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for a in ARTICLES:
        (OUT / f"{a['slug']}.html").write_text(article_page(a))
    (OUT / "index.html").write_text(index_page())
    # Article list for the sitemap and the social kit.
    (ROOT / "scripts" / "blog-posts.json").write_text(json.dumps([{k: a[k] for k in ("slug", "tag", "title", "desc", "lede")} for a in ARTICLES], indent=1) + "\n")
    print("wrote", len(ARTICLES) + 1, "pages to", OUT)
