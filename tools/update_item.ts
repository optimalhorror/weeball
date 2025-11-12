import * as inventory from "../persistence/inventory";

export default async function(
  args: { name: string; description: string },
  conversationId: string
): Promise<string> {
  return inventory.update(conversationId, args.name, args.description);
}
