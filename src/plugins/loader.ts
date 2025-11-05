import type { ContextPlugin } from "./types";

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
      } else {
        console.warn(`[Plugin Loader] Skipping ${file}: missing process function`);
      }
    } catch (e) {
      console.error(`[Plugin Loader] Failed to load ${file}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[Plugin Loader] Loaded ${loadedPlugins.length} plugin(s) from ${pluginsDir}`);
  return loadedPlugins;
}
