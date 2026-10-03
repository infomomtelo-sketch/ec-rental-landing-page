/**
 * "Continue with Google" for landlords and tenants (OAuth 2.0 authorization code flow).
 * An existing account whose email Google has verified is signed in. A new landlord gets a
 * short-lived sign-up ticket and finishes the homepage sign-up form without a password.
 * Needs GOOGLE_CLIENT_ID and the GOOGLE_CLIENT_SECRET secret; the buttons stay hidden until both are set.
 */

export interface GoogleEnv { DB: D1Database; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; }
export interface GoogleHelpers {
  generateToken(): string;
  sha256Hex(value: string): Promise<string>;
  createSession(userId: number): Promise<string>;
  allowAttempt(request: Request): Promise<boolean>;
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_COOKIE = "ec_g_state";
const SIGNUP_TICKET_TTL_MS = 30 * 60 * 1000;
// Where the visitor started: the dashboard sign in, the homepage sign up, or the tenant portal.
const STARTS = ["dashboard", "signup", "tenant"] as const;
type Start = typeof STARTS[number];

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
function clearStateCookie(): string { return STATE_COOKIE + "=; Path=/api/auth/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax"; }
function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
// Messages travel in the URL fragment, so they never reach server logs.
function failTo(start: Start, message: string): Response {
  const page = start === "tenant" ? "/tenant" : start === "signup" ? "/" : "/dashboard";
  return redirect(page + "#google_error=" + encodeURIComponent(message), clearStateCookie());
}

export function googleEnabled(env: GoogleEnv): boolean { return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET); }

/** Decodes the payload of an ID token received straight from Google's token endpoint over TLS (Google's docs allow skipping the signature check in that case). */
export function decodeIdToken(idToken: string): Record<string, unknown> | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

/** Returns the verified email and name from Google's claims, or an error message. */
export function checkClaims(claims: Record<string, unknown> | null, clientId: string, nowMs = Date.now()): { email: string; name: string } | { error: string } {
  if (!claims) return { error: "Google sign-in failed. Please try again." };
  if (claims.aud !== clientId || (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com")) return { error: "Google sign-in failed. Please try again." };
  if (typeof claims.exp !== "number" || claims.exp * 1000 < nowMs) return { error: "Google sign-in expired. Please try again." };
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || claims.email_verified !== true) return { error: "Your Google account's email isn't verified, so we can't use it to sign in." };
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 100) : email.split("@")[0];
  return { email, name };
}

export async function handleGoogleRoutes(request: Request, env: GoogleEnv, url: URL, h: GoogleHelpers, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/auth/google/")) return null;
  const route = url.pathname.slice("/api/auth/google/".length);

  if (route === "status" && request.method === "GET") return json({ enabled: googleEnabled(env) });

  // GET ?ticket= : the name and email for a pending Google sign up, to prefill the homepage form.
  if (route === "signup" && request.method === "GET") {
    const ticket = String(url.searchParams.get("ticket") || "").slice(0, 200);
    const row = ticket ? await env.DB.prepare("SELECT email, name, expires_at, used_at FROM google_signups WHERE token_hash = ?").bind(await h.sha256Hex(ticket)).first<{ email: string; name: string; expires_at: string; used_at: string | null }>() : null;
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) return json({ error: "This Google sign-up has expired. Please click Continue with Google again." }, 404);
    return json({ email: row.email, name: row.name });
  }

  if (request.method !== "GET" || (route !== "start" && route !== "callback")) return null;
  if (!googleEnabled(env)) return failTo("dashboard", "Google sign-in isn't set up yet. Please use your email and password.");

  const redirectUri = url.origin + "/api/auth/google/callback";

  if (route === "start") {
    const from = url.searchParams.get("from");
    const start: Start = (STARTS as readonly string[]).includes(from || "") ? from as Start : "dashboard";
    const state = h.generateToken();
    const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
    return redirect(AUTH_URL + "?" + params, STATE_COOKIE + "=" + state + "." + start + "; Path=/api/auth/google; Max-Age=600; HttpOnly; Secure; SameSite=Lax");
  }

  // Callback from Google
  const [expected, startRaw] = (readCookie(request, STATE_COOKIE) || "").split(".");
  const start: Start = (STARTS as readonly string[]).includes(startRaw || "") ? startRaw as Start : "dashboard";
  const state = url.searchParams.get("state") || "";
  if (!expected || state !== expected) return failTo(start, "Google sign-in timed out. Please try again.");
  if (url.searchParams.get("error")) return failTo(start, "Google sign-in was cancelled.");
  const code = url.searchParams.get("code");
  if (!code) return failTo(start, "Google sign-in failed. Please try again.");
  if (!(await h.allowAttempt(request))) return failTo(start, "Too many sign-in attempts. Please wait a minute and try again.");

  let claims: Record<string, unknown> | null = null;
  try {
    const res = await fetcher(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
    if (!res.ok) { console.error("[google] token exchange " + res.status + ": " + (await res.text()).slice(0, 300)); return failTo(start, "Google sign-in failed. Please try again."); }
    const body = await res.json() as { id_token?: string };
    claims = body.id_token ? decodeIdToken(body.id_token) : null;
  } catch (err) { console.error("[google]", err instanceof Error ? err.message : err); return failTo(start, "Couldn't reach Google. Please try again."); }

  const checked = checkClaims(claims, env.GOOGLE_CLIENT_ID!);
  if ("error" in checked) return failTo(start, checked.error);

  const user = await env.DB.prepare("SELECT id, role FROM users WHERE lower(email) = ?").bind(checked.email).first<{ id: number; role: string }>();
  if (user) {
    const token = await h.createSession(user.id);
    return redirect((user.role === "tenant" ? "/tenant" : "/dashboard") + "#google_token=" + token, clearStateCookie());
  }
  if (start === "tenant") return failTo(start, "There's no tenant account for " + checked.email + ". Open the invite link your landlord emailed you first.");

  // New landlord: hold the verified email for the homepage sign-up form.
  const ticket = h.generateToken(); const now = new Date();
  await env.DB.prepare("INSERT INTO google_signups (token_hash, email, name, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await h.sha256Hex(ticket), checked.email, checked.name, new Date(now.getTime() + SIGNUP_TICKET_TTL_MS).toISOString(), now.toISOString()).run();
  return redirect("/#google_signup=" + ticket, clearStateCookie());
}

/** For /api/subscribe: returns the verified email behind a Google sign-up ticket and marks it used, or null. */
export async function redeemSignupTicket(env: GoogleEnv, ticket: string, sha256Hex: (v: string) => Promise<string>): Promise<string | null> {
  const hash = await sha256Hex(String(ticket).slice(0, 200));
  const row = await env.DB.prepare("UPDATE google_signups SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email")
    .bind(new Date().toISOString(), hash, new Date().toISOString()).first<{ email: string }>();
  return row ? row.email : null;
}
