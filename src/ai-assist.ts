/**
 * AI help for landlords (Workers AI): listing descriptions written from the listing's details and
 * photos, draft replies to renter inquiries, rewrite / spelling-and-grammar fixes, a rent check
 * against similar listings, application summaries and maintenance triage. Everything here returns
 * suggestions for the landlord to review; nothing is saved, sent or decided automatically, except
 * that the landlord can apply a suggested maintenance priority.
 */

export interface AiAssistEnv { AI: Ai; DB: D1Database; PHOTOS?: R2Bucket; }

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
export const MAINTENANCE_PRIORITIES = ["emergency", "high", "normal", "low"];

// Fair housing: describe the home, never the kind of person wanted.
export const FAIR_HOUSING = "Follow US and California fair housing law: describe only the home, its features and location. Never mention or imply a preference about race, color, religion, sex, gender, sexual orientation, familial status (no 'perfect for couples', 'no kids', 'ideal for singles'), disability, national origin, age, marital status, or source of income (never 'no Section 8'). Don't describe the neighborhood's people.";

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 500): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }

const PARKING: Record<string, string> = { garageAttached: "attached garage", garageLot: "garage parking", coveredLot: "covered parking", street: "street parking", surfaceLot: "parking lot", other: "parking available" };
const LAUNDRY: Record<string, string> = { in_unit: "in-unit laundry", shared: "shared laundry on site", hookups: "washer/dryer hookups" };

/** Turns listing form fields into plain facts for the prompt. Only what the landlord entered. */
export function listingFacts(b: Record<string, unknown>): string[] {
  const facts: string[] = [];
  const type = ({ HOUSE: "house", CONDO: "condo", TOWNHOUSE: "townhouse" } as Record<string, string>)[str(b.property_type)] || "home";
  const beds = num(b.bedrooms), full = num(b.full_baths), half = num(b.half_baths), sqft = num(b.square_feet);
  facts.push(`Type: ${beds ? beds + "-bedroom " : beds === 0 && b.bedrooms !== undefined && b.bedrooms !== "" ? "studio " : ""}${type}`);
  if (full || half) facts.push(`Bathrooms: ${full}${half ? " full and " + half + " half" : ""}`);
  if (sqft) facts.push(`Size: ${sqft} square feet`);
  const city = str(b.city, 100);
  if (city) facts.push(`Location: ${city}${str(b.state, 2) ? ", " + str(b.state, 2).toUpperCase() : ""}${str(b.zip, 10) ? " " + str(b.zip, 10) : ""}`);
  if (num(b.rent)) facts.push(`Rent: $${Math.round(num(b.rent))} per month`);
  if (num(b.deposit)) facts.push(`Security deposit: $${Math.round(num(b.deposit))}`);
  if (str(b.date_available)) facts.push(`Available: ${str(b.date_available, 20)}`);
  if (str(b.lease_term)) facts.push(`Lease: ${str(b.lease_term) === "monthly" ? "month to month" : str(b.lease_term) === "contactForDetails" ? "contact for details" : str(b.lease_term, 20)}`);
  if (PARKING[str(b.parking_type)]) facts.push(`Parking: ${PARKING[str(b.parking_type)]}`);
  if (LAUNDRY[str(b.laundry)]) facts.push(`Laundry: ${LAUNDRY[str(b.laundry)]}`);
  const yes = (v: unknown) => v === true || v === 1 || v === "1" || v === "true" || v === "on";
  const pets = [yes(b.cats_allowed) && "cats", yes(b.small_dogs_allowed) && "small dogs", yes(b.large_dogs_allowed) && "large dogs"].filter(Boolean);
  facts.push(pets.length ? `Pets allowed: ${pets.join(", ")}` : "Pets: not allowed");
  if (yes(b.furnished)) facts.push("Furnished");
  if (str(b.amenities)) facts.push(`Amenities: ${str(b.amenities, 1000)}`);
  if (str(b.title)) facts.push(`Headline: ${str(b.title, 120)}`);
  if (str(b.description)) facts.push(`Landlord's notes: ${str(b.description, 3000)}`);
  return facts;
}

export function aiText(out: unknown): string { return String((out as { response?: unknown })?.response ?? "").trim(); }
// Models sometimes wrap the answer in quotes or a "Here is..." lead-in; keep only the text.
// Strips whole runs of quotes ("""text""" too), which used to leave "" at both ends of rewritten listings.
export function clean(text: string): string { return text.trim().replace(/^(here('s| is)[^\n]*:\s*)/i, "").replace(/^["'\u201C\u201D]+\s*|\s*["'\u201C\u201D]+$/g, "").trim(); }

export async function handleAiAssistRoutes(request: Request, env: AiAssistEnv, url: URL, user: { id: number; name: string; company: string }, allow: () => Promise<boolean>): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/ai/") || request.method !== "POST") return null;
  if (!(await allow())) return json({ error: "Too many AI requests. Please wait a minute and try again." }, 429);

  if (url.pathname === "/api/ai/listing-description") {
    const body = await request.json() as Record<string, unknown>;
    if (!num(body.rent) && !str(body.city)) return json({ error: "Fill in at least the city and rent first, so the AI has something to describe." }, 400);
    const seen = await photoFeatures(env, user.id, Math.floor(num(body.id)));
    const prompt = [
      "Write the description for a rental listing that will appear on our website and on Zillow.",
      "Use only these facts. Don't invent features, distances, schools, landmarks or upgrades that aren't listed:",
      ...listingFacts(body).map((f) => "- " + f),
      ...(seen.length ? ["- Seen in the listing photos (mention only if consistent with the facts above): " + seen.join("; ")] : []),
      "",
      "Write 110 to 170 words in 2 or 3 short paragraphs of plain text: no headings, bullet points, emojis, markdown or exclamation-mark overload. Lead with what makes the home appealing, then the practical details (rent, availability, lease, pets, parking, laundry). End with one sentence inviting renters to request a showing or apply online. Don't repeat the street address.",
    ].join("\n");
    try {
      const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "system", content: "You write clear, honest, appealing rental listing descriptions for EC Rental Property Management in Fresno, California. " + FAIR_HOUSING }, { role: "user", content: prompt }], max_tokens: 500 } as never);
      const description = clean(aiText(out)).slice(0, 5000);
      if (!description) return json({ error: "The AI didn't return a description. Please try again." }, 502);
      return json({ description, photos_used: seen.length });
    } catch (err) { console.error("[ai] listing-description", err instanceof Error ? err.message : err); return json({ error: "The AI is unavailable right now. Please try again shortly." }, 502); }
  }

  if (url.pathname === "/api/ai/inquiry-reply") {
    const body = await request.json() as Record<string, unknown>;
    const leadId = Math.floor(num(body.leadId));
    const lead = leadId ? await env.DB.prepare("SELECT s.name, s.message, l.* FROM signups s JOIN listings l ON l.id = (CASE WHEN json_valid(s.message) THEN json_extract(s.message, '$.listingId') END) WHERE s.id = ? AND s.plan = 'tenant_application' AND l.user_id = ?")
      .bind(leadId, user.id).first<Record<string, unknown> & { name: string; message: string; id: number; street: string; unit: string; city: string; contact_name: string; contact_phone: string }>() : null;
    if (!lead) return json({ error: "Inquiry not found." }, 404);
    let d: Record<string, unknown> = {}; try { d = JSON.parse(lead.message); } catch { /* keep empty */ }
    const question = str(d.message, 2000) || "(no message, just asked to be contacted)";
    const kind = ({ tourRequest: "a tour request", applicationRequest: "a request to apply", question: "a question" } as Record<string, string>)[str(d.leadType)] || "an inquiry";
    const signer = str(lead.contact_name, 100) || str(user.company, 100) || str(user.name, 100) || "EC Rental Property Management";
    const home = str(lead.street, 200) + (lead.unit ? " #" + str(lead.unit, 20) : "") + ", " + str(lead.city, 100);
    const phone = str(lead.contact_phone).replace(/^(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
    const prompt = [
      `A renter named ${str(lead.name, 100) || "there"} sent ${kind} about our rental at ${home}${d.moveIn ? `, hoping to move in around ${str(d.moveIn, 20)}` : ""}.`,
      `Their message: """${question}"""`,
      "",
      "Facts about the home (use only these; if they ask something not covered, say we'll confirm and get back to them):",
      ...listingFacts(lead).map((f) => "- " + f),
      `- Apply online: ${url.origin}/apply?listing=${lead.id}`,
      `- Listing page: ${url.origin}/listing?id=${lead.id}`,
      phone ? `- Our phone: ${phone}` : "",
      "",
      `Write the email reply, signed "${signer}". Warm, brief (under 150 words), plain text, no subject line. Answer their question directly, offer to set up a showing, and include the apply link. Don't promise approval, don't ask about their personal characteristics, and treat every renter the same.`,
    ].filter(Boolean).join("\n");
    try {
      const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "system", content: "You help a Fresno, California property manager answer renter inquiries by email. " + FAIR_HOUSING }, { role: "user", content: prompt }], max_tokens: 450 } as never);
      const reply = clean(aiText(out)).slice(0, 4000);
      if (!reply) return json({ error: "The AI didn't return a reply. Please try again." }, 502);
      return json({ reply, subject: "Re: " + home });
    } catch (err) { console.error("[ai] inquiry-reply", err instanceof Error ? err.message : err); return json({ error: "The AI is unavailable right now. Please try again shortly." }, 502); }
  }

  // Rewrites or proofreads text the landlord wrote (a description or a reply).
  if (url.pathname === "/api/ai/polish") {
    const body = await request.json() as Record<string, unknown>;
    const text = str(body.text, 5000);
    const mode = str(body.mode) === "grammar" ? "grammar" : "rewrite";
    const kind = str(body.kind) === "reply" ? "email reply to a renter" : "rental listing description";
    if (text.length < 5) return json({ error: "Write something first, then the AI can improve it." }, 400);
    const task = mode === "grammar"
      ? `Fix only spelling, grammar, punctuation and capitalization in this ${kind}. Keep the wording, meaning, facts, tone and paragraph breaks as they are. Return only the corrected text.`
      : `Rewrite this ${kind} so it reads clearly and professionally and is easy to scan. Keep every fact, number, link and name exactly; don't add new facts. Keep about the same length. Return only the rewritten text.`;
    try {
      const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "system", content: "You are a careful editor for a Fresno, California property manager. " + FAIR_HOUSING + " If the text has wording that breaks those rules, rephrase it to describe the home instead." }, { role: "user", content: task + "\n\nText:\n\"\"\"\n" + text + "\n\"\"\"" }], max_tokens: 1200 } as never);
      const result = clean(aiText(out)).replace(/^"""\s*|\s*"""$/g, "").slice(0, 5000);
      if (!result) return json({ error: "The AI didn't return any text. Please try again." }, 502);
      return json({ text: result });
    } catch (err) { console.error("[ai] polish", err instanceof Error ? err.message : err); return json({ error: "The AI is unavailable right now. Please try again shortly." }, 502); }
  }

  // Rent check: compares the rent with similar listings on EC Rental (same ZIP or city, same bedrooms).
  if (url.pathname === "/api/ai/rent-check") {
    const body = await request.json() as Record<string, unknown>;
    const rent = num(body.rent), beds = Math.floor(num(body.bedrooms)), zip = str(body.zip, 10), city = str(body.city, 100);
    if (!rent || (!zip && !city)) return json({ error: "Fill in the rent, bedrooms and ZIP or city first." }, 400);
    const comps = await rentComps(env, { id: Math.floor(num(body.id)), beds, zip, city });
    const sqft = num(body.square_feet);
    if (comps.rents.length < 3) {
      return json({ count: comps.rents.length, area: comps.area, message: `There aren't enough similar ${beds ? beds + "-bedroom " : ""}listings on EC Rental yet to compare (found ${comps.rents.length}, need 3). Check a few nearby ${beds ? beds + "-bedroom " : ""}rentals on Zillow for ${zip || city} before you set the price.` });
    }
    const sorted = [...comps.rents].sort((a, b) => a - b);
    const q = (p: number) => { const i = p * (sorted.length - 1), lo = Math.floor(i); return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo); };
    const low = q(0.25), median = q(0.5), high = q(0.75);
    const diff = Math.round(((rent - median) / median) * 100);
    const position = diff > 10 ? "above" : diff < -10 ? "below" : "in line with";
    const facts = [`Your rent: $${Math.round(rent)}/month`, `Similar listings (${sorted.length}, ${comps.area}): typical range $${Math.round(low)} to $${Math.round(high)}, median $${Math.round(median)}`, `Difference from median: ${diff > 0 ? "+" : ""}${diff}%`, ...(sqft ? [`Your price per square foot: $${(rent / sqft).toFixed(2)}`] : []), ...listingFacts(body).filter((f) => !f.startsWith("Rent:") && !f.startsWith("Landlord's notes") && !f.startsWith("Headline"))];
    let advice = "";
    try {
      const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "system", content: "You help a Fresno, California landlord price a rental. Use only the numbers given; never invent market data. 2 or 3 short sentences, plain text." }, { role: "user", content: facts.join("\n") + `\n\nThe rent is ${position} similar listings. Say whether it looks reasonable, and which of the home's listed features could justify a higher or lower price.` }], max_tokens: 200 } as never);
      advice = clean(aiText(out)).slice(0, 800);
    } catch (err) { console.error("[ai] rent-check", err instanceof Error ? err.message : err); }
    return json({ count: sorted.length, area: comps.area, low: Math.round(low), median: Math.round(median), high: Math.round(high), diff_percent: diff, position, advice });
  }

  // Application summary: income-to-rent and what to verify. Never a decision.
  if (url.pathname === "/api/ai/application-summary") {
    const body = await request.json() as Record<string, unknown>;
    const id = Math.floor(num(body.applicationId));
    const a = id ? await env.DB.prepare("SELECT a.*, l.rent, l.cats_allowed, l.small_dogs_allowed, l.large_dogs_allowed FROM applications a JOIN listings l ON a.listing_id = l.id WHERE a.id = ? AND a.landlord_user_id = ?").bind(id, user.id).first<Record<string, unknown>>() : null;
    if (!a) return json({ error: "Application not found." }, 404);
    const income = num(a.monthly_income), rent = num(a.rent);
    const ratio = income && rent ? Math.round((income / rent) * 10) / 10 : 0;
    const missing = ([["employer", "employer"], ["employer_phone", "employer phone"], ["employment_length", "time at job"], ["current_landlord_name", "current landlord"], ["current_landlord_phone", "current landlord phone"], ["time_at_address", "time at current address"], ["monthly_income", "monthly income"]] as const).filter(([k]) => !str(a[k])|| str(a[k]) === "0").map(([, label]) => label);
    // Names, current address and household details stay out of the prompt so they can't sway the summary.
    const facts = [
      `Monthly rent of the home: $${Math.round(rent)}`,
      income ? `Stated monthly income: $${Math.round(income)} (${ratio}x rent)` : "Monthly income: not given",
      str(a.other_income) ? `Other income: ${str(a.other_income, 300)}` : "",
      str(a.employer) ? `Employer: ${str(a.employer, 100)}${str(a.job_title) ? ", " + str(a.job_title, 100) : ""}${str(a.employment_length) ? ", for " + str(a.employment_length, 50) : ""}` : "",
      num(a.current_rent) ? `Current rent: $${Math.round(num(a.current_rent))}` : "",
      str(a.time_at_address) ? `Time at current address: ${str(a.time_at_address, 50)}` : "",
      str(a.reason_for_moving) ? `Reason for moving: ${str(a.reason_for_moving, 300)}` : "",
      str(a.move_in_date) ? `Requested move-in: ${str(a.move_in_date, 20)}` : "",
      str(a.pets) ? `Pets: ${str(a.pets, 200)} (listing allows: ${[a.cats_allowed && "cats", a.small_dogs_allowed && "small dogs", a.large_dogs_allowed && "large dogs"].filter(Boolean).join(", ") || "no pets"})` : "",
      str(a.vehicles) ? `Vehicles: ${str(a.vehicles, 200)}` : "",
      missing.length ? `Left blank: ${missing.join(", ")}` : "",
    ].filter(Boolean);
    let summary = "";
    try {
      const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "system", content: "You help a landlord review a rental application consistently. Summarize only the facts given in 3 to 5 short bullet lines starting with '- ', then a line 'To verify:' with 2 to 4 bullet lines of things to check (pay stubs, landlord reference, etc.). Never recommend approving or denying, never score the person, and never mention or infer race, religion, national origin, sex, familial status, disability, age or source of income. Plain text." }, { role: "user", content: facts.join("\n") }], max_tokens: 350 } as never);
      summary = clean(aiText(out)).slice(0, 2000);
    } catch (err) { console.error("[ai] application-summary", err instanceof Error ? err.message : err); }
    return json({ ratio, missing, summary });
  }

  // Maintenance triage: suggested priority, category, next steps and a reply to the tenant.
  if (url.pathname === "/api/ai/maintenance-triage") {
    const body = await request.json() as Record<string, unknown>;
    const id = Math.floor(num(body.requestId));
    const m = id ? await env.DB.prepare("SELECT m.id, m.description, m.priority, m.tenant_name, p.address FROM maintenance_requests m JOIN properties p ON m.property_id = p.id WHERE m.id = ? AND p.user_id = ?").bind(id, user.id).first<{ id: number; description: string; priority: string; tenant_name: string; address: string }>() : null;
    if (!m) return json({ error: "Request not found." }, 404);
    const prompt = `A tenant at ${str(m.address, 200)} reported: """${str(m.description, 2000)}"""\n\nReturn only JSON: {"priority":"emergency|high|normal|low","category":"plumbing|electrical|heating/cooling|appliance|pest|structural|safety|other","why":"one sentence","next_steps":["2 to 4 short steps for the landlord"],"tenant_reply":"a short, kind message to the tenant (under 80 words) saying it's received and what happens next, with any safety step they should take now"}\nEmergency means risk to people or serious damage now (gas smell, flooding, no heat in freezing weather, fire or electrical hazard, sewage backup, broken lock on an outside door). California requires habitable conditions, so heat, hot water, plumbing and electrical outages are at least high.`;
    try {
      const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "system", content: "You triage rental maintenance requests for a Fresno, California property manager. Be practical and safety-first. Output valid JSON only." }, { role: "user", content: prompt }], max_tokens: 500 } as never);
      const raw = aiText(out);
      const match = raw.match(/\{[\s\S]*\}/);
      let t: Record<string, unknown> = {};
      try { t = match ? JSON.parse(match[0]) : {}; } catch { t = {}; }
      const priority = MAINTENANCE_PRIORITIES.includes(str(t.priority)) ? str(t.priority) : "";
      if (!priority) return json({ error: "The AI couldn't triage this one. Please try again." }, 502);
      const steps = Array.isArray(t.next_steps) ? t.next_steps.map((x) => str(x, 200)).filter(Boolean).slice(0, 5) : [];
      return json({ priority, current_priority: m.priority, category: str(t.category, 40), why: str(t.why, 300), next_steps: steps, tenant_reply: str(t.tenant_reply, 1000) });
    } catch (err) { console.error("[ai] maintenance-triage", err instanceof Error ? err.message : err); return json({ error: "The AI is unavailable right now. Please try again shortly." }, 502); }
  }

  return json({ error: "Not found" }, 404);
}

/** Short lists of what the vision model sees in up to 3 of the listing's photos. Empty when there are none or it fails. */
async function photoFeatures(env: AiAssistEnv, userId: number, listingId: number): Promise<string[]> {
  if (!listingId || !env.PHOTOS) return [];
  const photos = await env.DB.prepare("SELECT p.r2_key FROM listing_photos p JOIN listings l ON p.listing_id = l.id WHERE l.id = ? AND l.user_id = ? ORDER BY p.sort_order, p.id LIMIT 3").bind(listingId, userId).all<{ r2_key: string }>();
  const results = await Promise.all(photos.results.map(async (p) => {
    try {
      const obj = await env.PHOTOS!.get(p.r2_key);
      if (!obj) return "";
      const image = [...new Uint8Array(await obj.arrayBuffer())];
      const out = await env.AI.run(VISION_MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "user", content: "This is a photo from a rental listing. List the home features you can clearly see (room type, flooring, counters, appliances, cabinets, windows and light, yard or patio, condition). Short comma-separated phrases, at most 20 words. Don't mention people or guess at anything you can't see." }], image, max_tokens: 80 } as never);
      return clean(aiText(out)).replace(/\s+/g, " ").slice(0, 200);
    } catch (err) { console.error("[ai] photo", err instanceof Error ? err.message : err); return ""; }
  }));
  return results.filter(Boolean);
}

/** Rents of similar listings on EC Rental: same bedrooms, same ZIP (or the city when the ZIP has too few). */
export async function rentComps(env: AiAssistEnv, q: { id: number; beds: number; zip: string; city: string }): Promise<{ rents: number[]; area: string }> {
  const base = "SELECT rent FROM listings WHERE status IN ('active', 'rented') AND bedrooms = ? AND id != ? AND rent > 0";
  if (q.zip) {
    const r = await env.DB.prepare(base + " AND zip = ? LIMIT 200").bind(q.beds, q.id, q.zip).all<{ rent: number }>();
    if (r.results.length >= 3 || !q.city) return { rents: r.results.map((x) => x.rent), area: "ZIP " + q.zip };
  }
  const r = await env.DB.prepare(base + " AND lower(city) = lower(?) LIMIT 200").bind(q.beds, q.id, q.city).all<{ rent: number }>();
  return { rents: r.results.map((x) => x.rent), area: q.city };
}
