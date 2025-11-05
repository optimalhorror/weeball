export function logProxyError(component: string, message: string, error?: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error(`[PROXY:${component}] ${message}${error ? `: ${errorMsg}` : ""}`);
}

export function logProxyWarn(component: string, message: string): void {
  console.warn(`[PROXY:${component}] ${message}`);
}

export function logProxyInfo(component: string, message: string): void {
  console.log(`[PROXY:${component}] ${message}`);
}

export class ClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "ClientError";
  }
}
