import type { ContextPlugin, Message } from "../plugins/types";
import { loadPlugins } from "../plugins/loader";
import { truncateAddedContent } from "../utils/token-counter";
import { logProxyInfo } from "../utils/logger";

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
    if (this.plugins.length === 0) {
      return messages;
    }

    logProxyInfo("PluginProcessor", `Executing ${this.plugins.length} plugin(s)`);
    const originalMessages = messages;
    let modified = messages;

    for (const plugin of this.plugins) {
      modified = plugin.process(modified);
    }

    return truncateAddedContent(originalMessages, modified, this.maxPluginTokens);
  }
}
