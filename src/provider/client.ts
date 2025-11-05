import type { Config } from "../config/env";
import type { ChatCompletionRequest } from "../types";

export async function makeProviderRequest(
  config: Config,
  authHeader: string,
  body: ChatCompletionRequest
): Promise<Response> {
  const url = `${config.PROVIDER_URL}/chat/completions`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
      "HTTP-Referer": config.HTTP_REFERER,
      "X-Title": config.PROXY_TITLE,
    },
    body: JSON.stringify(body),
  });
}

export function isToolUnsupportedError(errorText: string): boolean {
  const lower = errorText.toLowerCase();

  return (
    (lower.includes("tool") &&
      lower.includes("not") &&
      (lower.includes("support") || lower.includes("available"))) ||
    (lower.includes("function") &&
      lower.includes("not") &&
      (lower.includes("support") || lower.includes("available"))) ||
    lower.includes("tool_choice") ||
    (lower.includes("tools") && lower.includes("invalid")) ||
    lower.includes("does not support function calling") ||
    lower.includes("does not support tool") ||
    lower.includes("function calling is not available")
  );
}
