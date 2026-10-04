/**
 * Renter chat on the public rentals pages (Workers AI). On a listing page it answers questions about
 * that home from the landlord's own listing details; on /listings it helps renters find a match among
 * the active listings. It never invents facts, screens people or promises approval; tours go through
 * the listing's "Request a showing" inquiry, so they land in the landlord's Renter Inquiries.
 */
import { aiText, clean, FAIR_HOUSING, listingFacts, MODEL } from "./ai-assist";

interface ChatEnv { AI: Ai; DB: D1Database; }
interface Turn { role: string; content: string; }

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

interface ListingFactsRow { id: number; title: string; street: string; unit: string; city: string; state: string; zip: string; property_type: string; rent: number; bedrooms: number; full_baths: number; half_baths: number; square_feet: number; deposit: number; application_fee: number; date_available: string; lease_term: string; laundry: string; parking_type: string; cats_allowed: number; small_dogs_allowed: number; large_dogs_allowed: number; furnished: number; smoking_allowed: number; amenities: string; description: string; contact_phone: string; }

function address(l: ListingFactsRow): string { return `${l.street}${l.unit ? " #" + l.unit : ""}, ${l.city}, ${l.state} ${l.zip}`; }
// "now" once the date has passed, otherwise "Oct 10, 2026", so the AI never quotes a past date.
function available(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "") || d <= new Date().toISOString().slice(0, 10)) return "now";
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function phone(p: string): string { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; }

const RULES = [
  "Answer in 1 to 4 short sentences of plain text, no markdown or lists. Be warm and direct.",
  "Use only the facts given here. If something isn't in them (utilities, HOA, schools, exact move-in costs beyond rent and deposit, whether a specific pet breed is OK), say you don't have that detail and that the landlord can answer it, and suggest requesting a showing.",
  "Never promise approval, never say who will or won't qualify, never ask for a Social Security number, income, birth date or other screening information, and don't discuss anyone's personal characteristics. Applicants are screened the same way through the online application.",
  "If the renter asks about anything unrelated to renting these homes, politely steer back.",
  FAIR_HOUSING,
].join(" ");

export async function handleRenterChat(request: Request, env: ChatEnv, url: URL, allow: () => Promise<boolean>): Promise<Response | null> {
  if (url.pathname !== "/api/public/chat" || request.method !== "POST") return null;
  if (!(await allow())) return json({ error: "Too many messages. Please wait a minute and try again." }, 429);
  const body = await request.json().catch(() => ({})) as { message?: unknown; history?: unknown; listingId?: unknown };
  const message = String(body.message ?? "").trim().slice(0, 1000);
  if (!message) return json({ error: "Type a question first." }, 400);
  const history: Turn[] = (Array.isArray(body.history) ? body.history : [])
    .filter((m: Turn) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-8).map((m: Turn) => ({ role: m.role, content: m.content.slice(0, 1000) }));

  const listingId = Number(body.listingId);
  let system: string, found: ListingFactsRow[] = [];
  if (Number.isInteger(listingId) && listingId > 0) {
    const l = await env.DB.prepare("SELECT * FROM listings WHERE id = ? AND status = 'active'").bind(listingId).first<ListingFactsRow>();
    if (!l) return json({ error: "This listing is no longer available." }, 404);
    system = [
      "You are Tello, the EC Rental assistant on the web page for one rental home, answering renters' questions about it for EC Rental Property Management in Fresno, California.",
      "Facts about this home:",
      `- Address: ${address(l)}`,
      ...listingFacts({ ...l, date_available: available(l.date_available) } as unknown as Record<string, unknown>).map((f) => "- " + f),
      ...(l.application_fee > 0 ? [`- Application fee: $${Math.round(l.application_fee)}`] : []),
      `- Smoking: ${l.smoking_allowed ? "allowed" : "not allowed"}`,
      ...(l.contact_phone ? [`- Phone for this home: ${phone(l.contact_phone)}`] : []),
      "Renters can apply online with the Apply now button, or request a showing on this page.",
      "When the renter wants to see the home, schedule a tour or be contacted, end your reply with [TOUR]. When they want to apply, end with [APPLY].",
      RULES,
    ].join("\n");
  } else {
    const rows = await env.DB.prepare("SELECT * FROM listings WHERE status = 'active' ORDER BY rent LIMIT 40").all<ListingFactsRow>();
    found = rows.results;
    const lines = rows.results.map((l) => {
      const pets = [l.cats_allowed && "cats", l.small_dogs_allowed && "small dogs", l.large_dogs_allowed && "large dogs"].filter(Boolean).join(", ") || "no pets";
      return `- Listing ${l.id}: ${l.bedrooms ? l.bedrooms + " bd" : "studio"} / ${l.full_baths}${l.half_baths ? ".5" : ""} ba ${({ HOUSE: "house", CONDO: "condo", TOWNHOUSE: "townhouse" } as Record<string, string>)[l.property_type] || "home"}, ${address(l)}, $${Math.round(l.rent)}/mo, ${l.square_feet ? l.square_feet + " sq ft, " : ""}${pets}${l.furnished ? ", furnished" : ""}, available ${available(l.date_available)}`;
    });
    system = [
      "You are Tello, the EC Rental assistant on the rentals search page of EC Rental Property Management in Fresno, California. Help renters find a home among the listings below.",
      lines.length ? "Homes available now:\n" + lines.join("\n") : "There are no homes available right now. Suggest checking back soon or calling (559) 825-3038.",
      "When you suggest a home, write [LISTING:id] after it (for example [LISTING:12]) so the page can show a link; don't write URLs. Suggest at most 3 homes. If none match, say so and name the closest option.",
      RULES,
    ].join("\n");
  }

  let reply: string;
  try {
    const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "system", content: system }, ...history, { role: "user", content: message }], max_tokens: 300 } as never);
    reply = clean(aiText(out));
  } catch (err) {
    console.error("[renter-chat]", err);
    return json({ error: "The assistant is busy right now. Please try again, or use the form to contact us." }, 502);
  }
  if (!reply) return json({ error: "The assistant didn't answer. Please try again." }, 502);
  const tour = /\[TOUR\]/i.test(reply), apply = /\[APPLY\]/i.test(reply);
  const picked = Array.from(new Set(Array.from(reply.matchAll(/\[LISTING:(\d+)\]/gi), (m) => Number(m[1]))));
  const listings = picked.map((id) => found.find((l) => l.id === id)).filter((l): l is ListingFactsRow => !!l).slice(0, 3)
    .map((l) => ({ id: l.id, label: `${l.bedrooms ? l.bedrooms + " bd" : "Studio"} · $${Math.round(l.rent).toLocaleString("en-US")}/mo · ${l.street}${l.unit ? " #" + l.unit : ""}` }));
  reply = reply.replace(/\[(TOUR|APPLY|LISTING:\d+)\]/gi, "").replace(/[ \t]+([.,!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
  return json({ reply, tour, apply, listings });
}
