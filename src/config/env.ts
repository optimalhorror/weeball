export interface Config {
  PORT: number;
  PROVIDER_URL: string;
  DEFAULT_MODEL: string;
  FALLBACK_API_KEY?: string;
  CORS_ORIGIN: string;
  CORS_METHODS: string;
  CORS_HEADERS: string;
  HTTP_REFERER: string;
  PROXY_TITLE: string;
}

export function loadConfig(): Config {
  const required = ["PROVIDER_URL", "DEFAULT_MODEL"];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    PORT: Number(process.env.PORT || "3000"),
    PROVIDER_URL: process.env.PROVIDER_URL!,
    DEFAULT_MODEL: process.env.DEFAULT_MODEL!,
    FALLBACK_API_KEY: process.env.FALLBACK_API_KEY,
    CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
    CORS_METHODS: process.env.CORS_METHODS || "POST, OPTIONS",
    CORS_HEADERS: process.env.CORS_HEADERS || "Content-Type, Authorization, HTTP-Referer, X-Title",
    HTTP_REFERER: process.env.HTTP_REFERER || "https://weeball.ai",
    PROXY_TITLE: process.env.PROXY_TITLE || "Weeball Proxy",
  };
}
