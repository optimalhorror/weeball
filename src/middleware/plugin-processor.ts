import type { ContextPlugin, Message } from "../plugins/types";
import { loadPlugins } from "../plugins/loader";

export class PluginProcessor {
  private plugins: ContextPlugin[] = [];

  async load(pluginsSource: string | ContextPlugin[]): Promise<void> {
    if (typeof pluginsSource === "string") {
      this.plugins = await loadPlugins(pluginsSource);
    } else {
      this.plugins = pluginsSource;
    }
  }

  processRequest(messages: Message[]): Message[] {
    let modified = messages;
    for (const plugin of this.plugins) {
      modified = plugin.process(modified);
    }
    return modified;
  }
}
