/**
 * Business landing pages: every landlord account gets its own public page at /rentals/<slug>, under their
 * business name, with their available rentals, an about section, a contact form and a link to the tenant portal.
 * Landlords edit it from Settings ("Your business page"). Visitor messages are saved in `signups` as plan
 * 'business_page_message' and emailed to the page's contact email.
 *
 * With online billing switched on, a page is only shown while its account has a paid-up or intro/trial plan.
 */
import { isAdmin } from "./admin";
import { billingEnabled, hasActivePlan, type BillingEnv } from "./billing";

type Notify = (to: string, subject: string, html: string, text: string) => Promise<unknown>;
export interface BusinessEnv extends BillingEnv { DB: D1Database; }
interface PageUser { id: number; name: string; company: string; email: string; role: string; }
interface PageRow {
  user_id: number; slug: string; business_name: string; tagline: string; about: string; phone: string; email: string;
  service_area: string; published: number; created_at: string; updated_at: string;
}
interface CardListing { id: number; street: string; unit: string; city: string; state: string; rent: number; bedrooms: number; full_baths: number; half_baths: number; square_feet: number | null; date_available: string; }

export const PAGE_PREFIX = "/rentals/";
const SITE = "https://ecrentalpm.com";
// Words that would read as part of EC Rental's own site rather than a landlord's business.
const RESERVED = new Set(["admin", "api", "app", "dashboard", "ec-rental", "ecrental", "ecrentalpm", "help", "listing", "listings", "login", "rentals", "settings", "support", "tello", "tenant"]);

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max: number): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
function esc(s: unknown): string { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function money(n: number): string { return "$" + Math.round(n || 0).toLocaleString("en-US"); }

/** "Smith Properties, LLC" -> "smith-properties-llc" */
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
}
export function validSlug(slug: string): boolean { return /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(slug) && !slug.includes("--") && !RESERVED.has(slug); }

async function pageFor(env: BusinessEnv, userId: number): Promise<PageRow | null> {
  return env.DB.prepare("SELECT * FROM business_pages WHERE user_id = ?").bind(userId).first<PageRow>();
}
async function slugTaken(env: BusinessEnv, slug: string, userId: number): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT user_id FROM business_pages WHERE slug = ? AND user_id != ?").bind(slug, userId).first());
}
/** A free page address based on the business name: smith-properties, then smith-properties-2, and so on. */
async function freeSlug(env: BusinessEnv, name: string, userId: number): Promise<string> {
  let base = slugify(name);
  if (!validSlug(base)) base = validSlug(base + "-rentals") ? base + "-rentals" : "rentals-" + userId;
  for (let i = 1; i < 50; i++) {
    const s = i === 1 ? base : `${base.slice(0, 46)}-${i}`;
    if (!(await slugTaken(env, s, userId))) return s;
  }
  return `${base.slice(0, 40)}-${userId}`;
}

/** The account's page, created with sensible defaults the first time the landlord opens the Settings card. */
async function ensurePage(env: BusinessEnv, user: PageUser): Promise<PageRow> {
  const existing = await pageFor(env, user.id);
  if (existing) return existing;
  const name = user.company || user.name || "My Rentals";
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO business_pages (user_id, slug, business_name, tagline, about, phone, email, service_area, published, created_at, updated_at) VALUES (?, ?, ?, '', '', '', ?, '', 1, ?, ?) ON CONFLICT(user_id) DO NOTHING")
    .bind(user.id, await freeSlug(env, name, user.id), name, user.email, now, now).run();
  return (await pageFor(env, user.id))!;
}

async function messagesFor(env: BusinessEnv, userId: number) {
  const rows = await env.DB.prepare("SELECT id, name, email, phone, message, created_at FROM signups WHERE plan = 'business_page_message' AND json_valid(message) AND json_extract(message, '$.owner_user_id') = ? ORDER BY created_at DESC LIMIT 20")
    .bind(userId).all<{ id: number; name: string; email: string; phone: string; message: string; created_at: string }>();
  return rows.results.map((r) => { let d: Record<string, unknown> = {}; try { d = JSON.parse(r.message); } catch { /* keep empty */ } return { id: r.id, name: r.name, email: r.email, phone: r.phone, message: str(d.text, 2000), created_at: r.created_at }; });
}

/** GET/PUT /api/business-page for a signed-in landlord. Returns null for other paths. */
export async function handleBusinessPageRoutes(request: Request, env: BusinessEnv, url: URL, user: PageUser): Promise<Response | null> {
  if (url.pathname !== "/api/business-page") return null;
  if (request.method === "GET") {
    const page = await ensurePage(env, user);
    return json({ page, url: url.origin + PAGE_PREFIX + page.slug, live: await isLive(env, page), messages: await messagesFor(env, user.id) });
  }
  if (request.method !== "PUT") return json({ error: "Not found" }, 404);
  const current = await ensurePage(env, user);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const businessName = str(body.business_name, 80);
  if (!businessName) return json({ error: "Add your business name." }, 400);
  const slug = str(body.slug, 60).toLowerCase() || current.slug;
  if (!validSlug(slug)) return json({ error: "The page address can use lowercase letters, numbers and single dashes (3 to 50 characters)." }, 400);
  if (await slugTaken(env, slug, user.id)) return json({ error: "That page address is taken. Try adding your city or a number." }, 409);
  const email = str(body.email, 200);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "That contact email doesn't look right." }, 400);
  await env.DB.prepare("UPDATE business_pages SET slug = ?, business_name = ?, tagline = ?, about = ?, phone = ?, email = ?, service_area = ?, published = ?, updated_at = ? WHERE user_id = ?")
    .bind(slug, businessName, str(body.tagline, 140), str(body.about, 3000), str(body.phone, 30), email, str(body.service_area, 120), body.published === false ? 0 : 1, new Date().toISOString(), user.id).run();
  const page = (await pageFor(env, user.id))!;
  return json({ success: true, page, url: url.origin + PAGE_PREFIX + page.slug, live: await isLive(env, page) });
}

/** A page shows when it's published and (with billing on) its account has a working plan or is an admin's. */
async function isLive(env: BusinessEnv, page: PageRow): Promise<boolean> {
  if (!page.published) return false;
  if (!billingEnabled(env)) return true;
  if (await hasActivePlan(env, page.user_id)) return true;
  const owner = await env.DB.prepare("SELECT id, email, role FROM users WHERE id = ?").bind(page.user_id).first<{ id: number; email: string; role: string }>();
  return isAdmin(env, owner);
}

async function livePage(env: BusinessEnv, slug: string): Promise<PageRow | null> {
  if (!validSlug(slug)) return null;
  const page = await env.DB.prepare("SELECT * FROM business_pages WHERE slug = ?").bind(slug).first<PageRow>();
  return page && (await isLive(env, page)) ? page : null;
}

/** Sitemap entries for every live business page. */
export async function businessPageUrls(env: BusinessEnv): Promise<string[]> {
  const rows = await env.DB.prepare("SELECT * FROM business_pages WHERE published = 1 ORDER BY user_id").all<PageRow>().catch(() => ({ results: [] as PageRow[] }));
  const out: string[] = [];
  for (const p of rows.results) if (await isLive(env, p)) out.push(`${SITE}${PAGE_PREFIX}${p.slug}`);
  return out;
}

/** Public routes: GET /rentals/<slug> (the page) and POST /api/public/business/<slug>/contact. */
export async function handlePublicBusinessPages(request: Request, env: BusinessEnv, url: URL, allow: () => Promise<boolean>, notify?: Notify): Promise<Response | null> {
  const contact = url.pathname.match(/^\/api\/public\/business\/([a-z0-9-]+)\/contact$/);
  if (contact && request.method === "POST") {
    if (!(await allow())) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
    const page = await livePage(env, contact[1]);
    if (!page) return json({ error: "This page isn't available." }, 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (str(body.website, 200)) return json({ success: true }); // filled in only by bots
    const name = str(body.name, 100), email = str(body.email, 200), phone = str(body.phone, 30), text = str(body.message, 2000);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !text) return json({ error: "Please add your name, email and a message." }, 400);
    await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, 'business_page', 'business_page_message', ?, 'pending', ?)")
      .bind(name, page.business_name, email, phone, JSON.stringify({ source: "business_page", owner_user_id: page.user_id, slug: page.slug, text }), new Date().toISOString()).run();
    const owner = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(page.user_id).first<{ email: string }>();
    const to = page.email || owner?.email;
    if (notify && to) {
      const lines: [string, string][] = [["Name", name], ["Email", email], ["Phone", phone], ["Message", text]];
      const shown = lines.filter(([, v]) => v);
      await Promise.resolve(notify(to, `New message from your ${page.business_name} page`,
        `<p>Someone wrote to you from your business page (${esc(url.origin + PAGE_PREFIX + page.slug)}):</p><ul>${shown.map(([k, v]) => `<li><strong>${k}:</strong> ${esc(v)}</li>`).join("")}</ul><p>Reply to them at ${esc(email)}. You can also see recent messages in your <a href="${url.origin}/dashboard">dashboard</a> under Settings.</p>`,
        `Someone wrote to you from your business page (${url.origin + PAGE_PREFIX + page.slug}):\n\n${shown.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nReply to them at ${email}.`)).catch((err) => console.error("[business-page] email", err));
    }
    return json({ success: true });
  }

  if (!url.pathname.startsWith(PAGE_PREFIX) || (request.method !== "GET" && request.method !== "HEAD")) return null;
  const slug = decodeURIComponent(url.pathname.slice(PAGE_PREFIX.length)).replace(/\/+$/, "").toLowerCase();
  const page = await livePage(env, slug);
  if (!page) return html(notFoundPage(), 404);
  if (url.pathname !== PAGE_PREFIX + page.slug) return Response.redirect(url.origin + PAGE_PREFIX + page.slug, 301);
  const listings = await env.DB.prepare("SELECT id, street, unit, city, state, rent, bedrooms, full_baths, half_baths, square_feet, date_available FROM listings WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 60")
    .bind(page.user_id).all<CardListing>();
  const ids = listings.results.map((l) => l.id);
  const photos: Record<number, string> = {};
  if (ids.length) {
    const rows = await env.DB.prepare(`SELECT listing_id, r2_key FROM listing_photos WHERE listing_id IN (${ids.map(() => "?").join(",")}) ORDER BY sort_order, id`).bind(...ids).all<{ listing_id: number; r2_key: string }>();
    for (const r of rows.results) if (!photos[r.listing_id]) photos[r.listing_id] = `/photos/${r.r2_key}`;
  }
  return html(renderPage(page, listings.results, photos), 200);
}

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": status === 200 ? "public, max-age=120" : "no-store" } });
}

const ICON = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
};
const icon = (k: keyof typeof ICON) => `<svg class="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

function available(d: string): string {
  if (!d) return "Available now";
  const t = new Date(d + "T00:00:00Z");
  if (isNaN(t.getTime()) || t.getTime() <= Date.now()) return "Available now";
  return "Available " + t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function card(l: CardListing, photo?: string): string {
  const address = [l.street + (l.unit ? " #" + l.unit : ""), l.city].filter(Boolean).join(", ");
  const baths = (l.full_baths || 0) + (l.half_baths ? 0.5 : 0);
  const img = photo ? `<img src="${esc(photo)}" alt="Photo of ${esc(l.street)}" loading="lazy" />` : '<div class="noimg">No photo yet</div>';
  return `<a class="card" href="/listing?id=${l.id}">${img}<div class="card-body"><div class="price">${money(l.rent)}<span>/mo</span></div><div class="facts">${l.bedrooms} bd · ${baths} ba${l.square_feet ? " · " + l.square_feet.toLocaleString("en-US") + " sq ft" : ""}</div><div class="addr">${esc(address)}</div><div class="avail">${available(l.date_available)}</div></div></a>`;
}

const PAGE_CSS = `
.bp-hero { background: linear-gradient(135deg, var(--primary-dark), var(--primary)); color: var(--white); padding: 3.5rem 1rem 3rem; }
.bp-hero .in { max-width: 1100px; margin: 0 auto; }
.bp-hero h1 { color: var(--white); font-size: 2.2rem; }
.bp-hero p { opacity: 0.92; font-size: 1.1rem; margin-top: 0.5rem; max-width: 46rem; }
.bp-hero .area { display: inline-flex; gap: 0.4rem; align-items: center; font-size: 0.95rem; margin-top: 0.75rem; opacity: 0.85; }
.bp-cta { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }
.bp-btn { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.75rem 1.2rem; border-radius: 8px; font-weight: 700; text-decoration: none; }
.bp-btn.gold { background: var(--accent); color: var(--dark); }
.bp-btn.ghost { border: 1.5px solid rgba(255,255,255,0.7); color: var(--white); }
.bp-sec { margin-top: 2.5rem; }
.bp-sec > h2 { font-size: 1.4rem; margin: 0 0 1rem; }
.bp-about { background: var(--white); border-radius: var(--radius); box-shadow: var(--shadow); padding: 1.5rem; white-space: pre-line; }
.bp-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
.bp-tile { background: var(--white); border-radius: var(--radius); box-shadow: var(--shadow); padding: 1.25rem; text-decoration: none; color: inherit; display: block; }
.bp-tile strong { display: flex; gap: 0.5rem; align-items: center; color: var(--primary); }
.bp-tile p { color: var(--gray); font-size: 0.9rem; margin-top: 0.35rem; }
.bp-contact { display: grid; grid-template-columns: 1fr 1.4fr; gap: 1.5rem; }
.bp-contact .contact { position: static; }
.bp-lines { display: flex; flex-direction: column; gap: 0.75rem; }
.bp-lines a, .bp-lines span { display: inline-flex; gap: 0.5rem; align-items: center; font-weight: 600; text-decoration: none; color: var(--dark); }
.bp-lines .ico { color: var(--primary); flex: none; }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.powered { color: var(--gray); }
@media (max-width: 800px) { .bp-hero h1 { font-size: 1.7rem; } .bp-contact { grid-template-columns: 1fr; } }
@media (max-width: 520px) { .nav-right { gap: 0.75rem; font-size: 0.9rem; } .nav-right a[href="#rentals"] { display: none; } .logo { font-size: 1.05rem; line-height: 1.25; } }
`;

export function renderPage(page: PageRow, listings: CardListing[], photos: Record<number, string>): string {
  const name = page.business_name;
  const pageUrl = SITE + PAGE_PREFIX + page.slug;
  const desc = page.tagline || `${name}: rental homes${page.service_area ? " in " + page.service_area : ""}. See available rentals, contact us, and current tenants can sign in to pay rent and request repairs.`;
  const firstPhoto = listings.map((l) => photos[l.id]).find(Boolean);
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name, url: pageUrl, ...(page.phone ? { telephone: page.phone } : {}), ...(page.email ? { email: page.email } : {}), ...(page.service_area ? { areaServed: page.service_area } : {}), ...(page.about ? { description: page.about.slice(0, 300) } : {}) }).replace(/</g, "\\u003c");
  const lines = [
    page.phone ? `<a href="tel:${esc(page.phone.replace(/[^\d+]/g, ""))}">${icon("phone")}${esc(page.phone)}</a>` : "",
    page.email ? `<a href="mailto:${esc(page.email)}">${icon("mail")}${esc(page.email)}</a>` : "",
    page.service_area ? `<span>${icon("pin")}${esc(page.service_area)}</span>` : "",
  ].filter(Boolean).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(name)}${page.service_area ? " | Rentals in " + esc(page.service_area) : " | Rental Homes"}</title>
  <meta name="description" content="${esc(desc.slice(0, 300))}" />
  <link rel="canonical" href="${pageUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${esc(name)}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:title" content="${esc(name)}" />
  <meta property="og:description" content="${esc(desc.slice(0, 300))}" />
  <meta property="og:image" content="${firstPhoto ? SITE + esc(firstPhoto) : SITE + "/og-image.png"}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="/css/rentals.css" />
  <style>${PAGE_CSS}</style>
  <script type="application/ld+json">${ld}</script>
</head>
<body>
  <header><nav class="nav"><a class="logo" href="${PAGE_PREFIX}${esc(page.slug)}">${esc(name)}</a><div class="nav-right"><a href="#rentals">Rentals</a><a href="#contact">Contact</a><a href="/tenant">Tenant Login</a></div></nav></header>
  <section class="bp-hero"><div class="in">
    <h1>${esc(name)}</h1>
    ${page.tagline ? `<p>${esc(page.tagline)}</p>` : "<p>Quality rental homes, managed with care.</p>"}
    ${page.service_area ? `<div class="area">${icon("pin")}${esc(page.service_area)}</div>` : ""}
    <div class="bp-cta"><a class="bp-btn gold" href="#rentals">${icon("home")}See available rentals</a><a class="bp-btn ghost" href="#contact">${icon("mail")}Contact us</a></div>
  </div></section>
  <main class="wrap">
    <section class="bp-sec" id="rentals"><h2>Available rentals</h2>
      ${listings.length ? `<div class="grid">${listings.map((l) => card(l, photos[l.id])).join("")}</div>` : '<p class="muted">No homes are available right now. Send us a message and we\'ll let you know when one opens up.</p>'}
    </section>
    ${page.about ? `<section class="bp-sec" id="about"><h2>About ${esc(name)}</h2><div class="bp-about">${esc(page.about)}</div></section>` : ""}
    <section class="bp-sec" id="tenants"><h2>Current tenants</h2><div class="bp-tiles">
      <a class="bp-tile" href="/tenant"><strong>${icon("key")}Tenant portal</strong><p>Sign in to pay rent and see your lease documents.</p></a>
      <a class="bp-tile" href="/tenant"><strong>${icon("wrench")}Request a repair</strong><p>Send a maintenance request with photos from your tenant portal.</p></a>
    </div></section>
    <section class="bp-sec" id="contact"><h2>Contact ${esc(name)}</h2><div class="bp-contact">
      <div class="bp-lines">${lines || '<span class="muted">Send us a message and we\'ll get back to you.</span>'}</div>
      <div class="contact"><form id="bpForm"><label class="hp">Website <input name="website" tabindex="-1" autocomplete="off" /></label>
        <input name="name" required maxlength="100" placeholder="Your name" aria-label="Your name" />
        <input name="email" type="email" required maxlength="200" placeholder="Email" aria-label="Email" />
        <input name="phone" type="tel" maxlength="30" placeholder="Phone (optional)" aria-label="Phone" />
        <textarea name="message" rows="4" required maxlength="2000" placeholder="How can we help?" aria-label="Message"></textarea>
        <button type="submit">Send message</button><p id="bpNote" class="small" role="status"></p></form></div>
    </div></section>
  </main>
  <footer class="footer"><p><strong>Equal Housing Opportunity.</strong> ${esc(name)} does not discriminate on the basis of race, color, religion, sex, gender identity, sexual orientation, national origin, familial status, disability, source of income, or any other class protected by law.</p><p class="footer-links powered">Website by <a href="/">EC Rental PM</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></footer>
  <script>
    (function() {
      var form = document.getElementById('bpForm'), note = document.getElementById('bpNote');
      form.addEventListener('submit', function(e) {
        e.preventDefault(); var btn = form.querySelector('button'); btn.disabled = true; note.className = 'small'; note.textContent = 'Sending...';
        var data = {}; new FormData(form).forEach(function(v, k) { data[k] = v; });
        fetch('/api/public/business/${esc(page.slug)}/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
          .then(function(r) { return r.json().catch(function() { return {}; }).then(function(d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.'); }); })
          .then(function() { form.reset(); note.className = 'small ok'; note.textContent = 'Thanks! Your message was sent.'; })
          .catch(function(err) { note.className = 'small err'; note.textContent = err.message; })
          .then(function() { btn.disabled = false; });
      });
    })();
  </script>
</body>
</html>`;
}

function notFoundPage(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex" /><title>Page not available</title><link rel="stylesheet" href="/css/rentals.css" /></head>
<body><header><nav class="nav"><a class="logo" href="/">EC<span> Rental</span> PM</a><div class="nav-right"><a href="/listings">Rentals</a></div></nav></header>
<main class="wrap narrow"><h1>This page isn't available</h1><p class="sub" style="margin-top:0.5rem">The business page you're looking for doesn't exist or isn't published right now.</p><p style="margin-top:1rem"><a href="/listings">Browse rental homes</a></p></main></body></html>`;
}
