/**
 * Tello's public voice: POST /api/public/video-voice.
 * Ported from tello-live src/video-maker.ts (voicePost + speak + kokoro).
 * Tello's own voice is hosted Kokoro-82M (af_heart, the voice in the Tello
 * videos) when DEEPINFRA_API_KEY is set, else Workers AI aura-1 (luna),
 * else Workers AI melotts. No sign-in: anonymous pages (homepage chat,
 * Tello Inspect, the /tello page when signed out) speak through here, and
 * the signed-in /api/tello/voice route in src/tello.ts falls back to this
 * same route when its own keys fail — which is why this route has to exist
 * in this Worker (it 404'd on ecrentalpm.com before).
 * Text is capped at 320 chars; 80 requests per IP per 10 minutes.
 * No key is ever needed in the browser: DEEPINFRA_API_KEY lives only as a
 * Worker secret, and the route still works without it (Workers AI fallback).
 */
import { fetchWithTimeout, isTimeoutError, logUpstreamTimeout, UPSTREAM_TIMEOUT_MS } from "./outbound";

export interface PublicVoiceEnv { AI?: Ai; DEEPINFRA_API_KEY?: string; TELLO_KOKORO_VOICE?: string; }

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

const voiceHits = new Map<string, number[]>();

function limitedVoice(ip: string): boolean {
  const now = Date.now(), list = (voiceHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 80) { voiceHits.set(ip, list); return true; }
  list.push(now); voiceHits.set(ip, list);
  if (voiceHits.size > 500) for (const k of voiceHits.keys()) { voiceHits.delete(k); if (voiceHits.size < 250) break; }
  return false;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

// Tello's own voice (hosted Kokoro af_heart, the voice in the Tello videos) when a DeepInfra key is set; otherwise a warm
// Workers AI voice first and a second model as a backup.
async function kokoro(key: string, text: string, voice: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout("https://api.deepinfra.com/v1/openai/audio/speech", {
      method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "hexgrad/Kokoro-82M", input: text, voice, response_format: "mp3" }),
    });
    if (!r.ok) { console.error("video-voice kokoro", r.status); return null; }
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf.length > 500 ? "data:audio/mpeg;base64," + toBase64(buf) : null;
  } catch (e) { if (isTimeoutError(e)) logUpstreamTimeout("deepinfra", UPSTREAM_TIMEOUT_MS); console.error("video-voice kokoro", (e as Error)?.message); return null; }
}

async function speak(ai: Ai, text: string, env: PublicVoiceEnv): Promise<string | null> {
  if (env && env.DEEPINFRA_API_KEY) { const k = await kokoro(env.DEEPINFRA_API_KEY, text, (env.TELLO_KOKORO_VOICE || "af_heart").replace(/[^a-z_]/g, "")); if (k) return k; }
  try {
    const out = await ai.run("@cf/deepgram/aura-1" as Parameters<Ai["run"]>[0], { text, speaker: "luna" } as never, { returnRawResponse: true } as never);
    const buf = out instanceof Response ? new Uint8Array(await out.arrayBuffer()) : out instanceof ArrayBuffer ? new Uint8Array(out) : out && (out as { audio?: unknown }).audio ? null : null;
    if (buf && buf.length > 500) return "data:audio/mpeg;base64," + toBase64(buf);
    if (out && typeof (out as { audio?: unknown }).audio === "string" && ((out as { audio: string }).audio.length > 500)) return "data:audio/mpeg;base64," + (out as { audio: string }).audio;
  } catch (e) { console.error("video-voice aura", (e as Error)?.message); }
  try {
    const out = await ai.run("@cf/myshell-ai/melotts" as Parameters<Ai["run"]>[0], { prompt: text, lang: "en" } as never) as { audio?: unknown } | string;
    const a = out && ((out as { audio?: unknown }).audio || (typeof out === "string" ? out : ""));
    if (typeof a === "string" && a.length > 500) return "data:audio/mpeg;base64," + a;
  } catch (e) { console.error("video-voice melo", (e as Error)?.message); }
  return null;
}

async function voicePost(request: Request, env: PublicVoiceEnv): Promise<Response> {
  if (!env || !env.AI) return json({ error: "voice_off" }, 503);
  const ip = request.headers.get("CF-Connecting-IP") || "x";
  if (limitedVoice(ip)) return json({ error: "Too many requests. Please wait a few minutes." }, 429);
  let body: { text?: unknown };
  try { const raw = await request.text(); if (raw.length > 2000) return json({ error: "Too long." }, 413); body = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }
  const text = String((body && body.text) || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 320);
  if (text.length < 2) return json({ error: "Nothing to say." }, 400);
  const audio = await speak(env.AI, text, env);
  if (!audio) return json({ error: "voice_failed" }, 503);
  return json({ audio });
}

/** POST /api/public/video-voice. Returns null for anything else. */
export async function handlePublicVideoVoice(request: Request, env: PublicVoiceEnv, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/public/video-voice") return null;
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  return voicePost(request, env);
}
