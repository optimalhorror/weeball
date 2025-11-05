import type { Config } from "./config/env";
import { handleChatCompletion } from "./chat-completion";
import type { PluginProcessor } from "./middleware/plugin-processor";
import type { ToolProcessor } from "./middleware/tool-processor";

function buildCorsHeaders(config: Config) {
  return {
    "Access-Control-Allow-Origin": config.CORS_ORIGIN,
    "Access-Control-Allow-Methods": config.CORS_METHODS,
    "Access-Control-Allow-Headers": config.CORS_HEADERS
  };
}

export function createServer(config: Config, pluginProcessor: PluginProcessor, toolProcessor: ToolProcessor) {
  return Bun.serve({
    port: config.PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...buildCorsHeaders(config),
            "Access-Control-Max-Age": "86400"
          }
        });
      }

      if (url.pathname !== "/chat/completions" && url.pathname !== "/v1/chat/completions") {
        return new Response(JSON.stringify({ error: "Not found", path: url.pathname }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...buildCorsHeaders(config)
          }
        });
      }

      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Allow": "POST, OPTIONS",
            ...buildCorsHeaders(config)
          }
        });
      }

      return await handleChatCompletion(req, config, pluginProcessor, toolProcessor);
    }
  });
}
