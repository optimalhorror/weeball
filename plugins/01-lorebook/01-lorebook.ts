import type { Message } from "../../src/plugins/types";
import { load, type LoreEntry } from "../../persistence/lorebook/lorebook";

function getRecentMessages(messages: Message[], depth: number): Message[] {
  if (depth === 0) return [];

  const userMessages: Message[] = [];
  const allMessages: Message[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      userMessages.unshift(msg);
      if (userMessages.length === depth) {
        const firstUserIndex = i;
        allMessages.unshift(...messages.slice(firstUserIndex));
        break;
      }
    }
  }

  return allMessages.length > 0 ? allMessages : messages.slice(-depth);
}

function messageToText(message: Message): string {
  if (typeof message.content === "string") {
    return message.content.toLowerCase();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join(" ")
      .toLowerCase();
  }
  return "";
}

function shouldIncludeLore(entry: LoreEntry, messages: Message[]): boolean {
  if (entry.depth === 0) return true;

  const recentMessages = getRecentMessages(messages, entry.depth);
  const recentText = recentMessages.map(messageToText).join(" ");

  return entry.triggers.some(trigger =>
    recentText.includes(trigger.toLowerCase())
  );
}

export default {
  process(messages: Message[], conversationId: string): Message[] {
    const loreEntries = load(conversationId);
    const injectedEntries = new Set<string>();
    const modified = [...messages];

    for (const entry of loreEntries) {
      if (injectedEntries.has(entry.name)) continue;

      if (shouldIncludeLore(entry, messages)) {
        let content = entry.content;

        if (entry.arc) {
          content += `\n\nHistory with {{user}}: ${entry.arc}`;
        }

        if (entry.perception) {
          content += `\n\nCurrent standing: ${entry.perception}`;
        }

        modified.push({
          role: "system",
          content
        });
        injectedEntries.add(entry.name);
      }
    }

    return modified;
  }
};
