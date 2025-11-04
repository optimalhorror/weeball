import type { ContextPlugin, Message } from "../plugins/types";

export class PluginProcessor {
  private plugins: ContextPlugin[] = [];

  load(plugins: ContextPlugin[]): void {
    this.plugins = plugins;
  }

  processRequest(messages: Message[]): Message[] {
    let modified = messages;
    for (const plugin of this.plugins) {
      modified = plugin.process(modified);
    }
    return modified;
  }
}
