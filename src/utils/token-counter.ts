import { encode } from "gpt-tokenizer";
import type { ChatCompletionMessageParam } from "../types";

export function countMessageTokens(messages: ChatCompletionMessageParam[]): number {
  let total = 0;

  for (const message of messages) {
    // Count role tokens
    total += encode(message.role).length;

    // Count content tokens
    if (typeof message.content === "string") {
      total += encode(message.content).length;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "text") {
          total += encode(part.text).length;
        }
      }
    }

    // Count tool_calls if present
    if ("tool_calls" in message && message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        total += encode(toolCall.function.name).length;
        total += encode(toolCall.function.arguments).length;
      }
    }

    // Count tool results
    if ("tool_call_id" in message && message.tool_call_id) {
      total += encode(message.tool_call_id).length;
      if (typeof message.content === "string") {
        total += encode(message.content).length;
      }
    }
  }

  return total;
}

export function calculateAddedTokens(
  originalMessages: ChatCompletionMessageParam[],
  processedMessages: ChatCompletionMessageParam[]
): number {
  const originalTokens = countMessageTokens(originalMessages);
  const processedTokens = countMessageTokens(processedMessages);
  return processedTokens - originalTokens;
}

export function truncateAddedContent(
  originalMessages: ChatCompletionMessageParam[],
  processedMessages: ChatCompletionMessageParam[],
  maxTokens: number
): ChatCompletionMessageParam[] {
  const addedTokens = calculateAddedTokens(originalMessages, processedMessages);

  if (addedTokens <= maxTokens) {
    return processedMessages;
  }

  // Find added messages (messages not in original)
  const result: ChatCompletionMessageParam[] = [];
  let tokensRemoved = 0;
  const tokensToRemove = addedTokens - maxTokens;

  for (let i = 0; i < processedMessages.length; i++) {
    const isOriginalMessage = i < originalMessages.length &&
      JSON.stringify(processedMessages[i]) === JSON.stringify(originalMessages[i]);

    if (isOriginalMessage) {
      result.push(processedMessages[i]);
    } else {
      // This is an added message - check if we should include it
      const messageTokens = countMessageTokens([processedMessages[i]]);

      if (tokensRemoved < tokensToRemove) {
        // Skip this message to reduce tokens
        tokensRemoved += messageTokens;
      } else {
        result.push(processedMessages[i]);
      }
    }
  }

  return result;
}
