import * as inventory from "../persistence/inventory";

export default async function(
  args: { name: string; description: string; obtained: string },
  conversationId: string
): Promise<string> {
  return inventory.add(conversationId, args.name, args.description, args.obtained);
}
