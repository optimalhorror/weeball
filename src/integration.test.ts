import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createServer } from "./server";
import { PluginProcessor } from "./middleware/plugin-processor";
import type { Config } from "./config/env";
import type { ContextPlugin } from "./plugins/types";

const mockConfig: Config = {
  PORT: 3001,
  PROVIDER_URL: "https://mock-provider.com/v1",
  DEFAULT_MODEL: "mock-model",
  HTTP_REFERER: "https://mock-referer.com",
  PROXY_TITLE: "Mock Proxy",
  CORS_ORIGIN: "*",
  CORS_METHODS: "GET, POST, OPTIONS",
  CORS_HEADERS: "Content-Type, Authorization"
};

describe("Integration: Full passthrough flow", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("request → req-plugin → mock LLM → response", async () => {
    const requestPlugin: ContextPlugin = {
      process: (messages) => {
        const modified = [...messages];
        const lastUserIndex = modified.map(m => m.role).lastIndexOf("user");
        if (lastUserIndex !== -1) {
          modified[lastUserIndex] = {
            ...modified[lastUserIndex],
            content: `[REQ]${modified[lastUserIndex].content}[/REQ]`
          };
        }
        return modified;
      }
    };

    const mockLLMResponse = {
      choices: [{
        message: {
          role: "assistant",
          content: "Hello from LLM"
        }
      }]
    };

    const fetchMock = mock((_url: string, options: any) => {
      const requestBody = JSON.parse(options.body);

      expect(requestBody.messages[0].content).toBe("[REQ]Hi there[/REQ]");
      expect(requestBody.model).toBe("mock-model");

      return Promise.resolve(
        new Response(JSON.stringify(mockLLMResponse), { status: 200 })
      );
    });

    globalThis.fetch = fetchMock as any;

    const processor = new PluginProcessor();
    processor.load([requestPlugin]);

    const server = createServer(mockConfig, processor);

    const request = new Request(`http://localhost:${mockConfig.PORT}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer test-key",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "original-model",
        messages: [
          { role: "user", content: "Hi there" }
        ]
      })
    });

    const response = await server.fetch(request);
    expect(response.status).toBe(200);

    const data: any = await response.json();

    expect(data.choices[0].message.content).toBe("Hello from LLM");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    server.stop();
  });

  test("no plugins: request → mock LLM → response (passthrough)", async () => {
    const mockLLMResponse = {
      choices: [{
        message: {
          role: "assistant",
          content: "Raw LLM response"
        }
      }]
    };

    const fetchMock = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify(mockLLMResponse), { status: 200 })
      );
    });

    globalThis.fetch = fetchMock as any;

    const processor = new PluginProcessor();
    processor.load([]);

    const server = createServer(mockConfig, processor);

    const request = new Request(`http://localhost:${mockConfig.PORT}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer test-key",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "test",
        messages: [
          { role: "user", content: "Original message" }
        ]
      })
    });

    const response = await server.fetch(request);
    expect(response.status).toBe(200);

    const data: any = await response.json();

    expect(data.choices[0].message.content).toBe("Raw LLM response");

    server.stop();
  });
});
