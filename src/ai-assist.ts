/**
 * AI writing help for landlords (Workers AI): a listing description written from the listing's
 * own details, a draft reply to a renter inquiry, and rewrite / spelling-and-grammar fixes for either. Both return text for the landlord to
 * edit; nothing is saved or sent from here.
 */

export interface AiAssistEnv { AI: Ai; DB: D1Database; }

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Fair housing: describe the home, never the kind of person wanted.
const FAIR_HOUSING = "Follow US and California fair housing law: describe only the home, its features and location. Never mention or imply a preference about race, color, religion, sex, gender, sexual orientation, familial status (no 'perfect for couples', 'no kids', 'ideal for singles'), disability, national origin, age, marital status, or source of income (never 'no Section 8'). Don't describe the neighborhood's people.";

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
  if (str(b.date_available)) facts.push(`Available: ${str(b.date_available, 10)}`);
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

function aiText(out: unknown): string { return String((out as { response?: unknown })?.response ?? "").trim(); }
// Models sometimes wrap the answer in quotes or a "Here is..." lead-in; keep only the text.
function clean(text: string): string { return text.replace(/^(here('s| is)[^\n]*:\s*)/i, "").replace(/^["']|["']$/g, "").trim(); }

export async function handleAiAssistRoutes(request: Request, env: AiAssistEnv, url: URL, user: { id: number; name: string; company: string }, allow: () => Promise<boolean>): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/ai/") || request.method !== "POST") return null;
  if (!(await allow())) return json({ error: "Too many AI requests. Please wait a minute and try again." }, 429);

  if (url.pathname === "/api/ai/listing-description") {
    const body = await request.json() as Record<string, unknown>;
    if (!num(body.rent) && !str(body.city)) return json({ error: "Fill in at least the city and rent first, so the AI has something to describe." }, 400);
    const prompt = [
      "Write the description for a rental listing that will appear on our website and on Zillow.",
      "Use only these facts. Don't invent features, distances, schools, landmarks or upgrades that aren't listed:",
      ...listingFacts(body).map((f) => "- " + f),
      "",
      "Write 110 to 170 words in 2 or 3 short paragraphs of plain text: no headings, bullet points, emojis, markdown or exclamation-mark overload. Lead with what makes the home appealing, then the practical details (rent, availability, lease, pets, parking, laundry). End with one sentence inviting renters to request a showing or apply online. Don't repeat the street address.",
    ].join("\n");
    try {
      const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "system", content: "You write clear, honest, appealing rental listing descriptions for EC Rental Property Management in Fresno, California. " + FAIR_HOUSING }, { role: "user", content: prompt }], max_tokens: 500 } as never);
      const description = clean(aiText(out)).slice(0, 5000);
      if (!description) return json({ error: "The AI didn't return a description. Please try again." }, 502);
      return json({ description });
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

  return json({ error: "Not found" }, 404);
}
