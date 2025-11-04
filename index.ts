import { loadConfig } from "./src/config/env";
import { loadPlugins } from "./src/plugins/loader";
import { createServer } from "./src/server";
import { PluginProcessor } from "./src/middleware/plugin-processor";

try {
  const config = loadConfig();

  const plugins = await loadPlugins(`${import.meta.dir}/plugins`);
  const pluginProcessor = new PluginProcessor();
  pluginProcessor.load(plugins);

  const server = createServer(config, pluginProcessor);

  console.log(`Weeball Phase 0 running on http://localhost:${server.port}`);
  console.log(`Provider URL: ${config.PROVIDER_URL}`);
  console.log(`Default Model: ${config.DEFAULT_MODEL}`);
} catch (error) {
  console.error(`Failed to start server: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exit(1);
}
