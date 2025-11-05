import type { Tool, ToolDefinition } from "../tools/types";
import { loadTools } from "../tools/loader";

export class ToolProcessor {
  private tools: Tool[] = [];
  private toolMap: Map<string, Tool> = new Map();

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
  }

  getDefinitions(): ToolDefinition[] {
    return this.tools.map(tool => tool.definition);
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
