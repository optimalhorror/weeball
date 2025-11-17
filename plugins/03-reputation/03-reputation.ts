import type { Message } from "../../src/plugins/types";

export default {
  process(messages: Message[], conversationId: string): Message[] {
    // This plugin intentionally does nothing in message processing.
    // Its purpose is to ensure the lorebook plugin (01-lorebook) is loaded first
    // so that reputation changes made via the reputation_change tool
    // are properly reflected when lorebook entries are injected.
    return messages;
  }
};
