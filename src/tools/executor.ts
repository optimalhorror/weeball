import type { ToolProcessor } from "../middleware/tool-processor";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { logProxyInfo } from "../utils/logger";

export async function executeToolCalls(
  toolCalls: ChatCompletionMessageToolCall[],
  toolProcessor: ToolProcessor
) {
  logProxyInfo("ToolExecutor", `Executing ${toolCalls.length} tool call(s)`);
  const toolResults = [];

  for (const toolCall of toolCalls) {
    if (toolCall.type !== "function") continue;

    try {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await toolProcessor.execute(toolCall.function.name, args);

      toolResults.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: result,
      });
    } catch (e) {
      toolResults.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: `Error: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
    }
  }

  return toolResults;
}
