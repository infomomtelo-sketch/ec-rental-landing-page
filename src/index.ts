/**
 * EC Rental Property Management LLC — Worker
 * Powered by Thelo AI (branded), running on Cloudflare Workers AI.
 */
interface ChatRequest { message: string; history?: { role: "user" | "assistant"; content: string }[]; }
interface SubscribeRequest { name: string; company?: string; email: string; phone: string; propertyCount: string; plan: string; password: string; message?: string; }
interface LoginRequest { email: string; password: string; }

const SYSTEM_PROMPT = `You are the EC Rental Property Management LLC assistant in Fresno, California. You are "Powered by Thelo AI."
Company info:
- Locally owned property management in Fresno, CA serving the Central Valley including Clovis.
- Services: tenant placement & screening, 24/7 maintenance, rent collection, lease management, financial/tax reporting, AI home inspections.
- Pricing: Solo $29/mo (1-5 units), Manager $79/mo (25 units), Portfolio $199/mo (unlimited).
- Contact: info@ecrentalpm.com, (559) 825-3038.
- AI Home Inspections: upload photos of each area, Thelo AI analyzes condition, identifies needed repairs, and provides recommendations.
Rules:
- Be friendly but VERY concise. Max 2-3 sentences per response.
- Never use more than 40 words unless absolutely necessary.
- Only answer about EC Rental, property management, or Fresno rentals.
- Don't make up URLs, buttons, or features that don't exist on the site.
Special actions — include these tags in your response to trigger UI elements:
- If asked about applying as tenant, renting, available properties, or becoming a renter: include [SHOW_TENANT_FORM] in your response.
- If asked about pricing, cost, plans, or subscription: include [SHOW_PRICING] in your response.
- If asked about services or what you offer: include [SHOW_SERVICES] in your response.
- If asked about tax reporting, statements, or financial reports: include [SHOW_TAX_INFO] in your response.
- If asked about maintenance or repairs: include [SHOW_MAINTENANCE] in your response.
Always give a real answer first, then include the tag. Never just say "contact us" — always provide the actual information or a form.`;

import { handleListingRoutes, handlePublicListingRoutes } from "./listings";
import { handleApplicationRoutes, handlePublicApplicationRoutes } from "./applications";

const PLAN_LIMITS: Record<string, number> = { solo: 5, manager: 25, portfolio: 999999 };

function corsHeaders(): Record<string, string> { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" }; }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders() } }); }
function toHex(bytes: Uint8Array): string { return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function generateToken(): string { const arr = new Uint8Array(32); crypto.getRandomValues(arr); return toHex(arr); }
// New hashes are PBKDF2 and prefixed "pbkdf2$"; unprefixed hashes are legacy single-pass SHA-256 and get upgraded on login.
async function hashPassword(password: string, salt: string): Promise<string> { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256); return "pbkdf2$" + toHex(new Uint8Array(bits)); }
async function legacyHashPassword(password: string, salt: string): Promise<string> { const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password + salt)); return toHex(new Uint8Array(hash)); }
async function verifyPassword(password: string, salt: string, stored: string): Promise<boolean> { const hash = stored.startsWith("pbkdf2$") ? await hashPassword(password, salt) : await legacyHashPassword(password, salt); return timingSafeEqual(hash, stored); }
function timingSafeEqual(a: string, b: string): boolean { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function generateSalt(): string { const arr = new Uint8Array(16); crypto.getRandomValues(arr); return toHex(arr); }
const MIN_PASSWORD_LENGTH = 8;
function normalizeEmail(email: string): string { return String(email).trim().toLowerCase(); }
// Logs the real error (visible in `wrangler tail`) and gives the visitor a message that says what to do.
function dbErrorResponse(route: string, err: unknown): Response { const msg = err instanceof Error ? err.message : String(err); console.error(`[${route}]`, msg); if (/no such table/i.test(msg)) return json({ success: false, error: "Sign up isn't available yet: the site's database hasn't been set up. Please try again later or contact us." }, 503); if (/UNIQUE constraint failed: users\.email/i.test(msg)) return json({ success: false, error: "An account with this email already exists." }, 409); return json({ success: false, error: "Something went wrong. Please try again or contact us." }, 500); }
async function ownsProperty(env: Env, userId: number, propertyId: unknown): Promise<boolean> { const id = Number(propertyId); if (!Number.isInteger(id)) return false; const row = await env.DB.prepare("SELECT id FROM properties WHERE id = ? AND user_id = ?").bind(id, userId).first(); return !!row; }
const LEAD_STATUSES = ["pending", "contacted", "closed"];
function parseLeadDetails(message: string): Record<string, unknown> { try { const parsed = JSON.parse(message || "{}"); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; } }
function dataUrlToBytes(dataUrl: string): number[] { const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl; const bin = atob(base64); const out = new Array<number>(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function sha256Hex(value: string): Promise<string> { return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
function clientIp(request: Request): string { return request.headers.get("CF-Connecting-IP") || "unknown"; }
// Returns true when every key is under its limit. A missing binding (e.g. older local setups) never blocks.
async function underLimit(limiter: RateLimit | undefined, keys: string[]): Promise<boolean> { if (!limiter) return true; for (const key of keys) { const { success } = await limiter.limit({ key }); if (!success) return false; } return true; }
const tooManyRequests = () => json({ error: "Too many requests. Please wait a minute and try again." }, 429);
function escapeHtml(str: string): string { return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
async function sendEmail(env: Env, to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) { console.warn("RESEND_API_KEY not set; email to " + to + " not sent"); return false; }
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text }) });
  if (!res.ok) console.error("Resend " + res.status + ": " + (await res.text()));
  return res.ok;
}
async function getUserFromRequest(request: Request, env: Env): Promise<User | null> { const auth = request.headers.get("Authorization"); if (!auth || !auth.startsWith("Bearer ")) return null; const token = auth.slice(7); const session = await env.DB.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").bind(token).first<{ user_id: number; expires_at: string }>(); if (!session) return null; if (new Date(session.expires_at) < new Date()) return null; const user = await env.DB.prepare("SELECT id, name, company, email, plan, property_limit, role FROM users WHERE id = ?").bind(session.user_id).first<User>(); return user || null; }
interface User { id: number; name: string; company: string; email: string; plan: string; property_limit: number; role: string; }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") { return new Response(null, { headers: corsHeaders() }); }

    // Chat API
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        if (!(await underLimit(env.CHAT_LIMITER, ["ip:" + clientIp(request)]))) return tooManyRequests();
        const body = await request.json() as ChatRequest;
        const userMessage = body.message?.trim().slice(0, 2000);
        if (!userMessage) return json({ error: "Message is required" }, 400);
        const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...(Array.isArray(body.history) ? body.history : []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })), { role: "user", content: userMessage }];
        const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", { messages });
        return json({ response: (aiResponse as { response?: string }).response || "I'm sorry, I couldn't generate a response right now." });
      } catch { return json({ error: "Something went wrong." }, 500); }
    }

    // Tenant Application API (from chat)
    if (url.pathname === "/api/tenant-application" && request.method === "POST") {
      try {
        if (!(await underLimit(env.CHAT_LIMITER, ["ip:" + clientIp(request)]))) return tooManyRequests();
        const body = await request.json() as Record<string, unknown>;
        if (!body.name || !body.email || !body.phone) return json({ success: false, error: "Name, email, and phone required" }, 400);
        await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(body.name, "", body.email, body.phone, "tenant", "tenant_application", JSON.stringify({ area: body.area, bedrooms: body.bedrooms, budget: body.budget, moveIn: body.moveIn }), "pending", new Date().toISOString()).run();
        return json({ success: true });
      } catch { return json({ success: false, error: "Something went wrong." }, 500); }
    }

    // Maintenance Request API (from chat)
    if (url.pathname === "/api/maintenance-request" && request.method === "POST") {
      try {
        if (!(await underLimit(env.CHAT_LIMITER, ["ip:" + clientIp(request)]))) return tooManyRequests();
        const body = await request.json() as Record<string, unknown>;
        if (!body.name || !body.address || !body.description) return json({ success: false, error: "Name, address, and description required" }, 400);
        await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(body.name, "", "", "", "maintenance", "maintenance_request", JSON.stringify({ address: body.address, description: body.description, priority: body.priority }), "pending", new Date().toISOString()).run();
        return json({ success: true });
      } catch { return json({ success: false, error: "Something went wrong." }, 500); }
    }

    // Subscribe API
    if (url.pathname === "/api/subscribe" && request.method === "POST") {
      try {
        if (!(await underLimit(env.AUTH_LIMITER, ["ip:" + clientIp(request)]))) return tooManyRequests();
        const body = await request.json() as SubscribeRequest;
        if (!body.name || !body.email || !body.phone || !body.propertyCount || !body.plan || !body.password) return json({ success: false, error: "Please fill in all required fields." }, 400);
        if (body.password.length < MIN_PASSWORD_LENGTH) return json({ success: false, error: "Password must be at least " + MIN_PASSWORD_LENGTH + " characters" }, 400);
        if (!(body.plan in PLAN_LIMITS)) return json({ success: false, error: "Please choose a plan." }, 400);
        const email = normalizeEmail(body.email);
        const existing = await env.DB.prepare("SELECT id FROM users WHERE lower(email) = ?").bind(email).first();
        if (existing) return json({ success: false, error: "An account with this email already exists." }, 409);
        const planNames: Record<string, string> = { solo: "Solo Landlord ($29/mo)", manager: "Property Manager ($79/mo)", portfolio: "Portfolio ($199/mo)" };
        const salt = generateSalt(); const passwordHash = await hashPassword(body.password, salt); const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO users (name, company, email, password_hash, password_salt, plan, property_limit, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(body.name, body.company || "", email, passwordHash, salt, body.plan, PLAN_LIMITS[body.plan], "landlord", now),
          env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(body.name, body.company || "", email, body.phone, body.propertyCount, planNames[body.plan], body.message || "", now),
        ]);
        return json({ success: true, message: "Account created" });
      } catch (err) { return dbErrorResponse("subscribe", err); }
    }

    // Login API
    if (url.pathname === "/api/login" && request.method === "POST") {
      try {
        const body = await request.json() as LoginRequest;
        if (!body.email || !body.password) return json({ error: "Email and password required" }, 400);
        if (!(await underLimit(env.AUTH_LIMITER, ["ip:" + clientIp(request), "email:" + body.email.toLowerCase()]))) return tooManyRequests();
        const user = await env.DB.prepare("SELECT id, name, company, email, plan, property_limit, role, password_hash, password_salt FROM users WHERE lower(email) = ?").bind(normalizeEmail(body.email)).first<User & { password_hash: string; password_salt: string }>();
        if (!user) return json({ error: "Invalid email or password" }, 401);
        if (!(await verifyPassword(body.password, user.password_salt, user.password_hash))) return json({ error: "Invalid email or password" }, 401);
        if (!user.password_hash.startsWith("pbkdf2$")) { const salt = generateSalt(); await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(await hashPassword(body.password, salt), salt, user.id).run(); }
        const token = generateToken(); const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(token, user.id, expires, new Date().toISOString()).run();
        const { password_hash, password_salt, ...userWithoutPw } = user;
        return json({ token, user: userWithoutPw });
      } catch (err) { return dbErrorResponse("login", err); }
    }

    // Password reset: request a link by email
    if (url.pathname === "/api/password-reset/request" && request.method === "POST") {
      try {
        const body = await request.json() as { email?: string };
        if (!body.email) return json({ error: "Email required" }, 400);
        if (!(await underLimit(env.AUTH_LIMITER, ["ip:" + clientIp(request), "email:" + body.email.toLowerCase()]))) return tooManyRequests();
        const account = await env.DB.prepare("SELECT id, name, email FROM users WHERE lower(email) = ?").bind(normalizeEmail(body.email)).first<{ id: number; name: string; email: string }>();
        if (account) {
          const token = generateToken(); const now = new Date();
          await env.DB.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await sha256Hex(token), account.id, new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString(), now.toISOString()).run();
          const link = url.origin + "/dashboard?reset=" + token;
          await sendEmail(env, account.email, "Reset your EC Rental password",
            "<p>Hi " + escapeHtml(account.name) + ",</p><p>Someone asked to reset the password for your EC Rental account. This link works for one hour:</p><p><a href=\"" + link + "\">Reset my password</a></p><p>If you didn't ask for this, you can ignore this email.</p>",
            "Hi " + account.name + ",\n\nSomeone asked to reset the password for your EC Rental account. This link works for one hour:\n" + link + "\n\nIf you didn't ask for this, you can ignore this email.");
        }
        // Same answer whether or not the account exists, so this can't be used to discover emails.
        return json({ success: true });
      } catch { return json({ error: "Something went wrong." }, 500); }
    }

    // Password reset: set a new password with the emailed token
    if (url.pathname === "/api/password-reset/confirm" && request.method === "POST") {
      try {
        const body = await request.json() as { token?: string; new_password?: string };
        if (!body.token || !body.new_password) return json({ error: "Token and new password required" }, 400);
        if (!(await underLimit(env.AUTH_LIMITER, ["ip:" + clientIp(request)]))) return tooManyRequests();
        if (body.new_password.length < MIN_PASSWORD_LENGTH) return json({ error: "Password must be at least " + MIN_PASSWORD_LENGTH + " characters" }, 400);
        const tokenHash = await sha256Hex(body.token);
        const reset = await env.DB.prepare("SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?").bind(tokenHash).first<{ user_id: number; expires_at: string; used_at: string | null }>();
        if (!reset || reset.used_at || new Date(reset.expires_at) < new Date()) return json({ error: "This reset link is invalid or has expired. Please request a new one." }, 400);
        const salt = generateSalt();
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(await hashPassword(body.new_password, salt), salt, reset.user_id),
          env.DB.prepare("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL").bind(new Date().toISOString(), reset.user_id),
          env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(reset.user_id),
        ]);
        return json({ success: true });
      } catch { return json({ error: "Something went wrong." }, 500); }
    }

    // Public listings, listing photos and the Zillow feed
    try { const publicRes = await handlePublicListingRoutes(request, env, url); if (publicRes) return publicRes; } catch (err) { return dbErrorResponse("public-listings", err); }
    try { const applyRes = await handlePublicApplicationRoutes(request, env, url); if (applyRes) return applyRes; } catch (err) { return dbErrorResponse("apply", err); }

    const user = await getUserFromRequest(request, env);
    if (!user && url.pathname.startsWith("/api/") && url.pathname !== "/api/chat" && url.pathname !== "/api/subscribe" && url.pathname !== "/api/login" && url.pathname !== "/api/tenant-application" && url.pathname !== "/api/maintenance-request" && !url.pathname.startsWith("/api/password-reset/")) return json({ error: "Unauthorized" }, 401);

    // Me API
    if (user && url.pathname.startsWith("/api/applications")) { try { const res = await handleApplicationRoutes(request, env, url, user); if (res) return res; } catch (err) { return dbErrorResponse("applications", err); } }
    if (user && url.pathname.startsWith("/api/listings")) { try { const res = await handleListingRoutes(request, env, url, user); if (res) return res; } catch (err) { return dbErrorResponse("listings", err); } }

    if (url.pathname === "/api/me" && request.method === "GET") return json({ user });
    if (url.pathname === "/api/me" && request.method === "PUT") { try { const body = await request.json() as { name?: string; company?: string }; await env.DB.prepare("UPDATE users SET name = ?, company = ? WHERE id = ?").bind(body.name || user!.name, body.company || user!.company, user!.id).run(); const updated = await env.DB.prepare("SELECT id, name, company, email, plan, property_limit, role FROM users WHERE id = ?").bind(user!.id).first<User>(); return json({ user: updated }); } catch { return json({ error: "Update failed" }, 500); } }

    if (url.pathname === "/api/me/password" && request.method === "PUT") {
      try {
        const body = await request.json() as { current_password?: string; new_password?: string };
        if (!body.current_password || !body.new_password) return json({ error: "Current and new password required" }, 400);
        if (body.new_password.length < MIN_PASSWORD_LENGTH) return json({ error: "New password must be at least " + MIN_PASSWORD_LENGTH + " characters" }, 400);
        const creds = await env.DB.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").bind(user!.id).first<{ password_hash: string; password_salt: string }>();
        // 403 rather than 401 so the dashboard doesn't treat a wrong password as an expired session.
        if (!creds || !(await verifyPassword(body.current_password, creds.password_salt, creds.password_hash))) return json({ error: "Current password is incorrect" }, 403);
        const salt = generateSalt();
        await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(await hashPassword(body.new_password, salt), salt, user!.id).run();
        // Sign out every other session for this account.
        const token = request.headers.get("Authorization")!.slice(7);
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").bind(user!.id, token).run();
        return json({ success: true });
      } catch { return json({ error: "Password change failed" }, 500); }
    }

    // Properties API
    if (url.pathname === "/api/properties" && request.method === "GET") { const results = await env.DB.prepare("SELECT * FROM properties WHERE user_id = ? ORDER BY created_at DESC").bind(user!.id).all(); return json(results.results); }
    if (url.pathname === "/api/properties" && request.method === "POST") { try { const body = await request.json() as Record<string, unknown>; const count = await env.DB.prepare("SELECT COUNT(*) as count FROM properties WHERE user_id = ?").bind(user!.id).first<{ count: number }>(); if (count && count.count >= user!.property_limit) return json({ error: "Property limit reached for your plan. Upgrade to add more." }, 403); const result = await env.DB.prepare("INSERT INTO properties (user_id, address, city, state, zip, rent_amount, tenant_name, tenant_email, tenant_phone, lease_start, lease_end, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(user!.id, body.address, body.city || "", body.state || "CA", body.zip || "", body.rent_amount || 0, body.tenant_name || "", body.tenant_email || "", body.tenant_phone || "", body.lease_start || "", body.lease_end || "", body.status || "vacant", body.notes || "", new Date().toISOString()).run(); return json({ success: true, id: result.meta.last_row_id }); } catch { return json({ error: "Failed to create property" }, 500); } }
    const propMatch = url.pathname.match(/^\/api\/properties\/(\d+)$/);
    if (propMatch) { const propId = parseInt(propMatch[1]); if (request.method === "GET") { const prop = await env.DB.prepare("SELECT * FROM properties WHERE id = ? AND user_id = ?").bind(propId, user!.id).first(); return prop ? json(prop) : json({ error: "Not found" }, 404); } if (request.method === "PUT") { try { const body = await request.json() as Record<string, unknown>; await env.DB.prepare("UPDATE properties SET address = ?, city = ?, state = ?, zip = ?, rent_amount = ?, tenant_name = ?, tenant_email = ?, tenant_phone = ?, lease_start = ?, lease_end = ?, status = ?, notes = ? WHERE id = ? AND user_id = ?").bind(body.address, body.city || "", body.state || "CA", body.zip || "", body.rent_amount || 0, body.tenant_name || "", body.tenant_email || "", body.tenant_phone || "", body.lease_start || "", body.lease_end || "", body.status || "vacant", body.notes || "", propId, user!.id).run(); return json({ success: true }); } catch { return json({ error: "Update failed" }, 500); } } if (request.method === "DELETE") { if (!(await ownsProperty(env, user!.id, propId))) return json({ error: "Not found" }, 404); await env.DB.batch([env.DB.prepare("DELETE FROM transactions WHERE property_id = ?").bind(propId), env.DB.prepare("DELETE FROM maintenance_requests WHERE property_id = ?").bind(propId), env.DB.prepare("DELETE FROM inspection_photos WHERE inspection_id IN (SELECT id FROM inspections WHERE property_id = ?)").bind(propId), env.DB.prepare("DELETE FROM inspections WHERE property_id = ?").bind(propId), env.DB.prepare("DELETE FROM properties WHERE id = ? AND user_id = ?").bind(propId, user!.id)]); return json({ success: true }); } }

    // Transactions API
    if (url.pathname === "/api/transactions" && request.method === "GET") { const results = await env.DB.prepare("SELECT t.*, p.address as property_address FROM transactions t JOIN properties p ON t.property_id = p.id WHERE p.user_id = ? ORDER BY t.date DESC").bind(user!.id).all(); return json(results.results); }
    if (url.pathname === "/api/transactions" && request.method === "POST") { try { const body = await request.json() as Record<string, unknown>; if (!(await ownsProperty(env, user!.id, body.property_id))) return json({ error: "Property not found" }, 404); await env.DB.prepare("INSERT INTO transactions (property_id, type, amount, description, date, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(body.property_id, body.type, body.amount, body.description || "", body.date, new Date().toISOString()).run(); return json({ success: true }); } catch { return json({ error: "Failed to create transaction" }, 500); } }

    // Maintenance API
    if (url.pathname === "/api/maintenance" && request.method === "GET") { const results = await env.DB.prepare("SELECT m.*, p.address as property_address FROM maintenance_requests m JOIN properties p ON m.property_id = p.id WHERE p.user_id = ? ORDER BY m.created_at DESC").bind(user!.id).all(); return json(results.results); }
    if (url.pathname === "/api/maintenance" && request.method === "POST") { try { const body = await request.json() as Record<string, unknown>; if (!(await ownsProperty(env, user!.id, body.property_id))) return json({ error: "Property not found" }, 404); await env.DB.prepare("INSERT INTO maintenance_requests (property_id, tenant_name, description, priority, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)").bind(body.property_id, body.tenant_name || "", body.description, body.priority || "normal", new Date().toISOString()).run(); return json({ success: true }); } catch { return json({ error: "Failed to create request" }, 500); } }
    const maintMatch = url.pathname.match(/^\/api\/maintenance\/(\d+)$/);
    if (maintMatch && request.method === "PUT") { const maintId = parseInt(maintMatch[1]); try { const body = await request.json() as { status?: string }; await env.DB.prepare("UPDATE maintenance_requests SET status = ? WHERE id = ? AND property_id IN (SELECT id FROM properties WHERE user_id = ?)").bind(body.status || "resolved", maintId, user!.id).run(); return json({ success: true }); } catch { return json({ error: "Update failed" }, 500); } }

    // Reports API
    if (url.pathname === "/api/reports" && request.method === "GET") { const properties = await env.DB.prepare("SELECT id, address FROM properties WHERE user_id = ?").bind(user!.id).all<{ id: number; address: string }>(); const reports = []; for (const prop of properties.results) { const rentResult = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE property_id = ? AND type = 'rent'").bind(prop.id).first<{ total: number }>(); const expenseResult = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE property_id = ? AND type = 'expense'").bind(prop.id).first<{ total: number }>(); const feeResult = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE property_id = ? AND type = 'fee'").bind(prop.id).first<{ total: number }>(); const rent = rentResult?.total || 0; const expenses = expenseResult?.total || 0; const fees = feeResult?.total || 0; reports.push({ address: prop.address, rent_collected: rent, expenses: expenses, mgmt_fee: fees, paid_to_owner: rent - expenses - fees }); } return json(reports); }

    // Dashboard Overview API
    if (url.pathname === "/api/dashboard/overview" && request.method === "GET") { const props = await env.DB.prepare("SELECT * FROM properties WHERE user_id = ? ORDER BY created_at DESC LIMIT 5").bind(user!.id).all(); const count = await env.DB.prepare("SELECT COUNT(*) as count FROM properties WHERE user_id = ?").bind(user!.id).first<{ count: number }>(); const occupied = await env.DB.prepare("SELECT COUNT(*) as count FROM properties WHERE user_id = ? AND status = 'occupied'").bind(user!.id).first<{ count: number }>(); const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString(); const rentResult = await env.DB.prepare("SELECT COALESCE(SUM(t.amount), 0) as total FROM transactions t JOIN properties p ON t.property_id = p.id WHERE p.user_id = ? AND t.type = 'rent' AND t.date >= ?").bind(user!.id, monthStart).first<{ total: number }>(); const maintResult = await env.DB.prepare("SELECT COUNT(*) as count FROM maintenance_requests m JOIN properties p ON m.property_id = p.id WHERE p.user_id = ? AND m.status = 'open'").bind(user!.id).first<{ count: number }>(); return json({ totalProperties: count?.count || 0, propertyLimit: user!.property_limit, occupied: occupied?.count || 0, vacant: (count?.count || 0) - (occupied?.count || 0), monthlyRent: rentResult?.total || 0, openMaintenance: maintResult?.count || 0, properties: props.results }); }

    // Chat Leads API (admin only): tenant applications and maintenance requests sent through the website chat.
    // These belong to EC Rental itself, not to any one landlord account, so only admins can see them.
    if (url.pathname === "/api/leads" && request.method === "GET") { if (user!.role !== "admin") return json({ error: "Admins only" }, 403); const results = await env.DB.prepare("SELECT id, name, email, phone, plan AS type, message, status, created_at FROM signups WHERE plan IN ('tenant_application', 'maintenance_request') ORDER BY created_at DESC LIMIT 500").all<{ message: string }>(); return json(results.results.map(({ message, ...lead }) => ({ ...lead, details: parseLeadDetails(message) }))); }
    const leadMatch = url.pathname.match(/^\/api\/leads\/(\d+)$/);
    if (leadMatch && request.method === "PUT") { if (user!.role !== "admin") return json({ error: "Admins only" }, 403); try { const body = await request.json() as { status?: string }; if (!body.status || !LEAD_STATUSES.includes(body.status)) return json({ error: "Status must be one of: " + LEAD_STATUSES.join(", ") }, 400); const result = await env.DB.prepare("UPDATE signups SET status = ? WHERE id = ? AND plan IN ('tenant_application', 'maintenance_request')").bind(body.status, parseInt(leadMatch[1])).run(); return result.meta.changes ? json({ success: true }) : json({ error: "Not found" }, 404); } catch { return json({ error: "Update failed" }, 500); } }

    // === Inspection API ===
    if (url.pathname === "/api/inspections" && request.method === "POST") {
      try {
        const body = await request.json() as { property_id: number; inspector_name?: string; inspection_date: string; photos: { room_area: string; photo_data: string }[] };
        if (!(await ownsProperty(env, user!.id, body.property_id))) return json({ error: "Property not found" }, 404);
        if (!Array.isArray(body.photos) || body.photos.length === 0) return json({ error: "At least one photo is required" }, 400);
        const inspResult = await env.DB.prepare("INSERT INTO inspections (property_id, inspector_name, inspection_date, overall_condition, summary, status, created_at) VALUES (?, ?, ?, '', '', 'in_progress', ?)").bind(body.property_id, body.inspector_name || "", body.inspection_date, new Date().toISOString()).run();
        const inspectionId = inspResult.meta.last_row_id;
        const photoResults = []; let repairCount = 0;
        for (const photo of body.photos) {
          const visionMessages = [{ role: "system", content: "You are a professional home inspector. Analyze this property photo and provide: 1) What you see (condition), 2) Whether repair or replacement is needed, 3) Specific recommendations. Be concise but thorough. Format as JSON: {\"condition\":\"\",\"repair_needed\":true/false,\"recommendation\":\"\"}" }, { role: "user", content: "Analyze this photo of the " + photo.room_area + ". What is the condition? Does it need repair or replacement? Provide specific recommendations." }];
          let aiAnalysis = ""; let aiCondition = "unknown"; let aiRecommendation = ""; let aiRepairNeeded = 0;
          try {
            const aiResponse = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { messages: visionMessages, image: dataUrlToBytes(photo.photo_data) });
            aiAnalysis = (aiResponse as { response?: string }).response || "";
            const jsonMatch = aiAnalysis.match(/\{[\s\S]*\}/);
            if (jsonMatch) { try { const parsed = JSON.parse(jsonMatch[0]); aiCondition = parsed.condition || "unknown"; aiRepairNeeded = parsed.repair_needed ? 1 : 0; aiRecommendation = parsed.recommendation || ""; } catch { aiCondition = aiAnalysis.substring(0, 200); aiRecommendation = aiAnalysis; } } else { aiCondition = aiAnalysis.substring(0, 200); aiRecommendation = aiAnalysis; }
          } catch { aiAnalysis = "Analysis unavailable"; aiCondition = "unknown"; aiRecommendation = "Unable to analyze photo"; }
          if (aiRepairNeeded) repairCount++;
          const photoResult = await env.DB.prepare("INSERT INTO inspection_photos (inspection_id, room_area, photo_data, ai_analysis, ai_condition, ai_recommendation, ai_repair_needed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(inspectionId, photo.room_area, "", aiAnalysis, aiCondition, aiRecommendation, aiRepairNeeded, new Date().toISOString()).run();
          photoResults.push({ id: photoResult.meta.last_row_id, room_area: photo.room_area, condition: aiCondition, repair_needed: aiRepairNeeded === 1, recommendation: aiRecommendation });
        }
        const overallCondition = repairCount === 0 ? "Good" : repairCount <= 2 ? "Fair" : "Needs Attention";
        const summary = "Inspected " + body.photos.length + " areas. " + repairCount + " need repair. Overall: " + overallCondition + ".";
        await env.DB.prepare("UPDATE inspections SET overall_condition = ?, summary = ?, status = 'completed' WHERE id = ?").bind(overallCondition, summary, inspectionId).run();
        return json({ success: true, inspection_id: inspectionId, overall_condition: overallCondition, repair_count: repairCount, photos: photoResults });
      } catch { return json({ error: "Failed to create inspection" }, 500); }
    }
    if (url.pathname === "/api/inspections" && request.method === "GET") { const results = await env.DB.prepare("SELECT i.*, p.address as property_address FROM inspections i JOIN properties p ON i.property_id = p.id WHERE p.user_id = ? ORDER BY i.created_at DESC").bind(user!.id).all(); return json(results.results); }
    const inspMatch = url.pathname.match(/^\/api\/inspections\/(\d+)$/);
    if (inspMatch && request.method === "GET") { const inspId = parseInt(inspMatch[1]); const inspection = await env.DB.prepare("SELECT i.*, p.address as property_address FROM inspections i JOIN properties p ON i.property_id = p.id WHERE i.id = ? AND p.user_id = ?").bind(inspId, user!.id).first(); if (!inspection) return json({ error: "Not found" }, 404); const photos = await env.DB.prepare("SELECT * FROM inspection_photos WHERE inspection_id = ? ORDER BY created_at ASC").bind(inspId).all(); return json({ inspection, photos: photos.results }); }

    // The dashboard's code-editor preview runs the Worker without the static assets binding.
    if (!env.ASSETS) return new Response("Static pages aren't available in this preview. Open https://ec-rental-landing-page.infomomtelo.workers.dev instead.", { status: 503, headers: { "Content-Type": "text/plain" } });
    return env.ASSETS.fetch(request);
  },
};
interface Env { AI: Ai; ASSETS: Fetcher; DB: D1Database; PHOTOS?: R2Bucket; AUTH_LIMITER?: RateLimit; CHAT_LIMITER?: RateLimit; RESEND_API_KEY?: string; EMAIL_FROM: string; }
