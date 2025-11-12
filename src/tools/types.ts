import type { ChatCompletionTool } from "openai/resources/chat/completions";

export type ToolDefinition = ChatCompletionTool;

export interface ToolExecutor {
  (args: any, conversationId: string): Promise<string> | string;
}

export interface Tool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}
