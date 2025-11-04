import type { Config } from "./config/env";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import type { PluginProcessor } from "./middleware/plugin-processor";
import type { Tool } from "./tools/types";
import { parseSSEStream } from "./utils/stream-parser";

let toolCallsEnabled = true;

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

  const userRequestedStream = body.stream;

  if (toolCallsEnabled && tools.length > 0) {
    body.tools = tools.map(t => t.definition);
    console.log(`[TOOLS] Injecting ${tools.length} tool definitions into request`);
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

  if (!providerResponse.ok && body.tools) {
    console.error("[TOOLS] Tool calls not supported by model, disabling");
    console.error(`[TOOLS] toolCallsEnabled: true -> false`);
    toolCallsEnabled = false;
    delete body.tools;

    const retryResponse = await fetch(targetUrl, {
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
      return new Response(retryResponse.body, {
        status: retryResponse.status,
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

    const retryData = await retryResponse.json() as ChatCompletionResponse;
    return new Response(JSON.stringify(retryData), {
      status: retryResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": config.CORS_ORIGIN,
        "Access-Control-Allow-Methods": config.CORS_METHODS,
        "Access-Control-Allow-Headers": config.CORS_HEADERS
      }
    });
  }

  if (body.stream && toolCallsEnabled && tools.length > 0) {
    console.log(`[TOOLS] Parsing stream to detect tool calls`);
    const streamResult = await parseSSEStream(providerResponse.body!);

    if (streamResult.passthrough) {
      console.log(`[TOOLS] Content detected, passing through stream`);
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
      console.log(`[TOOLS] Tool calls detected in stream`);
      const toolCalls = streamResult.toolCalls!;
      console.log(`[TOOLS] LLM requested ${toolCalls.length} tool call(s)`);
      const toolResults = [];

      for (const toolCall of toolCalls) {
        const tool = tools.find(t => t.definition.function.name === toolCall.function.name);
        if (tool) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            console.log(`[TOOLS] Executing: ${toolCall.function.name}(${JSON.stringify(args)})`);
            const result = await tool.executor(args);
            console.log(`[TOOLS] Result: ${result}`);
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
        stream: userRequestedStream,
        messages: [
          ...body.messages,
          streamResult.assistantMessage,
          ...toolResults
        ]
      };

      console.log(`[TOOLS] Sending tool results back to LLM (${toolResults.length} results)`);
      console.log(`[TOOLS] Second round stream=${userRequestedStream}`);

      const secondRoundResponse = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
          "HTTP-Referer": config.HTTP_REFERER,
          "X-Title": config.PROXY_TITLE
        },
        body: JSON.stringify(secondRoundBody)
      });

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

    console.log(`[TOOLS] No tool calls in stream, passing through`);
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

  console.log(`[TOOLS] LLM response finish_reason: ${responseData.choices?.[0]?.finish_reason}`);
  console.log(`[TOOLS] LLM response has tool_calls: ${!!responseData.choices?.[0]?.message?.tool_calls}`);

  const toolCalls = responseData.choices?.[0]?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    console.log(`[TOOLS] LLM requested ${toolCalls.length} tool call(s)`);
    const toolResults = [];

    for (const toolCall of toolCalls) {
      const tool = tools.find(t => t.definition.function.name === toolCall.function.name);
      if (tool) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[TOOLS] Executing: ${toolCall.function.name}(${JSON.stringify(args)})`);
          const result = await tool.executor(args);
          console.log(`[TOOLS] Result: ${result}`);
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

    console.log(`[TOOLS] Sending tool results back to LLM (${toolResults.length} results)`);

    const secondRoundResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "HTTP-Referer": config.HTTP_REFERER,
        "X-Title": config.PROXY_TITLE
      },
      body: JSON.stringify(secondRoundBody)
    });

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
