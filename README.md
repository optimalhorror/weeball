# Weeball

A minimal LLM proxy with a plugin system for request transformation.

## What It Does

Weeball sits between your chat client and LLM providers. It intercepts requests, runs them through plugins that can modify content, executes tool calls locally, then forwards to the provider.

## Features

- **OpenAI-compatible API** - `/chat/completions` endpoint
- **Plugin system** - Transform requests before they hit the LLM with token limits
- **Tool calling** - Execute functions locally, handle multi-round conversations
- **Smart streaming** - Early detection for minimal latency on content responses
- **Provider agnostic** - Works with any OpenAI-compatible API
- **Model override** - Force all requests to use a specific model
- **Minimal dependencies** - Only 2 packages (`openai` types, `gpt-tokenizer`)

## Architecture

```
Client → Weeball → Plugins → Provider
                 ↓           ↓
               Tools ← Tool Calls
```

**Components:**
- `index.ts` - Entry point
- `src/server.ts` - HTTP routing
- `src/chat-completion.ts` - Main request handler
- `src/middleware/auth.ts` - Auth validation
- `src/middleware/plugin-processor.ts` - Plugin orchestration
- `src/middleware/tool-processor.ts` - Tool orchestration
- `src/provider/client.ts` - Provider communication
- `src/tools/executor.ts` - Tool execution
- `src/tools/loader.ts` - Loads tools from `/tools`
- `src/plugins/loader.ts` - Loads plugins from `/plugins`
- `src/utils/stream-parser.ts` - Smart streaming
- `src/utils/response-builder.ts` - Response utilities
- `src/utils/logger.ts` - Logging
- `src/utils/cors.ts` - CORS headers
- `src/config/env.ts` - Environment config
- `src/types.ts` - OpenAI type re-exports

**Plugin interface:**
```typescript
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

type Message = ChatCompletionMessageParam;

interface ContextPlugin {
  process: (messages: Message[]) => Message[];
}
```

Plugins receive the entire messages array and return a modified version. Messages use OpenAI's type definitions.

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
DEFAULT_MODEL=deepseek/deepseek-v3.2-exp

# Optional
FALLBACK_API_KEY=your-openrouter-api-key
MAX_PLUGIN_TOKENS=1000
CORS_ORIGIN=*
CORS_METHODS=POST, OPTIONS
CORS_HEADERS=Content-Type, Authorization, HTTP-Referer, X-Title
HTTP_REFERER=https://weeball.ai
PROXY_TITLE=Weeball Proxy
```

**Required:**
- `PROVIDER_URL` - LLM provider endpoint (e.g., OpenRouter, OpenAI)
- `DEFAULT_MODEL` - Model to use for all requests

**Optional (with defaults):**
- `PORT` - Server port (default: `3000`)
- `FALLBACK_API_KEY` - API key to use only when client sends malformed/unusable auth (e.g., for Wyvern Chat bug workaround)
- `MAX_PLUGIN_TOKENS` - Maximum tokens plugins can add to requests (default: `1000`). Added content exceeding this is truncated
- `CORS_ORIGIN` - CORS allowed origins (default: `*`)
- `CORS_METHODS` - CORS allowed methods (default: `POST, OPTIONS`)
- `CORS_HEADERS` - CORS allowed headers (default: `Content-Type, Authorization, HTTP-Referer, X-Title`)
- `HTTP_REFERER` - Referer header sent to provider (default: `https://weeball.ai`)
- `PROXY_TITLE` - Custom title header sent to provider (default: `Weeball Proxy`)

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

### Token Limiting

Plugins can add context (RAG, system prompts, etc.), but Weeball limits how much they can inject:

- **MAX_PLUGIN_TOKENS** (default: 1000) sets the maximum tokens plugins can add
- Original client messages are **never truncated** - only plugin additions
- If plugins add more than the limit, added messages are removed (oldest first) until under limit
- Truncation happens on whole messages, not mid-sentence
- Example: Plugin adds 5 system messages (1500 tokens total), limit is 1000 → first 2 messages dropped

This prevents runaway context injection while ensuring the user's actual conversation always gets through.

## Writing Tools

Create two files in `/tools`:

**Definition (`hello_world.json`):**
```json
{
  "type": "function",
  "function": {
    "name": "hello_world",
    "description": "Says hello to someone by name",
    "parameters": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the person to greet"
        }
      },
      "required": ["name"]
    }
  }
}
```

**Executor (`hello_world.ts`):**
```typescript
export default async function(args: { name: string }): Promise<string> {
  return `Hello, ${args.name}!`;
}
```

Tools are automatically loaded and added to requests. When the LLM calls a tool, Weeball executes it locally and sends the result back for a final response.

## Testing

```bash
bun test
```

Tests cover plugin processing, tool calling, streaming, and error handling.

## Usage with Chat Clients

**Wyvern Chat:**
1. Set `FALLBACK_API_KEY` in `.env` to your OpenRouter API key
2. Start Weeball: `bun start`
3. In Wyvern AI Connections settings:
   - API URL: `http://localhost:3000/v1`
   - API Key: (can be anything, FALLBACK_API_KEY is used)
   - Enable "Chat Completion Only" and "No Key Required"
   - Enable "Use Browser Request" (note: API key is still sent from proxy to provider)

**JanitorAI:**
1. Start Weeball: `bun start`
2. In JanitorAI API Settings:
   - Proxy URL: `http://localhost:3000/v1/chat/completions`
   - API Key: Your provider's API key
   - Model: (ignored, DEFAULT_MODEL is used)

**Any OpenAI-compatible client:**
```bash
curl http://localhost:3000/chat/completions \
  -H "Authorization: Bearer YOUR_PROVIDER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ignored",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Both `/chat/completions` and `/v1/chat/completions` paths are supported.

## Use Cases

The plugin and tool system gives you full runtime access. Here are some examples of what you can build:

**Dynamic routing:**
- Analyze request content and route to specialized models (horror → Claude Opus, coding → DeepSeek)
- Cost optimization by provider/model selection
- Fallback chains when providers are down

**Context enhancement:**
- RAG: Vector search your docs and inject relevant context
- Conversation memory: SQLite-backed long-term memory
- Game state: Track inventory, quests, character stats

**Automation:**
- Trigger external APIs based on conversation events
- Log conversations to databases for analysis
- Send notifications (Discord, Telegram, SMS)

**Content transformation:**
- Pre-process user messages (censoring, formatting)
- Post-process AI responses (with response plugins - not implemented yet)
- Inject system prompts dynamically

**TTRPG engines:**
- Dice rolling tools that execute locally
- Inventory management via plugins
- NPC generation and tracking

Plugins have full Bun runtime access (SQLite, fetch, file I/O, WebSocket). Tools are AI-triggered functions. Both are just TypeScript - no framework limitations.

## Stats

- **~1000 lines of code** (excluding tests)
- **19 source files**
- **2 runtime dependencies** (`openai` for types, `gpt-tokenizer` for plugin limits)
- **4 integration tests**

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Testing:** Bun's built-in test runner
