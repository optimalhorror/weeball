import type { ContextPlugin, Message } from "../plugins/types";
import { loadPlugins } from "../plugins/loader";
import { truncateAddedContent } from "../utils/token-counter";

export class PluginProcessor {
  private plugins: ContextPlugin[] = [];
  private maxPluginTokens: number;

  async load(pluginsSource: string | ContextPlugin[], maxTokens: number): Promise<void> {
    if (typeof pluginsSource === "string") {
      this.plugins = await loadPlugins(pluginsSource);
    } else {
      this.plugins = pluginsSource;
    }
    this.maxPluginTokens = maxTokens;
  }

  processRequest(messages: Message[]): Message[] {
    const originalMessages = messages;
    let modified = messages;

    for (const plugin of this.plugins) {
      modified = plugin.process(modified);
    }

    // Truncate if plugins added too much content
    return truncateAddedContent(originalMessages, modified, this.maxPluginTokens);
  }
}
