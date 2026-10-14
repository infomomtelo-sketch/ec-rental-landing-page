// One way for every text answer in EC Rental and the tello.live tools to use Claude (Sonnet 5.5) first, and fall back to the
// free Workers AI model when Claude is off, over today's app budget (APP_DAILY_CENTS) or fails. Returns { response } like Workers AI does,
// so the existing code that reads the answer does not change. Photos still go to the Workers AI vision model.
import { claudeReply, type HubEnv } from "./tello-hub";

const FREE_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export async function textRun(env: any, payload: { messages: { role: string; content: string }[]; max_tokens?: number; temperature?: number }): Promise<{ response: string }> {
  const system = payload.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n") || "You are a helpful assistant.";
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of payload.messages) {
    if (m.role === "system" || !String(m.content || "").trim()) continue;
    const role = m.role === "assistant" ? "assistant" : "user", last = turns[turns.length - 1];
    if (last && last.role === role) last.content += "\n\n" + m.content; else turns.push({ role, content: m.content });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (turns.length) {
    const text = await claudeReply(env as HubEnv, system, turns, payload.max_tokens ?? 600, { scope: "app" });
    if (text) return { response: text };
  }
  const out: any = await env.AI.run(FREE_TEXT_MODEL, payload as any);
  return { response: String(out?.response ?? "") };
}
