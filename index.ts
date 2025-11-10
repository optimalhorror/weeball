import { loadConfig } from "./src/config/env";
import { createServer } from "./src/server";
import { PluginProcessor } from "./src/middleware/plugin-processor";
import { ToolProcessor } from "./src/middleware/tool-processor";

try {
  const config = loadConfig();

  const pluginProcessor = new PluginProcessor();
  await pluginProcessor.load(`${import.meta.dir}/plugins`, config.MAX_PLUGIN_TOKENS);

  const toolProcessor = new ToolProcessor();
  await toolProcessor.load(`${import.meta.dir}/tools`);

  const server = createServer(config, pluginProcessor, toolProcessor);

  console.log(`Weeball running on http://localhost:${server.port} | Provider: ${config.PROVIDER_URL} | Model: ${config.DEFAULT_MODEL}`);
} catch (error) {
  console.error(`Failed to start server: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exit(1);
}
