export interface Config {
  PORT: number;
  PROVIDER_URL: string;
  DEFAULT_MODEL: string;
  CORS_ORIGIN: string;
  CORS_METHODS: string;
  CORS_HEADERS: string;
  HTTP_REFERER: string;
  PROXY_TITLE: string;
}

export function loadConfig(): Config {
  const required = ["PORT", "PROVIDER_URL", "DEFAULT_MODEL", "CORS_ORIGIN", "CORS_METHODS", "CORS_HEADERS", "HTTP_REFERER", "PROXY_TITLE"];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    PORT: Number(process.env.PORT),
    PROVIDER_URL: process.env.PROVIDER_URL!,
    DEFAULT_MODEL: process.env.DEFAULT_MODEL!,
    CORS_ORIGIN: process.env.CORS_ORIGIN!,
    CORS_METHODS: process.env.CORS_METHODS!,
    CORS_HEADERS: process.env.CORS_HEADERS!,
    HTTP_REFERER: process.env.HTTP_REFERER!,
    PROXY_TITLE: process.env.PROXY_TITLE!,
  };
}
