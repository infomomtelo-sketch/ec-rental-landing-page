// Reads a small business website for Tello: the page someone gives, plus up to three of that site's own most useful
// pages (about, services, prices, menu, FAQ, contact, hours), chosen from the page's real links. Used by the tello.live
// chat ("look at my website", "Try Tello on my website") and by business set-up, so the assistant learns more than the
// front page. Every address, including each redirect, goes through the video maker's safeUrl check (no IP addresses,
// localhost, internal names or odd ports). Nothing is stored.
import { safeUrl, readPage } from "./video-maker";

export interface SitePage { url: string; title: string; description: string; headings: string[]; text: string; }

const MAX_BYTES = 400000;
const USEFUL = /(about|service|pric|rate|menu|faq|question|contact|hour|location|visit|book|appointment|plan|product|shop|store|team|story|policy|policies|shipping|return)/i;
const SKIP = /\.(pdf|jpe?g|png|gif|webp|svg|mp4|mp3|zip|docx?|xlsx?)(\?|$)|^mailto:|^tel:|^javascript:|\/(cart|checkout|login|signin|sign-in|account|wp-admin|feed)\b/i;

/** Plain text of a page, one line per paragraph or heading, without scripts, styles or navigation chrome. */
export function pageText(html: string, max: number): string {
  const body = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|h[1-6]|li|div|section|tr|summary|details|blockquote)>|<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ");
  const decoded = body.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&middot;/g, "·").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (m, n) => { const c = Number(n); return c > 31 && c < 65536 ? String.fromCharCode(c) : " "; });
  return decoded.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").slice(0, max);
}

async function getHtml(raw: string): Promise<{ html?: string; url?: URL; error?: string }> {
  let u: URL | null = safeUrl(raw);
  if (!u) return { error: "That link does not look like a public website address." };
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (/(^|\.)workers\.dev$/i.test(u.hostname)) return { error: "That address cannot be read." };
      const res = await fetch(u.toString(), { redirect: "manual", signal: AbortSignal.timeout(7000), headers: { "User-Agent": "TelloBot/1.0 (+https://tello.live)", Accept: "text/html,application/xhtml+xml" } });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next: URL | null = safeUrl(new URL(loc, u).toString());
        if (!next) return { error: "The link redirects somewhere I cannot read." };
        u = next; continue;
      }
      if (!res.ok) return { error: `I could not open that page (it answered ${res.status}).` };
      if (!/text\/html|application\/xhtml/i.test(res.headers.get("content-type") || "")) return { error: "That link is not a web page I can read." };
      const reader = res.body!.getReader(), dec = new TextDecoder();
      let html = "", size = 0;
      while (size < MAX_BYTES) { const { done, value } = await reader.read(); if (done) break; size += value.length; html += dec.decode(value, { stream: true }); }
      try { await reader.cancel(); } catch { /* done reading */ }
      return { html, url: u };
    }
    return { error: "The link redirects too many times." };
  } catch { return { error: "I could not reach that page." }; }
}

/** The page's own links that are most likely to hold what customers ask about, best first. */
function usefulLinks(html: string, base: URL, max: number): string[] {
  const host = base.hostname.replace(/^www\./, ""), seen = new Set([base.origin + base.pathname.replace(/\/$/, "")]), scored: { url: string; score: number }[] = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && scored.length < 200) {
    const href = m[1].trim();
    if (SKIP.test(href)) continue;
    let u: URL; try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, "") !== host) continue;
    const key = u.origin + u.pathname.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const label = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const score = (USEFUL.test(u.pathname) ? 2 : 0) + (USEFUL.test(label) ? 2 : 0) - u.pathname.split("/").filter(Boolean).length * 0.5;
    if (score > 0) scored.push({ url: u.origin + u.pathname, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.url);
}

function toPage(html: string, url: URL, max: number): SitePage {
  const p = readPage(html, url.toString());
  return { url: url.toString(), title: p.title, description: p.description, headings: p.headings, text: pageText(html, max) };
}

/** The given page (up to 8,000 characters of text) and up to three more pages of the same site (2,300 each). */
export async function readSite(raw: string, extra = 3): Promise<{ pages: SitePage[]; error?: string }> {
  const first = await getHtml(raw);
  if (!first.html || !first.url) return { pages: [], error: first.error || "I could not read that page." };
  const main = toPage(first.html, first.url, 8000), pages = [main];
  const more = await Promise.all(usefulLinks(first.html, first.url, extra).map(getHtml));
  for (const r of more) {
    if (!r.html || !r.url) continue;
    const p = toPage(r.html, r.url, 2300);
    if (p.text && !pages.some((x) => x.url === p.url || x.text === p.text)) pages.push(p);
  }
  return { pages };
}

/** readSite merged into one page, in the shape fetchPage returns, for code that expects a single page (business set-up). */
export async function readSiteAsPage(raw: string): Promise<{ page?: SitePage; error?: string }> {
  const r = await readSite(raw);
  if (!r.pages.length) return { error: r.error };
  const [main, ...rest] = r.pages;
  return { page: { ...main, headings: [...main.headings, ...rest.map((p) => p.title).filter(Boolean)].slice(0, 20), text: r.pages.map((p) => (p === main ? "" : `[${p.title || p.url}]\n`) + p.text).join("\n\n") } };
}

/** Whether a public page's HTML contains `needle` (used to see if a business's Tello line is on its website). */
export async function pageHas(raw: string, needle: string): Promise<{ found: boolean; error?: string }> {
  const r = await getHtml(raw);
  if (!r.html) return { found: false, error: r.error || "I could not read that page." };
  return { found: r.html.includes(needle) };
}
