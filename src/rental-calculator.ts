// Free rental property calculator (/rental-calculator page). The math runs in the browser; when a visitor asks for the
// report by email, this recomputes it from their inputs, emails it to them, saves them as a lead and tells EC Rental.

type Notify = (to: string, subject: string, html: string, text: string) => Promise<unknown>;
interface CalcEnv { DB: D1Database; }
const NOTIFY_TO = "info@ecrentalpm.com";

function str(v: unknown, max: number): string { return String(v ?? "").trim().slice(0, max); }
function num(v: unknown, max: number): number { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function money(n: number): string { return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US"); }
function pct(n: number): string { return Number.isFinite(n) ? n.toFixed(1) + "%" : "n/a"; }

export interface CalcInputs { price: number; down_pct: number; rate: number; years: number; closing: number; rent: number; other_income: number; vacancy_pct: number; tax_year: number; insurance_year: number; hoa: number; utilities: number; maintenance_pct: number; management_pct: number; }

export function readInputs(b: Record<string, unknown>): CalcInputs {
  return {
    price: num(b.price, 100_000_000), down_pct: num(b.down_pct, 100), rate: num(b.rate, 30), years: Math.max(1, Math.round(num(b.years, 40)) || 30),
    closing: num(b.closing, 10_000_000), rent: num(b.rent, 1_000_000), other_income: num(b.other_income, 1_000_000), vacancy_pct: num(b.vacancy_pct, 100),
    tax_year: num(b.tax_year, 10_000_000), insurance_year: num(b.insurance_year, 10_000_000), hoa: num(b.hoa, 1_000_000), utilities: num(b.utilities, 1_000_000),
    maintenance_pct: num(b.maintenance_pct, 100), management_pct: num(b.management_pct, 100),
  };
}

/** Same formulas as public/rental-calculator.html. Monthly figures unless the name says year. */
export function calculate(i: CalcInputs) {
  const loan = i.price * (1 - i.down_pct / 100), r = i.rate / 1200, n = i.years * 12;
  const mortgage = loan <= 0 ? 0 : r === 0 ? loan / n : loan * r / (1 - Math.pow(1 + r, -n));
  const gross = i.rent + i.other_income, income = gross * (1 - i.vacancy_pct / 100);
  const opex = i.tax_year / 12 + i.insurance_year / 12 + i.hoa + i.utilities + i.rent * i.maintenance_pct / 100 + income * i.management_pct / 100;
  const noi = income - opex, cashflow = noi - mortgage, invested = i.price * i.down_pct / 100 + i.closing;
  return {
    loan, mortgage, gross, income, opex, noi, cashflow, invested,
    cap_rate: i.price > 0 ? noi * 12 / i.price * 100 : NaN,
    cash_on_cash: invested > 0 ? cashflow * 12 / invested * 100 : NaN,
    dscr: mortgage > 0 ? noi / mortgage : NaN,
  };
}

export async function handleRentalCalculator(request: Request, env: CalcEnv, url: URL, allow: () => Promise<boolean>, notify?: Notify): Promise<Response | null> {
  if (url.pathname !== "/api/public/calculator-report" || request.method !== "POST") return null;
  if (!(await allow())) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
  const body = await request.json() as Record<string, unknown>;
  if (str(body.website, 100)) return json({ success: true }); // spam trap: a hidden field people never fill in
  const name = str(body.name, 100), email = str(body.email, 200), phone = str(body.phone, 30), label = str(body.label, 200);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Please enter your name and email." }, 400);
  const inp = readInputs(body), c = calculate(inp);
  if (!inp.price || !inp.rent) return json({ error: "Please enter the price and monthly rent first." }, 400);

  const rows: [string, string][] = [
    ["Property", label || "Not named"],
    ["Purchase price", money(inp.price)], ["Down payment", `${inp.down_pct}% (${money(inp.price * inp.down_pct / 100)})`],
    ["Loan", `${money(c.loan)} at ${inp.rate}% for ${inp.years} years`], ["Monthly rent", money(inp.rent)],
    ["Mortgage payment (principal and interest)", money(c.mortgage) + " / month"],
    ["Income after vacancy", money(c.income) + " / month"], ["Operating expenses", money(c.opex) + " / month"],
    ["Net operating income", money(c.noi) + " / month (" + money(c.noi * 12) + " / year)"],
    ["Cash flow", money(c.cashflow) + " / month (" + money(c.cashflow * 12) + " / year)"],
    ["Cap rate", pct(c.cap_rate)], ["Cash-on-cash return", pct(c.cash_on_cash)],
    ["Debt coverage (DSCR)", Number.isFinite(c.dscr) ? c.dscr.toFixed(2) : "No loan"], ["Cash needed to buy", money(c.invested)],
  ];
  const first = esc(name.split(" ")[0]);
  const table = `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows.map(([k, v]) => `<tr><td style="border-bottom:1px solid #eee;color:#555">${esc(k)}</td><td style="border-bottom:1px solid #eee"><b>${esc(v)}</b></td></tr>`).join("")}</table>`;
  const note = "These are estimates from the numbers you entered, not financial, tax or lending advice. Check taxes, insurance and loan terms with your lender and tax pro.";
  const cta = "Own rentals already? EC Rental is property management software with Tello, an AI assistant, plus listings, applications, rent reminders, online rent, maintenance and tax reports. Start for $3 for your first 3 months: https://ecrentalpm.com/#subscribe";

  const details = { source: "rental_calculator", label, ...inp, cashflow: Math.round(c.cashflow), cap_rate: Number.isFinite(c.cap_rate) ? +c.cap_rate.toFixed(2) : null, cash_on_cash: Number.isFinite(c.cash_on_cash) ? +c.cash_on_cash.toFixed(2) : null };
  await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(name, "", email, phone, "1", "calculator", JSON.stringify(details), "pending", new Date().toISOString()).run();

  let sent = false;
  if (notify) {
    try {
      sent = !!(await notify(email, `Your rental property report${label ? ": " + label : ""}`,
        `<p>Hi ${first},</p><p>Here is the rental property report you ran on ecrentalpm.com.</p>${table}<p style="color:#666;font-size:12px">${esc(note)}</p><p>${esc(cta).replace("https://ecrentalpm.com/#subscribe", '<a href="https://ecrentalpm.com/#subscribe">ecrentalpm.com</a>')}</p><p>Run another one anytime: <a href="https://ecrentalpm.com/rental-calculator">ecrentalpm.com/rental-calculator</a></p><p>EC Rental Property Management<br>info@ecrentalpm.com</p>`,
        `Hi ${name.split(" ")[0]},\n\nHere is the rental property report you ran on ecrentalpm.com.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${note}\n\n${cta}\n\nRun another one anytime: https://ecrentalpm.com/rental-calculator\n\nEC Rental Property Management\ninfo@ecrentalpm.com`));
    } catch (err) { console.error("[rental-calculator] email", err); }
    try {
      const lines = [`Name: ${name}`, `Email: ${email}`, ...(phone ? [`Phone: ${phone}`] : []), ...rows.map(([k, v]) => `${k}: ${v}`)];
      await notify(NOTIFY_TO, `Calculator lead: ${name}${label ? " (" + label + ")" : ""}`,
        `<p>Someone emailed themselves a rental calculator report on ecrentalpm.com. They may own or be buying a rental.</p><p>${lines.map(esc).join("<br>")}</p>`,
        "Someone emailed themselves a rental calculator report on ecrentalpm.com. They may own or be buying a rental.\n\n" + lines.join("\n"));
    } catch (err) { console.error("[rental-calculator] notify", err); }
  }
  return json({ success: true, emailed: sent });
}
