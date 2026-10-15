// Green Tello for a business (paid): the owner's private assistant on the manage page. It knows the business notes and the open leads,
// answers questions about them, and can propose one action at a time (mark a lead done, email a lead, add a note).
// Nothing runs until the owner taps Confirm, and every id is checked against that owner's own leads again on Confirm.
import { claudeReply, type HubEnv } from "./tello-hub";

interface GreenBot { id: string; business: string; facts: string; owner_email: string; status: string }
interface GreenEnv { DB: D1Database }
type Notify = (to: string, subject: string, html: string, text: string, replyTo?: string) => Promise<unknown>;
type Action =
  | { type: "lead_done"; id: number; label: string }
  | { type: "email_lead"; id: number; subject: string; body: string; label: string }
  | { type: "add_note"; text: string; label: string };

const FACTS_MAX = 4000, EMAILS_PER_DAY = 10;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const one = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const lines = (s: unknown, max: number) => String(s ?? "").replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const noEmoji = (s: string) => s.replace(/\p{Extended_Pictographic}️?/gu, "");
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

interface LeadRow { id: number; name: string; contact: string; message: string; created_at: string }
async function openLeads(env: GreenEnv, botId: string): Promise<LeadRow[]> {
  return (await env.DB.prepare("SELECT l.id, l.name, l.contact, l.message, l.created_at FROM biz_leads l LEFT JOIN biz_lead_done d ON d.lead_id = l.id WHERE l.bot_id = ? AND d.lead_id IS NULL ORDER BY l.id DESC LIMIT 15").bind(botId).all<LeadRow>()).results || [];
}
async function ownLead(env: GreenEnv, botId: string, id: unknown): Promise<LeadRow | null> {
  const n = Number(id);
  return Number.isInteger(n) ? await env.DB.prepare("SELECT id, name, contact, message, created_at FROM biz_leads WHERE id = ? AND bot_id = ?").bind(n, botId).first<LeadRow>() : null;
}

function system(bot: GreenBot, leads: LeadRow[]): string {
  const list = leads.length
    ? leads.map((l) => `#${l.id} (${l.created_at.slice(0, 10)}) ${l.name || "no name"}, ${l.contact}: ${one(l.message, 400)}`).join("\n")
    : "(no one is waiting for a reply)";
  return `You are Tello, the private assistant of the owner of ${bot.business}. You are talking to the owner, not to a customer. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" })}.
Rules: use only the business notes and the leads below. Never invent customers, messages, prices or facts. Do not give legal, tax, medical or payment-card advice, and never ask for card numbers, passwords or health details. Write plain text, short and friendly, no markdown, no emojis. Replies you draft for customers are written in the owner's voice and signed with the business name.
Actions: when the owner wants something done, propose exactly one action by ending your reply with one line: <action>{json}</action>. Say in your reply what you propose and that nothing happens until they tap Confirm. Use only these actions, with ids from the list:
{"type":"lead_done","id":12} marks a lead as handled.
{"type":"email_lead","id":12,"subject":"...","body":"..."} emails that lead (only when their contact is an email address). The body is the full message, 120 words or fewer.
{"type":"add_note","text":"..."} adds one line to the business notes the website chat answers from.
If no action is needed, add no action line.

BUSINESS NOTES:
${bot.facts.slice(0, FACTS_MAX) || "(none yet)"}

LEADS WAITING FOR A REPLY (newest first):
${list}`;
}

/** Checks a proposed action against this owner's own data and returns it in clean form, or null. Used when proposing and again on Confirm. */
async function check(env: GreenEnv, bot: GreenBot, a: any): Promise<Action | null> {
  if (!a || typeof a !== "object") return null;
  if (a.type === "lead_done") {
    const l = await ownLead(env, bot.id, a.id);
    return l ? { type: "lead_done", id: l.id, label: `Mark ${l.name || l.contact} as done` } : null;
  }
  if (a.type === "email_lead") {
    const l = await ownLead(env, bot.id, a.id);
    const subject = noEmoji(one(a.subject, 120)), body = noEmoji(lines(a.body, 1500));
    if (!l || !EMAIL.test(l.contact.trim()) || !subject || body.length < 5) return null;
    return { type: "email_lead", id: l.id, subject, body, label: `Email ${l.name || l.contact}` };
  }
  if (a.type === "add_note") {
    const text = noEmoji(one(a.text, 300));
    return text.length >= 3 ? { type: "add_note", text, label: "Add this to your notes" } : null;
  }
  return null;
}

export async function handleGreen(env: GreenEnv, bot: GreenBot, sub: string, body: Record<string, unknown>, notify?: Notify): Promise<Response | null> {
  if (sub !== "/tello" && sub !== "/tello-confirm") return null;
  if (!["active", "trialing", "past_due"].includes(bot.status)) return json({ error: "Green Tello is part of the paid plan. Start it on this page." }, 402);

  if (sub === "/tello") {
    const hist = (Array.isArray(body.history) ? body.history : []).filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-8)
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: one(m.content, 1500) })).filter((m) => m.content);
    const message = one(body.message, 1500);
    if (!message) return json({ error: "Type a question first." }, 400);
    const turns: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of [...hist, { role: "user" as const, content: message }]) {
      const last = turns[turns.length - 1];
      if (last && last.role === m.role) last.content += "\n\n" + m.content; else turns.push(m);
    }
    while (turns.length && turns[0].role !== "user") turns.shift();
    const raw = await claudeReply(env as unknown as HubEnv, system(bot, await openLeads(env, bot.id)), turns, 900);
    if (!raw) return json({ error: "Tello is busy right now. Please try again in a minute." }, 503);
    const m = raw.match(/<action>([\s\S]*?)<\/action>/);
    let action: Action | null = null;
    if (m) { try { action = await check(env, bot, JSON.parse(m[1])); } catch { action = null; } }
    const reply = noEmoji(raw.replace(/<action>[\s\S]*?<\/action>/g, "").trim());
    return json({ reply: reply || "Done.", action });
  }

  // /tello-confirm
  const action = await check(env, bot, body.action);
  if (!action) return json({ error: "That action is no longer valid." }, 400);
  const now = new Date();
  if (action.type === "lead_done") {
    await env.DB.prepare("INSERT OR IGNORE INTO biz_lead_done (lead_id, bot_id, done_at) VALUES (?, ?, ?)").bind(action.id, bot.id, now.toISOString()).run();
    return json({ success: true, message: "Marked as done." });
  }
  if (action.type === "add_note") {
    const facts = (bot.facts.trim() + "\n- " + action.text).trim();
    if (facts.length > FACTS_MAX) return json({ error: "Your notes are full. Open Teach Tello below and trim them first." }, 400);
    await env.DB.prepare("UPDATE biz_bots SET facts = ?, updated_at = ? WHERE id = ?").bind(facts, now.toISOString(), bot.id).run();
    return json({ success: true, message: "Added to your notes." });
  }
  // email_lead
  const lead = await ownLead(env, bot.id, action.id);
  if (!lead || !notify) return json({ error: "Email is not available right now." }, 503);
  const day = "mail-" + now.toISOString().slice(0, 10);
  const used = (await env.DB.prepare("SELECT n FROM biz_usage WHERE bot_id = ? AND day = ?").bind(bot.id, day).first<{ n: number }>())?.n ?? 0;
  if (used >= EMAILS_PER_DAY) return json({ error: `You can send ${EMAILS_PER_DAY} emails a day from Tello. Try again tomorrow.` }, 429);
  const foot = `Sent by Tello for ${bot.business}. Reply to this email to reach ${bot.business}.`;
  await notify(lead.contact.trim(), action.subject, `${action.body.split("\n").map((p) => `<p>${esc(p) || "&nbsp;"}</p>`).join("")}<p style="color:#666;font-size:12px">${esc(foot)}</p>`, `${action.body}\n\n--\n${foot}`, bot.owner_email);
  await env.DB.prepare("INSERT INTO biz_usage (bot_id, day, n) VALUES (?, ?, 1) ON CONFLICT(bot_id, day) DO UPDATE SET n = n + 1").bind(bot.id, day).run();
  await env.DB.prepare("INSERT OR IGNORE INTO biz_lead_done (lead_id, bot_id, done_at) VALUES (?, ?, ?)").bind(lead.id, bot.id, now.toISOString()).run();
  return json({ success: true, message: `Sent to ${lead.contact.trim()} and marked as done.` });
}

/** Morning briefing email for every Tello owner, free chat and Green Tello alike: who is still waiting for a reply. Sent once a day, only when someone is waiting. No AI cost. */
export async function runGreenBriefings(env: GreenEnv, notify: Notify, origin: string, now = new Date()): Promise<number> {
  const day = "brief-" + now.toISOString().slice(0, 10);
  const bots = (await env.DB.prepare("SELECT id, business, owner_email, owner_name, manage_token, status FROM biz_bots WHERE id NOT IN (SELECT bot_id FROM biz_usage WHERE day = ?) AND EXISTS (SELECT 1 FROM biz_leads l LEFT JOIN biz_lead_done d ON d.lead_id = l.id WHERE l.bot_id = biz_bots.id AND d.lead_id IS NULL) LIMIT 500").bind(day).all<{ id: string; business: string; owner_email: string; owner_name: string; manage_token: string; status: string }>()).results || [];
  let sent = 0;
  for (const b of bots) {
    try {
      await env.DB.prepare("INSERT OR IGNORE INTO biz_usage (bot_id, day, n) VALUES (?, ?, 1)").bind(b.id, day).run();
      const leads = await openLeads(env, b.id);
      if (!leads.length) continue;
      const first = (b.owner_name || "").split(" ")[0] || "there", link = `${origin}/business/manage?t=${b.manage_token}`;
      // Free-chat owners get the same briefing; the reply button and the footer name only what they have.
      const paid = ["active", "trialing", "past_due"].includes(b.status), cta = paid ? "Ask Tello to reply" : "See who is waiting", who = paid ? "Green Tello" : "Tello";
      const subject = `Tello: ${leads.length === 1 ? "1 person is" : leads.length + " people are"} waiting to hear from ${b.business}`;
      const items = leads.slice(0, 8);
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;color:#1a1a1a"><p style="font-size:16px">Good morning, ${esc(first)}. Here is who is waiting for a reply.</p>`
        + items.map((l) => `<div style="border-left:3px solid #123a30;padding:6px 12px;margin:10px 0"><strong>${esc(l.name || "No name")}</strong> <span style="color:#6b7280">${esc(l.contact)}</span><br><span style="color:#4b5563">${esc(one(l.message, 160))}</span></div>`).join("")
        + `<p><a href="${link}" style="display:inline-block;background:#123a30;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">${cta}</a></p><p style="color:#6b7280;font-size:12px">${who}, the assistant for ${esc(b.business)}. Tello can be wrong, so check anything that matters.</p></div>`;
      const text = `Good morning, ${first}. Here is who is waiting for a reply.\n\n` + items.map((l) => `- ${l.name || "No name"} (${l.contact}): ${one(l.message, 160)}`).join("\n") + `\n\n${cta}: ${link}`;
      await notify(b.owner_email, subject, html, text);
      sent++;
    } catch (err) { console.error("[green-briefing]", b.id, err instanceof Error ? err.message : err); }
  }
  return sent;
}
