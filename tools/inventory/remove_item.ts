import * as inventory from "../../persistence/inventory/inventory";

export default async function(
  args: { name: string },
  conversationId: string
): Promise<string> {
  return inventory.remove(conversationId, args.name);
}
