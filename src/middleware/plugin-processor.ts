import type { Plugin, Message } from "../plugins/types";
import { loadPlugins } from "../plugins/loader";
import { truncateAddedContent } from "../utils/token-counter";
import { logProxyInfo } from "../utils/logger";

export class PluginProcessor {
  private plugins: Plugin[] = [];
  private maxPluginTokens: number;

  async load(pluginsSource: string | Plugin[], maxTokens: number): Promise<void> {
    if (typeof pluginsSource === "string") {
      this.plugins = await loadPlugins(pluginsSource);
    } else {
      this.plugins = pluginsSource;
    }
    this.maxPluginTokens = maxTokens;
  }

  processRequest(messages: Message[], conversationId: string): Message[] {
    if (this.plugins.length === 0) {
      return messages;
    }

    logProxyInfo("PluginProcessor", `Executing ${this.plugins.length} plugin(s)`);
    const originalMessages = messages;
    let modified = messages;

    for (const plugin of this.plugins) {
      const beforeLength = modified.length;
      modified = plugin.process(modified, conversationId);
      const afterLength = modified.length;

      if (beforeLength !== afterLength || JSON.stringify(messages) !== JSON.stringify(modified)) {
        const pluginName = plugin.name || "unknown";
        logProxyInfo("PluginProcessor", `Plugin [${pluginName}] modified messages`);
      }
    }

    return truncateAddedContent(originalMessages, modified, this.maxPluginTokens);
  }
}
