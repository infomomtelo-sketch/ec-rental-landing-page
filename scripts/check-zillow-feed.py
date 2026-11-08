#!/usr/bin/env python3
"""Checks a Zillow Rentals (hotPadsItems v2.1) feed before it is sent to Zillow.

    python3 scripts/check-zillow-feed.py docs/sample-zillow-feed.xml
    python3 scripts/check-zillow-feed.py https://ecrentalpm.com/feeds/zillow.xml [--photos]

Checks well-formed XML, the structure we send, unique listing ids, duplicate addresses, https photo links and
formats. --photos also requests every photo URL and checks it is an image. It is NOT the official Zillow schema
check: Zillow's Rentals Integrations team tests the feed against its own Rental Listings Feed Guide.
Exit code 0 = no errors (warnings are allowed), 1 = errors.
"""
import re, sys, urllib.request, xml.etree.ElementTree as ET

REQUIRED = ["name", "street", "city", "state", "zip", "contactEmail", "contactPhone", "description", "price", "pricingFrequency", "numBedrooms", "numFullBaths", "dateAvailable", "website"]

def load(src):
    if re.match(r"https?://", src):
        req = urllib.request.Request(src, headers={"User-Agent": "ec-rental-feed-check"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    return open(src, "rb").read()

def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    check_photos = "--photos" in argv
    if len(args) != 1:
        print(__doc__); return 2
    errors, warnings = [], []
    try:
        root = ET.fromstring(load(args[0]))
    except ET.ParseError as e:
        print(f"ERROR not well-formed XML: {e}"); return 1
    if root.tag != "hotPadsItems": errors.append(f"root element is <{root.tag}>, expected <hotPadsItems>")
    if root.get("version") != "2.1": errors.append(f"version is {root.get('version')!r}, expected '2.1'")
    companies = {c.get("id"): c for c in root.findall("Company")}
    if not companies: errors.append("no <Company> element")
    for cid, c in companies.items():
        for f in ("name", "email", "phone", "website"):
            if not (c.findtext(f) or "").strip(): warnings.append(f"Company {cid}: <{f}> is empty")
        if not (c.findtext("address") or "").strip(): warnings.append(f"Company {cid}: no street <address>; Zillow's intake form asks for the business address")
    listings = root.findall("listing")
    if not listings: warnings.append("feed has no listings (nothing is ready, or nothing is switched on)")
    ids, addrs, photo_urls = set(), {}, []
    for l in listings:
        lid = l.get("id") or "(no id)"
        def bad(msg): errors.append(f"{lid}: {msg}")
        if not l.get("id"): bad("missing id attribute")
        elif lid in ids: bad("duplicate listing id")
        ids.add(lid)
        if l.get("type") != "RENTAL": bad(f"type is {l.get('type')!r}, expected RENTAL")
        if l.get("companyId") not in companies: bad(f"companyId {l.get('companyId')!r} has no matching <Company>")
        if l.get("propertyType") not in ("HOUSE", "CONDO", "TOWNHOUSE"): bad(f"propertyType {l.get('propertyType')!r} is not HOUSE, CONDO or TOWNHOUSE")
        for f in REQUIRED:
            if not (l.findtext(f) or "").strip(): bad(f"<{f}> missing or empty")
        if not re.fullmatch(r"\d{5}(-\d{4})?", l.findtext("zip") or ""): bad("zip is not 5 digits")
        if not re.fullmatch(r"[A-Z]{2}", l.findtext("state") or ""): bad("state is not a 2-letter code")
        if not re.fullmatch(r"\d{10,15}", l.findtext("contactPhone") or ""): bad("contactPhone must be digits with area code")
        if not re.fullmatch(r"\S+@\S+\.\S+", l.findtext("contactEmail") or ""): bad("contactEmail is not an email")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", l.findtext("dateAvailable") or ""): bad("dateAvailable is not YYYY-MM-DD")
        if not re.fullmatch(r"\d+", l.findtext("price") or ""): bad("price is not a whole number")
        elif int(l.findtext("price")) < 100: warnings.append(f"{lid}: price {l.findtext('price')} looks too low for a monthly rent")
        if l.findtext("pricingFrequency") != "MONTH": bad("pricingFrequency should be MONTH")
        if len((l.findtext("description") or "").strip()) < 50: bad("description under 50 characters")
        if not (l.findtext("street") or "")[:1].isdigit(): warnings.append(f"{lid}: street doesn't start with a house number")
        ph = [p.get("source") or "" for p in l.findall("listingPhoto")]
        if not ph: bad("no <listingPhoto>")
        for u in ph:
            if not u.startswith("https://"): bad(f"photo URL is not https: {u}")
            photo_urls.append((lid, u))
        if len(ph) < 3: warnings.append(f"{lid}: only {len(ph)} photo(s); Zillow ranks listings with more photos higher")
        key = re.sub(r"[^a-z0-9]", "", ((l.findtext("street") or "") + (l.findtext("unit") or "") + (l.findtext("zip") or "")[:5]).lower())
        if key in addrs: bad(f"same address as {addrs[key]}; Zillow rejects duplicate addresses")
        addrs.setdefault(key, lid)
    if check_photos:
        for lid, u in photo_urls:
            try:
                with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "ec-rental-feed-check"}), timeout=30) as r:
                    if not (r.headers.get("Content-Type") or "").startswith("image/"): errors.append(f"{lid}: {u} is not an image ({r.headers.get('Content-Type')})")
            except Exception as e:
                errors.append(f"{lid}: photo not reachable: {u} ({e})")
    for w in warnings: print("WARN ", w)
    for e in errors: print("ERROR", e)
    print(f"{len(listings)} listing(s), {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0

sys.exit(main(sys.argv))
