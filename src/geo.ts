/**
 * Map pins for public listings. Addresses are turned into coordinates with the free US Census
 * geocoder (no API key) the first time a listing is shown on the map, then cached in listing_geo.
 * A listing whose address changes is looked up again; one that can't be found is retried weekly.
 */

export interface GeoEnv { DB: D1Database; }

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const LOOKUPS_PER_REQUEST = 5;
const RETRY_FAILED_MS = 7 * 24 * 60 * 60 * 1000;

interface Row { id: number; street: string; city: string; state: string; zip: string; geo_address: string | null; lat: number | null; lng: number | null; geo_updated: string | null; }

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } }); }

/** The unit number is left out: the geocoder matches street addresses, and the pin is the building. */
export function geoAddress(l: { street: string; city: string; state: string; zip: string }): string {
  return [l.street, l.city, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** Returns [lat, lng] for a US street address, or null when the Census geocoder has no match. */
export async function geocode(address: string, fetcher: typeof fetch = fetch): Promise<[number, number] | null> {
  const res = await fetcher(CENSUS_URL + "?benchmark=Public_AR_Current&format=json&address=" + encodeURIComponent(address), { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error("Geocoder returned " + res.status);
  const body = await res.json() as { result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] } };
  const c = body.result?.addressMatches?.[0]?.coordinates;
  return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? [c.y as number, c.x as number] : null;
}

/** GET /api/public/listings/map : [{ id, lat, lng }] for active listings that have been located. */
export async function handleMapRoute(request: Request, env: GeoEnv, url: URL, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (url.pathname !== "/api/public/listings/map" || request.method !== "GET") return null;
  const rows = (await env.DB.prepare("SELECT l.id, l.street, l.city, l.state, l.zip, g.address AS geo_address, g.lat, g.lng, g.updated_at AS geo_updated FROM listings l LEFT JOIN listing_geo g ON g.listing_id = l.id WHERE l.status = 'active' ORDER BY l.updated_at DESC LIMIT 200").all<Row>()).results;

  const now = Date.now();
  const stale = rows.filter((r) => r.geo_address !== geoAddress(r) || (r.lat === null && now - Date.parse(r.geo_updated || "") > RETRY_FAILED_MS)).slice(0, LOOKUPS_PER_REQUEST);
  await Promise.all(stale.map(async (r) => {
    const address = geoAddress(r);
    let point: [number, number] | null;
    try { point = await geocode(address, fetcher); } catch (err) { console.error("[geocode]", address, err instanceof Error ? err.message : err); return; }
    r.lat = point ? point[0] : null; r.lng = point ? point[1] : null;
    await env.DB.prepare("INSERT INTO listing_geo (listing_id, address, lat, lng, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(listing_id) DO UPDATE SET address = excluded.address, lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at")
      .bind(r.id, address, r.lat, r.lng, new Date().toISOString()).run();
    r.geo_address = address;
  }));

  return json(rows.filter((r) => r.lat !== null && r.lng !== null && r.geo_address === geoAddress(r)).map((r) => ({ id: r.id, lat: r.lat, lng: r.lng })));
}
