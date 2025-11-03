/**
 * Weeball Phase 0: Basic Passthrough Proxy
 *
 * This is a simple proxy that forwards chat completion requests to LLM providers.
 * No sessions, no sandboxing, no persistence - just basic request forwarding.
 */

const PORT = process.env.PORT || 3000;
const DEFAULT_PROVIDER_URL = "https://openrouter.ai/api/v1";

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
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // Models endpoint (for API key validation)
    if (url.pathname.endsWith("/models")) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      const providerUrl = process.env.PROVIDER_URL || DEFAULT_PROVIDER_URL;
      const targetUrl = `${providerUrl}/models`;

      try {
        const providerResponse = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "Authorization": authHeader,
            "HTTP-Referer": "https://weeball.ai",
            "X-Title": "Weeball Proxy"
          }
        });

        const responseData = await providerResponse.json();

        return new Response(JSON.stringify(responseData), {
          status: providerResponse.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
          }
        });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Models endpoint error:`, error);
        return new Response(JSON.stringify({ error: "Failed to fetch models" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
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

      // Log request (for debugging)
      console.log(`[${new Date().toISOString()}] Request:`, {
        method: req.method,
        path: url.pathname,
        model: body.model,
        messageCount: body.messages?.length || 0,
        referer: req.headers.get("Referer") || "none"
      });

      // Determine provider URL (hardcoded for now, will be configurable later)
      const providerUrl = process.env.PROVIDER_URL || DEFAULT_PROVIDER_URL;
      const targetUrl = `${providerUrl}/chat/completions`;

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
console.log(`Provider URL: ${process.env.PROVIDER_URL || DEFAULT_PROVIDER_URL}`);
