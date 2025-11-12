export function extractConversationId(req: Request): string {
  const referer = req.headers.get("referer") || req.headers.get("referrer");

  if (referer) {
    try {
      const url = new URL(referer);
      const pathSegments = url.pathname.split("/").filter(s => s);
      const conversationId = `${url.hostname}:${pathSegments.join(":")}`;
      return conversationId || "default";
    } catch (e) {
      // ignore parse error
    }
  }

  const customId = req.headers.get("x-conversation-id");
  if (customId) {
    return customId;
  }

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const hostname = new URL(origin).hostname;
      return `${hostname}:default`;
    } catch (e) {
      // ignore
    }
  }

  return "default";
}
