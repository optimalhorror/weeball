import { readFileSync } from "fs";
import { join } from "path";
import { load, save, type LoreEntry } from "../lorebook/lorebook";

interface ReputationThreshold {
  min: number;
  perception: string;
}

function loadReputationThresholds(): ReputationThreshold[] {
  const path = join(process.cwd(), "plugins", "03-reputation", "reputation-thresholds.json");

  try {
    const data = readFileSync(path, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.warn("Failed to load reputation thresholds, using defaults");
    return [
      { min: 25, perception: "Friendly" },
      { min: -25, perception: "Neutral" },
      { min: -Infinity, perception: "Hostile" }
    ];
  }
}

function calculatePerception(standing: number): string {
  const thresholds = loadReputationThresholds();

  for (const threshold of thresholds) {
    if (standing >= threshold.min) {
      return threshold.perception;
    }
  }

  return "Unknown";
}

export function updateReputation(
  conversationId: string,
  name: string,
  change: number,
  reason: string
): string {
  const entries = load(conversationId);

  let entry = entries.find(e =>
    e.triggers.some(trigger => trigger.toLowerCase() === name.toLowerCase()) &&
    (e.type === "npc" || e.type === "faction")
  );

  if (!entry) {
    entry = {
      name,
      triggers: [name],
      content: `${name} is a character in this story.`,
      depth: 2,
      type: "npc",
      arc: "",
      standing: 0,
      perception: "Neutral"
    };
    entries.push(entry);
  }

  const currentStanding = entry.standing ?? 0;
  const newStanding = currentStanding + change;

  entry.standing = newStanding;
  entry.perception = calculatePerception(newStanding);

  if (entry.arc) {
    entry.arc += `\n${reason}`;
  } else {
    entry.arc = reason;
  }

  save(conversationId, entries);

  return `${entry.name}: ${entry.perception} (${newStanding >= 0 ? '+' : ''}${newStanding})`;
}
