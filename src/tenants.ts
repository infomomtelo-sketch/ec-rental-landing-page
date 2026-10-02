/**
 * Tenant accounts: landlords invite a tenant to a property by email; the tenant sets a password
 * and gets a portal showing their home, lease, recorded rent payments and maintenance requests.
 * Tenants are users with role 'tenant' and can only reach /api/tenant/* (plus /api/me).
 */

export interface TenantsEnv { DB: D1Database; AUTH_LIMITER?: RateLimit; }
interface TenantUser { id: number; name: string; email: string; role: string; company: string; }

/** Helpers that live in index.ts, passed in to avoid a circular import. */
export interface TenantHelpers {
  generateToken(): string;
  generateSalt(): string;
  hashPassword(password: string, salt: string): Promise<string>;
  verifyPassword(password: string, salt: string, stored: string): Promise<boolean>;
  sha256Hex(value: string): Promise<string>;
  sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean>;
  allowAuthAttempt(request: Request, keys: string[]): Promise<boolean>;
  minPasswordLength: number;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 200): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
function escapeHtml(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }

/** Paths a signed-in tenant may use. Everything else under /api/ is landlord-only. */
export function tenantMayUse(path: string): boolean {
  return path.startsWith("/api/tenant/") || path === "/api/me" || path === "/api/me/password";
}

async function newInvite(h: TenantHelpers) {
  const token = h.generateToken();
  return { token, hash: await h.sha256Hex(token), expires: new Date(Date.now() + INVITE_TTL_MS).toISOString() };
}

async function emailInvite(h: TenantHelpers, url: URL, to: string, link: string, address: string, landlord: string): Promise<boolean> {
  return h.sendEmail(to, "Your tenant portal for " + address,
    "<p>Hi,</p><p>" + escapeHtml(landlord) + " invited you to the EC Rental tenant portal for <strong>" + escapeHtml(address) + "</strong>. There you can see your lease and rent payments and send maintenance requests.</p><p><a href=\"" + link + "\">Set up my account</a></p><p>This link works for 7 days.</p>",
    "Hi,\n\n" + landlord + " invited you to the EC Rental tenant portal for " + address + ". There you can see your lease and rent payments and send maintenance requests.\n\nSet up your account: " + link + "\n\nThis link works for 7 days.").catch(() => false);
}

/** Public: GET /api/tenant-invite?token=, POST /api/tenant-invite/accept */
export async function handlePublicTenantRoutes(request: Request, env: TenantsEnv, url: URL, h: TenantHelpers): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/tenant-invite")) return null;
  const findInvite = async (token: string) => {
    if (!token) return null;
    const row = await env.DB.prepare("SELECT t.id, t.email, t.status, t.invite_expires_at, p.address, p.city, u.name AS landlord_name, u.company AS landlord_company FROM tenancies t JOIN properties p ON t.property_id = p.id JOIN users u ON t.landlord_user_id = u.id WHERE t.invite_token_hash = ?").bind(await h.sha256Hex(token)).first<{ id: number; email: string; status: string; invite_expires_at: string; address: string; city: string; landlord_name: string; landlord_company: string }>();
    if (!row || row.status !== "invited" || new Date(row.invite_expires_at) < new Date()) return null;
    return row;
  };
  const expired = () => json({ error: "This invite link is invalid or has expired. Ask your landlord to send a new one." }, 400);

  if (url.pathname === "/api/tenant-invite" && request.method === "GET") {
    const invite = await findInvite(str(url.searchParams.get("token"), 100));
    if (!invite) return expired();
    const existing = await env.DB.prepare("SELECT role FROM users WHERE lower(email) = ?").bind(invite.email).first<{ role: string }>();
    return json({ email: invite.email, address: invite.address + (invite.city ? ", " + invite.city : ""), landlord: invite.landlord_company || invite.landlord_name, has_account: !!existing });
  }

  if (url.pathname === "/api/tenant-invite/accept" && request.method === "POST") {
    const body = await request.json() as { token?: string; name?: string; password?: string };
    if (!(await h.allowAuthAttempt(request, []))) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
    const invite = await findInvite(str(body.token, 100));
    if (!invite) return expired();
    const password = String(body.password || "");
    const now = new Date().toISOString();
    let account = await env.DB.prepare("SELECT id, name, company, email, role, password_hash, password_salt FROM users WHERE lower(email) = ?").bind(invite.email).first<TenantUser & { password_hash: string; password_salt: string }>();
    if (account) {
      if (account.role !== "tenant") return json({ error: "This email already has a landlord account. Ask your landlord to invite a different email for your tenant account." }, 409);
      if (!(await h.verifyPassword(password, account.password_salt, account.password_hash))) return json({ error: "That password doesn't match your existing account. Use Forgot password on the sign-in page if you need to reset it." }, 401);
    } else {
      const name = str(body.name, 100);
      if (!name) return json({ error: "Please enter your name." }, 400);
      if (password.length < h.minPasswordLength) return json({ error: "Password must be at least " + h.minPasswordLength + " characters" }, 400);
      const salt = h.generateSalt();
      const res = await env.DB.prepare("INSERT INTO users (name, company, email, password_hash, password_salt, plan, property_limit, role, created_at) VALUES (?, '', ?, ?, ?, 'tenant', 0, 'tenant', ?)").bind(name, invite.email, await h.hashPassword(password, salt), salt, now).run();
      account = { id: Number(res.meta.last_row_id), name, company: "", email: invite.email, role: "tenant", password_hash: "", password_salt: "" };
    }
    const session = h.generateToken();
    await env.DB.batch([
      env.DB.prepare("UPDATE tenancies SET status = 'active', tenant_user_id = ?, accepted_at = ?, invite_token_hash = NULL WHERE id = ?").bind(account.id, now, invite.id),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(session, account.id, new Date(Date.now() + SESSION_TTL_MS).toISOString(), now),
    ]);
    return json({ token: session, user: { id: account.id, name: account.name, email: account.email, role: "tenant" } });
  }
  return null;
}

/** Landlord routes under /api/tenancies. */
export async function handleTenancyRoutes(request: Request, env: TenantsEnv, url: URL, user: TenantUser, h: TenantHelpers): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/tenancies")) return null;
  const landlordName = user.company || user.name;

  if (path === "/api/tenancies" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT t.id, t.property_id, t.email, t.status, t.invite_expires_at, t.accepted_at, t.created_at, p.address, p.city, u.name AS tenant_name FROM tenancies t JOIN properties p ON t.property_id = p.id LEFT JOIN users u ON t.tenant_user_id = u.id WHERE t.landlord_user_id = ? AND t.status != 'ended' ORDER BY t.created_at DESC").bind(user.id).all();
    return json(rows.results);
  }

  if (path === "/api/tenancies" && request.method === "POST") {
    const body = await request.json() as { property_id?: unknown; email?: unknown };
    const email = str(body.email).toLowerCase();
    if (!isEmail(email)) return json({ error: "Please enter the tenant's email address." }, 400);
    const property = await env.DB.prepare("SELECT id, address, city FROM properties WHERE id = ? AND user_id = ?").bind(Number(body.property_id), user.id).first<{ id: number; address: string; city: string }>();
    if (!property) return json({ error: "Property not found" }, 404);
    const existing = await env.DB.prepare("SELECT id FROM tenancies WHERE property_id = ? AND email = ? AND status != 'ended'").bind(property.id, email).first();
    if (existing) return json({ error: "This tenant is already invited to this property. Use Resend to send a new link." }, 409);
    const owner = await env.DB.prepare("SELECT role FROM users WHERE lower(email) = ?").bind(email).first<{ role: string }>();
    if (owner && owner.role !== "tenant") return json({ error: "That email belongs to a landlord account. Use the tenant's own email." }, 409);
    const invite = await newInvite(h);
    const res = await env.DB.prepare("INSERT INTO tenancies (property_id, landlord_user_id, email, status, invite_token_hash, invite_expires_at, created_at) VALUES (?, ?, ?, 'invited', ?, ?, ?)").bind(property.id, user.id, email, invite.hash, invite.expires, new Date().toISOString()).run();
    const link = url.origin + "/tenant?invite=" + invite.token;
    const emailed = await emailInvite(h, url, email, link, property.address, landlordName);
    return json({ id: res.meta.last_row_id, invite_link: link, emailed });
  }

  const resend = path.match(/^\/api\/tenancies\/(\d+)\/resend$/);
  if (resend && request.method === "POST") {
    const t = await env.DB.prepare("SELECT t.id, t.email, t.status, p.address FROM tenancies t JOIN properties p ON t.property_id = p.id WHERE t.id = ? AND t.landlord_user_id = ?").bind(parseInt(resend[1]), user.id).first<{ id: number; email: string; status: string; address: string }>();
    if (!t) return json({ error: "Not found" }, 404);
    if (t.status !== "invited") return json({ error: "This tenant has already set up their account." }, 400);
    const invite = await newInvite(h);
    await env.DB.prepare("UPDATE tenancies SET invite_token_hash = ?, invite_expires_at = ? WHERE id = ?").bind(invite.hash, invite.expires, t.id).run();
    const link = url.origin + "/tenant?invite=" + invite.token;
    const emailed = await emailInvite(h, url, t.email, link, t.address, landlordName);
    return json({ invite_link: link, emailed });
  }

  const one = path.match(/^\/api\/tenancies\/(\d+)$/);
  if (one && request.method === "DELETE") {
    const res = await env.DB.prepare("UPDATE tenancies SET status = 'ended', invite_token_hash = NULL WHERE id = ? AND landlord_user_id = ?").bind(parseInt(one[1]), user.id).run();
    if (!res.meta.changes) return json({ error: "Not found" }, 404);
    return json({ success: true });
  }
  return json({ error: "Not found" }, 404);
}

/** Tenant portal routes under /api/tenant/. */
export async function handleTenantPortalRoutes(request: Request, env: TenantsEnv, url: URL, user: TenantUser, h: TenantHelpers): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/tenant/")) return null;
  if (user.role !== "tenant") return json({ error: "This is for tenant accounts." }, 403);

  type Home = { tenancy_id: number; property_id: number; accepted_at: string; address: string; city: string; state: string; zip: string; rent_amount: number; lease_start: string; lease_end: string; landlord_name: string; landlord_company: string; landlord_email: string; landlord_user_id: number };
  const homesSql = "SELECT t.id AS tenancy_id, t.property_id, t.accepted_at, t.landlord_user_id, p.address, p.city, p.state, p.zip, p.rent_amount, p.lease_start, p.lease_end, u.name AS landlord_name, u.company AS landlord_company, u.email AS landlord_email FROM tenancies t JOIN properties p ON t.property_id = p.id JOIN users u ON t.landlord_user_id = u.id WHERE t.tenant_user_id = ? AND t.status = 'active'";
  // Only show history from this tenant's time in the home, so earlier tenants' records stay private.
  const since = (home: Home) => { const joined = home.accepted_at.slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(home.lease_start) && home.lease_start < joined ? home.lease_start : joined; };

  if (path === "/api/tenant/home" && request.method === "GET") {
    const homes = (await env.DB.prepare(homesSql + " ORDER BY t.accepted_at DESC").bind(user.id).all<Home>()).results;
    const out = [];
    for (const home of homes) {
      const from = since(home);
      const payments = await env.DB.prepare("SELECT date, amount, description FROM transactions WHERE property_id = ? AND type = 'rent' AND date >= ? ORDER BY date DESC LIMIT 24").bind(home.property_id, from).all();
      const requests = await env.DB.prepare("SELECT id, description, priority, status, created_at FROM maintenance_requests WHERE property_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 50").bind(home.property_id, home.accepted_at).all();
      out.push({ tenancy_id: home.tenancy_id, address: home.address, city: home.city, state: home.state, zip: home.zip, rent: home.rent_amount, lease_start: home.lease_start, lease_end: home.lease_end, landlord: { name: home.landlord_company || home.landlord_name, email: home.landlord_email }, payments: payments.results, requests: requests.results });
    }
    return json({ user: { name: user.name, email: user.email }, homes: out });
  }

  if (path === "/api/tenant/maintenance" && request.method === "POST") {
    const body = await request.json() as { tenancy_id?: unknown; description?: unknown; priority?: unknown };
    const description = str(body.description, 2000);
    if (description.length < 5) return json({ error: "Please describe the problem." }, 400);
    const priority = ["low", "normal", "high", "urgent"].includes(String(body.priority)) ? String(body.priority) : "normal";
    const home = await env.DB.prepare(homesSql + " AND t.id = ?").bind(user.id, Number(body.tenancy_id)).first<Home>();
    if (!home) return json({ error: "Home not found" }, 404);
    await env.DB.prepare("INSERT INTO maintenance_requests (property_id, tenant_name, description, priority, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)").bind(home.property_id, user.name, description, priority, new Date().toISOString()).run();
    await h.sendEmail(home.landlord_email, "Maintenance request: " + home.address,
      "<p>" + escapeHtml(user.name) + " sent a " + priority + " priority maintenance request for <strong>" + escapeHtml(home.address) + "</strong>:</p><blockquote>" + escapeHtml(description) + "</blockquote><p><a href=\"" + url.origin + "/dashboard\">Open your dashboard</a></p>",
      user.name + " sent a " + priority + " priority maintenance request for " + home.address + ":\n\n" + description + "\n\n" + url.origin + "/dashboard").catch(() => false);
    return json({ success: true });
  }
  return json({ error: "Not found" }, 404);
}
