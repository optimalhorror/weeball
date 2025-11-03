# Weball

A semi-stateless smart proxy for AI chatbots built with Bun.

## What's Currently Here

This is **Phase 0** - a basic passthrough proxy that forwards chat completion requests to LLM providers.

### Features

- **OpenAI-compatible API** - accepts `/chat/completions` requests
- **Provider forwarding** - proxies requests to configurable LLM providers (default: OpenRouter)
- **Streaming support** - handles both streaming (SSE) and non-streaming responses
- **Models endpoint** - provides `/models` endpoint for API key validation
- **CORS enabled** - allows cross-origin requests
- **Request logging** - logs all incoming requests with timestamps

### Architecture

Single-file TypeScript proxy server (`index.ts`) that:
- Accepts authorization headers (user's API key)
- Forwards requests to the configured provider
- Passes through responses without modification
- No sessions, no sandboxing, no persistence

### Running

```bash
# Install dependencies
bun install

# Start the server
bun start

# Or with watch mode
bun dev
```

### Configuration

Environment variables:
- `PORT` - Server port (default: 3000)
- `PROVIDER_URL` - LLM provider endpoint (default: https://openrouter.ai/api/v1)

### Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Dependencies**: None (only dev dependencies for types)
