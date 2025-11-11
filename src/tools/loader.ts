import type { Tool, ToolDefinition, ToolExecutor } from "./types";
import { logProxyWarn, logProxyError } from "../utils/logger";

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
        logProxyWarn("ToolLoader", `Skipping ${file}: executor is not a function`);
        continue;
      }

      tools.push({ definition, executor });
    } catch (e) {
      logProxyError("ToolLoader", `Failed to load ${file}`, e);
    }
  }

  return tools;
}
