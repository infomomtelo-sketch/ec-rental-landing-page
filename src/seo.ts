// Search and social sharing: /sitemap.xml, and share-preview tags + Google rental data on /listing?id= pages.
// Crawlers and link previews (Facebook, iMessage, Google) don't run the page's JavaScript, so the tags are added here.

import { businessPageUrls, type BusinessEnv } from "./business-pages";

interface SeoEnv extends BusinessEnv { ASSETS: Fetcher; }
interface SeoListing {
  id: number; title: string; property_type: string; street: string; unit: string; city: string; state: string; zip: string;
  rent: number; bedrooms: number; full_baths: number; half_baths: number; square_feet: number | null;
  date_available: string; description: string; cats_allowed: number; small_dogs_allowed: number; large_dogs_allowed: number; updated_at: string;
}

const SITE = "https://ecrentalpm.com";
// Blog URLs mirror scripts/blog-posts.json (written by scripts/build-blog.py); add new articles here too.
const PAGES = ["/", "/listings", "/fresno-property-management", "/fresno-rental-inspections", "/rent-review", "/tello-inspect", "/tello", "/features/", "/features/tello", "/features/listings", "/features/applications", "/features/inspections", "/features/maintenance", "/features/tenant-portal", "/features/documents", "/features/accounting", "/blog/", "/blog/move-in-inspection-checklist", "/blog/california-security-deposit-rules", "/blog/california-rent-increase-limits-ab-1482", "/blog/remote-home-inspection-photos", "/blog/how-to-price-your-rental", "/blog/rental-listing-that-rents-fast", "/privacy", "/terms"];
const TYPE_NAMES: Record<string, string> = { HOUSE: "house", CONDO: "condo", TOWNHOUSE: "townhouse" };
const SCHEMA_TYPES: Record<string, string> = { HOUSE: "SingleFamilyResidence", CONDO: "Apartment", TOWNHOUSE: "House" };

function attr(s: unknown): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function money(n: number): string { return "$" + Math.round(n || 0).toLocaleString("en-US"); }
function baths(l: SeoListing): string { return String((l.full_baths || 0) + (l.half_baths ? 0.5 : 0)); }

/** One-line summary used for the page title and share previews, e.g. "3 bd / 2 ba house for rent · $1,200/mo · Fresno, CA". */
export function listingHeadline(l: SeoListing): string {
  const beds = l.bedrooms ? `${l.bedrooms} bd` : "Studio";
  return `${beds} / ${baths(l)} ba ${TYPE_NAMES[l.property_type] || "home"} for rent · ${money(l.rent)}/mo · ${l.city}, ${l.state}`;
}

function listingSummary(l: SeoListing): string {
  const pets = l.cats_allowed || l.small_dogs_allowed || l.large_dogs_allowed ? " Pets considered." : "";
  const size = l.square_feet ? ` ${l.square_feet.toLocaleString("en-US")} sq ft.` : "";
  const desc = String(l.description || "").replace(/\s+/g, " ").trim();
  const text = `${l.street}${l.unit ? " #" + l.unit : ""}, ${l.city}.${size}${pets} ${desc}`.trim();
  return text.length > 200 ? text.slice(0, 197).replace(/\s+\S*$/, "") + "..." : text;
}

function listingJsonLd(l: SeoListing, pageUrl: string, images: string[]): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listingHeadline(l),
    url: pageUrl,
    datePosted: String(l.updated_at || "").slice(0, 10) || undefined,
    image: images.length ? images : undefined,
    offers: {
      "@type": "Offer", price: l.rent, priceCurrency: "USD", availability: "https://schema.org/InStock",
      priceSpecification: { "@type": "UnitPriceSpecification", price: l.rent, priceCurrency: "USD", unitText: "MONTH" },
      seller: { "@type": "RealEstateAgent", name: "EC Rental Property Management LLC", url: SITE },
    },
    about: {
      "@type": SCHEMA_TYPES[l.property_type] || "House",
      address: { "@type": "PostalAddress", streetAddress: l.street + (l.unit ? " #" + l.unit : ""), addressLocality: l.city, addressRegion: l.state, postalCode: l.zip, addressCountry: "US" },
      numberOfBedrooms: l.bedrooms,
      numberOfBathroomsTotal: (l.full_baths || 0) + (l.half_baths ? 0.5 : 0),
      floorSize: l.square_feet ? { "@type": "QuantitativeValue", value: l.square_feet, unitCode: "FTK" } : undefined,
      petsAllowed: Boolean(l.cats_allowed || l.small_dogs_allowed || l.large_dogs_allowed),
    },
  };
  // "<" is escaped so a description can't close the script tag.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Handles /sitemap.xml and /listing. Returns null for any other path. */
export async function handleSeoRoutes(request: Request, env: SeoEnv, url: URL): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  if (url.pathname === "/sitemap.xml") {
    const rows = await env.DB.prepare("SELECT id, updated_at FROM listings WHERE status = 'active' ORDER BY id").all<{ id: number; updated_at: string }>();
    const urls = PAGES.map((p) => `<url><loc>${SITE}${p}</loc></url>`)
      .concat((await businessPageUrls(env)).map((u) => `<url><loc>${u}</loc></url>`))
      .concat(rows.results.map((r) => `<url><loc>${SITE}/listing?id=${r.id}</loc><lastmod>${attr(String(r.updated_at || "").slice(0, 10))}</lastmod></url>`));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }

  if (url.pathname !== "/listing") return null;
  const page = await env.ASSETS.fetch(new Request(new URL("/listing", url.origin), request));
  const id = url.searchParams.get("id") || "";
  if (!page.ok || !/^\d+$/.test(id)) return page;
  let l: SeoListing | null = null;
  try { l = await env.DB.prepare("SELECT * FROM listings WHERE id = ? AND status = 'active'").bind(parseInt(id)).first<SeoListing>(); } catch (err) { console.error("[seo]", err); }
  if (!l) return page;
  const photos = await env.DB.prepare("SELECT r2_key FROM listing_photos WHERE listing_id = ? ORDER BY sort_order, id LIMIT 10").bind(l.id).all<{ r2_key: string }>();
  const images = photos.results.map((p) => `${SITE}/photos/${p.r2_key}`);
  const pageUrl = `${SITE}/listing?id=${l.id}`;
  const title = listingHeadline(l);
  const summary = listingSummary(l);
  const tags = [
    `<meta name="description" content="${attr(summary)}" />`,
    `<link rel="canonical" href="${pageUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="EC Rental Property Management" />`,
    `<meta property="og:url" content="${pageUrl}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(summary)}" />`,
    `<meta property="og:image" content="${attr(images[0] || SITE + "/og-image.png")}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${listingJsonLd(l, pageUrl, images)}</script>`,
  ].join("\n  ");
  const out = new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(`${title} — EC Rental`); } })
    .on("head", { element(e) { e.append(tags, { html: true }); } })
    .transform(page);
  const headers = new Headers(out.headers);
  headers.set("Cache-Control", "public, max-age=300");
  return new Response(out.body, { status: out.status, headers });
}

/** Videos under /media/ with byte-range support, which iPhone Safari needs before it will play a video. */
export async function handleMedia(request: Request, env: { ASSETS: Fetcher }, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/media/") || (request.method !== "GET" && request.method !== "HEAD")) return null;
  const res = await env.ASSETS.fetch(new Request(url.toString(), { method: "GET" }));
  if (!res.ok) return res;
  const type = res.headers.get("Content-Type") || "application/octet-stream";
  const body = await res.arrayBuffer();
  const size = body.byteLength;
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400" };
  const m = (request.headers.get("Range") || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return new Response(request.method === "HEAD" ? null : body, { headers: { ...headers, "Content-Length": String(size) } });
  let start: number, end: number;
  if (m[1] === "") { start = Math.max(0, size - parseInt(m[2])); end = size - 1; }
  else { start = parseInt(m[1]); end = m[2] === "" ? size - 1 : Math.min(parseInt(m[2]), size - 1); }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(request.method === "HEAD" ? null : body.slice(start, end + 1), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
}
