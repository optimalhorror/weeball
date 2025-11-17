import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type Message = ChatCompletionMessageParam;

export interface Plugin {
  name?: string;
  process: (messages: Message[], conversationId: string) => Message[];
}
