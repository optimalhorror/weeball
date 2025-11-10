import type { Config } from "../config/env";

export function validateAuthHeader(req: Request, config: Config): string {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  // Handle Wyvern's bug where it sends "Bearer [object Object]"
  if (authHeader === "Bearer [object Object]") {
    if (!config.FALLBACK_API_KEY) {
      throw new AuthError("Malformed Authorization header and no fallback API key configured");
    }
    return `Bearer ${config.FALLBACK_API_KEY}`;
  }

  return authHeader;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
