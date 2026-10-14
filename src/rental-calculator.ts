// Free landlord calculators (/rental-calculator, /cap-rate-calculator, /cash-on-cash-calculator,
// /california-rent-increase-calculator). The math runs in the browser; when a visitor asks for the report by email,
// this recomputes it from their inputs, emails it to them, saves them as a calculator lead and tells EC Rental.

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

/** Cap rate page: price, rent and yearly operating costs. */
export function capRate(b: Record<string, unknown>) {
  const price = num(b.price, 100_000_000), rent = num(b.rent, 1_000_000), other = num(b.other_income, 1_000_000), vac = num(b.vacancy_pct, 100), opexYear = num(b.opex_year, 100_000_000);
  const income = (rent + other) * 12 * (1 - vac / 100), noi = income - opexYear;
  return { price, rent, other_income: other, vacancy_pct: vac, opex_year: opexYear, income_year: income, noi_year: noi, cap_rate: price > 0 ? noi / price * 100 : NaN };
}

/** Cash-on-cash page: cash put in, monthly rent and monthly costs including the mortgage. */
export function cashOnCash(b: Record<string, unknown>) {
  const down = num(b.down, 100_000_000), closing = num(b.closing, 10_000_000), repairs = num(b.repairs, 10_000_000), rent = num(b.rent, 1_000_000), costs = num(b.costs, 1_000_000);
  const invested = down + closing + repairs, cashflow = rent - costs;
  return { down, closing, repairs, rent, costs, invested, cashflow, cash_on_cash: invested > 0 ? cashflow * 12 / invested * 100 : NaN };
}

/** California rent increase page (AB 1482, Civ. Code 1947.12 and notice under Civ. Code 827). */
export function rentIncrease(b: Record<string, unknown>) {
  const rent = num(b.current_rent, 1_000_000), cpi = num(b.cpi_pct, 50), exempt = b.exempt === true || b.exempt === "true" || b.exempt === "yes", proposed = num(b.proposed_rent, 1_000_000);
  const capPct = exempt ? NaN : Math.min(5 + cpi, 10), maxRent = exempt ? NaN : rent * (1 + capPct / 100);
  const raisePct = rent > 0 && proposed > 0 ? (proposed - rent) / rent * 100 : NaN;
  const allowed = !proposed ? null : exempt ? true : proposed <= maxRent + 0.005;
  const noticeDays = Number.isFinite(raisePct) ? (raisePct > 10 ? 90 : 30) : 30;
  return { current_rent: rent, cpi_pct: cpi, exempt, proposed_rent: proposed, cap_pct: capPct, max_rent: maxRent, raise_pct: raisePct, allowed, notice_days: noticeDays };
}

const TOOLS: Record<string, { title: string; page: string }> = {
  rental: { title: "rental property report", page: "rental-calculator" },
  cap_rate: { title: "cap rate report", page: "cap-rate-calculator" },
  cash_on_cash: { title: "cash-on-cash report", page: "cash-on-cash-calculator" },
  rent_increase: { title: "California rent increase report", page: "california-rent-increase-calculator" },
};

/** The report rows and lead details for one tool, recomputed here so the email only says what the math says. */
function report(tool: string, b: Record<string, unknown>): { rows: [string, string][]; details: Record<string, unknown> } | { error: string } {
  if (tool === "cap_rate") {
    const c = capRate(b); if (!c.price || !c.rent) return { error: "Please enter the price and monthly rent first." };
    return { rows: [["Purchase price", money(c.price)], ["Monthly rent", money(c.rent)], ["Income after vacancy", money(c.income_year) + " / year"], ["Operating costs", money(c.opex_year) + " / year"], ["Net operating income", money(c.noi_year) + " / year"], ["Cap rate", pct(c.cap_rate)]],
      details: { ...c, cap_rate: Number.isFinite(c.cap_rate) ? +c.cap_rate.toFixed(2) : null } };
  }
  if (tool === "cash_on_cash") {
    const c = cashOnCash(b); if (!c.invested || !c.rent) return { error: "Please enter the cash you put in and the monthly rent first." };
    return { rows: [["Cash put in", money(c.invested)], ["Monthly rent", money(c.rent)], ["Monthly costs (including mortgage)", money(c.costs)], ["Cash flow", money(c.cashflow) + " / month (" + money(c.cashflow * 12) + " / year)"], ["Cash-on-cash return", pct(c.cash_on_cash)]],
      details: { ...c, cash_on_cash: Number.isFinite(c.cash_on_cash) ? +c.cash_on_cash.toFixed(2) : null } };
  }
  if (tool === "rent_increase") {
    const c = rentIncrease(b); if (!c.current_rent) return { error: "Please enter the current rent first." };
    const rows: [string, string][] = [["Lowest rent in the last 12 months", money(c.current_rent)], ["Exempt from AB 1482", c.exempt ? "Yes (you said so)" : "No"]];
    if (!c.exempt) rows.push(["Regional CPI change you entered", c.cpi_pct + "%"], ["Most you can raise it", pct(c.cap_pct) + " (5% + CPI, never over 10%)"], ["Highest allowed new rent", money(c.max_rent)]);
    if (c.proposed_rent) rows.push(["Your proposed rent", money(c.proposed_rent) + " (" + pct(c.raise_pct) + ")"], ["Within the cap", c.allowed ? "Yes" : "No, lower it to " + money(c.max_rent) + " or less"], ["Written notice needed", c.notice_days + " days"]);
    return { rows, details: { ...c, cap_pct: Number.isFinite(c.cap_pct) ? c.cap_pct : null, max_rent: Number.isFinite(c.max_rent) ? Math.round(c.max_rent) : null, raise_pct: Number.isFinite(c.raise_pct) ? +c.raise_pct.toFixed(2) : null } };
  }
  const inp = readInputs(b), c = calculate(inp);
  if (!inp.price || !inp.rent) return { error: "Please enter the price and monthly rent first." };
  return { rows: [
    ["Purchase price", money(inp.price)], ["Down payment", `${inp.down_pct}% (${money(inp.price * inp.down_pct / 100)})`],
    ["Loan", `${money(c.loan)} at ${inp.rate}% for ${inp.years} years`], ["Monthly rent", money(inp.rent)],
    ["Mortgage payment (principal and interest)", money(c.mortgage) + " / month"],
    ["Income after vacancy", money(c.income) + " / month"], ["Operating expenses", money(c.opex) + " / month"],
    ["Net operating income", money(c.noi) + " / month (" + money(c.noi * 12) + " / year)"],
    ["Cash flow", money(c.cashflow) + " / month (" + money(c.cashflow * 12) + " / year)"],
    ["Cap rate", pct(c.cap_rate)], ["Cash-on-cash return", pct(c.cash_on_cash)],
    ["Debt coverage (DSCR)", Number.isFinite(c.dscr) ? c.dscr.toFixed(2) : "No loan"], ["Cash needed to buy", money(c.invested)],
  ], details: { ...inp, cashflow: Math.round(c.cashflow), cap_rate: Number.isFinite(c.cap_rate) ? +c.cap_rate.toFixed(2) : null, cash_on_cash: Number.isFinite(c.cash_on_cash) ? +c.cash_on_cash.toFixed(2) : null } };
}

export async function handleRentalCalculator(request: Request, env: CalcEnv, url: URL, allow: () => Promise<boolean>, notify?: Notify): Promise<Response | null> {
  if (url.pathname !== "/api/public/calculator-report" || request.method !== "POST") return null;
  if (!(await allow())) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
  const body = await request.json() as Record<string, unknown>;
  if (str(body.website, 100)) return json({ success: true }); // spam trap: a hidden field people never fill in
  const name = str(body.name, 100), email = str(body.email, 200), phone = str(body.phone, 30), label = str(body.label, 200);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Please enter your name and email." }, 400);
  const tool = TOOLS[str(body.tool, 30)] ? str(body.tool, 30) : "rental", meta = TOOLS[tool];
  const r = report(tool, body);
  if ("error" in r) return json({ error: r.error }, 400);
  const rows: [string, string][] = [["Property", label || "Not named"], ...r.rows];
  const first = esc(name.split(" ")[0]), pageUrl = `https://ecrentalpm.com/${meta.page}`;
  const table = `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows.map(([k, v]) => `<tr><td style="border-bottom:1px solid #eee;color:#555">${esc(k)}</td><td style="border-bottom:1px solid #eee"><b>${esc(v)}</b></td></tr>`).join("")}</table>`;
  const note = tool === "rent_increase"
    ? "This is general information from the numbers you entered, not legal advice. Check local rent control rules too, since some cities are stricter than state law."
    : "These are estimates from the numbers you entered, not financial, tax or lending advice. Check taxes, insurance and loan terms with your lender and tax pro.";
  const cta = "Own rentals already? EC Rental is property management software with Tello, an AI assistant, plus listings, applications, rent reminders, online rent, maintenance and tax reports. Start for $3 for your first 3 months: https://ecrentalpm.com/#subscribe";

  await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(name, "", email, phone, "1", "calculator", JSON.stringify({ source: "rental_calculator", tool, label, ...r.details }), "pending", new Date().toISOString()).run();

  let sent = false;
  if (notify) {
    try {
      sent = !!(await notify(email, `Your ${meta.title}${label ? ": " + label : ""}`,
        `<p>Hi ${first},</p><p>Here is the ${esc(meta.title)} you ran on ecrentalpm.com.</p>${table}<p style="color:#666;font-size:12px">${esc(note)}</p><p>${esc(cta).replace("https://ecrentalpm.com/#subscribe", '<a href="https://ecrentalpm.com/#subscribe">ecrentalpm.com</a>')}</p><p>Run another one anytime: <a href="${pageUrl}">ecrentalpm.com/${meta.page}</a></p><p>EC Rental Property Management<br>info@ecrentalpm.com</p>`,
        `Hi ${name.split(" ")[0]},\n\nHere is the ${meta.title} you ran on ecrentalpm.com.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${note}\n\n${cta}\n\nRun another one anytime: ${pageUrl}\n\nEC Rental Property Management\ninfo@ecrentalpm.com`));
    } catch (err) { console.error("[rental-calculator] email", err); }
    try {
      const lines = [`Tool: ${meta.title}`, `Name: ${name}`, `Email: ${email}`, ...(phone ? [`Phone: ${phone}`] : []), ...rows.map(([k, v]) => `${k}: ${v}`)];
      await notify(NOTIFY_TO, `Calculator lead: ${name}${label ? " (" + label + ")" : ""}`,
        `<p>Someone emailed themselves a ${esc(meta.title)} on ecrentalpm.com. They may own or be buying a rental.</p><p>${lines.map(esc).join("<br>")}</p>`,
        `Someone emailed themselves a ${meta.title} on ecrentalpm.com. They may own or be buying a rental.\n\n` + lines.join("\n"));
    } catch (err) { console.error("[rental-calculator] notify", err); }
  }
  return json({ success: true, emailed: sent });
}
