import type { Config } from "./config/env";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import type { PluginProcessor } from "./middleware/plugin-processor";
import type { ToolProcessor } from "./middleware/tool-processor";
import { validateAuthHeader, AuthError } from "./middleware/auth";
import { makeProviderRequest, isToolUnsupportedError } from "./provider/client";
import { executeToolCalls } from "./tools/executor";
import { classifyStreamResponse } from "./utils/stream-parser";
import { buildResponseHeaders, createErrorResponse } from "./utils/response-builder";
import { logProxyInfo } from "./utils/logger";

// Global state: Single-user MVP, single model per session.
// If tools fail once, disabled for entire session until restart.
let toolCallsEnabled = true;

export async function handleChatCompletion(
  req: Request,
  config: Config,
  pluginProcessor: PluginProcessor,
  toolProcessor: ToolProcessor
): Promise<Response> {
  let authHeader: string;
  try {
    authHeader = validateAuthHeader(req, config);
  } catch (e) {
    if (e instanceof AuthError) {
      return createErrorResponse(config, 401, e.message);
    }
    throw e;
  }

  const body = (await req.json()) as ChatCompletionRequest;

  if (body.messages) {
    body.messages = pluginProcessor.processRequest(body.messages);
  }

  if (config.DEFAULT_MODEL) {
    body.model = config.DEFAULT_MODEL;
  }

  const toolsAttached = toolCallsEnabled && toolProcessor.hasTools();
  if (toolsAttached) {
    body.tools = toolProcessor.getDefinitions();
    logProxyInfo("ToolAttachment", `Attached ${body.tools.length} tool(s) to request`);
  }

  let providerResponse = await makeProviderRequest(config, authHeader, body);

  if (!providerResponse.ok && toolsAttached) {
    const errorText = await providerResponse.text();

    if (isToolUnsupportedError(errorText)) {
      logProxyInfo("ToolFallback", "Provider doesn't support tools, disabling for session");
      toolCallsEnabled = false;
      delete body.tools;
      providerResponse = await makeProviderRequest(config, authHeader, body);
    } else {
      return new Response(errorText, {
        status: providerResponse.status,
        headers: buildResponseHeaders(config, "application/json"),
      });
    }
  }

  if (body.stream && toolCallsEnabled && toolProcessor.hasTools()) {
    const streamResult = await classifyStreamResponse(providerResponse.body!);
    logProxyInfo("ToolDetection", `Stream classified: isToolCall=${streamResult.isToolCall}, toolCalls=${streamResult.toolCalls?.length ?? 0}`);

    if (streamResult.isToolCall && streamResult.toolCalls && streamResult.toolCalls.length > 0) {
      logProxyInfo("ToolExecution", `Executing ${streamResult.toolCalls.length} tool call(s)`);
      const toolResults = await executeToolCalls(streamResult.toolCalls, toolProcessor);

      const secondRoundBody: ChatCompletionRequest = {
        ...body,
        messages: [...body.messages, streamResult.assistantMessage, ...toolResults],
      };

      const secondRoundResponse = await makeProviderRequest(config, authHeader, secondRoundBody);

      return new Response(secondRoundResponse.body, {
        status: secondRoundResponse.status,
        headers: buildResponseHeaders(config, "text/event-stream"),
      });
    }

    return new Response(streamResult.remainingStream, {
      status: providerResponse.status,
      headers: buildResponseHeaders(config, "text/event-stream"),
    });
  }

  if (body.stream) {
    return new Response(providerResponse.body, {
      status: providerResponse.status,
      headers: buildResponseHeaders(config, "text/event-stream"),
    });
  }

  const responseData = (await providerResponse.json()) as ChatCompletionResponse;

  const toolCalls = responseData.choices?.[0]?.message?.tool_calls;
  logProxyInfo("ToolDetection", `Non-streaming response: tool_calls=${toolCalls?.length ?? 0}`);
  if (toolCalls && toolCalls.length > 0) {
    logProxyInfo("ToolExecution", `Executing ${toolCalls.length} tool call(s)`);
    const toolResults = await executeToolCalls(toolCalls, toolProcessor);

    const secondRoundBody: ChatCompletionRequest = {
      ...body,
      stream: false,
      messages: [...body.messages, responseData.choices![0].message, ...toolResults],
    };

    const secondRoundResponse = await makeProviderRequest(config, authHeader, secondRoundBody);
    const finalResponse = (await secondRoundResponse.json()) as ChatCompletionResponse;

    return new Response(JSON.stringify(finalResponse), {
      status: secondRoundResponse.status,
      headers: buildResponseHeaders(config, "application/json"),
    });
  }

  return new Response(JSON.stringify(responseData), {
    status: providerResponse.status,
    headers: buildResponseHeaders(config, "application/json"),
  });
}
