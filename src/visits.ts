/**
 * First-party visitor counts for the admin page. No cookies and no third-party scripts: each public page sends one
 * small beacon (public/js/track.js) and the Worker adds 1 to a per-day row for that page, traffic source and device.
 * A "visitor" is the first page view a browser sends that day (the browser remembers the day in localStorage).
 */

interface VisitsEnv { DB: D1Database; }

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python|node-fetch/i;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex)\./;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t|twitter|x|linkedin|lnkd|tiktok|reddit|youtube|pinterest|nextdoor)\.(com|co|me|in)$/;

/** Where the visit came from, in words the owner reads: "Google", "Facebook", "Direct or typed in", "zillow.com"... */
export function sourceOf(referrer: string, utm: string, ownHost: string): string {
  const u = utm.trim().toLowerCase().replace(/[^a-z0-9 ._-]/g, "").slice(0, 40);
  if (u) return u.replace(/^./, (c) => c.toUpperCase());
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase().replace(/^www\.|^m\.|^l\.|^lm\./, ""); } catch { return "Direct or typed in"; }
  if (!host || host === ownHost.replace(/^www\./, "") || host.endsWith(".workers.dev")) return "Direct or typed in";
  if (SEARCH.test(host)) return host.split(".")[0].replace(/^./, (c) => c.toUpperCase()) + " search";
  if (SOCIAL.test(host)) return ({ fb: "Facebook", t: "X (Twitter)", x: "X (Twitter)", twitter: "X (Twitter)", lnkd: "LinkedIn" } as Record<string, string>)[host.split(".")[0]] || host.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  return host.slice(0, 60);
}

export async function handleVisits(request: Request, env: VisitsEnv, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/public/pv" || request.method !== "POST") return null;
  const ua = request.headers.get("User-Agent") || "";
  if (!ua || BOT.test(ua)) return new Response(null, { status: 204 });
  let body: { p?: unknown; r?: unknown; u?: unknown; n?: unknown };
  try { body = await request.json(); } catch { return new Response(null, { status: 204 }); }
  const path = typeof body.p === "string" ? body.p.split("?")[0].split("#")[0].slice(0, 100) : "";
  if (!path.startsWith("/") || path.startsWith("/api/") || path.startsWith("/admin")) return new Response(null, { status: 204 });
  const source = sourceOf(typeof body.r === "string" ? body.r : "", typeof body.u === "string" ? body.u : "", url.hostname);
  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "phone" : "computer";
  const day = new Date().toISOString().slice(0, 10);
  const visitor = body.n === 1 || body.n === true ? 1 : 0;
  try {
    await env.DB.prepare("INSERT INTO page_views (day, path, source, device, views, visitors) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT (day, path, source, device) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors")
      .bind(day, path, source, device, visitor).run();
  } catch { /* counting must never break a page */ }
  return new Response(null, { status: 204 });
}

/** /api/admin/visits: totals, a day-by-day series and the top pages and sources for the last `days` days. */
export async function visitsReport(env: VisitsEnv, days: number): Promise<Response> {
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const since7 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const sinceIso = since + "T00:00:00.000Z";
  const q = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<Record<string, number | string>>().then((r) => r.results);
  const [totals, week, daily, pages, sources, devices, signups, applications, aiChecks, rentReviews] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(views),0) AS views, COALESCE(SUM(visitors),0) AS visitors FROM page_views WHERE day >= ?").bind(since).first<{ views: number; visitors: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(views),0) AS views, COALESCE(SUM(visitors),0) AS visitors FROM page_views WHERE day >= ?").bind(since7).first<{ views: number; visitors: number }>(),
    q("SELECT day, SUM(views) AS views, SUM(visitors) AS visitors FROM page_views WHERE day >= ? GROUP BY day ORDER BY day", since),
    q("SELECT path, SUM(views) AS views, SUM(visitors) AS visitors FROM page_views WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 15", since),
    q("SELECT source, SUM(visitors) AS visitors, SUM(views) AS views FROM page_views WHERE day >= ? GROUP BY source ORDER BY visitors DESC, views DESC LIMIT 15", since),
    q("SELECT device, SUM(visitors) AS visitors FROM page_views WHERE day >= ? GROUP BY device", since),
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role != 'tenant' AND created_at >= ?").bind(sinceIso).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM applications WHERE created_at >= ?").bind(sinceIso).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM signups WHERE plan = 'ai_inspection' AND created_at >= ?").bind(sinceIso).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM signups WHERE plan = 'rent_review' AND created_at >= ?").bind(sinceIso).first<{ n: number }>(),
  ]);
  return json({
    days, views: totals?.views || 0, visitors: totals?.visitors || 0, views7: week?.views || 0, visitors7: week?.visitors || 0,
    daily, pages, sources, devices,
    results: { accounts: signups?.n || 0, applications: applications?.n || 0, aiChecks: aiChecks?.n || 0, rentReviews: rentReviews?.n || 0 },
  });
}
