import type { Config } from "../config/env";
import { buildBaseCorsHeaders } from "./cors";

export function buildResponseHeaders(
  config: Config,
  contentType: "application/json" | "text/event-stream"
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    ...buildBaseCorsHeaders(config),
  };

  if (contentType === "text/event-stream") {
    headers["Cache-Control"] = "no-cache";
    headers["Connection"] = "keep-alive";
  }

  return headers;
}

export function createErrorResponse(
  config: Config,
  status: number,
  message: string
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: buildResponseHeaders(config, "application/json"),
  });
}
