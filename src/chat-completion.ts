import type { Config } from "./config/env";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import type { PluginProcessor } from "./middleware/plugin-processor";
import type { Tool } from "./tools/types";
import { parseSSEStream } from "./utils/stream-parser";

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
    console.error("[TOOLS] Tool calls not supported by model, retrying without tools");
    toolCallsEnabled = false;
    delete body.tools;
    providerResponse = await makeRequest(targetUrl, authHeader, config, body);
  }

  if (body.stream && toolCallsEnabled && tools.length > 0) {
    const streamResult = await parseSSEStream(providerResponse.body!);

    if (streamResult.passthrough) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of streamResult.chunks) {
            controller.enqueue(encoder.encode(chunk));
          }

          if (streamResult.remainingStream) {
            const reader = streamResult.remainingStream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            } finally {
              reader.releaseLock();
            }
          }

          controller.close();
        }
      });

      return new Response(stream, {
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

    if (streamResult.isToolCall) {
      const toolCalls = streamResult.toolCalls!;
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
            console.error(`[TOOLS] Execution failed for ${toolCall.function.name}:`, e);
            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error: ${e instanceof Error ? e.message : "Unknown error"}`
            });
          }
        }
      }

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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of streamResult.chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    });

    return new Response(stream, {
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

  const toolCalls = responseData.choices?.[0]?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
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
          console.error(`[TOOLS] Execution failed for ${toolCall.function.name}:`, e);
          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error: ${e instanceof Error ? e.message : "Unknown error"}`
          });
        }
      }
    }

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
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": config.CORS_ORIGIN,
        "Access-Control-Allow-Methods": config.CORS_METHODS,
        "Access-Control-Allow-Headers": config.CORS_HEADERS
      }
    });
  }

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
