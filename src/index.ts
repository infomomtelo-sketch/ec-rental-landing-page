/**
 * EC Rental Property Management LLC — Worker
 * Powered by Tello (branded), running on Cloudflare Workers AI.
 */
interface ChatRequest { message: string; history?: { role: "user" | "assistant"; content: string }[]; context?: string; image?: string; }
interface SubscribeRequest { name: string; company?: string; email: string; phone: string; propertyCount: string; plan: string; password?: string; google_ticket?: string; message?: string; }
interface LoginRequest { email: string; password: string; }

const SYSTEM_PROMPT = `You are Tello, the AI assistant for EC Rental Property Management LLC in Fresno, California. If asked your name, you are Tello.
Company info:
- Locally owned property management in Fresno, CA serving the Central Valley including Clovis.
- Services: tenant placement & screening, 24/7 maintenance, rent collection, lease management, financial/tax reporting, AI home inspections.
- Pricing: Solo $29/mo (1-5 units), Manager $79/mo (25 units), Portfolio $199/mo (unlimited). Every plan starts with a 14-day free trial (card entered on Stripe, not charged until the trial ends; cancel anytime).
- Contact: info@ecrentalpm.com, (559) 825-3038.
- AI Home Inspections: move-in, move-out and routine inspections led by a certified home inspector (trained through Home Inspectors of America); AI reads each photo to note condition, flag repairs and compare move-out with move-in, and owners get a printable photo report. Launch bonus: a landlord's first in-person inspection is free once their plan is paid (Fresno and Clovis); they book it from the dashboard Inspections page.
Rules:
- Be friendly but VERY concise. Max 2-3 sentences per response.
- Write in a professional tone. Never use emojis.
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

// Added to the system prompt when Tello is opened inside the signed-in landlord dashboard.
const DASHBOARD_GUIDE = `
The person is a landlord signed in to their EC Rental dashboard and wants help using it. Explain where things are and which button to tap. On a phone, the menu is behind the menu button (three lines) at the top left. You can't see or change their data.
Dashboard pages (left menu):
- Overview: totals for properties, occupancy, rent this month and open maintenance.
- Properties: "+ Add Property", then Edit or Delete on each row.
- Listings: "+ New Listing". In the listing form, "Write with AI" drafts the description (it can read the photos), "Check my rent" compares rent with similar EC Rental listings, and photos can be dragged in or picked several at once. Each listing has Edit, View, Share (ready-made post for Facebook, Marketplace and texts) and Delete. Listings can be switched on for the Zillow feed. Renter Inquiries are below the listings, with "Draft reply".
- Applications: rental applications from active listings, with Review and "AI summary".
- Tenants: invite a tenant by email to their tenant portal (lease, rent payments, maintenance requests). Once online rent payments are set up in Settings, tenants see a "Pay rent online" button there.
- Documents: "+ New Document" for leases, notices, invoices and receipts, then "Print or save PDF".
- Transactions: "+ Add Transaction" for rent, expenses and owner payments.
- Maintenance: "+ New Request", "AI triage" for a suggested priority, next steps and a reply to the tenant, and Resolve.
- Tax Reports: per-property totals and "Export CSV".
- Inspections: "+ New Inspection" (move-in, move-out, routine or annual), add photos room by room, the AI fills in condition and notes for you to check, "Compare with move-in" on move-outs, then a printable report. "Book in-person inspection" asks a certified home inspector to visit (Fresno and Clovis); the first one on an account is a free launch bonus once the plan is paid.
- Settings: account details and password. When online billing is on, the "Plan & Billing" card there starts the 14-day free trial (Stripe checkout), switches plans (Solo $29, Property Manager $79, Portfolio $199 a month) and opens "Manage billing" for card, invoices and cancelling. The "Online rent payments" card connects the landlord's own Stripe account ("Set up payouts with Stripe") so tenants can pay rent by bank transfer or card; money goes straight to the landlord's Stripe account and bank, Stripe's fees come out of each payment, and paid rent is added to Transactions by itself.
- Setting up online rent payments, step by step (walk the landlord through one step at a time and ask where they are stuck):
  1. It needs an EC Rental plan or free trial (Plan & Billing card) first. Then Settings, "Online rent payments" card, tap "Set up payouts with Stripe". This opens Stripe's own secure setup page. EC Rental never sees their bank or ID details.
  2. On Stripe, sign in to an existing Stripe account or create one with their email and a password.
  3. Business type: an individual landlord picks "Individual" (sole proprietor); an LLC or company picks "Company" and enters its legal name and EIN.
  4. Personal details: legal name, date of birth, home address, phone and the last 4 digits (or full) SSN. Stripe asks for these by law to verify identity; sometimes it also asks for a photo of a driver's license or passport, uploaded only on Stripe.
  5. Business details: industry "Real estate" or "Property management", website ecrentalpm.com (or their own), and a short description like "Residential rent collection".
  6. Payout bank account: routing and account number, or log in to their bank.
  7. Review and submit. Stripe sends them back to the dashboard. If the card says "Stripe still needs a few details", tap "Finish Stripe setup" to continue where they left off. Once it says "Ready", invited tenants see "Pay rent online" in their tenant portal.
  - Fees: about 0.8% capped at $5 for a bank transfer, 2.9% + 30 cents for a card, taken by Stripe from each payment. EC Rental charges no extra fee. Bank transfers take a few business days to clear.
  - Never ask the landlord to type their SSN, bank numbers or ID into this chat; those go only on Stripe's page. If Stripe shows an error or rejects something, tell them to follow Stripe's on-screen message or contact Stripe support, or email info@ecrentalpm.com.
- Rent reminders (Settings, "Rent reminders" card): when switched on, tenants who accepted their invite get an email a few days before rent is due (with a "Pay rent online" button once online payments are set up) and a friendly notice a few days after the due date if that month's rent isn't recorded yet; the landlord gets a copy of late notices. The landlord picks the due day and the timing. Rent recorded in Transactions as Rent Collected, or paid online, stops the reminders for that month. Needs an EC Rental plan or free trial.
In this mode, never include [SHOW_...] tags.`;

// A picture attached in the Tello chat (screenshot or photo), sent as a data URL. Read once and never stored.
const CHAT_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const CHAT_IMAGE_GUIDE = `
The person attached a picture to this message, often a screenshot of the EC Rental dashboard or a Stripe page, or a photo of their rental. Look at it closely, say briefly what you see that matters to their question, then tell them the next step. If you can't make something out, say so and ask them to describe it. If the picture shows a Social Security number, bank or card number, password or ID document, never repeat those details and remind them not to share them in chat.`;
function chatImage(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!m || m[2].length > 5_600_000) return null;
  try { const bin = atob(m[2]); const out = new Array<number>(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.length ? out : null; } catch { return null; }
}

import { handleRentReminderRoutes, runRentReminders } from "./rent-reminders";
import { handleListingRoutes, handlePublicListingRoutes } from "./listings";
import { handleLandlordLeadRoute, handleZillowLeadRoute } from "./leads";
import { handleAiAssistRoutes, MAINTENANCE_PRIORITIES } from "./ai-assist";
import { handleRenterChat } from "./renter-chat";
import { handleRentReview } from "./rent-review";
import { handleRemoteInspections } from "./remote-inspections";
import { handleInspectionRoutes } from "./inspections";
import { handleApplicationRoutes, handlePublicApplicationRoutes } from "./applications";
import { handleDocumentRoutes, handleTenantDocumentRoutes } from "./documents";
import { handleMapRoute } from "./geo";
import { handleMedia, handleSeoRoutes } from "./seo";
import { handleGoogleRoutes, redeemSignupTicket } from "./google";
import { handleAdminRoutes, isAdmin } from "./admin";
import { handleInspectionRequests } from "./inspection-requests";
import { billingEnabled, createCheckout, handleBillingRoutes, handleStripeWebhook } from "./billing";
import { handleConnectWebhook, handleLandlordRentPayments, handleTenantRentPayments } from "./rent-payments";
import { handlePublicTenantRoutes, handleTenancyRoutes, handleTenantPortalRoutes, tenantMayUse, type TenantHelpers } from "./tenants";

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
function tenantHelpers(env: Env): TenantHelpers {
  return { generateToken, generateSalt, hashPassword, verifyPassword, sha256Hex, minPasswordLength: MIN_PASSWORD_LENGTH,
    sendEmail: (to, subject, html, text) => sendEmail(env, to, subject, html, text),
    allowAuthAttempt: (request, keys) => underLimit(env.AUTH_LIMITER, ["ip:" + clientIp(request), ...keys]) };
}
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
async function createSession(env: Env, userId: number): Promise<string> { const token = generateToken(); await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(token, userId, new Date(Date.now() + SESSION_TTL_MS).toISOString(), new Date().toISOString()).run(); return token; }
async function getUserFromRequest(request: Request, env: Env): Promise<User | null> { const auth = request.headers.get("Authorization"); if (!auth || !auth.startsWith("Bearer ")) return null; const token = auth.slice(7); const session = await env.DB.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").bind(token).first<{ user_id: number; expires_at: string }>(); if (!session) return null; if (new Date(session.expires_at) < new Date()) return null; const user = await env.DB.prepare("SELECT id, name, company, email, plan, property_limit, role FROM users WHERE id = ?").bind(session.user_id).first<User>(); return user || null; }
interface User { id: number; name: string; company: string; email: string; plan: string; property_limit: number; role: string; }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Send plain http visits to https so the site never shows "Not Secure".
    if (url.protocol === "http:" && url.hostname.endsWith("ecrentalpm.com") && (request.method === "GET" || request.method === "HEAD")) { url.protocol = "https:"; return Response.redirect(url.toString(), 301); }
    if (request.method === "OPTIONS") { return new Response(null, { headers: corsHeaders() }); }

    // Chat API
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        if (!(await underLimit(env.CHAT_LIMITER, ["ip:" + clientIp(request)]))) return tooManyRequests();
        const body = await request.json() as ChatRequest;
        const image = chatImage(body.image);
        if (body.image && !image) return json({ error: "That picture couldn't be read. Please try a JPG or PNG under 4 MB." }, 400);
        const userMessage = (typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "") || (image ? "What do you see in this picture, and what should I do next?" : "");
        if (!userMessage) return json({ error: "Message is required" }, 400);
        const system = SYSTEM_PROMPT + (body.context === "dashboard" ? DASHBOARD_GUIDE : "") + (image ? CHAT_IMAGE_GUIDE : "");
        const messages = [{ role: "system", content: system }, ...(Array.isArray(body.history) ? body.history : []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })), { role: "user", content: userMessage }];
        const aiResponse = image
          ? await env.AI.run(CHAT_VISION_MODEL as Parameters<Ai["run"]>[0], { messages, image, max_tokens: 700 } as never)
          : await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", { messages });
        return json({ response: ((aiResponse as { response?: string }).response || "").replace(/\p{Extended_Pictographic}\uFE0F?/gu, "").trim() || "I'm sorry, I couldn't generate a response right now." });
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
        const viaGoogle = !!body.google_ticket;
        if (!body.name || (!viaGoogle && !body.email) || !body.phone || !body.propertyCount || !body.plan || (!viaGoogle && !body.password)) return json({ success: false, error: "Please fill in all required fields." }, 400);
        if (!viaGoogle && body.password!.length < MIN_PASSWORD_LENGTH) return json({ success: false, error: "Password must be at least " + MIN_PASSWORD_LENGTH + " characters" }, 400);
        if (!(body.plan in PLAN_LIMITS)) return json({ success: false, error: "Please choose a plan." }, 400);
        // A Google sign up uses the email Google verified and gets a random password; "Forgot password?" can set one later.
        const googleEmail = viaGoogle ? await redeemSignupTicket(env, body.google_ticket!, sha256Hex) : null;
        if (viaGoogle && !googleEmail) return json({ success: false, error: "Your Google sign-up expired. Please click Continue with Google again." }, 400);
        const email = googleEmail || normalizeEmail(body.email);
        const existing = await env.DB.prepare("SELECT id FROM users WHERE lower(email) = ?").bind(email).first();
        if (existing) return json({ success: false, error: "An account with this email already exists." }, 409);
        const planNames: Record<string, string> = { solo: "Solo Landlord ($29/mo)", manager: "Property Manager ($79/mo)", portfolio: "Portfolio ($199/mo)" };
        const salt = generateSalt(); const passwordHash = await hashPassword(body.password || generateToken(), salt); const now = new Date().toISOString();
        const results = await env.DB.batch([
          env.DB.prepare("INSERT INTO users (name, company, email, password_hash, password_salt, plan, property_limit, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(body.name, body.company || "", email, passwordHash, salt, body.plan, PLAN_LIMITS[body.plan], "landlord", now),
          env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(body.name, body.company || "", email, body.phone, body.propertyCount, planNames[body.plan], body.message || "", now),
        ]);
        const newUserId = Number(results[0].meta.last_row_id);
        // With Stripe switched on, the new landlord goes straight to checkout. If Stripe fails they still have their account.
        let checkoutUrl: string | undefined;
        if (billingEnabled(env)) { try { checkoutUrl = await createCheckout(env, { id: newUserId, name: body.name, email, plan: body.plan, role: "landlord" }, body.plan, url.origin); } catch (err) { console.error("[billing] signup checkout", err instanceof Error ? err.message : err); } }
        if (viaGoogle) return json({ success: true, message: "Account created", token: await createSession(env, newUserId), checkoutUrl });
        return json({ success: true, message: "Account created", checkoutUrl });
      } catch (err) { return dbErrorResponse("subscribe", err); }
    }

    // Stripe calls this when a subscription starts, changes or ends (src/billing.ts).
    if (url.pathname === "/api/stripe/webhook" && request.method === "POST") { try { return await handleStripeWebhook(request, env); } catch (err) { console.error("[stripe-webhook]", err instanceof Error ? err.message : err); return json({ error: "Webhook failed" }, 500); } }

    // Stripe calls this when a tenant's rent payment or a landlord's payout account changes (src/rent-payments.ts).
    if (url.pathname === "/api/stripe/connect-webhook" && request.method === "POST") { try { return await handleConnectWebhook(request, env, url, (to, subject, html, text) => sendEmail(env, to, subject, html, text)); } catch (err) { console.error("[stripe-connect-webhook]", err instanceof Error ? err.message : err); return json({ error: "Webhook failed" }, 500); } }

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
        const token = await createSession(env, user.id);
        const { password_hash, password_salt, ...userWithoutPw } = user;
        if (isAdmin(env, userWithoutPw)) userWithoutPw.role = "admin";
        return json({ token, user: userWithoutPw });
      } catch (err) { return dbErrorResponse("login", err); }
    }

    // Continue with Google
    const googleResponse = await handleGoogleRoutes(request, env, url, { generateToken, sha256Hex, createSession: (userId) => createSession(env, userId), allowAttempt: (req) => underLimit(env.AUTH_LIMITER, ["ip:" + clientIp(req)]) });
    if (googleResponse) return googleResponse;

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
          // Sent in the background so response time does not reveal whether the account exists.
          ctx.waitUntil(sendEmail(env, account.email, "Reset your EC Rental password",
            "<p>Hi " + escapeHtml(account.name) + ",</p><p>Someone asked to reset the password for your EC Rental account. This link works for one hour:</p><p><a href=\"" + link + "\">Reset my password</a></p><p>If you didn't ask for this, you can ignore this email.</p>",
            "Hi " + account.name + ",\n\nSomeone asked to reset the password for your EC Rental account. This link works for one hour:\n" + link + "\n\nIf you didn't ask for this, you can ignore this email.").catch((err) => console.error("Reset email failed: " + err)));
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
    const notify = (to: string, subject: string, html: string, text: string) => sendEmail(env, to, subject, html, text);
    if (env.ASSETS) { try { const seoRes = await handleSeoRoutes(request, env, url); if (seoRes) return seoRes; } catch (err) { console.error("[seo]", err); } }
    if (env.ASSETS) { try { const mediaRes = await handleMedia(request, env, url); if (mediaRes) return mediaRes; } catch (err) { console.error("[media]", err); } }
    try { const mapRes = await handleMapRoute(request, env, url); if (mapRes) return mapRes; } catch (err) { return dbErrorResponse("listing-map", err); }
    try { const chatRes = await handleRenterChat(request, env, url, () => underLimit(env.CHAT_LIMITER, ["ip:" + clientIp(request)])); if (chatRes) return chatRes; } catch (err) { return dbErrorResponse("renter-chat", err); }
    try { const reviewRes = await handleRentReview(request, env, url, () => underLimit(env.CHAT_LIMITER, ["ip:" + clientIp(request)]), notify); if (reviewRes) return reviewRes; } catch (err) { return dbErrorResponse("rent-review", err); }
    try { const remoteRes = await handleRemoteInspections(request, env, url, () => underLimit(env.CHAT_LIMITER, ["ip:" + clientIp(request)]), notify); if (remoteRes) return remoteRes; } catch (err) { return dbErrorResponse("ai-inspection", err); }
    try { const publicRes = await handlePublicListingRoutes(request, env, url, notify); if (publicRes) return publicRes; } catch (err) { return dbErrorResponse("public-listings", err); }
    try { const zillowRes = await handleZillowLeadRoute(request, env, url, notify); if (zillowRes) return zillowRes; } catch (err) { console.error("[zillow-leads]", err); return json({ error: "Something went wrong." }, 500); }
    try { const applyRes = await handlePublicApplicationRoutes(request, env, url); if (applyRes) return applyRes; } catch (err) { return dbErrorResponse("apply", err); }
    try { const inviteRes = await handlePublicTenantRoutes(request, env, url, tenantHelpers(env)); if (inviteRes) return inviteRes; } catch (err) { return dbErrorResponse("tenant-invite", err); }

    const user = await getUserFromRequest(request, env);
    // Emails in the ADMIN_EMAILS secret count as admins everywhere (Chat Leads, /admin).
    if (user && isAdmin(env, user)) user.role = "admin";
    if (!user && url.pathname.startsWith("/api/") && url.pathname !== "/api/chat" && url.pathname !== "/api/subscribe" && url.pathname !== "/api/login" && url.pathname !== "/api/tenant-application" && url.pathname !== "/api/maintenance-request" && !url.pathname.startsWith("/api/password-reset/") && !url.pathname.startsWith("/api/tenant-invite")) return json({ error: "Unauthorized" }, 401);

    // Tenants only reach their portal; every other API route is for landlords.
    if (user && user.role === "tenant" && url.pathname.startsWith("/api/") && !tenantMayUse(url.pathname)) return json({ error: "This page is for landlord accounts." }, 403);
    if (user && url.pathname.startsWith("/api/tenant/documents")) { try { const res = await handleTenantDocumentRoutes(request, env, url, user); if (res) return res; } catch (err) { return dbErrorResponse("tenant-documents", err); } }
    if (user && (url.pathname === "/api/tenant/rent" || url.pathname.startsWith("/api/tenant/rent/"))) { try { const res = await handleTenantRentPayments(request, env, url, user, (to, subject, html, text) => sendEmail(env, to, subject, html, text)); if (res) return res; } catch (err) { console.error("[rent-payments]", err instanceof Error ? err.message : err); return json({ error: "Online payments are having trouble right now. Please try again in a minute." }, 502); } }
    if (user && url.pathname.startsWith("/api/tenant/")) { try { const res = await handleTenantPortalRoutes(request, env, url, user, tenantHelpers(env)); if (res) return res; } catch (err) { return dbErrorResponse("tenant-portal", err); } }
    if (user && url.pathname.startsWith("/api/tenancies")) { try { const res = await handleTenancyRoutes(request, env, url, user, tenantHelpers(env)); if (res) return res; } catch (err) { return dbErrorResponse("tenancies", err); } }

    // Me API
    if (user && url.pathname.startsWith("/api/documents")) { try { const res = await handleDocumentRoutes(request, env, url, user, notify); if (res) return res; } catch (err) { return dbErrorResponse("documents", err); } }
    if (user && url.pathname.startsWith("/api/applications")) { try { const res = await handleApplicationRoutes(request, env, url, user); if (res) return res; } catch (err) { return dbErrorResponse("applications", err); } }
    if (user && url.pathname.startsWith("/api/ai/")) { try { const res = await handleAiAssistRoutes(request, env, url, user, () => underLimit(env.CHAT_LIMITER, ["user:" + user.id])); if (res) return res; } catch (err) { return dbErrorResponse("ai-assist", err); } }
    if (user && url.pathname === "/api/listings/leads") { try { const res = await handleLandlordLeadRoute(request, env, url, user); if (res) return res; } catch (err) { return dbErrorResponse("listing-leads", err); } }
    if (user && url.pathname.startsWith("/api/listings")) { try { const res = await handleListingRoutes(request, env, url, user); if (res) return res; } catch (err) { return dbErrorResponse("listings", err); } }

    // Site owner admin page (src/admin.ts)
    if (user && url.pathname.startsWith("/api/admin/")) { if (user.role !== "admin") return json({ error: "Admins only" }, 403); try { const res = await handleAdminRoutes(request, env, url); if (res) return res; } catch (err) { return dbErrorResponse("admin", err); } }
    if (user && url.pathname === "/api/inspection-requests") { try { const res = await handleInspectionRequests(request, env, url, user, notify); if (res) return res; } catch (err) { return dbErrorResponse("inspection-requests", err); } }

    // Plans and Stripe billing (src/billing.ts)
    if (user && url.pathname === "/api/rent-reminders") { try { const res = await handleRentReminderRoutes(request, env, url, user); if (res) return res; } catch (err) { return dbErrorResponse("rent reminders", err); } }
    if (user && (url.pathname === "/api/rent-payments" || url.pathname.startsWith("/api/rent-payments/"))) { try { const res = await handleLandlordRentPayments(request, env, url, user); if (res) return res; } catch (err) { console.error("[rent-payments]", err instanceof Error ? err.message : err); return json({ error: "Stripe is having trouble right now. Please try again in a minute." }, 502); } }
    if (user && (url.pathname === "/api/billing" || url.pathname.startsWith("/api/billing/"))) { try { const res = await handleBillingRoutes(request, env, url, user); if (res) return res; } catch (err) { console.error("[billing]", err instanceof Error ? err.message : err); return json({ error: "Billing is having trouble right now. Please try again in a minute." }, 502); } }

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
    if (propMatch) { const propId = parseInt(propMatch[1]); if (request.method === "GET") { const prop = await env.DB.prepare("SELECT * FROM properties WHERE id = ? AND user_id = ?").bind(propId, user!.id).first(); return prop ? json(prop) : json({ error: "Not found" }, 404); } if (request.method === "PUT") { try { const body = await request.json() as Record<string, unknown>; await env.DB.prepare("UPDATE properties SET address = ?, city = ?, state = ?, zip = ?, rent_amount = ?, tenant_name = ?, tenant_email = ?, tenant_phone = ?, lease_start = ?, lease_end = ?, status = ?, notes = ? WHERE id = ? AND user_id = ?").bind(body.address, body.city || "", body.state || "CA", body.zip || "", body.rent_amount || 0, body.tenant_name || "", body.tenant_email || "", body.tenant_phone || "", body.lease_start || "", body.lease_end || "", body.status || "vacant", body.notes || "", propId, user!.id).run(); return json({ success: true }); } catch { return json({ error: "Update failed" }, 500); } } if (request.method === "DELETE") { if (!(await ownsProperty(env, user!.id, propId))) return json({ error: "Not found" }, 404); const inspKeys = (await env.DB.prepare("SELECT t.r2_key FROM inspection_items t JOIN inspections i ON t.inspection_id = i.id WHERE i.property_id = ?").bind(propId).all<{ r2_key: string }>()).results.map((r) => r.r2_key); if (env.PHOTOS && inspKeys.length) await env.PHOTOS.delete(inspKeys); await env.DB.batch([env.DB.prepare("DELETE FROM inspection_items WHERE inspection_id IN (SELECT id FROM inspections WHERE property_id = ?)").bind(propId), env.DB.prepare("DELETE FROM inspection_details WHERE inspection_id IN (SELECT id FROM inspections WHERE property_id = ?)").bind(propId), env.DB.prepare("DELETE FROM transactions WHERE property_id = ?").bind(propId), env.DB.prepare("DELETE FROM maintenance_requests WHERE property_id = ?").bind(propId), env.DB.prepare("DELETE FROM inspection_photos WHERE inspection_id IN (SELECT id FROM inspections WHERE property_id = ?)").bind(propId), env.DB.prepare("DELETE FROM inspections WHERE property_id = ?").bind(propId), env.DB.prepare("DELETE FROM properties WHERE id = ? AND user_id = ?").bind(propId, user!.id)]); return json({ success: true }); } }

    // Transactions API
    if (url.pathname === "/api/transactions" && request.method === "GET") { const results = await env.DB.prepare("SELECT t.*, p.address as property_address FROM transactions t JOIN properties p ON t.property_id = p.id WHERE p.user_id = ? ORDER BY t.date DESC").bind(user!.id).all(); return json(results.results); }
    if (url.pathname === "/api/transactions" && request.method === "POST") { try { const body = await request.json() as Record<string, unknown>; if (!(await ownsProperty(env, user!.id, body.property_id))) return json({ error: "Property not found" }, 404); await env.DB.prepare("INSERT INTO transactions (property_id, type, amount, description, date, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(body.property_id, body.type, body.amount, body.description || "", body.date, new Date().toISOString()).run(); return json({ success: true }); } catch { return json({ error: "Failed to create transaction" }, 500); } }

    // Maintenance API
    if (url.pathname === "/api/maintenance" && request.method === "GET") { const results = await env.DB.prepare("SELECT m.*, p.address as property_address FROM maintenance_requests m JOIN properties p ON m.property_id = p.id WHERE p.user_id = ? ORDER BY m.created_at DESC").bind(user!.id).all(); return json(results.results); }
    if (url.pathname === "/api/maintenance" && request.method === "POST") { try { const body = await request.json() as Record<string, unknown>; if (!(await ownsProperty(env, user!.id, body.property_id))) return json({ error: "Property not found" }, 404); await env.DB.prepare("INSERT INTO maintenance_requests (property_id, tenant_name, description, priority, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)").bind(body.property_id, body.tenant_name || "", body.description, body.priority || "normal", new Date().toISOString()).run(); return json({ success: true }); } catch { return json({ error: "Failed to create request" }, 500); } }
    const maintMatch = url.pathname.match(/^\/api\/maintenance\/(\d+)$/);
    if (maintMatch && request.method === "PUT") { const maintId = parseInt(maintMatch[1]); try { const body = await request.json() as { status?: string; priority?: string }; if (body.priority) { if (!MAINTENANCE_PRIORITIES.includes(body.priority)) return json({ error: "Priority must be one of: " + MAINTENANCE_PRIORITIES.join(", ") }, 400); await env.DB.prepare("UPDATE maintenance_requests SET priority = ? WHERE id = ? AND property_id IN (SELECT id FROM properties WHERE user_id = ?)").bind(body.priority, maintId, user!.id).run(); return json({ success: true }); } await env.DB.prepare("UPDATE maintenance_requests SET status = ? WHERE id = ? AND property_id IN (SELECT id FROM properties WHERE user_id = ?)").bind(body.status || "resolved", maintId, user!.id).run(); return json({ success: true }); } catch { return json({ error: "Update failed" }, 500); } }

    // Reports API
    if (url.pathname === "/api/reports" && request.method === "GET") { const properties = await env.DB.prepare("SELECT id, address FROM properties WHERE user_id = ?").bind(user!.id).all<{ id: number; address: string }>(); const reports = []; for (const prop of properties.results) { const rentResult = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE property_id = ? AND type = 'rent'").bind(prop.id).first<{ total: number }>(); const expenseResult = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE property_id = ? AND type = 'expense'").bind(prop.id).first<{ total: number }>(); const feeResult = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE property_id = ? AND type = 'fee'").bind(prop.id).first<{ total: number }>(); const rent = rentResult?.total || 0; const expenses = expenseResult?.total || 0; const fees = feeResult?.total || 0; reports.push({ address: prop.address, rent_collected: rent, expenses: expenses, mgmt_fee: fees, paid_to_owner: rent - expenses - fees }); } return json(reports); }

    // Dashboard Overview API
    if (url.pathname === "/api/dashboard/overview" && request.method === "GET") { const props = await env.DB.prepare("SELECT * FROM properties WHERE user_id = ? ORDER BY created_at DESC LIMIT 5").bind(user!.id).all(); const count = await env.DB.prepare("SELECT COUNT(*) as count FROM properties WHERE user_id = ?").bind(user!.id).first<{ count: number }>(); const occupied = await env.DB.prepare("SELECT COUNT(*) as count FROM properties WHERE user_id = ? AND status = 'occupied'").bind(user!.id).first<{ count: number }>(); const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); const rentResult = await env.DB.prepare("SELECT COALESCE(SUM(t.amount), 0) as total FROM transactions t JOIN properties p ON t.property_id = p.id WHERE p.user_id = ? AND t.type = 'rent' AND t.date >= ?").bind(user!.id, monthStart).first<{ total: number }>(); const maintResult = await env.DB.prepare("SELECT COUNT(*) as count FROM maintenance_requests m JOIN properties p ON m.property_id = p.id WHERE p.user_id = ? AND m.status = 'open'").bind(user!.id).first<{ count: number }>(); return json({ totalProperties: count?.count || 0, propertyLimit: user!.property_limit, occupied: occupied?.count || 0, vacant: (count?.count || 0) - (occupied?.count || 0), monthlyRent: rentResult?.total || 0, openMaintenance: maintResult?.count || 0, properties: props.results }); }

    // Chat Leads API (admin only): tenant applications and maintenance requests sent through the website chat.
    // These belong to EC Rental itself, not to any one landlord account, so only admins can see them.
    if (url.pathname === "/api/leads" && request.method === "GET") { if (user!.role !== "admin") return json({ error: "Admins only" }, 403); const results = await env.DB.prepare("SELECT id, name, email, phone, plan AS type, message, status, created_at FROM signups WHERE plan IN ('tenant_application', 'maintenance_request', 'rent_review', 'inspection_request', 'ai_inspection') ORDER BY created_at DESC LIMIT 500").all<{ message: string }>(); return json(results.results.map(({ message, ...lead }) => ({ ...lead, details: parseLeadDetails(message) }))); }
    const leadMatch = url.pathname.match(/^\/api\/leads\/(\d+)$/);
    if (leadMatch && request.method === "PUT") { if (user!.role !== "admin") return json({ error: "Admins only" }, 403); try { const body = await request.json() as { status?: string }; if (!body.status || !LEAD_STATUSES.includes(body.status)) return json({ error: "Status must be one of: " + LEAD_STATUSES.join(", ") }, 400); const result = await env.DB.prepare("UPDATE signups SET status = ? WHERE id = ? AND plan IN ('tenant_application', 'maintenance_request', 'rent_review', 'inspection_request')").bind(body.status, parseInt(leadMatch[1])).run(); return result.meta.changes ? json({ success: true }) : json({ error: "Not found" }, 404); } catch { return json({ error: "Update failed" }, 500); } }

    // === Inspection API (src/inspections.ts) ===
    if (url.pathname.startsWith("/api/inspections")) { try { const res = await handleInspectionRoutes(request, env, url, user!); if (res) return res; } catch (err) { return dbErrorResponse("inspections", err); } }

    // The dashboard's code-editor preview runs the Worker without the static assets binding.
    if (!env.ASSETS) return new Response("Static pages aren't available in this preview. Open https://ecrentalpm.com instead.", { status: 503, headers: { "Content-Type": "text/plain" } });
    return env.ASSETS.fetch(request);
  },

  // Daily cron (wrangler.toml [triggers]): rent reminders and late notices.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runRentReminders(env, (to, subject, html, text) => sendEmail(env, to, subject, html, text), "https://ecrentalpm.com")
      .then((n) => console.log("[rent-reminders] sent", n))
      .catch((err) => console.error("[rent-reminders]", err instanceof Error ? err.message : err)));
  },
};
interface Env { AI: Ai; ASSETS: Fetcher; DB: D1Database; PHOTOS?: R2Bucket; AUTH_LIMITER?: RateLimit; CHAT_LIMITER?: RateLimit; RESEND_API_KEY?: string; EMAIL_FROM: string; ZILLOW_LEAD_KEY?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_TRIAL_DAYS?: string; STRIPE_API_BASE?: string; STRIPE_CONNECT_WEBHOOK_SECRET?: string; ADMIN_EMAILS?: string; }
