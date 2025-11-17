import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface LoreEntry {
  name: string;
  triggers: string[];
  content: string;
  depth: number;
  type?: "npc" | "faction" | "other";
  arc?: string;
  perception?: string;
  standing?: number;
}

function getTemplatePath(): string {
  return join(process.cwd(), "plugins", "01-lorebook", "lore-template.json");
}

function getRuntimePath(conversationId: string): string {
  return join(process.cwd(), "persistence", "lorebook", "data", `lore-${conversationId}.json`);
}

function loadTemplate(): LoreEntry[] {
  const path = getTemplatePath();

  if (!existsSync(path)) {
    console.warn("Lore template not found, returning empty lorebook");
    return [];
  }

  try {
    const data = readFileSync(path, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.warn("Failed to load lore template:", e);
    return [];
  }
}

function initializeRuntime(conversationId: string): void {
  const runtimePath = getRuntimePath(conversationId);
  const template = loadTemplate();

  try {
    writeFileSync(runtimePath, JSON.stringify(template, null, 2), "utf-8");
  } catch (e) {
    console.error(`Failed to initialize runtime lore for ${conversationId}:`, e);
    throw e;
  }
}

export function load(conversationId: string): LoreEntry[] {
  const runtimePath = getRuntimePath(conversationId);

  if (!existsSync(runtimePath)) {
    initializeRuntime(conversationId);
  }

  try {
    const data = readFileSync(runtimePath, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.warn(`Failed to load runtime lore for ${conversationId}:`, e);
    return [];
  }
}

export function save(conversationId: string, entries: LoreEntry[]): void {
  const runtimePath = getRuntimePath(conversationId);

  try {
    writeFileSync(runtimePath, JSON.stringify(entries, null, 2), "utf-8");
  } catch (e) {
    console.error(`Failed to save runtime lore for ${conversationId}:`, e);
    throw e;
  }
}
