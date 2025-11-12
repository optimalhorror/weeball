import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface InventoryItem {
  name: string;
  description: string;
  obtained: string;
}

function load(conversationId: string): InventoryItem[] {
  const path = join(process.cwd(), "persistence", "inventory", "data", `inventory-${conversationId}.json`);

  if (!existsSync(path)) {
    return [];
  }

  try {
    const data = readFileSync(path, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.warn(`Failed to load inventory for ${conversationId}:`, e);
    return [];
  }
}

function save(conversationId: string, items: InventoryItem[]): void {
  const path = join(process.cwd(), "persistence", "inventory", "data", `inventory-${conversationId}.json`);

  try {
    writeFileSync(path, JSON.stringify(items, null, 2), "utf-8");
  } catch (e) {
    console.error(`Failed to save inventory for ${conversationId}:`, e);
    throw e;
  }
}

function formatList(items: InventoryItem[]): string {
  if (items.length === 0) {
    return "Inventory is empty.";
  }
  return "Current inventory:\n" + items.map(item => `- ${item.name}`).join("\n");
}

export function add(conversationId: string, name: string, description: string, obtained: string): string {
  const items = load(conversationId);

  const existingIndex = items.findIndex(
    item => item.name.toLowerCase() === name.toLowerCase()
  );

  if (existingIndex === -1) {
    items.push({ name, description, obtained });
    save(conversationId, items);
  }

  return formatList(items);
}

export function remove(conversationId: string, name: string): string {
  const items = load(conversationId);

  const index = items.findIndex(
    item => item.name.toLowerCase() === name.toLowerCase()
  );

  if (index !== -1) {
    items.splice(index, 1);
    save(conversationId, items);
  }

  return formatList(items);
}

export function update(conversationId: string, name: string, description: string): string {
  const items = load(conversationId);

  const index = items.findIndex(
    item => item.name.toLowerCase() === name.toLowerCase()
  );

  if (index !== -1) {
    items[index].description = description;
    save(conversationId, items);
  }

  return formatList(items);
}

export function list(conversationId: string): InventoryItem[] {
  return load(conversationId);
}
