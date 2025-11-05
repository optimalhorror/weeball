interface StreamedToolCall {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

function processToolCallDelta(toolCallsMap: Map<number, StreamedToolCall>, delta: any): void {
  if (!delta?.tool_calls) return;

  for (const tc of delta.tool_calls) {
    const existing: StreamedToolCall = toolCallsMap.get(tc.index) || { index: tc.index };

    if (tc.id) existing.id = tc.id;
    if (tc.type) existing.type = tc.type;
    if (tc.function) {
      existing.function = existing.function || {};
      if (tc.function.name) existing.function.name = tc.function.name;
      if (tc.function.arguments) {
        existing.function.arguments = (existing.function.arguments || '') + tc.function.arguments;
      }
    }

    toolCallsMap.set(tc.index, existing);
  }
}

function createPassthroughStream(reader: any, bufferedChunks: string[]): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const bufferedChunk of bufferedChunks) {
        controller.enqueue(encoder.encode(bufferedChunk));
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    }
  });
}

export async function classifyStreamResponse(stream: ReadableStream, maxBufferChunks: number = 5): Promise<{
  isToolCall: boolean;
  chunks: string[];
  toolCalls?: any[];
  assistantMessage?: any;
  remainingStream?: ReadableStream;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const toolCallsMap = new Map<number, StreamedToolCall>();
  let chunkCount = 0;

  while (chunkCount < maxBufferChunks) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    chunks.push(chunk);
    chunkCount++;

    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;

        if (delta && 'content' in delta && delta.content !== null && delta.content !== '') {
          return {
            isToolCall: false,
            chunks,
            remainingStream: createPassthroughStream(reader, chunks)
          };
        }

        processToolCallDelta(toolCallsMap, delta);
      } catch (e) {
      }
    }
  }

  if (toolCallsMap.size > 0) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      chunks.push(chunk);

      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          processToolCallDelta(toolCallsMap, delta);
        } catch (e) {
          console.error("[STREAM] Failed to parse SSE data:", data, e);
        }
      }
    }

    reader.releaseLock();

    const toolCalls = Array.from(toolCallsMap.values()).map(tc => ({
      id: tc.id!,
      type: tc.type || 'function',
      function: {
        name: tc.function!.name!,
        arguments: tc.function!.arguments!
      }
    }));

    return {
      isToolCall: true,
      chunks,
      toolCalls,
      assistantMessage: {
        role: 'assistant',
        content: null,
        tool_calls: toolCalls
      }
    };
  }

  return {
    isToolCall: false,
    chunks,
    remainingStream: createPassthroughStream(reader, chunks)
  };
}
