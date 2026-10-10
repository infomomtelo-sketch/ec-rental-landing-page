/**
 * Built-in e-sign for landlord documents. A landlord asks the tenant a document is shared with to sign it;
 * the tenant signs in their portal, then the landlord countersigns. Each signature records the typed name,
 * time, IP address, browser and a SHA-256 fingerprint of the document, and the document is locked from the
 * moment signing is requested so everyone signs the same text.
 * Status: awaiting_tenant -> awaiting_landlord -> completed. Cancelling (before completion) removes the request.
 */

export interface EsignEnv { DB: D1Database; }
interface SignUser { id: number; name: string; company: string; email: string; role: string; }
type SendEmail = (to: string, subject: string, html: string, text: string) => Promise<boolean>;
interface Signing { document_id: number; tenancy_id: number; status: string; doc_hash: string; requested_at: string; completed_at: string | null; }
interface SignatureRow { role: string; name: string; email: string; doc_hash: string; ip: string | null; user_agent: string | null; signed_at: string; }

export const CONSENT_TEXT = "I agree to sign this document electronically. My typed name is my signature and has the same effect as signing on paper.";

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 200): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function when(iso: string): string { return new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " Pacific"; }

/** SHA-256 of exactly what is signed: the document type, title and saved fields. */
async function fingerprint(doc: { doc_type: string; title: string; data: string }): Promise<string> {
  const bytes = new TextEncoder().encode(doc.doc_type + "\n" + doc.title + "\n" + doc.data);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getSigning(env: EsignEnv, documentId: number): Promise<Signing | null> {
  return await env.DB.prepare("SELECT * FROM document_signing WHERE document_id = ?").bind(documentId).first<Signing>();
}

/** Why a document can't be edited, moved, unshared or deleted right now, or null when it can. */
export async function lockReason(env: EsignEnv, documentId: number): Promise<string | null> {
  const s = await getSigning(env, documentId);
  if (!s) return null;
  return s.status === "completed" ? "This document is signed, so it can't be changed or deleted. Make a new document instead." : "This document is out for signature. Cancel the signature request to change it.";
}

async function signingInfo(env: EsignEnv, documentId: number, viewerRole: "tenant" | "landlord") {
  const s = await getSigning(env, documentId);
  if (!s) return { status: null, can_sign: false, consent: CONSENT_TEXT, signatures: [] };
  const sigs = await env.DB.prepare("SELECT role, name, email, doc_hash, ip, user_agent, signed_at FROM document_signatures WHERE document_id = ? ORDER BY signed_at").bind(documentId).all<SignatureRow>();
  const doc = await env.DB.prepare("SELECT doc_type, title, data FROM documents WHERE id = ?").bind(documentId).first<{ doc_type: string; title: string; data: string }>();
  const unchanged = !!doc && (await fingerprint(doc)) === s.doc_hash;
  return {
    status: s.status, requested_at: s.requested_at, completed_at: s.completed_at, doc_hash: s.doc_hash, unchanged,
    can_sign: (viewerRole === "tenant" && s.status === "awaiting_tenant") || (viewerRole === "landlord" && s.status === "awaiting_landlord"),
    consent: CONSENT_TEXT,
    signatures: sigs.results.map((r) => ({ role: r.role, name: r.name, email: r.email, signed_at: r.signed_at, ip: r.ip, user_agent: r.user_agent })),
  };
}

function signedBlock(info: Awaited<ReturnType<typeof signingInfo>>): { html: string; text: string } {
  const rows = info.signatures.map((s) => ({ who: (s.role === "tenant" ? "Tenant" : "Landlord") + ": " + s.name + " (" + s.email + ")", at: "Signed " + when(s.signed_at) + (s.ip ? " from IP " + s.ip : "") }));
  return {
    html: rows.map((r) => "<p style=\"margin:0 0 8px\"><strong>" + esc(r.who) + "</strong><br>" + esc(r.at) + "</p>").join("") + "<p style=\"color:#555;font-size:12px\">Document fingerprint (SHA-256): " + esc(String(info.doc_hash)) + "</p>",
    text: rows.map((r) => r.who + "\n" + r.at).join("\n\n") + "\n\nDocument fingerprint (SHA-256): " + info.doc_hash,
  };
}

async function recordSignature(env: EsignEnv, request: Request, documentId: number, role: "tenant" | "landlord", user: SignUser, body: Record<string, unknown>, hash: string): Promise<string | null> {
  const name = str(body.name, 120);
  if (name.length < 2) return "Type your full name to sign.";
  if (body.agree !== true) return "Check the box to agree to sign electronically.";
  await env.DB.prepare("INSERT INTO document_signatures (document_id, role, user_id, name, email, doc_hash, ip, user_agent, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(documentId, role, user.id, name, user.email, hash, request.headers.get("CF-Connecting-IP"), str(request.headers.get("User-Agent"), 300) || null, new Date().toISOString()).run();
  return null;
}

/** Landlord routes: /api/documents/:id/signing (GET, POST to request, DELETE to cancel) and /api/documents/:id/countersign. */
export async function handleLandlordSigningRoutes(request: Request, env: EsignEnv, url: URL, user: SignUser, sendEmail: SendEmail): Promise<Response | null> {
  const m = url.pathname.match(/^\/api\/documents\/(\d+)\/(signing|countersign)$/);
  if (!m) return null;
  const id = parseInt(m[1]);
  const doc = await env.DB.prepare("SELECT d.id, d.doc_type, d.title, d.data, d.tenancy_id, p.address FROM documents d LEFT JOIN properties p ON d.property_id = p.id WHERE d.id = ? AND d.user_id = ?").bind(id, user.id).first<{ id: number; doc_type: string; title: string; data: string; tenancy_id: number | null; address: string | null }>();
  if (!doc) return json({ error: "Not found" }, 404);
  const from = user.company || user.name;
  const link = url.origin + "/document?id=" + id;

  if (m[2] === "signing" && request.method === "GET") return json(await signingInfo(env, id, "landlord"));

  if (m[2] === "signing" && request.method === "POST") {
    if (await getSigning(env, id)) return json({ error: "This document already has a signature request." }, 409);
    if (!doc.tenancy_id) return json({ error: "Share this document with a tenant first, then ask them to sign." }, 400);
    const t = await env.DB.prepare("SELECT id, email, status FROM tenancies WHERE id = ? AND landlord_user_id = ? AND status != 'ended'").bind(doc.tenancy_id, user.id).first<{ id: number; email: string; status: string }>();
    if (!t) return json({ error: "That tenant is no longer connected to your account." }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO document_signing (document_id, tenancy_id, status, doc_hash, requested_at) VALUES (?, ?, 'awaiting_tenant', ?, ?)").bind(id, t.id, await fingerprint(doc), now).run();
    const place = doc.address ? " for " + doc.address : "";
    const setup = t.status === "invited" ? " Use the invite link from your landlord to set up your tenant account first." : "";
    const emailed = await sendEmail(t.email, from + " asked you to sign " + doc.title,
      "<p>" + esc(from) + " asked you to sign <strong>" + esc(doc.title) + "</strong>" + esc(place) + ".</p><p><a href=\"" + link + "\">Read and sign it in your tenant portal</a>." + esc(setup) + "</p><p style=\"color:#555;font-size:12px\">You sign by typing your name. Your landlord signs after you, and you both get an email when it's done.</p>",
      from + " asked you to sign \"" + doc.title + "\"" + place + ".\n\nRead and sign it here: " + link + (setup ? "\n" + setup.trim() : "")).catch(() => false);
    return json({ success: true, emailed, tenant_ready: t.status === "active" });
  }

  if (m[2] === "signing" && request.method === "DELETE") {
    const s = await getSigning(env, id);
    if (!s) return json({ error: "There is no signature request to cancel." }, 404);
    if (s.status === "completed") return json({ error: "This document is already signed by everyone, so the request can't be cancelled." }, 409);
    await env.DB.batch([env.DB.prepare("DELETE FROM document_signatures WHERE document_id = ?").bind(id), env.DB.prepare("DELETE FROM document_signing WHERE document_id = ?").bind(id)]);
    return json({ success: true });
  }

  if (m[2] === "countersign" && request.method === "POST") {
    const s = await getSigning(env, id);
    if (!s || s.status !== "awaiting_landlord") return json({ error: s?.status === "awaiting_tenant" ? "Your tenant hasn't signed yet." : "This document isn't waiting for your signature." }, 409);
    const hash = await fingerprint(doc);
    if (hash !== s.doc_hash) return json({ error: "This document changed after it was sent for signature. Cancel the request and send it again." }, 409);
    const err = await recordSignature(env, request, id, "landlord", user, await request.json() as Record<string, unknown>, hash);
    if (err) return json({ error: err }, 400);
    await env.DB.prepare("UPDATE document_signing SET status = 'completed', completed_at = ? WHERE document_id = ?").bind(new Date().toISOString(), id).run();
    const info = await signingInfo(env, id, "landlord");
    const block = signedBlock(info);
    const tenantEmail = info.signatures.find((x) => x.role === "tenant")?.email;
    const subject = doc.title + " is signed";
    const html = "<p><strong>" + esc(doc.title) + "</strong>" + (doc.address ? " for " + esc(doc.address) : "") + " is now signed by everyone.</p>" + block.html + "<p><a href=\"" + link + "\">Open the signed copy</a> to view it, print it or save it as a PDF.</p>";
    const text = "\"" + doc.title + "\"" + (doc.address ? " for " + doc.address : "") + " is now signed by everyone.\n\n" + block.text + "\n\nOpen the signed copy to view, print or save it as a PDF: " + link;
    const sends = [sendEmail(user.email, subject, html, text).catch(() => false)];
    if (tenantEmail) sends.push(sendEmail(tenantEmail, subject, html, text).catch(() => false));
    await Promise.all(sends);
    return json({ success: true, signing: info });
  }

  return json({ error: "Not found" }, 404);
}

/** Tenant routes: GET /api/tenant/documents/:id/signing and POST /api/tenant/documents/:id/sign. */
export async function handleTenantSigningRoutes(request: Request, env: EsignEnv, url: URL, user: SignUser, sendEmail: SendEmail): Promise<Response | null> {
  const m = url.pathname.match(/^\/api\/tenant\/documents\/(\d+)\/(signing|sign)$/);
  if (!m) return null;
  if (user.role !== "tenant") return json({ error: "This is for tenant accounts." }, 403);
  const id = parseInt(m[1]);
  // Tenants see documents shared with their active home, and keep documents they signed after moving out.
  const doc = await env.DB.prepare("SELECT d.id, d.doc_type, d.title, d.data, d.user_id, t.status AS tenancy_status, p.address FROM documents d JOIN tenancies t ON d.tenancy_id = t.id LEFT JOIN properties p ON d.property_id = p.id WHERE d.id = ? AND t.tenant_user_id = ? AND (t.status = 'active' OR EXISTS (SELECT 1 FROM document_signing s WHERE s.document_id = d.id AND s.status = 'completed'))")
    .bind(id, user.id).first<{ id: number; doc_type: string; title: string; data: string; user_id: number; tenancy_status: string; address: string | null }>();
  if (!doc) return json({ error: "Not found" }, 404);

  if (m[2] === "signing" && request.method === "GET") return json(await signingInfo(env, id, "tenant"));

  if (m[2] === "sign" && request.method === "POST") {
    const s = await getSigning(env, id);
    if (!s || s.status !== "awaiting_tenant" || doc.tenancy_status !== "active") return json({ error: "This document isn't waiting for your signature." }, 409);
    const hash = await fingerprint(doc);
    if (hash !== s.doc_hash) return json({ error: "This document changed after it was sent. Ask your landlord to send it again." }, 409);
    const err = await recordSignature(env, request, id, "tenant", user, await request.json() as Record<string, unknown>, hash);
    if (err) return json({ error: err }, 400);
    await env.DB.prepare("UPDATE document_signing SET status = 'awaiting_landlord' WHERE document_id = ?").bind(id).run();
    const landlord = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(doc.user_id).first<{ email: string }>();
    if (landlord) {
      const link = url.origin + "/document?id=" + id;
      await sendEmail(landlord.email, "Your tenant signed " + doc.title + ". Your turn to sign",
        "<p>Your tenant signed <strong>" + esc(doc.title) + "</strong>" + (doc.address ? " for " + esc(doc.address) : "") + ".</p><p><a href=\"" + link + "\">Countersign it here</a> to finish. You both get the signed copy by email when you do.</p>",
        "Your tenant signed \"" + doc.title + "\"" + (doc.address ? " for " + doc.address : "") + ".\n\nCountersign it here to finish: " + link).catch(() => false);
    }
    return json({ success: true, signing: await signingInfo(env, id, "tenant") });
  }

  return json({ error: "Not found" }, 404);
}
