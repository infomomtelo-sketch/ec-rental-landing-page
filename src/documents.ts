/**
 * Landlord documents: leases, notices, invoices, receipts and printable applications.
 * The dashboard fills a template (public/js/doc-templates.js) and the filled-in fields are saved
 * here as JSON; the same script renders them for preview, printing and the tenant portal.
 * A landlord can share a document with one tenancy, and that tenant then sees it in their portal.
 */

import { lockReason } from "./esign";

export interface DocumentsEnv { DB: D1Database; }
interface DocUser { id: number; name: string; company: string; email: string; role: string; }
type SendEmail = (to: string, subject: string, html: string, text: string) => Promise<boolean>;

export const DOC_TYPES = ["lease", "notice_pay_or_quit", "invoice", "receipt", "application", "notice_of_entry"];
const DOC_LABELS: Record<string, string> = { lease: "Rental agreement", notice_pay_or_quit: "3-day notice to pay rent or quit", invoice: "Rent invoice", receipt: "Rent receipt", application: "Rental application", notice_of_entry: "Notice of entry" };
const MAX_DATA_BYTES = 60_000;

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 200): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }

/** Keeps only string fields and item rows, so stored data is plain and bounded. */
function cleanData(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 120)) {
    if (!/^[a-z0-9_]{1,40}$/.test(k)) continue;
    if (Array.isArray(val)) out[k] = val.slice(0, 20).map((row) => row && typeof row === "object" ? { desc: str((row as Record<string, unknown>).desc, 200), amount: str((row as Record<string, unknown>).amount, 20) } : { desc: "", amount: "" });
    else if (typeof val === "boolean") out[k] = val;
    else out[k] = str(val, 4000);
  }
  return JSON.stringify(out).length > MAX_DATA_BYTES ? null : out;
}

async function ownsProperty(env: DocumentsEnv, userId: number, propertyId: unknown): Promise<number | null> {
  if (propertyId === null || propertyId === undefined || propertyId === "") return null;
  const id = Number(propertyId);
  if (!Number.isInteger(id)) return -1;
  const row = await env.DB.prepare("SELECT id FROM properties WHERE id = ? AND user_id = ?").bind(id, userId).first();
  return row ? id : -1;
}

const LIST_SQL = "SELECT d.id, d.doc_type, d.title, d.property_id, d.tenancy_id, d.shared_at, d.created_at, d.updated_at, p.address AS property_address, t.email AS shared_with, s.status AS sign_status FROM documents d LEFT JOIN properties p ON d.property_id = p.id LEFT JOIN tenancies t ON d.tenancy_id = t.id LEFT JOIN document_signing s ON s.document_id = d.id";

/** Landlord routes under /api/documents. */
export async function handleDocumentRoutes(request: Request, env: DocumentsEnv, url: URL, user: DocUser, sendEmail: SendEmail): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/documents")) return null;

  if (path === "/api/documents" && request.method === "GET") {
    const rows = await env.DB.prepare(LIST_SQL + " WHERE d.user_id = ? ORDER BY d.updated_at DESC LIMIT 300").bind(user.id).all();
    return json(rows.results);
  }

  if (path === "/api/documents" && request.method === "POST") {
    const body = await request.json() as Record<string, unknown>;
    const type = str(body.doc_type, 40);
    if (!DOC_TYPES.includes(type)) return json({ error: "Choose a document type." }, 400);
    const data = cleanData(body.data);
    if (!data) return json({ error: "This document is too large to save." }, 400);
    const prop = await ownsProperty(env, user.id, body.property_id);
    if (prop === -1) return json({ error: "Property not found" }, 404);
    const now = new Date().toISOString();
    const res = await env.DB.prepare("INSERT INTO documents (user_id, property_id, doc_type, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(user.id, prop, type, str(body.title, 150) || DOC_LABELS[type], JSON.stringify(data), now, now).run();
    return json({ success: true, id: res.meta.last_row_id });
  }

  const one = path.match(/^\/api\/documents\/(\d+)$/);
  if (one) {
    const id = parseInt(one[1]);
    if (request.method === "GET") {
      const doc = await env.DB.prepare(LIST_SQL.replace("SELECT d.id,", "SELECT d.data, d.id,") + " WHERE d.id = ? AND d.user_id = ?").bind(id, user.id).first<Record<string, unknown>>();
      if (!doc) return json({ error: "Not found" }, 404);
      return json({ ...doc, data: JSON.parse(String(doc.data || "{}")) });
    }
    if (request.method === "PUT" || request.method === "DELETE") {
      const locked = await lockReason(env, id);
      if (locked) return json({ error: locked }, 409);
    }
    if (request.method === "PUT") {
      const body = await request.json() as Record<string, unknown>;
      const data = cleanData(body.data);
      if (!data) return json({ error: "This document is too large to save." }, 400);
      const prop = await ownsProperty(env, user.id, body.property_id);
      if (prop === -1) return json({ error: "Property not found" }, 404);
      // Moving a document to another property un-shares it, so it can't land with the wrong tenant.
      const res = await env.DB.prepare("UPDATE documents SET title = ?, data = ?, tenancy_id = CASE WHEN property_id IS ? THEN tenancy_id ELSE NULL END, shared_at = CASE WHEN property_id IS ? THEN shared_at ELSE NULL END, property_id = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .bind(str(body.title, 150) || "Untitled document", JSON.stringify(data), prop, prop, prop, new Date().toISOString(), id, user.id).run();
      if (!res.meta.changes) return json({ error: "Not found" }, 404);
      return json({ success: true, id });
    }
    if (request.method === "DELETE") {
      const res = await env.DB.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").bind(id, user.id).run();
      if (!res.meta.changes) return json({ error: "Not found" }, 404);
      return json({ success: true });
    }
  }

  const share = path.match(/^\/api\/documents\/(\d+)\/share$/);
  if (share && request.method === "POST") {
    const id = parseInt(share[1]);
    const body = await request.json() as { tenancy_id?: unknown };
    const doc = await env.DB.prepare("SELECT id, title, property_id FROM documents WHERE id = ? AND user_id = ?").bind(id, user.id).first<{ id: number; title: string; property_id: number | null }>();
    if (!doc) return json({ error: "Not found" }, 404);
    const locked = await lockReason(env, id);
    if (locked) return json({ error: locked }, 409);
    if (body.tenancy_id === null || body.tenancy_id === "" || body.tenancy_id === undefined) {
      await env.DB.prepare("UPDATE documents SET tenancy_id = NULL, shared_at = NULL WHERE id = ?").bind(id).run();
      return json({ success: true, shared: false });
    }
    const t = await env.DB.prepare("SELECT t.id, t.email, t.status, t.property_id, p.address FROM tenancies t JOIN properties p ON t.property_id = p.id WHERE t.id = ? AND t.landlord_user_id = ? AND t.status != 'ended'").bind(Number(body.tenancy_id), user.id).first<{ id: number; email: string; status: string; property_id: number; address: string }>();
    if (!t) return json({ error: "That tenant isn't connected to your account." }, 404);
    if (doc.property_id !== null && doc.property_id !== t.property_id) return json({ error: "That tenant lives at a different property than this document." }, 400);
    await env.DB.prepare("UPDATE documents SET tenancy_id = ?, shared_at = ? WHERE id = ?").bind(t.id, new Date().toISOString(), id).run();
    const from = user.company || user.name;
    const link = url.origin + "/tenant";
    const emailed = await sendEmail(t.email, from + " shared a document with you",
      "<p>" + esc(from) + " shared <strong>" + esc(doc.title) + "</strong> for " + esc(t.address) + ".</p><p><a href=\"" + link + "\">Open your tenant portal</a> to view or print it." + (t.status === "invited" ? " Use the invite link from your landlord to set up your account first." : "") + "</p>",
      from + " shared \"" + doc.title + "\" for " + t.address + ".\n\nView or print it in your tenant portal: " + link + (t.status === "invited" ? "\nUse the invite link from your landlord to set up your account first." : "")).catch(() => false);
    return json({ success: true, shared: true, emailed, tenant_ready: t.status === "active" });
  }

  return json({ error: "Not found" }, 404);
}

/** Tenant portal routes: documents a landlord shared with this tenant's active tenancies, plus ones they signed. */
export async function handleTenantDocumentRoutes(request: Request, env: DocumentsEnv, url: URL, user: DocUser): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/tenant/documents") || request.method !== "GET") return null;
  if (user.role !== "tenant") return json({ error: "This is for tenant accounts." }, 403);
  const base = "FROM documents d JOIN tenancies t ON d.tenancy_id = t.id LEFT JOIN document_signing s ON s.document_id = d.id WHERE t.tenant_user_id = ? AND (t.status = 'active' OR s.status = 'completed')";
  if (path === "/api/tenant/documents") {
    const rows = await env.DB.prepare("SELECT d.id, d.doc_type, d.title, d.shared_at, t.id AS tenancy_id, s.status AS sign_status " + base + " ORDER BY d.shared_at DESC LIMIT 100").bind(user.id).all();
    return json(rows.results);
  }
  const one = path.match(/^\/api\/tenant\/documents\/(\d+)$/);
  if (one) {
    const doc = await env.DB.prepare("SELECT d.id, d.doc_type, d.title, d.data, d.shared_at, s.status AS sign_status " + base + " AND d.id = ?").bind(user.id, parseInt(one[1])).first<Record<string, unknown>>();
    if (!doc) return json({ error: "Not found" }, 404);
    return json({ ...doc, data: JSON.parse(String(doc.data || "{}")) });
  }
  return json({ error: "Not found" }, 404);
}
