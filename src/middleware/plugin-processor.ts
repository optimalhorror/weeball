import type { ContextPlugin } from "../plugins/types";

export class PluginProcessor {
  private plugins: ContextPlugin[] = [];

  load(plugins: ContextPlugin[]): void {
    this.plugins = plugins;
  }

  processRequest(content: string): string {
    let modified = content;
    for (const plugin of this.plugins) {
      modified = plugin.process(modified);
    }
    return modified;
  }
}
