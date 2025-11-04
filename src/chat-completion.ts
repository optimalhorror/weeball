import type { Config } from "./config/env";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import type { PluginProcessor } from "./middleware/plugin-processor";

export async function handleChatCompletion(
  req: Request,
  config: Config,
  pluginProcessor: PluginProcessor
): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const body = await req.json() as ChatCompletionRequest;

  if (body.messages) {
    const lastUserIndex = body.messages.map(m => m.role).lastIndexOf("user");
    if (lastUserIndex !== -1) {
      const processed = pluginProcessor.processRequest(body.messages[lastUserIndex].content);
      body.messages[lastUserIndex] = {
        ...body.messages[lastUserIndex],
        content: processed
      };
    }
  }

  if (config.DEFAULT_MODEL) {
    body.model = config.DEFAULT_MODEL;
  }

  const targetUrl = `${config.PROVIDER_URL}/chat/completions`;

  const providerResponse = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
      "HTTP-Referer": config.HTTP_REFERER,
      "X-Title": config.PROXY_TITLE
    },
    body: JSON.stringify(body)
  });

  if (body.stream) {
    return new Response(providerResponse.body, {
      status: providerResponse.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": config.CORS_ORIGIN,
        "Access-Control-Allow-Methods": config.CORS_METHODS,
        "Access-Control-Allow-Headers": config.CORS_HEADERS,
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  const responseData = await providerResponse.json() as ChatCompletionResponse;

  return new Response(JSON.stringify(responseData), {
    status: providerResponse.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": config.CORS_ORIGIN,
      "Access-Control-Allow-Methods": config.CORS_METHODS,
      "Access-Control-Allow-Headers": config.CORS_HEADERS
    }
  });
}
