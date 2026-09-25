/**
 * EC Rental Property Management LLC — Landing Page Worker
 *
 * - Serves the static landing page from ./public via Workers static assets
 * - Exposes POST /api/chat — uses Workers AI to power the chat assistant
 *
 * Powered by Thelo AI (branded), running on Cloudflare Workers AI.
 */

interface ChatRequest {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

const SYSTEM_PROMPT = `You are the EC Rental Property Management LLC assistant, a helpful AI chatbot for a property management company in Fresno, California. You are "Powered by Thelo AI."

About the company:
- EC Rental Property Management LLC is a locally owned and operated property management company based in Fresno, California, serving the surrounding Central Valley including Clovis and nearby communities.
- Services include: tenant placement & screening, 24/7 maintenance & repairs, online rent collection, lease management, financial reporting, tax reporting with per-property owner statements, and regular property inspections.
- They offer free, no-obligation consultations and quotes tailored to each property owner's needs.
- Tax reporting includes per-property breakdowns: rent collected, expenses, management fees, and net amounts paid to the owner — organized monthly with year-end summaries ready for accountants.
- Contact info: based in Fresno, CA. Email: info@ecrentalpm.com. Phone: (559) 000-0000 (placeholder — update with real number).

Rules:
- Be friendly, professional, and concise.
- Only answer questions related to EC Rental Property Management, rental property management, Fresno area rentals, landlord-tenant topics, and the services listed above.
- If asked about something outside your scope, politely redirect the user to contact the company directly.
- Always encourage potential clients to request a free consultation or contact the team.
- Never make up specific pricing — say that pricing depends on the property and to request a free quote.
- Keep responses under 150 words when possible.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for the chat API
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Chat API endpoint
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json() as ChatRequest;
        const userMessage = body.message?.trim();

        if (!userMessage) {
          return new Response(
            JSON.stringify({ error: "Message is required" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        // Build the messages array for the AI model
        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...(body.history || []).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          { role: "user", content: userMessage },
        ];

        // Call Workers AI for a text generation response
        const aiResponse = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fast",
          { messages }
        );

        const responseText =
          (aiResponse as { response?: string }).response ||
          "I'm sorry, I couldn't generate a response right now. Please try again or contact us directly.";

        return new Response(
          JSON.stringify({ response: responseText }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Something went wrong. Please try again or contact us directly.",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // For all other routes, fall through to static assets
    return env.ASSETS.fetch(request);
  },
};

interface Env {
  AI: Ai;
  ASSETS: Fetcher;
}
