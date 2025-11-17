import type { Message } from "../../src/plugins/types";
import { listActive, listCompleted } from "../../persistence/quests/quests";

function messageToText(message: Message): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join(" ");
  }
  return "";
}

function extractUserName(messages: Message[]): string {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const content = messageToText(msg);

    const match = content.match(/^([^:]+):/);
    if (match) {
      return match[1].trim();
    }
  }
  return "{{user}}";
}

function formatActiveQuests(conversationId: string, userName: string): string {
  const quests = listActive(conversationId);

  if (quests.length === 0) {
    return `[NARRATOR INSTRUCTION] ${userName} checked their active quests. The list is empty - no current tasks or objectives. Respond by having ${userName} realize they have nothing pressing to do right now.`;
  }

  const questList = quests
    .map(q => `- "${q.title}" (from ${q.giver}): ${q.description}`)
    .join("\n");

  return `[NARRATOR INSTRUCTION] ${userName} reviewed their active quests:\n\n${questList}\n\nRespond by having ${userName} look over their current objectives and tasks.`;
}

function formatCompletedQuests(conversationId: string, userName: string): string {
  const quests = listCompleted(conversationId);

  if (quests.length === 0) {
    return `[NARRATOR INSTRUCTION] ${userName} checked their completed quests. Nothing finished yet. Respond by having ${userName} realize they haven't accomplished any tasks yet.`;
  }

  const questList = quests
    .map(q => {
      let entry = `- "${q.title}" (from ${q.giver}): ${q.resolution}`;
      if (q.reward) {
        entry += ` Reward: ${q.reward}`;
      }
      return entry;
    })
    .join("\n");

  return `[NARRATOR INSTRUCTION] ${userName} reviewed their completed quests:\n\n${questList}\n\nRespond by having ${userName} reflect on their accomplishments.`;
}

export default {
  process(messages: Message[], conversationId: string): Message[] {
    const modified = [...messages];
    const userName = extractUserName(messages);
    let todoRequested = false;
    let doneRequested = false;

    for (let i = 0; i < modified.length; i++) {
      const msg = modified[i];
      if (msg.role !== "user") continue;

      const content = messageToText(msg);

      if (content.includes("/todo")) {
        console.log("[Quests Plugin] /todo command detected");
        todoRequested = true;
        const cleanedContent = content.replace(/\/todo/g, "").trim();
        const instruction = `[IMPORTANT]: Show ${userName} their active quests before continuing with the narration.`;

        const isJustNamePrefix = cleanedContent === "" || cleanedContent.match(/^[^:]+:\s*$/);

        if (isJustNamePrefix) {
          if (typeof msg.content === "string") {
            modified[i] = { ...msg, content: instruction };
          }
        } else {
          if (typeof msg.content === "string") {
            modified[i] = { ...msg, content: `${cleanedContent}\n\n${instruction}` };
          }
        }
      }

      if (content.includes("/done")) {
        console.log("[Quests Plugin] /done command detected");
        doneRequested = true;
        const cleanedContent = content.replace(/\/done/g, "").trim();
        const instruction = `[IMPORTANT]: Show ${userName} their completed quests before continuing with the narration.`;

        const isJustNamePrefix = cleanedContent === "" || cleanedContent.match(/^[^:]+:\s*$/);

        if (isJustNamePrefix) {
          if (typeof msg.content === "string") {
            modified[i] = { ...msg, content: instruction };
          }
        } else {
          if (typeof msg.content === "string") {
            modified[i] = { ...msg, content: `${cleanedContent}\n\n${instruction}` };
          }
        }
      }
    }

    if (todoRequested) {
      const questText = formatActiveQuests(conversationId, userName);
      modified.push({
        role: "system",
        content: questText
      });
    }

    if (doneRequested) {
      const questText = formatCompletedQuests(conversationId, userName);
      modified.push({
        role: "system",
        content: questText
      });
    }

    return modified;
  }
};
