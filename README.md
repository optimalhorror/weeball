# Weeball

A minimal LLM proxy with a plugin system for request transformation.

## What It Does

Weeball sits between your chat client and LLM providers. It intercepts requests, runs them through plugins that can modify content, then forwards to the provider.

**Current state:** Request plugins only. Response processing removed for simplicity (streaming support takes priority).

## Features

- **OpenAI-compatible API** - `/chat/completions` endpoint
- **Plugin system** - Transform requests before they hit the LLM
- **Provider agnostic** - Works with any OpenAI-compatible API
- **Streaming support** - Passes through streaming responses untouched
- **Model override** - Force all requests to use a specific model
- **Zero dependencies** - Pure Bun/TypeScript

## Architecture

```
Client → Weeball → Plugins → Provider → Response
```

**Components:**
- `index.ts` - Entry point, wires everything together
- `src/server.ts` - HTTP routing (OPTIONS, 404, 405, chat completions)
- `src/chat-completion.ts` - Core handler (auth, plugin processing, proxy)
- `src/middleware/plugin-processor.ts` - Plugin orchestration
- `src/plugins/loader.ts` - Scans and loads plugins from filesystem
- `src/config/env.ts` - Environment configuration
- `src/types.ts` - TypeScript interfaces for OpenAI API
- `src/plugins/types.ts` - Plugin interface

**Plugin interface:**
```typescript
interface Message {
  role: string;
  content: string;
}

interface ContextPlugin {
  process: (messages: Message[]) => Message[];
}
```

Plugins receive the entire messages array and return a modified version. They can transform any message in the conversation.

## Setup

```bash
bun install
cp .env.example .env
# Edit .env with your config
bun start
```

## Configuration

Create `.env`:

```env
PORT=3000
PROVIDER_URL=https://openrouter.ai/api/v1
DEFAULT_MODEL=moonshotai/kimi-k2

# Optional
CORS_ORIGIN=*
CORS_METHODS=POST, OPTIONS
CORS_HEADERS=Content-Type, Authorization
HTTP_REFERER=https://weeball.ai
PROXY_TITLE=Weeball Proxy
```

**Required:**
- `PROVIDER_URL` - LLM provider endpoint (e.g., OpenRouter, OpenAI)
- `DEFAULT_MODEL` - Model to use for all requests

**Optional:**
- `PORT` - Server port (default: 3000)
- `CORS_*` - CORS configuration
- `HTTP_REFERER` / `PROXY_TITLE` - Sent to provider (may be required by some providers)

## Writing Plugins

Create a file in `/plugins`:

```typescript
// plugins/my-plugin.ts
import type { Message } from "../src/plugins/types";

export default {
  process(messages: Message[]): Message[] {
    const modified = [...messages];
    const lastUserIndex = modified.map(m => m.role).lastIndexOf("user");

    if (lastUserIndex !== -1) {
      modified[lastUserIndex] = {
        ...modified[lastUserIndex],
        content: modified[lastUserIndex].content + "\n\nPlease respond concisely."
      };
    }

    return modified;
  }
};
```

Plugins receive the full conversation history and can modify any message. The example above modifies only the last user message, but you can transform the entire array however you want.

Plugins run in alphabetical order. Name them with prefixes if order matters:
- `01-add-context.ts`
- `02-format.ts`
- `99-final-check.ts`

## Testing

```bash
bun test
```

Runs integration tests that verify the full request → plugin → proxy → response flow.

## Usage with Chat Clients

**JanitorAI:**
1. Start Weeball: `bun start`
2. In JanitorAI API Settings:
   - Proxy URL: `http://localhost:3000/v1/chat/completions`
   - API Key: Your provider's API key
   - Model: (ignored, DEFAULT_MODEL is used)

**Any OpenAI-compatible client:**
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_PROVIDER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ignored",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Stats

- **207 lines of code** (excluding tests)
- **7 source files**
- **Zero runtime dependencies**
- **2 integration tests**

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Testing:** Bun's built-in test runner
