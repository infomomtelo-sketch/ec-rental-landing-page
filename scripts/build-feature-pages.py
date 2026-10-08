#!/usr/bin/env python3
"""Builds the feature landing pages in public/features/ from the content below.
scripts/build-blog.py imports head(), nav(), footer() and icon() from here for the /blog pages.

Run from the repo root after editing:  python3 scripts/build-feature-pages.py
Every claim on these pages must match what the product actually does today.
"""
import html, json, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "features"
SITE = "https://ecrentalpm.com"
TELLO = '<img src="/tello-icon.svg" alt="" />'

# Monochrome line icons (24x24, stroke) used for feature cards and links.
ICONS = {
 "alert": '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
 "award": '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
 "bank": '<path d="M3 21h18M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7M12 3l9 5H3z"/>',
 "camera": '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
 "cash": '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
 "chart": '<path d="M3 3v18h18"/><path d="M8 17v-4M13 17V8M18 17v-7"/>',
 "check": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
 "chip": '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M19 9h3M19 15h3M2 9h3M2 15h3"/>',
 "clipboard": '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
 "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 "dollar": '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
 "door": '<path d="M3 21h18"/><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M14 12h.01"/>',
 "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
 "file": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
 "files": '<path d="M15 2H8a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M15 2v5h5M10 11h6M10 15h6"/><path d="M4 7v13a2 2 0 0 0 2 2h10"/>',
 "folder": '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
 "gift": '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
 "home": '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
 "image": '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
 "key": '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
 "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
 "lock": '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
 "mail": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
 "megaphone": '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
 "message": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
 "pen": '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 "phone-mobile": '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
 "printer": '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
 "receipt": '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M16 8H8M16 12H8M13 16H8"/>',
 "scale": '<path d="M12 3v18M7 21h10M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
 "search": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
 "send": '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
 "wrench": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
}


def icon(name):
    if name == "tello":
        return '<img src="/tello-icon.svg" alt="" width="22" height="22" />'
    return f'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>'

# slug, nav label, icon
NAV = [
    ("tello", "Tello AI assistant", "tello"),
    ("listings", "Listings + Zillow feed", "megaphone"),
    ("applications", "Online applications", "pen"),
    ("inspections", "AI inspections", "search"),
    ("maintenance", "Maintenance", "wrench"),
    ("tenant-portal", "Tenant portal", "key"),
    ("documents", "Leases + notices", "file"),
    ("accounting", "Rent + tax reports", "dollar"),
]

PAGES = {
 "tello": dict(
  title="Tello, the AI rental assistant for landlords and renters",
  desc="Meet Tello, EC Rental's AI assistant. Tello answers renters 24/7, writes listings, drafts replies, reads inspection photos and triages repairs, with a person making every final call.",
  eyebrow="Tello AI", h1='Your rentals, run by <span class="grad">a tireless AI teammate.</span>',
  lede="Tello works inside every part of EC Rental. It answers renters at midnight, writes your listing from a few facts, reads inspection photos and sorts repairs by urgency. You stay in charge of every decision.",
  cta=("Talk to Tello", "/tello"),
  stats=[("24/7", "answers for renters"), ("8", "AI tools built in"), ("1", "person makes the final call")],
  mock="""<div class="row" style="justify-content:flex-start;gap:10px"><img src="/tello-icon.svg" alt="" style="width:28px;height:28px;border-radius:8px"><div><b>Tello</b><small>AI rental assistant</small></div></div>
<div class="bubble me">Is the studio on Maple still available?</div>
<div class="bubble ai">Yes, it's available now for $1,200 a month. Want me to set up a showing?</div>
<div class="bubble me">Saturday morning works</div>
<div class="bubble ai">Great. Share your name and phone and the landlord will confirm a time.</div>""",
  chips=("Answers from the listing", "Fair housing rules built in"),
  features=[
   ("message", "Answers renters 24/7", "On every listing and on ecrentalpm.com/tello. Rent, pets, move-in dates and showings, straight from the listing details."),
   ("pen", "Writes your listings", "Give Tello a few facts and up to three photos and it drafts a clear, fair-housing-safe description you can edit."),
   ("send", "Drafts your replies", "One tap turns a renter inquiry into a warm reply with your apply link, ready for you to read and send."),
   ("receipt", "Summarizes applications", "A quick read of income, rental history and employment, with no names or household details and never an approve or deny."),
   ("search", "Reads inspection photos", "Fills in condition and notes room by room and compares move-out with move-in."),
   ("wrench", "Triages repairs", "Suggests a priority, next steps and a kind reply to the tenant for every maintenance request."),
  ],
  steps=[("Ask anything", "Renters ask on a listing. Landlords ask from the dashboard's Ask Tello button."),
         ("Tello drafts", "An answer, a description, a reply, a summary or a repair plan."),
         ("You review", "Nothing goes out or gets decided without you."),
         ("Save hours", "The busywork is done, so you can focus on people and homes.")],
  split=("Built with guardrails", "AI that knows the rules.", "Tello follows fair housing rules in every tool: it describes homes, never the people who should live in them, and it treats every renter the same.",
         ["Never approves or denies an applicant", "Never asks about protected characteristics", "Only answers from the facts you entered", "Says when it doesn't know and points to the landlord"]),
  faq=[("Is Tello a real person?", "No. Tello is AI. It can make mistakes, so EC Rental and the landlord confirm every detail."),
       ("Does it cost extra?", "No. Tello is included in every plan."),
       ("Can renters use it?", "Yes. Renters can chat on any listing page or at ecrentalpm.com/tello.")],
 ),
 "listings": dict(
  title="Rental listings with a Zillow-ready feed | EC Rental",
  desc="List a rental once and share it everywhere: a listing page with photos and map, a Zillow-ready feed, a ready-made post for Facebook and Marketplace, and 24/7 renter chat.",
  eyebrow="Listings", h1='List once. <span class="grad">Get seen everywhere.</span>',
  lede="Every home gets its own fast listing page with photos, a map and an Apply button. Tello writes the description, checks your rent and answers renters around the clock.",
  cta=("List a rental", "/dashboard"),
  stats=[("1 tap", "to share on Facebook"), ("24/7", "renter chat"), ("Zillow", "-ready feed")],
  mock="""<div class="row"><div><b>123 Maple Ave · Studio 1</b><small>Sample listing · Studio / 1 ba</small></div><span class="pill p-green">Active</span></div>
<div class="row"><div><small>Rent</small><b>$1,200/mo</b></div><span class="pill p-green">On Zillow feed</span></div>
<div class="row"><div><b>Write with AI</b><small>Reads your photos and drafts the description</small></div></div>
<div class="mbtn gold">Share: Facebook · Marketplace · Text</div>""",
  chips=("Description written by Tello", "New inquiry · Draft reply ready"),
  features=[
   ("home", "A page for every home", "Photos, rent, pets, move-in date, a map and an Apply button, built to load fast on phones."),
   ("image", "Drag-and-drop photos", "Drop in a batch of photos from your phone or computer. They're stored securely with unique links."),
   ("pen", "Write with AI", "Tello reads up to three photos and your facts and writes a description you can edit."),
   ("chart", "Check my rent", "Compares your rent with similar EC Rental listings nearby when there are enough to compare."),
   ("megaphone", "Share anywhere", "A ready-to-post caption for Facebook, Marketplace and texts, plus a share preview with your first photo."),
   ("link", "Zillow-ready feed", "Switch a listing on for the feed. A checklist shows exactly what's missing before it goes out."),
  ],
  steps=[("Add the home", "Address, rent, beds, baths and your photos."), ("Let Tello write", "Edit the AI description and check your rent."),
         ("Publish", "Go live on ecrentalpm.com and switch on the Zillow feed."), ("Answer leads", "Inquiries land in your dashboard with a drafted reply.")],
  split=("Found on Google, too", "Built for search and sharing.", "Each listing page carries the details Google and social apps read, so your home shows up with its photo, price and address.",
         ["Listed in the site map for search engines", "Rich rental details for Google", "Photo previews on Facebook and iMessage", "Renter chat answers questions while you sleep"]),
  faq=[("Who can list?", "Owners and authorized managers only. Every listing must be for a home you have the right to rent out."),
       ("Is it on Zillow today?", "The feed is built in Zillow's rental format. Listings appear on Zillow once EC Rental's feed partnership is approved."),
       ("Can I take a listing down?", "Yes. Mark it rented or move it back to draft and it leaves the site and the feed.")],
 ),
 "applications": dict(
  title="Online rental applications for your rentals | EC Rental",
  desc="Renters apply online from their phone in minutes. Landlords review applications in one dashboard with an AI summary, without collecting Social Security numbers on the form.",
  eyebrow="Applications", h1='Applications in minutes, <span class="grad">not paperwork runs.</span>',
  lede="Renters apply from any listing on their phone. You see every application in one place, with a quick AI summary to help you review, and the decision always stays with you.",
  cta=("See a listing", "/listings"),
  stats=[("Minutes", "to apply"), ("1", "dashboard for all"), ("0", "SSNs on the form")],
  mock="""<div class="row"><div><b>Rental application</b><small>123 Maple Ave · Studio 1</small></div><span class="pill p-gold">New</span></div>
<div class="row"><div><small>Monthly income</small><b>$4,800</b></div><div><small>Move-in</small><b>Nov 1</b></div></div>
<div class="row"><div><b>AI summary</b><small>Income is about 4x rent. Two years at current job. Prior landlord listed.</small></div></div>
<div class="mbtn">Review application</div>""",
  chips=("Applied from a phone", "Summary ready to review"),
  features=[
   ("phone-mobile", "Mobile-first form", "Renters apply from the listing page in a few minutes, on any phone."),
   ("folder", "Everything in one place", "Applications from all your listings land in one Applications page."),
   ("receipt", "AI summary", "Tello summarizes income, employment and rental history. It never names people, never describes the household and never decides."),
   ("lock", "Less sensitive data", "No Social Security numbers or dates of birth on the form. Screening happens through a screening partner."),
   ("scale", "Fair by design", "Every applicant answers the same questions and is reviewed the same way."),
   ("check", "Track status", "Move each application through reviewing, approved or denied, and track the screening step."),
  ],
  steps=[("Renter finds a home", "From your listing, Zillow or a shared post."), ("Applies online", "Contact, income, employment and rental history."),
         ("You review", "Read the application and the AI summary."), ("Decide", "Set the status and reach out.")],
  split=("Privacy first", "Collect what you need. Nothing more.", "The application asks for what a landlord needs to review a renter, and leaves out the most sensitive identifiers.",
         ["No Social Security numbers", "No dates of birth", "Applications visible only to the listing's landlord", "Equal Housing Opportunity on every page"]),
  faq=[("Do you run credit checks?", "Not on the form. Landlords use a screening partner for credit and background checks."),
       ("Can renters apply without an account?", "Yes. They apply from the listing page."),
       ("Does the AI approve renters?", "Never. It only summarizes. The landlord decides.")],
 ),
 "inspections": dict(
  title="AI rental inspections with photo proof | EC Rental",
  desc="Move-in, move-out, routine and annual inspections from your phone. Tello reads every photo, flags repairs and compares move-out with move-in.",
  eyebrow="AI inspections", h1='Every room documented. <span class="grad">Every deposit protected.</span>',
  lede="Snap photos room by room. Tello fills in the condition and notes, you review them, and you get a printable report ready to sign.",
  cta=("Start for $3", "/#subscribe"),
  stats=[("4", "inspection types"), ("Every", "photo read by AI"), ("1 tap", "repair → work order")],
  mock="""<div class="row"><div><b>Move-out inspection</b><small>Compared with move-in</small></div><span class="pill p-gold">In progress</span></div>
<div class="row"><div><b>Living room carpet</b><small>Light wear since move-in</small></div><span class="pill p-green">Wear and tear</span></div>
<div class="row"><div><b>Bedroom wall</b><small>New hole behind the door</small></div><span class="pill p-red">Looks like damage</span></div>
<div class="mbtn gold">Create maintenance request</div>""",
  chips=("Photo read by Tello", "You review every note"),
  video="inspections",
  features=[
   ("camera", "Room by room", "Move-in, move-out, routine and annual inspections, captured from a phone."),
   ("chip", "AI photo reading", "Tello pre-fills condition and notes for each photo. You correct anything it got wrong."),
   ("scale", "Move-out vs move-in", "Tello drafts which changes look like wear and tear and which look like damage, for you to review."),
   ("wrench", "Repairs in one tap", "Turn any flagged item into a maintenance request."),
   ("printer", "Signed reports", "A printable photo report with landlord and tenant signature lines. Photos stay private."),
   ("gift", "Try it free", "Tello Inspect lets anyone run a free remote AI inspection with no account. It is an AI review of photos, not a licensed home inspection."),
  ],
  steps=[("Start", "Pick the property and inspection type."), ("Snap photos", "Room by room, from your phone."),
         ("Review", "Check Tello's notes and correct them."), ("Sign", "Print or save the report and sign it.")],
  split=("Why it matters in California", "Deposit decisions, backed by photos.", "California Civil Code 1950.5 allows deductions for damage beyond ordinary wear and tear and requires an itemized statement. Dated photo reports make those calls clearer and fairer.",
         ["Dated, photo-backed records", "Side-by-side move-in and move-out", "Private photos, never public", "Saved in your dashboard"]),
  faq=[("Who does the inspection?", "You do, from your phone. Tello reads the photos and drafts the notes, and you review and correct them. It is not a licensed home inspection."),
       ("Can I try it without an account?", "Yes. Tello Inspect at ecrentalpm.com/tello-inspect is a free remote AI home inspection for landlords, homeowners, buyers and tenants. Send photos from your phone, no app needed, and get a condition report by email. It is not a licensed home inspection."),
       ("Can tenants see the photos?", "Inspection photos are private to the landlord's account and the printed report."),
       ("Is the AI always right?", "No. It drafts notes from the photos; you review and correct every one.")],
 ),
 "maintenance": dict(
  title="Rental maintenance requests, handled fast | EC Rental",
  desc="Tenants send repair requests from their portal any time. Landlords get an email right away, Tello suggests priority and next steps, and every request is tracked to resolved.",
  eyebrow="Maintenance", h1='Repairs reported, <span class="grad">triaged and tracked.</span>',
  lede="Tenants send a request from their phone any time. You get an email right away, Tello suggests the priority and next steps, and both of you can see the status until it's fixed.",
  cta=("Start managing", "/#subscribe"),
  stats=[("24/7", "requests from tenants"), ("Instant", "email alerts"), ("AI", "triage")],
  mock="""<div class="row"><div><b>Kitchen sink is leaking</b><small>Jordan R. · just now</small></div><span class="pill p-red">High</span></div>
<div class="row" style="justify-content:flex-start;gap:10px"><img src="/tello-icon.svg" alt="" style="width:26px;height:26px;border-radius:7px"><div><b>Tello triage</b><small>Plumbing · shut the valve, send a plumber within 24 hours</small></div></div>
<div class="row"><div><b>AC not cooling</b><small>Technician booked</small></div><span class="pill p-gold">In progress</span></div>
<div class="row"><div><b>Garage door sticks</b><small>Fixed</small></div><span class="pill p-green">Resolved</span></div>""",
  chips=("Email sent to landlord", "Tenant reply drafted"),
  video="maintenance",
  features=[
   ("phone-mobile", "Requests from the portal", "Tenants describe the problem and pick a priority from their tenant portal."),
   ("mail", "Instant alerts", "The landlord gets an email the moment a request comes in."),
   ("chip", "AI triage", "Tello suggests priority and category, lists next steps and drafts a reply with any safety step to take now."),
   ("alert", "Safety first", "Gas smells, flooding and other emergencies are flagged as emergencies."),
   ("clipboard", "Track to resolved", "Open, in progress and resolved, with the full history saved per property."),
   ("search", "From inspections", "Repairs found in an inspection become maintenance requests in one tap."),
  ],
  steps=[("Tenant reports", "From the tenant portal, day or night."), ("You're alerted", "Email plus the request in your dashboard."),
         ("Tello triages", "Priority, next steps and a reply to send."), ("Resolve", "Mark it fixed. The tenant sees it too.")],
  split=("Everyone stays in the loop", "No more chasing texts.", "Tenants see the status of their requests in their portal, and landlords see every open repair across every property.",
         ["Open repair count on your overview", "Status visible to the tenant", "Priority you can change any time", "History kept with the property"]),
  faq=[("Do tenants need an account?", "Yes. Landlords invite tenants by email to their free tenant portal."),
       ("Do you dispatch vendors?", "You choose who does the work. Tello suggests next steps; you make the call."),
       ("What about emergencies?", "Tell tenants to call 911 for fire, gas or danger first. Tello's triage flags emergencies so you see them right away.")],
 ),
 "tenant-portal": dict(
  title="Tenant portal for renters | EC Rental",
  desc="Invite tenants by email to their own portal to see their home, lease, recorded rent payments and shared documents, and to send maintenance requests.",
  eyebrow="Tenant portal", h1='One home base <span class="grad">for every tenant.</span>',
  lede="Invite your tenant by email. They get their own secure portal with their home, lease dates, recorded rent payments, shared documents and a one-tap way to request repairs.",
  cta=("Tenant sign in", "/tenant"),
  stats=[("Free", "for tenants"), ("1 email", "to invite"), ("7 days", "invite link")],
  mock="""<div class="row"><div><b>My home</b><small>123 Maple Ave · Studio 1</small></div><span class="pill p-green">Active</span></div>
<div class="row"><div><small>Lease</small><b>Nov 1, 2026 to Oct 31, 2027</b></div></div>
<div class="row"><div><small>October rent</small><b>$1,200 recorded</b></div><span class="pill p-green">Paid</span></div>
<div class="mbtn">Send a maintenance request</div>""",
  chips=("Invite accepted", "Lease shared"),
  features=[
   ("mail", "Invite by email", "Send an invite from the Tenants page. The secure link works for 7 days."),
   ("home", "Their home", "Address, rent and lease dates in one place."),
   ("cash", "Rent, online or recorded", "Tenants can pay rent online, and payments you record show up in their portal too."),
   ("file", "Shared documents", "Share a lease, notice or receipt with the tenant from your Documents page."),
   ("wrench", "Repair requests", "Tenants send maintenance requests and see their status."),
   ("lock", "Private by design", "Tenants only see their own home, from their own move-in date onward."),
  ],
  steps=[("Invite", "Enter the tenant's email on the Tenants page."), ("Tenant joins", "They set a password from the email link."),
         ("Share", "Share documents and record rent."), ("Stay connected", "Requests and updates in one place.")],
  split=("Less back-and-forth", "Answers before they have to ask.", "Most tenant questions are about dates, payments and paperwork. The portal answers them without a phone call.",
         ["Works on any phone", "No app to download", "Separate from the landlord dashboard", "Resend or remove an invite any time"]),
  faq=[("Can tenants pay rent online?", "Yes, once you connect your own Stripe account in Settings. Tenants pay by bank transfer or card, the money goes to your bank, and each payment shows in their rent history."),
       ("What does it cost tenants?", "Nothing. The portal is free for tenants."),
       ("What happens when they move out?", "Remove them from the Tenants page and their access to that home ends.")],
 ),
 "documents": dict(
  title="California lease, notice and receipt templates | EC Rental",
  desc="Fill in California rental agreements, 3-day notices to pay or quit, notices of entry, invoices, receipts and applications from your property details, then print or share with tenants.",
  eyebrow="Documents", h1='Leases and notices, <span class="grad">filled in for you.</span>',
  lede="Pick a California template and EC Rental fills in the property, tenant and rent details. Edit, print or save as PDF, and share it to your tenant's portal.",
  cta=("Create a document", "/dashboard"),
  stats=[("6", "California templates"), ("Auto", "filled from your data"), ("1 tap", "share to tenant")],
  mock="""<div class="row"><div><b>Rental agreement</b><small>Month-to-month · 123 Maple Ave</small></div><span class="pill p-gray">Draft</span></div>
<div class="row"><div><b>3-day notice to pay or quit</b><small>Filled from the property</small></div><span class="pill p-gold">Ready</span></div>
<div class="row"><div><b>Rent receipt · October</b><small>Shared with tenant</small></div><span class="pill p-green">Shared</span></div>
<div class="mbtn">Print or save PDF</div>""",
  chips=("Filled from your property", "Shared to the tenant portal"),
  features=[
   ("pen", "Rental agreement", "A California residential lease or month-to-month agreement."),
   ("clock", "3-day notice", "A 3-day notice to pay rent or quit, filled with the amounts you enter."),
   ("door", "Notice of entry", "Written notice before entering the unit."),
   ("receipt", "Invoices and receipts", "Bill a tenant or give a rent receipt in seconds."),
   ("clipboard", "Rental application", "A printable application when you need paper."),
   ("link", "Share with tenants", "Shared documents appear in the tenant's portal while their tenancy is active."),
  ],
  steps=[("Pick a template", "Lease, notice, invoice, receipt or application."), ("Auto-fill", "Property, tenant and rent details come in for you."),
         ("Edit", "Change anything before you print."), ("Print or share", "Save as PDF or share to the tenant portal.")],
  split=("Organized for good", "Every document, with its property.", "Documents are saved with the property they belong to, so you can find last year's lease in seconds.",
         ["Saved per property", "Tenant access you control", "Print-ready layout", "Edit and re-print any time"]),
  faq=[("Are these legal advice?", "No. They're templates. Have an attorney review anything you're unsure about."),
       ("Can I e-sign?", "Today you print and sign. Electronic signatures are planned."),
       ("Which state?", "The templates are written for California rentals.")],
 ),
 "accounting": dict(
  title="Rent tracking and rental tax reports | EC Rental",
  desc="Record rent and expenses per property, sorted into Schedule E categories, and get a yearly tax summary you can export or print for your tax preparer.",
  eyebrow="Rent + tax reports", h1='Tax season, <span class="grad">already sorted.</span>',
  lede="Record rent and expenses as they happen. EC Rental sorts expenses into Schedule E categories and builds a yearly summary per property, ready to export or print for your tax preparer.",
  cta=("Start tracking", "/#subscribe"),
  stats=[("Sch. E", "categories"), ("Per", "property and year"), ("CSV", "or PDF export")],
  mock="""<div class="row"><div><small>Rent collected · 2026</small><b>$14,400</b></div><span class="pill p-green">123 Maple Ave</span></div>
<div class="row"><div><small>Expenses</small><b>$1,860</b></div><div><small>Net income</small><b>$12,540</b></div></div>
<div class="row"><div><b>Plumber · kitchen sink</b><small>Oct 12 · Repairs (line 14)</small></div><b>−$240</b></div>
<div class="mbtn gold">Export for my tax preparer</div>""",
  chips=("Rent recorded", "Report ready for your CPA"),
  features=[
   ("cash", "Record rent", "Log rent as it comes in, or let tenants pay online and it records itself. It shows in the tenant's portal too."),
   ("receipt", "Track expenses", "Each expense gets a Schedule E category, like repairs, utilities or insurance. EC Rental suggests one for you."),
   ("bank", "Owner draws", "Record money paid out to owners. It is kept off your expenses."),
   ("files", "Yearly tax summary", "Pick the tax year: rents received, expenses by Schedule E line and net income, per property."),
   ("download", "Export or print", "A CSV with the summary and every transaction, or print it as a PDF for your tax preparer."),
   ("chart", "Month by month", "Rent, expenses and net for each month of the year at a glance."),
  ],
  steps=[("Add properties", "Each home or unit you manage."), ("Record activity", "Rent, expenses and owner payments."),
         ("Review", "Pick the tax year and check the totals."), ("Export", "Download or print it at tax time.")],
  split=("Simple bookkeeping", "Built for small landlords.", "No accounting degree needed. Enter what happened and EC Rental keeps the totals straight.",
         ["Per-property totals", "Works for 1 home or many", "Ready for Schedule E prep", "Your data, exportable any time"]),
  faq=[("Do you collect rent online?", "Yes. Once you connect your own Stripe account, tenants can pay rent online and each payment is recorded for you."),
       ("Is this tax advice?", "No. It organizes your numbers by Schedule E line. Depreciation isn't included, and your tax professional files your return."),
       ("Can I import from my bank?", "Not today. Entries are added by hand.")],
 ),
}


def esc(s):
    return html.escape(s, quote=True)


def nav():
    return f'''<header class="fnav"><div class="wrap"><a class="flogo" href="/">EC<span> Rental</span> PM</a><nav class="flinks"><a href="/features/">Features</a><a href="/blog/">Guides</a><a href="/listings">Rentals</a><a href="/tello">Tello</a><a href="/dashboard">Sign in</a><a class="btn btn-gold" href="/#subscribe">Get started</a></nav></div></header>'''


def footer():
    links = "".join(f'<a href="/features/{s}">{esc(l)}</a>' for s, l, _ in NAV)
    return f'''<footer class="ffoot"><div class="wrap"><nav>{links}<a href="/blog/">Landlord guides</a><a href="/tello-inspect">Tello Inspect</a><a href="/rent-review">Free rent review</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
<p><strong>Equal Housing Opportunity.</strong> EC Rental Property Management LLC does not discriminate on the basis of race, color, religion, sex, gender identity, sexual orientation, national origin, familial status, disability, source of income, or any other class protected by federal, California, or local law.</p>
<p>Fresno, California · (559) 825-3038 · info@ecrentalpm.com · &copy; 2026 EC Rental Property Management LLC</p></div></footer>'''


def head(title, desc, url):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}" />
  <link rel="canonical" href="{url}" />
  <link rel="icon" href="/tello-icon.svg" type="image/svg+xml" />
  <meta name="theme-color" content="#07170f" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="{esc(title)}" />
  <meta property="og:description" content="{esc(desc)}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{SITE}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
  <link rel="stylesheet" href="/css/feature.css" />
</head>'''


def page(slug, p):
    url = f"{SITE}/features/{slug}"
    stats = "".join(f"<div><b>{esc(a)}</b><span>{esc(b)}</span></div>" for a, b in p["stats"])
    feats = "".join(f'<div class="card"><div class="ic">{icon(i)}</div><h3>{esc(t)}</h3><p>{esc(d)}</p></div>' for i, t, d in p["features"])
    steps = "".join(f'<div class="step"><h3>{esc(t)}</h3><p>{esc(d)}</p></div>' for t, d in p["steps"])
    k, h, sub, checks = p["split"]
    checks_html = "".join(f"<li>{esc(c)}</li>" for c in checks)
    if p.get("video"):
        v = p["video"]
        right = f'<div class="video"><video src="/media/{v}.mp4" poster="/media/{v}-poster.jpg" controls playsinline preload="none" aria-label="Video: {esc(p["eyebrow"])}"></video></div>'
    else:
        right = f'<div class="mock"><div class="mock-bar"><i></i><i></i><i></i><span>ecrentalpm.com</span></div><div class="screen">{p["mock"]}</div></div>'
    faq = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in p["faq"])
    more = "".join(f'<a href="/features/{s}"><span>{icon(i)}</span>{esc(l)}</a>' for s, l, i in NAV if s != slug)
    ld = {"@context": "https://schema.org", "@type": "WebPage", "name": p["title"], "description": p["desc"], "url": url,
          "isPartOf": {"@type": "WebSite", "name": "EC Rental Property Management", "url": SITE},
          "mainEntity": {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]]}}
    c1, c2 = p["chips"]
    ld_json = json.dumps(ld).replace("<", "\\u003c")
    return f'''{head(p["title"], p["desc"], url)}
<body>
  {nav()}
  <main>
    <section class="fhero"><div class="glow g1"></div><div class="glow g2"></div><div class="wrap">
      <div>
        <span class="eyebrow">{TELLO} {esc(p["eyebrow"])}</span>
        <h1>{p["h1"]}</h1>
        <p class="lede">{esc(p["lede"])}</p>
        <div class="cta-row"><a class="btn btn-gold" href="{p["cta"][1]}">{esc(p["cta"][0])} →</a><a class="btn btn-ghost" href="/tello?mode=landlord">Ask Tello a question</a></div>
        <div class="stats">{stats}</div>
      </div>
      <div style="position:relative">
        <div class="mock"><div class="mock-bar"><i></i><i></i><i></i><span>ecrentalpm.com · {esc(p["eyebrow"])}</span></div><div class="screen">{p["mock"]}</div></div>
        <div class="float-chip c1">{TELLO} {esc(c1)}</div>
        <div class="float-chip c2">✓ {esc(c2)}</div>
      </div>
    </div></section>

    <section class="band alt"><div class="wrap">
      <div class="kicker">What you get</div>
      <h2 class="title">{esc(p["eyebrow"])}, done right.</h2>
      <div class="grid">{feats}</div>
    </div></section>

    <section class="band"><div class="wrap">
      <div class="kicker">How it works</div>
      <h2 class="title">Up and running in four steps.</h2>
      <div class="steps">{steps}</div>
    </div></section>

    <section class="band alt"><div class="wrap split">
      <div><div class="kicker">{esc(k)}</div><h2 class="title">{esc(h)}</h2><p class="sub">{esc(sub)}</p><ul class="checks">{checks_html}</ul></div>
      {right}
    </div></section>

    <section class="band"><div class="wrap">
      <div class="kicker">Questions</div>
      <h2 class="title">Good to know.</h2>
      <div class="faq">{faq}</div>
    </div></section>

    <section class="band" style="padding-top:0"><div class="wrap">
      <div class="ctaband"><h2>Run your rentals <span class="grad">the modern way.</span></h2><p>Listings, applications, inspections, repairs, documents and reports, with Tello built into all of it. Launch offer: 3 months for $3 on Solo Landlord for sign ups through December 31, then $29/month. Your own business landing page is included.</p>
      <div class="cta-row"><a class="btn btn-gold" href="/#subscribe">Start for $3</a><a class="btn btn-ghost" href="/rent-review">Free rent review</a></div></div>
      <div class="kicker" style="margin-top:56px">Explore more</div>
      <div class="more">{more}</div>
    </div></section>
  </main>
  {footer()}
  <script type="application/ld+json">{ld_json}</script>
<script src="/js/track.js" defer></script>
</body>
</html>
'''


def index():
    url = f"{SITE}/features/"
    title = "Features | EC Rental Property Management"
    desc = "Everything EC Rental does for landlords and renters: Tello AI, listings with a Zillow-ready feed, online applications, AI inspections, maintenance, tenant portal, documents and tax reports."
    cards = "".join(f'<a class="card" href="/features/{s}" style="text-decoration:none"><div class="ic">{icon(i)}</div><h3>{esc(l)}</h3><p>{esc(PAGES[s]["lede"])}</p></a>' for s, l, i in NAV)
    return f'''{head(title, desc, url)}
<body>
  {nav()}
  <main>
    <section class="fhero"><div class="glow g1"></div><div class="glow g2"></div><div class="wrap" style="grid-template-columns:1fr">
      <div style="text-align:center;max-width:820px;margin:0 auto">
        <span class="eyebrow">{TELLO} The EC Rental platform</span>
        <h1>Everything your rentals need. <span class="grad">Tello built in.</span></h1>
        <p class="lede" style="margin:0 auto">Eight tools that work together, from the first listing to tax season, for landlords and the renters they serve, wherever the rentals are.</p>
        <div class="cta-row" style="justify-content:center"><a class="btn btn-gold" href="/#subscribe">Start for $3 →</a><a class="btn btn-ghost" href="/tello?mode=landlord">Ask Tello</a></div>
      </div>
    </div></section>
    <section class="band alt"><div class="wrap"><div class="grid">{cards}</div></div></section>
  </main>
  {footer()}
<script src="/js/track.js" defer></script>
</body>
</html>
'''


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, p in PAGES.items():
        (OUT / f"{slug}.html").write_text(page(slug, p))
    (OUT / "index.html").write_text(index())
    print("wrote", len(PAGES) + 1, "pages to", OUT)
