// Runs the real feed code (src/listings.ts) against an in-memory copy of schema.sql with made-up sample homes,
// writes docs/sample-zillow-feed.xml, and prints the admin readiness report. Needs Node 22+.
//   node scripts/sample-zillow-feed.mjs && python3 scripts/check-zillow-feed.py docs/sample-zillow-feed.xml
import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "ec-listings-bundle.mjs");
await build({ entryPoints: ["src/listings.ts"], bundle: true, format: "esm", platform: "neutral", outfile: out, logLevel: "error" });
const { handlePublicListingRoutes, zillowReadiness } = await import(pathToFileURL(out).href);

const db = new DatabaseSync(":memory:");
db.exec(readFileSync("schema.sql", "utf8"));
// Minimal D1 shim: prepare().bind().all()/first()/run()
const env = { ZILLOW_LEAD_KEY: "sample", DB: { prepare: (sql) => { let args = []; const st = db.prepare(sql); const o = {
  bind: (...a) => { args = a; return o; }, all: async () => ({ results: st.all(...args) }), first: async () => st.get(...args) ?? null, run: async () => { const r = st.run(...args); return { meta: { changes: r.changes } }; } }; return o; } } };

const now = new Date().toISOString();
const homes = [
  ["HOUSE", "1001 Sample Ave", "", "Fresno", "93721", 2100, 3, 2, 1450],
  ["CONDO", "2002 Example Blvd", "4B", "Fresno", "93711", 1650, 2, 2, 980],
  ["TOWNHOUSE", "3003 Demo Ct", "", "Clovis", "93612", 2400, 4, 3, 1800],
];
homes.forEach(([type, street, unit, city, zip, rent, bd, ba, sqft], i) => {
  db.prepare("INSERT INTO users (name, email, password_hash, password_salt, created_at) VALUES (?, ?, 'x', 'x', ?)").run("Sample Owner " + (i + 1), `owner${i + 1}@example.com`, now);
  db.prepare("INSERT INTO listings (user_id, title, property_type, street, unit, city, state, zip, rent, deposit, application_fee, bedrooms, full_baths, square_feet, date_available, description, contact_name, contact_email, contact_phone, status, syndicate_zillow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'CA', ?, ?, ?, 45, ?, ?, ?, '2026-12-01', ?, 'EC Rental', 'info@ecrentalpm.com', '5598253038', 'active', 1, ?, ?)")
    .run(i + 1, `${bd} bed ${type.toLowerCase()} in ${city}`, type, street, unit, city, zip, rent, rent, bd, ba, sqft, `Bright ${bd}-bedroom ${type.toLowerCase()} with updated kitchen, fenced yard and easy freeway access. Sample listing used only to test the feed format.`, now, now);
  for (let n = 1; n <= 3; n++) db.prepare("INSERT INTO listing_photos (listing_id, r2_key, caption, sort_order, created_at) VALUES (?, ?, '', ?, ?)").run(i + 1, `listings/${i + 1}/00000000-0000-0000-0000-00000000000${n}.jpg`, n, now);
});
// One that must stay out (no photos) and one duplicate address, to prove the checks work.
db.prepare("INSERT INTO listings (user_id, street, city, state, zip, rent, bedrooms, date_available, description, contact_email, contact_phone, status, syndicate_zillow, created_at, updated_at) VALUES (1, '9 No Photo Way', 'Fresno', 'CA', '93720', 1500, 2, '2026-12-01', ?, 'a@example.com', '5598253038', 'active', 1, ?, ?)").run('x'.repeat(60), now, now);
db.prepare("INSERT INTO listings (user_id, title, property_type, street, unit, city, state, zip, rent, bedrooms, full_baths, date_available, description, contact_email, contact_phone, status, syndicate_zillow, created_at, updated_at) VALUES (2, 'dup', 'HOUSE', '1001 Sample Ave', '', 'Fresno', 'CA', '93721', 2100, 3, 2, '2026-12-01', ?, 'a@example.com', '5598253038', 'active', 1, ?, ?)").run('y'.repeat(60), now, now);
db.prepare("INSERT INTO listing_photos (listing_id, r2_key, caption, sort_order, created_at) VALUES (5, 'listings/5/00000000-0000-0000-0000-000000000001.jpg', '', 1, ?)").run(now);

const res = await handlePublicListingRoutes(new Request("https://ecrentalpm.com/feeds/zillow.xml", { headers: { "User-Agent": "SampleFetcher/1.0" } }), env, new URL("https://ecrentalpm.com/feeds/zillow.xml"));
mkdirSync("docs", { recursive: true });
writeFileSync("docs/sample-zillow-feed.xml", await res.text());
console.log("feed status", res.status, "-> docs/sample-zillow-feed.xml");
const report = await zillowReadiness(env, "http://ecrentalpm.com");
console.log(JSON.stringify({ ...report, listings: report.listings.map((l) => ({ id: l.feed_id, in_feed: l.in_feed, issues: l.issues, warnings: l.warnings })) }, null, 1));
