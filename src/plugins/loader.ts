import type { Plugin } from "./types";
import { logProxyWarn, logProxyError } from "../utils/logger";

export async function loadPlugins(pluginsDir: string): Promise<Plugin[]> {
  const loadedPlugins: Plugin[] = [];
  const glob = new Bun.Glob("*/*.{js,ts}");
  const files = Array.from(glob.scanSync(pluginsDir))
    .map(f => String(f))
    .filter(f => {
      const parts = f.split('/');
      if (parts.length !== 2) return false;
      const dir = parts[0];
      const file = parts[1].replace(/\.(js|ts)$/, '');
      return file === dir;
    })
    .sort();

  for (const file of files) {
    try {
      const pluginPath = `${pluginsDir}/${file}`;
      const pluginModule = await import(pluginPath);
      const plugin = pluginModule.default || pluginModule;

      if (typeof plugin.process === "function") {
        loadedPlugins.push(plugin);
      } else {
        logProxyWarn("PluginLoader", `Skipping ${file}: missing process function`);
      }
    } catch (e) {
      logProxyError("PluginLoader", `Failed to load ${file}`, e);
    }
  }

  return loadedPlugins;
}
