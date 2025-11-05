import type { Tool, ToolDefinition, ToolExecutor } from "./types";

export async function loadTools(toolsDir: string): Promise<Tool[]> {
  const tools: Tool[] = [];
  const glob = new Bun.Glob("*.json");
  const definitionFiles = Array.from(glob.scanSync(toolsDir))
    .map(f => String(f))
    .sort();

  for (const file of definitionFiles) {
    try {
      const baseName = file.replace(".json", "");
      const definitionPath = `${toolsDir}/${file}`;
      const executorPath = `${toolsDir}/${baseName}.ts`;

      const definitionFile = Bun.file(definitionPath);
      const definition = await definitionFile.json() as ToolDefinition;

      const executorModule = await import(executorPath);
      const executor: ToolExecutor = executorModule.default || executorModule;

      if (typeof executor !== "function") {
        console.warn(`[Tool Loader] Skipping ${file}: executor is not a function`);
        continue;
      }

      tools.push({ definition, executor });
    } catch (e) {
      console.error(`[Tool Loader] Failed to load ${file}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[Tool Loader] Loaded ${tools.length} tool(s) from ${toolsDir}`);
  return tools;
}
