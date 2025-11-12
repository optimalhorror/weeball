import type { Message } from "../src/plugins/types";
import * as inventory from "../persistence/inventory";

function formatInventoryForDisplay(items: inventory.InventoryItem[]): string {
  if (items.length === 0) {
    return "[NARRATOR INSTRUCTION] {{user}} asked what they're carrying. The system reports the inventory is empty. Respond in-character by having {{user}} check their pockets/bag and finding nothing. Example: \"{{user}} pats down their pockets—empty. Nothing but lint.\"";
  }

  const itemList = items
    .map(item => `- ${item.name}: ${item.description}. Obtained from: ${item.obtained}`)
    .join("\n");

  return `[NARRATOR INSTRUCTION] {{user}} asked what they're carrying. The system has already tracked and persisted these items:\n\n${itemList}\n\nRespond by having {{user}} check their pockets/bag and list ONLY these items (incorporate them naturally into narration, e.g., "{{user}} digs through their pockets, pulling out..."). Do not add or remove items—these are already recorded in the system.`;
}

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

export default {
  process(messages: Message[], conversationId: string): Message[] {
    const modified = [...messages];
    let inventoryRequested = false;
    const userName = extractUserName(messages);

    for (let i = 0; i < modified.length; i++) {
      const msg = modified[i];
      if (msg.role !== "user") continue;

      const content = messageToText(msg);

      if (content.includes("/inventory")) {
        console.log("[Inventory Plugin] /inventory command detected");
        inventoryRequested = true;
        const cleanedContent = content.replace(/\/inventory/g, "").trim();
        const instruction = `[IMPORTANT]: Give me the list of what ${userName} carries in the inventory before continuing with the narration.`;

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

    if (inventoryRequested) {
      const items = inventory.list(conversationId);
      const inventoryText = formatInventoryForDisplay(items).replace(/\{\{user\}\}/g, userName);

      modified.push({
        role: "system",
        content: inventoryText
      });
    }

    return modified;
  }
};
