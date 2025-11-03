/**
 * Weeball Phase 0: Basic Passthrough Proxy
 *
 * This is a simple proxy that forwards chat completion requests to LLM providers.
 * No sessions, no sandboxing, no persistence - just basic request forwarding.
 */

// Load from environment (required)
if (!process.env.PROVIDER_URL) {
  console.error("ERROR: PROVIDER_URL is required in .env file");
  process.exit(1);
}
if (!process.env.DEFAULT_MODEL) {
  console.error("ERROR: DEFAULT_MODEL is required in .env file");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const PROVIDER_URL = process.env.PROVIDER_URL;
const DEFAULT_MODEL = process.env.DEFAULT_MODEL;

interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  [key: string]: any;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
  [key: string]: any;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Log ALL incoming requests
    console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname} (from: ${req.headers.get("Origin") || "unknown"})`);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // Only handle chat completion endpoints
    if (!url.pathname.endsWith("/chat/completions")) {
      return new Response(JSON.stringify({ error: "Not found", path: url.pathname }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      // Extract authorization header (user's provider API key)
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Parse request body
      const body = await req.json() as ChatCompletionRequest;

      // Override model if DEFAULT_MODEL is set
      const originalModel = body.model;
      if (DEFAULT_MODEL) {
        body.model = DEFAULT_MODEL;
      }

      // Log request (for debugging)
      console.log(`[${new Date().toISOString()}] Request:`, {
        method: req.method,
        path: url.pathname,
        model: body.model,
        originalModel: DEFAULT_MODEL ? originalModel : undefined,
        messageCount: body.messages?.length || 0,
        referer: req.headers.get("Referer") || "none"
      });

      // Determine provider URL
      const targetUrl = `${PROVIDER_URL}/chat/completions`;

      // Forward request to provider
      const providerResponse = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader, // Passthrough user's key
          "HTTP-Referer": "https://weeball.ai", // Some providers require this
          "X-Title": "Weeball Proxy"
        },
        body: JSON.stringify(body)
      });

      // Handle streaming vs non-streaming responses
      if (body.stream) {
        // Streaming: pass through SSE stream directly
        return new Response(providerResponse.body, {
          status: providerResponse.status,
          headers: {
            "Content-Type": "text/event-stream",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }

      // Non-streaming: parse and return JSON
      const responseData = await providerResponse.json() as ChatCompletionResponse;

      console.log(`[${new Date().toISOString()}] Response:`, {
        status: providerResponse.status,
        ok: providerResponse.ok,
        hasChoices: !!responseData.choices
      });

      return new Response(JSON.stringify(responseData), {
        status: providerResponse.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });

    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error:`, error);

      return new Response(JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});

console.log(`Weeball Phase 0 running on http://localhost:${server.port}`);
console.log(`Provider URL: ${PROVIDER_URL}`);
console.log(`Default Model: ${DEFAULT_MODEL}`);
