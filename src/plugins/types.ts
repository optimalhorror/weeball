import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type Message = ChatCompletionMessageParam;

export interface ContextPlugin {
  process: (messages: Message[]) => Message[];
}
