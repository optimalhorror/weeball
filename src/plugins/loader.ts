import type { ContextPlugin } from "../types";

export async function loadPlugins(pluginsDir: string): Promise<ContextPlugin[]> {
  const loadedPlugins: ContextPlugin[] = [];
  const glob = new Bun.Glob("*.{js,ts}");
  const files = Array.from(glob.scanSync(pluginsDir))
    .map(f => String(f))
    .sort();

  for (const file of files) {
    try {
      const pluginPath = `${pluginsDir}/${file}`;
      const pluginModule = await import(pluginPath);
      const plugin = pluginModule.default || pluginModule;

      if (typeof plugin.process === "function") {
        loadedPlugins.push(plugin);
      }
    } catch (e) {
      console.error(`Failed to load plugin ${file}:`, e);
    }
  }

  return loadedPlugins;
}
