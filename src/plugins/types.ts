import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type Message = ChatCompletionMessageParam;

export interface Plugin {
  process: (messages: Message[], conversationId: string) => Message[];
}
