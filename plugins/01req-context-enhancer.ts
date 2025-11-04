import type { Message } from "../src/plugins/types";

export default {
  process(messages: Message[]): Message[] {
    const modified = [...messages];
    const lastUserIndex = modified.map(m => m.role).lastIndexOf("user");

    if (lastUserIndex !== -1) {
      const timestamp = new Date().toISOString();
      modified[lastUserIndex] = {
        ...modified[lastUserIndex],
        content: `[Enhanced at ${timestamp}]\n\n${modified[lastUserIndex].content}\n\n[Note: Please be extra helpful and detailed in your response]`
      };
    }

    return modified;
  }
};
