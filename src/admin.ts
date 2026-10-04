/**
 * Site owner admin: totals and lists across every account, for the /admin page.
 * Admins are users with role 'admin', or whose email is in the ADMIN_EMAILS secret (comma-separated).
 */

export interface AdminEnv { DB: D1Database; ADMIN_EMAILS?: string; }
interface AdminUser { id: number; email: string; role: string; }

const PLAN_LIMITS: Record<string, number> = { solo: 5, manager: 25, portfolio: 999999 };
const PLAN_PRICES: Record<string, number> = { solo: 29, manager: 79, portfolio: 199 };
const LEAD_TYPES = "('tenant_application', 'maintenance_request', 'rent_review')";

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

/** True when the account may use the admin page. Tenants never qualify. */
export function isAdmin(env: AdminEnv, user: AdminUser | null): boolean {
  if (!user || user.role === "tenant") return false;
  if (user.role === "admin") return true;
  const emails = (env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return emails.includes(String(user.email).toLowerCase());
}

async function count(env: AdminEnv, sql: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n || 0;
}

/** Handles /api/admin/*. Returns null for other paths. The caller has already checked isAdmin. */
export async function handleAdminRoutes(request: Request, env: AdminEnv, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/admin/")) return null;

  if (url.pathname === "/api/admin/overview" && request.method === "GET") {
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const plans = await env.DB.prepare("SELECT plan, COUNT(*) AS n FROM users WHERE role != 'tenant' GROUP BY plan").all<{ plan: string; n: number }>();
    const byPlan: Record<string, number> = { solo: 0, manager: 0, portfolio: 0 };
    for (const p of plans.results) byPlan[p.plan] = (byPlan[p.plan] || 0) + p.n;
    const planValue = Object.keys(PLAN_PRICES).reduce((sum, p) => sum + (byPlan[p] || 0) * PLAN_PRICES[p], 0);
    return json({
      landlords: await count(env, "SELECT COUNT(*) AS n FROM users WHERE role != 'tenant'"),
      tenants: await count(env, "SELECT COUNT(*) AS n FROM users WHERE role = 'tenant'"),
      newAccounts7: await count(env, "SELECT COUNT(*) AS n FROM users WHERE role != 'tenant' AND created_at >= ?", since7),
      newAccounts30: await count(env, "SELECT COUNT(*) AS n FROM users WHERE role != 'tenant' AND created_at >= ?", since30),
      byPlan, planValue,
      properties: await count(env, "SELECT COUNT(*) AS n FROM properties"),
      listings: await count(env, "SELECT COUNT(*) AS n FROM listings"),
      activeListings: await count(env, "SELECT COUNT(*) AS n FROM listings WHERE status = 'active'"),
      applications: await count(env, "SELECT COUNT(*) AS n FROM applications"),
      newApplications: await count(env, "SELECT COUNT(*) AS n FROM applications WHERE status = 'new'"),
      leads: await count(env, "SELECT COUNT(*) AS n FROM signups WHERE plan IN " + LEAD_TYPES),
      newLeads: await count(env, "SELECT COUNT(*) AS n FROM signups WHERE plan IN " + LEAD_TYPES + " AND status = 'pending'"),
      openMaintenance: await count(env, "SELECT COUNT(*) AS n FROM maintenance_requests WHERE status = 'open'"),
    });
  }

  // Landlord accounts, with the phone and unit count from their sign-up form when there is one.
  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT u.id, u.name, u.company, u.email, u.plan, u.property_limit, u.role, u.created_at," +
      " (SELECT COUNT(*) FROM properties p WHERE p.user_id = u.id) AS properties," +
      " (SELECT COUNT(*) FROM listings l WHERE l.user_id = u.id) AS listings," +
      " (SELECT s.phone FROM signups s WHERE lower(s.email) = lower(u.email) AND s.plan NOT IN " + LEAD_TYPES + " ORDER BY s.created_at DESC LIMIT 1) AS phone," +
      " (SELECT s.property_count FROM signups s WHERE lower(s.email) = lower(u.email) AND s.plan NOT IN " + LEAD_TYPES + " ORDER BY s.created_at DESC LIMIT 1) AS unit_count" +
      " FROM users u WHERE u.role != 'tenant' ORDER BY u.created_at DESC LIMIT 1000").all<AdminUser>();
    return json(rows.results.map((u) => ({ ...u, role: isAdmin(env, u) ? "admin" : u.role })));
  }

  const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && request.method === "PUT") {
    const body = await request.json() as { plan?: string };
    if (!body.plan || !(body.plan in PLAN_LIMITS)) return json({ error: "Plan must be one of: " + Object.keys(PLAN_LIMITS).join(", ") }, 400);
    const res = await env.DB.prepare("UPDATE users SET plan = ?, property_limit = ? WHERE id = ? AND role != 'tenant'").bind(body.plan, PLAN_LIMITS[body.plan], parseInt(userMatch[1])).run();
    if (!res.meta.changes) return json({ error: "Account not found" }, 404);
    return json({ success: true });
  }

  if (url.pathname === "/api/admin/listings" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT l.id, l.street, l.unit, l.city, l.rent, l.bedrooms, l.status, l.syndicate_zillow, l.created_at, u.name AS owner_name, u.email AS owner_email," +
      " (SELECT COUNT(*) FROM applications a WHERE a.listing_id = l.id) AS applications" +
      " FROM listings l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 1000").all();
    return json(rows.results);
  }

  return json({ error: "Not found" }, 404);
}
