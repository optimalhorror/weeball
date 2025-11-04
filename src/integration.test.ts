import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createServer } from "./server";
import { PluginProcessor } from "./middleware/plugin-processor";
import type { Config } from "./config/env";
import type { ContextPlugin } from "./plugins/types";
import type { Tool } from "./tools/types";

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

    const server = createServer(mockConfig, processor, []);

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

    const server = createServer(mockConfig, processor, []);

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

  test("tool call: request → LLM requests tool → execute tool → LLM final response", async () => {
    const mockTool: Tool = {
      definition: {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "City name"
              }
            },
            required: ["location"]
          }
        }
      },
      executor: async (args: any) => {
        return `Weather in ${args.location}: Sunny, 25°C`;
      }
    };

    const mockToolCallResponse = {
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_123",
            type: "function",
            function: {
              name: "get_weather",
              arguments: JSON.stringify({ location: "London" })
            }
          }]
        },
        finish_reason: "tool_calls"
      }]
    };

    const mockFinalResponse = {
      choices: [{
        message: {
          role: "assistant",
          content: "The weather in London is sunny with 25°C!"
        }
      }]
    };

    let callCount = 0;
    const fetchMock = mock((_url: string, options: any) => {
      callCount++;
      const requestBody = JSON.parse(options.body);

      if (callCount === 1) {
        expect(requestBody.tools).toBeDefined();
        expect(requestBody.tools.length).toBe(1);
        expect(requestBody.tools[0].function.name).toBe("get_weather");
        return Promise.resolve(
          new Response(JSON.stringify(mockToolCallResponse), { status: 200 })
        );
      }

      if (callCount === 2) {
        expect(requestBody.messages.length).toBe(3);
        expect(requestBody.messages[1].role).toBe("assistant");
        expect(requestBody.messages[1].tool_calls).toBeDefined();
        expect(requestBody.messages[2].role).toBe("tool");
        expect(requestBody.messages[2].content).toContain("Weather in London");
        return Promise.resolve(
          new Response(JSON.stringify(mockFinalResponse), { status: 200 })
        );
      }

      throw new Error("Unexpected fetch call");
    });

    globalThis.fetch = fetchMock as any;

    const processor = new PluginProcessor();
    processor.load([]);

    const server = createServer(mockConfig, processor, [mockTool]);

    const request = new Request(`http://localhost:${mockConfig.PORT}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer test-key",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "test",
        messages: [
          { role: "user", content: "What's the weather in London?" }
        ]
      })
    });

    const response = await server.fetch(request);
    expect(response.status).toBe(200);

    const data: any = await response.json();

    expect(data.choices[0].message.content).toBe("The weather in London is sunny with 25°C!");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    server.stop();
  });

  test("tool disabled: model doesn't support tools → retry without tools", async () => {
    const mockTool: Tool = {
      definition: {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      executor: async () => "Should not be called"
    };

    const mockSuccessResponse = {
      choices: [{
        message: {
          role: "assistant",
          content: "Response without tools"
        }
      }]
    };

    let callCount = 0;
    const fetchMock = mock((_url: string, options: any) => {
      callCount++;
      const requestBody = JSON.parse(options.body);

      if (callCount === 1) {
        expect(requestBody.tools).toBeDefined();
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Tools not supported" }), { status: 400 })
        );
      }

      if (callCount === 2) {
        expect(requestBody.tools).toBeUndefined();
        return Promise.resolve(
          new Response(JSON.stringify(mockSuccessResponse), { status: 200 })
        );
      }

      throw new Error("Unexpected fetch call");
    });

    globalThis.fetch = fetchMock as any;

    const processor = new PluginProcessor();
    processor.load([]);

    const server = createServer(mockConfig, processor, [mockTool]);

    const request = new Request(`http://localhost:${mockConfig.PORT}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer test-key",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "test",
        messages: [
          { role: "user", content: "Hello" }
        ]
      })
    });

    const response = await server.fetch(request);
    expect(response.status).toBe(200);

    const data: any = await response.json();

    expect(data.choices[0].message.content).toBe("Response without tools");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    server.stop();
  });
});
