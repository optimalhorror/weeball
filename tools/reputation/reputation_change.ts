import { updateReputation } from "../../persistence/reputation/reputation";

export default async function(
  args: { name: string; change: number; reason: string },
  conversationId: string
): Promise<string> {
  return updateReputation(conversationId, args.name, args.change, args.reason);
}
