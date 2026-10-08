/**
 * Transactions and tax reports. Every transaction belongs to one of the landlord's properties; expenses carry an
 * IRS Schedule E category (kept beside transactions in transaction_categories, so the old table never needs ALTER).
 * The tax report is for one calendar year: rents received, expenses by Schedule E line, net, and month by month.
 * Not tax advice; depreciation isn't included, the landlord's tax preparer adds it.
 */

export interface FinanceEnv { DB: D1Database; }
interface FinanceUser { id: number; }
interface TxnRow { id: number; property_id: number; type: string; amount: number; description: string; date: string; created_at: string; property_address: string; category: string | null; }

export const TXN_TYPES = ["rent", "expense", "fee", "distribution"];
/** Schedule E (Form 1040) expense lines. "Management fees" (line 11) is also where the "fee" type lands. */
export const EXPENSE_CATEGORIES: Record<string, { label: string; line: number }> = {
  advertising: { label: "Advertising", line: 5 },
  auto_travel: { label: "Auto and travel", line: 6 },
  cleaning_maintenance: { label: "Cleaning and maintenance", line: 7 },
  commissions: { label: "Commissions", line: 8 },
  insurance: { label: "Insurance", line: 9 },
  legal_professional: { label: "Legal and other professional fees", line: 10 },
  management_fees: { label: "Management fees", line: 11 },
  mortgage_interest: { label: "Mortgage interest paid to banks", line: 12 },
  other_interest: { label: "Other interest", line: 13 },
  repairs: { label: "Repairs", line: 14 },
  supplies: { label: "Supplies", line: 15 },
  taxes: { label: "Taxes", line: 16 },
  utilities: { label: "Utilities", line: 17 },
  other: { label: "Other", line: 19 },
};

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max: number): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
const cents = (n: number) => Math.round(n * 100) / 100;

const SELECT_TXNS = "SELECT t.id, t.property_id, t.type, t.amount, t.description, t.date, t.created_at, p.address AS property_address, c.category FROM transactions t JOIN properties p ON t.property_id = p.id LEFT JOIN transaction_categories c ON c.transaction_id = t.id WHERE p.user_id = ?";

/** Checks a transaction from the dashboard form. */
function parseTxn(body: Record<string, unknown>): { error: string } | { type: string; amount: number; date: string; description: string; category: string | null } {
  const type = str(body.type, 20);
  if (!TXN_TYPES.includes(type)) return { error: "Choose a transaction type." };
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return { error: "Enter an amount greater than $0." };
  const date = str(body.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + "T00:00:00Z"))) return { error: "Choose a date." };
  let category: string | null = null;
  if (type === "expense") {
    category = str(body.category, 40) || "other";
    if (!(category in EXPENSE_CATEGORIES)) return { error: "Choose an expense category." };
  }
  return { type, amount: cents(amount), date, description: str(body.description, 300), category };
}

async function saveCategory(env: FinanceEnv, id: number, category: string | null): Promise<void> {
  if (category) await env.DB.prepare("INSERT INTO transaction_categories (transaction_id, category) VALUES (?, ?) ON CONFLICT(transaction_id) DO UPDATE SET category = excluded.category").bind(id, category).run();
  else await env.DB.prepare("DELETE FROM transaction_categories WHERE transaction_id = ?").bind(id).run();
}

async function ownsProperty(env: FinanceEnv, userId: number, propertyId: unknown): Promise<boolean> {
  const id = Number(propertyId);
  return Number.isInteger(id) && !!(await env.DB.prepare("SELECT id FROM properties WHERE id = ? AND user_id = ?").bind(id, userId).first());
}

/** /api/transactions, /api/transactions/:id and /api/reports for a signed-in landlord. Returns null for other paths. */
export async function handleFinanceRoutes(request: Request, env: FinanceEnv, url: URL, user: FinanceUser): Promise<Response | null> {
  const path = url.pathname;

  if (path === "/api/transactions" && request.method === "GET") {
    const rows = await env.DB.prepare(SELECT_TXNS + " ORDER BY t.date DESC, t.id DESC").bind(user.id).all<TxnRow>();
    return json(rows.results);
  }
  if (path === "/api/transactions" && request.method === "POST") {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (!(await ownsProperty(env, user.id, body.property_id))) return json({ error: "Choose one of your properties." }, 400);
    const t = parseTxn(body);
    if ("error" in t) return json(t, 400);
    const res = await env.DB.prepare("INSERT INTO transactions (property_id, type, amount, description, date, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(Number(body.property_id), t.type, t.amount, t.description, t.date, new Date().toISOString()).run();
    const id = Number(res.meta.last_row_id);
    await saveCategory(env, id, t.category);
    return json({ success: true, id });
  }

  const one = path.match(/^\/api\/transactions\/(\d+)$/);
  if (one) {
    const id = parseInt(one[1]);
    const existing = await env.DB.prepare(SELECT_TXNS + " AND t.id = ?").bind(user.id, id).first<TxnRow>();
    if (!existing) return json({ error: "Transaction not found" }, 404);
    if (request.method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM transaction_categories WHERE transaction_id = ?").bind(id),
        env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(id),
      ]);
      return json({ success: true });
    }
    if (request.method === "PUT") {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const propertyId = body.property_id === undefined ? existing.property_id : Number(body.property_id);
      if (!(await ownsProperty(env, user.id, propertyId))) return json({ error: "Choose one of your properties." }, 400);
      const t = parseTxn({ ...existing, category: existing.category, ...body });
      if ("error" in t) return json(t, 400);
      await env.DB.prepare("UPDATE transactions SET property_id = ?, type = ?, amount = ?, description = ?, date = ? WHERE id = ?").bind(propertyId, t.type, t.amount, t.description, t.date, id).run();
      await saveCategory(env, id, t.category);
      return json({ success: true });
    }
    return json({ error: "Not found" }, 404);
  }

  if (path === "/api/reports" && request.method === "GET") {
    const yearsRows = await env.DB.prepare("SELECT DISTINCT substr(t.date, 1, 4) AS y FROM transactions t JOIN properties p ON t.property_id = p.id WHERE p.user_id = ? AND t.date GLOB '[0-9][0-9][0-9][0-9]-*' ORDER BY y DESC").bind(user.id).all<{ y: string }>();
    const thisYear = new Date().getUTCFullYear();
    const years = Array.from(new Set([String(thisYear), ...yearsRows.results.map((r) => r.y)])).sort().reverse().map(Number);
    const asked = parseInt(url.searchParams.get("year") || "");
    const year = years.includes(asked) ? asked : (yearsRows.results.length ? Number(yearsRows.results[0].y) : thisYear);
    const props = await env.DB.prepare("SELECT id, address, city, state, zip FROM properties WHERE user_id = ? ORDER BY address").bind(user.id).all<{ id: number; address: string; city: string; state: string; zip: string }>();
    const rows = await env.DB.prepare(SELECT_TXNS + " AND t.date >= ? AND t.date <= ? ORDER BY t.date, t.id").bind(user.id, `${year}-01-01`, `${year}-12-31`).all<TxnRow>();
    return json(buildReport(year, years, props.results, rows.results));
  }

  return null;
}

type Bucket = { rent: number; expenses: Record<string, number>; expenses_total: number; distributions: number; uncategorized: number };
const emptyBucket = (): Bucket => ({ rent: 0, expenses: {}, expenses_total: 0, distributions: 0, uncategorized: 0 });

function add(b: Bucket, t: TxnRow): void {
  if (t.type === "rent") b.rent += t.amount;
  else if (t.type === "distribution") b.distributions += t.amount;
  else if (t.type === "fee" || t.type === "expense") {
    const cat = t.type === "fee" ? "management_fees" : t.category && t.category in EXPENSE_CATEGORIES ? t.category : "other";
    if (t.type === "expense" && !t.category) b.uncategorized += 1;
    b.expenses[cat] = cents((b.expenses[cat] || 0) + t.amount);
    b.expenses_total += t.amount;
  }
}
const finish = (b: Bucket) => ({ ...b, rent: cents(b.rent), expenses_total: cents(b.expenses_total), distributions: cents(b.distributions), net: cents(b.rent - b.expenses_total) });

/** One calendar year of rents and Schedule E expenses, per property, in total and month by month. */
export function buildReport(year: number, years: number[], props: { id: number; address: string; city: string; state: string; zip: string }[], txns: TxnRow[]) {
  const per = new Map(props.map((p) => [p.id, emptyBucket()]));
  const total = emptyBucket();
  const months = Array.from({ length: 12 }, () => ({ rent: 0, expenses: 0 }));
  for (const t of txns) {
    const b = per.get(t.property_id);
    if (!b) continue;
    add(b, t); add(total, t);
    const m = parseInt(t.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) { if (t.type === "rent") months[m].rent += t.amount; else if (t.type === "expense" || t.type === "fee") months[m].expenses += t.amount; }
  }
  return {
    year, years,
    categories: Object.entries(EXPENSE_CATEGORIES).map(([id, c]) => ({ id, label: c.label, line: c.line })),
    properties: props.map((p) => ({ id: p.id, address: p.address, city: p.city, state: p.state, zip: p.zip, ...finish(per.get(p.id)!) })),
    totals: finish(total),
    months: months.map((m, i) => ({ month: i + 1, rent: cents(m.rent), expenses: cents(m.expenses), net: cents(m.rent - m.expenses) })),
    transactions: txns.map((t) => ({ id: t.id, date: t.date, property_id: t.property_id, property_address: t.property_address, type: t.type, category: t.type === "fee" ? "management_fees" : t.category, amount: t.amount, description: t.description })),
  };
}
