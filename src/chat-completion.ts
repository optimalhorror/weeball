import type { Config } from "./config/env";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import type { PluginProcessor } from "./middleware/plugin-processor";
import type { Tool } from "./tools/types";
import { parseSSEStreamEarly } from "./utils/stream-parser";

// NOTE: Global state - model is set on proxy startup because this is a LEARNING project.
// I WILL add runtime model change support LATER, AFTER I MAKE IT WORK.
// For now, this is good enough for single-model deployments.
let toolCallsEnabled = true;

function makeRequest(url: string, authHeader: string, config: Config, body: any) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
      "HTTP-Referer": config.HTTP_REFERER,
      "X-Title": config.PROXY_TITLE
    },
    body: JSON.stringify(body)
  });
}

function buildCorsHeaders(config: Config, contentType: "application/json" | "text/event-stream") {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": config.CORS_ORIGIN,
    "Access-Control-Allow-Methods": config.CORS_METHODS,
    "Access-Control-Allow-Headers": config.CORS_HEADERS
  };

  if (contentType === "text/event-stream") {
    headers["Cache-Control"] = "no-cache";
    headers["Connection"] = "keep-alive";
  }

  return headers;
}

async function executeToolCalls(toolCalls: any[], tools: Tool[]) {
  const toolResults = [];

  for (const toolCall of toolCalls) {
    const tool = tools.find(t => t.definition.function.name === toolCall.function.name);
    if (tool) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await tool.executor(args);
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result
        });
      } catch (e) {
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Error: ${e instanceof Error ? e.message : "Unknown error"}`
        });
      }
    }
  }

  return toolResults;
}

export async function handleChatCompletion(
  req: Request,
  config: Config,
  pluginProcessor: PluginProcessor,
  tools: Tool[]
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
    body.messages = pluginProcessor.processRequest(body.messages);
  }

  if (config.DEFAULT_MODEL) {
    body.model = config.DEFAULT_MODEL;
  }

  if (toolCallsEnabled && tools.length > 0) {
    body.tools = tools.map(t => t.definition);
  }

  const targetUrl = `${config.PROVIDER_URL}/chat/completions`;
  let providerResponse = await makeRequest(targetUrl, authHeader, config, body);

  if (!providerResponse.ok && body.tools) {
    const errorText = await providerResponse.text();

    const lowerError = errorText.toLowerCase();
    const isToolError = (
      (lowerError.includes("tool") && lowerError.includes("not") && (lowerError.includes("support") || lowerError.includes("available"))) ||
      (lowerError.includes("function") && lowerError.includes("not") && (lowerError.includes("support") || lowerError.includes("available"))) ||
      lowerError.includes("tool_choice") ||
      lowerError.includes("tools") && lowerError.includes("invalid") ||
      lowerError.includes("does not support function calling") ||
      lowerError.includes("does not support tool") ||
      lowerError.includes("function calling is not available")
    );

    if (isToolError) {
      toolCallsEnabled = false;
      delete body.tools;
      providerResponse = await makeRequest(targetUrl, authHeader, config, body);
    } else {
      return new Response(errorText, {
        status: providerResponse.status,
        headers: buildCorsHeaders(config, "application/json")
      });
    }
  }

  if (body.stream && toolCallsEnabled && tools.length > 0) {
    const streamResult = await parseSSEStreamEarly(providerResponse.body!);

    if (streamResult.isToolCall && streamResult.toolCalls && streamResult.toolCalls.length > 0) {
      const toolResults = await executeToolCalls(streamResult.toolCalls, tools);

      const secondRoundBody = {
        ...body,
        messages: [
          ...body.messages,
          streamResult.assistantMessage,
          ...toolResults
        ]
      };

      const secondRoundResponse = await makeRequest(targetUrl, authHeader, config, secondRoundBody);

      return new Response(secondRoundResponse.body, {
        status: secondRoundResponse.status,
        headers: buildCorsHeaders(config, "text/event-stream")
      });
    }

    return new Response(streamResult.remainingStream, {
      status: providerResponse.status,
      headers: buildCorsHeaders(config, "text/event-stream")
    });
  }

  if (body.stream) {
    return new Response(providerResponse.body, {
      status: providerResponse.status,
      headers: buildCorsHeaders(config, "text/event-stream")
    });
  }

  const responseData = await providerResponse.json() as ChatCompletionResponse;

  const toolCalls = responseData.choices?.[0]?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const toolResults = await executeToolCalls(toolCalls, tools);

    const secondRoundBody = {
      ...body,
      stream: false,
      messages: [
        ...body.messages,
        responseData.choices![0].message,
        ...toolResults
      ]
    };

    const secondRoundResponse = await makeRequest(targetUrl, authHeader, config, secondRoundBody);

    const finalResponse = await secondRoundResponse.json() as ChatCompletionResponse;
    return new Response(JSON.stringify(finalResponse), {
      status: secondRoundResponse.status,
      headers: buildCorsHeaders(config, "application/json")
    });
  }

  return new Response(JSON.stringify(responseData), {
    status: providerResponse.status,
    headers: buildCorsHeaders(config, "application/json")
  });
}
