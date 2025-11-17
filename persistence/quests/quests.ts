import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface Quest {
  title: string;
  giver: string;
  description: string;
}

export interface CompletedQuest extends Quest {
  resolution: string;
  reward?: string;
}

export interface QuestState {
  active: Quest[];
  completed: CompletedQuest[];
}

function getQuestsPath(conversationId: string): string {
  return join(process.cwd(), "persistence", "quests", "data", `quests-${conversationId}.json`);
}

function load(conversationId: string): QuestState {
  const path = getQuestsPath(conversationId);

  if (!existsSync(path)) {
    return { active: [], completed: [] };
  }

  try {
    const data = readFileSync(path, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.warn(`Failed to load quests for ${conversationId}:`, e);
    return { active: [], completed: [] };
  }
}

function save(conversationId: string, state: QuestState): void {
  const path = getQuestsPath(conversationId);

  try {
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.error(`Failed to save quests for ${conversationId}:`, e);
    throw e;
  }
}

export function addQuest(
  conversationId: string,
  title: string,
  giver: string,
  description: string
): string {
  const state = load(conversationId);

  // Check if quest already exists
  const exists = state.active.some(q => q.title.toLowerCase() === title.toLowerCase());
  if (exists) {
    return `Quest "${title}" is already active.`;
  }

  state.active.push({ title, giver, description });
  save(conversationId, state);

  return `Quest added: "${title}" from ${giver}`;
}

export function completeQuest(
  conversationId: string,
  title: string,
  resolution: string,
  reward?: string
): string {
  const state = load(conversationId);

  // Find quest by fuzzy match
  const index = state.active.findIndex(q =>
    q.title.toLowerCase().includes(title.toLowerCase()) ||
    title.toLowerCase().includes(q.title.toLowerCase())
  );

  if (index === -1) {
    return `No active quest found matching "${title}"`;
  }

  const quest = state.active[index];
  state.active.splice(index, 1);

  state.completed.push({
    ...quest,
    resolution,
    reward
  });

  save(conversationId, state);

  return `Quest completed: "${quest.title}"`;
}

export function listActive(conversationId: string): Quest[] {
  return load(conversationId).active;
}

export function listCompleted(conversationId: string): CompletedQuest[] {
  return load(conversationId).completed;
}
