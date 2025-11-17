import { addQuest } from "../../persistence/quests/quests";

export default async function(
  args: { title: string; giver: string; description: string },
  conversationId: string
): Promise<string> {
  return addQuest(conversationId, args.title, args.giver, args.description);
}
