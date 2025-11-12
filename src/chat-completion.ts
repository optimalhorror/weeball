import type { Config } from "./config/env";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import type { PluginProcessor } from "./middleware/plugin-processor";
import type { ToolProcessor } from "./middleware/tool-processor";
import { validateAuthHeader, AuthError } from "./middleware/auth";
import { makeProviderRequest, isToolUnsupportedError } from "./provider/client";
import { executeToolCalls } from "./tools/executor";
import { classifyStreamResponse } from "./utils/stream-parser";
import { buildResponseHeaders, createErrorResponse } from "./utils/response-builder";
import { extractConversationId } from "./utils/conversation-id";

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

  const conversationId = extractConversationId(req);

  const body = (await req.json()) as ChatCompletionRequest;

  if (body.messages) {
    body.messages = pluginProcessor.processRequest(body.messages, conversationId);
  }

  if (config.DEFAULT_MODEL) {
    body.model = config.DEFAULT_MODEL;
  }

  const toolsAttached = toolCallsEnabled && toolProcessor.hasTools();
  if (toolsAttached) {
    body.tools = toolProcessor.getDefinitions();

    // Add game master instruction when tools are available
    const toolNames = body.tools.map(t => `'${t.function.name}'`).join(", ");
    const gmInstruction = `[GAME MASTER INSTRUCTION] You are acting as a game master for this roleplay session. You have access to the following tools to help manage the game state: ${toolNames}. Use these tools proactively when appropriate actions occur in the narrative to maintain accurate state tracking. Do not narrate item tracking without calling tools. Tools are essential to keep the state of the game consistent.`;

    body.messages.push({
      role: "system",
      content: gmInstruction
    });
  }

  let providerResponse = await makeProviderRequest(config, authHeader, body);

  if (!providerResponse.ok && toolsAttached) {
    const errorText = await providerResponse.text();

    if (isToolUnsupportedError(errorText)) {
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

    if (streamResult.isToolCall && streamResult.toolCalls && streamResult.toolCalls.length > 0) {
      const toolResults = await executeToolCalls(streamResult.toolCalls, toolProcessor, conversationId);

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
  if (toolCalls && toolCalls.length > 0) {
    const toolResults = await executeToolCalls(toolCalls, toolProcessor, conversationId);

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
