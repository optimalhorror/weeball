import { completeQuest } from "../../persistence/quests/quests";

export default async function(
  args: { title: string; resolution: string; reward?: string },
  conversationId: string
): Promise<string> {
  return completeQuest(conversationId, args.title, args.resolution, args.reward);
}
