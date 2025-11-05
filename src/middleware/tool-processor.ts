import type { Tool, ToolDefinition } from "../tools/types";
import { loadTools } from "../tools/loader";

export class ToolProcessor {
  private tools: Tool[] = [];
  private toolMap: Map<string, Tool> = new Map();
  private definitionsCache: ToolDefinition[] | null = null;

  async load(toolsSource: string | Tool[]): Promise<void> {
    if (typeof toolsSource === "string") {
      this.tools = await loadTools(toolsSource);
    } else {
      this.tools = toolsSource;
    }

    this.toolMap.clear();
    for (const tool of this.tools) {
      this.toolMap.set(tool.definition.function.name, tool);
    }

    this.definitionsCache = null;
  }

  getDefinitions(): ToolDefinition[] {
    if (!this.definitionsCache) {
      this.definitionsCache = this.tools.map(tool => tool.definition);
    }
    return this.definitionsCache;
  }

  async execute(toolName: string, args: any): Promise<string> {
    const tool = this.toolMap.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    return await tool.executor(args);
  }

  hasTools(): boolean {
    return this.tools.length > 0;
  }
}
