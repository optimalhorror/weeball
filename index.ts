import { loadConfig } from "./src/config/env";
import { loadPlugins } from "./src/plugins/loader";
import { loadTools } from "./src/tools/loader";
import { createServer } from "./src/server";
import { PluginProcessor } from "./src/middleware/plugin-processor";

try {
  const config = loadConfig();

  const plugins = await loadPlugins(`${import.meta.dir}/plugins`);
  const pluginProcessor = new PluginProcessor();
  pluginProcessor.load(plugins);

  const tools = await loadTools(`${import.meta.dir}/tools`);

  const server = createServer(config, pluginProcessor, tools);

  console.log(`Weeball Phase 0 running on http://localhost:${server.port}`);
  console.log(`Provider URL: ${config.PROVIDER_URL}`);
  console.log(`Default Model: ${config.DEFAULT_MODEL}`);
  console.log(`Tools loaded: ${tools.length}`);
} catch (error) {
  console.error(`Failed to start server: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exit(1);
}
