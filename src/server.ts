import type { Config } from "./config/env";
import { handleChatCompletion } from "./chat-completion";
import type { PluginProcessor } from "./middleware/plugin-processor";
import type { ToolProcessor } from "./middleware/tool-processor";
import { buildBaseCorsHeaders } from "./utils/cors";

export function createServer(config: Config, pluginProcessor: PluginProcessor, toolProcessor: ToolProcessor) {
  return Bun.serve({
    port: config.PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...buildBaseCorsHeaders(config),
            "Access-Control-Max-Age": "86400"
          }
        });
      }

      if (url.pathname !== "/chat/completions" && url.pathname !== "/v1/chat/completions") {
        return new Response(JSON.stringify({ error: "Not found", path: url.pathname }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...buildBaseCorsHeaders(config)
          }
        });
      }

      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Allow": "POST, OPTIONS",
            ...buildBaseCorsHeaders(config)
          }
        });
      }

      return await handleChatCompletion(req, config, pluginProcessor, toolProcessor);
    }
  });
}
