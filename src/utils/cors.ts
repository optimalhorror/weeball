import type { Config } from "../config/env";

export function buildBaseCorsHeaders(config: Config): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": config.CORS_ORIGIN,
    "Access-Control-Allow-Methods": config.CORS_METHODS,
    "Access-Control-Allow-Headers": config.CORS_HEADERS
  };
}
