import { describe, expect, it, vi } from "vitest";

import {
  createDeepSeekClient,
  DeepSeekTimeoutError,
  DeepSeekUpstreamError,
} from "./deepseek.js";

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

function response(body: ReadableStream<Uint8Array>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
  } as unknown as Response;
}

const baseOptions = {
  apiKey: "sk-test",
  model: "deepseek-v4-flash",
  baseUrl: "https://api.deepseek.com",
  timeoutMs: 5000,
};

describe("createDeepSeekClient", () => {
  it("yields content deltas from the SSE stream and stops at [DONE]", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(
          sseBody([
            'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        ),
      );
    const client = createDeepSeekClient({ ...baseOptions, fetcher });

    const deltas: string[] = [];
    for await (const delta of client.chatStream({
      messages: [{ role: "user", content: "hi" }],
    })) {
      deltas.push(delta);
    }

    expect(deltas).toEqual(["你", "好"]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
        }),
        body: expect.stringContaining('"model":"deepseek-v4-flash"'),
      }),
    );
  });

  it("normalizes the base URL and sends stream: true", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response(sseBody(["data: [DONE]\n\n"])));
    const client = createDeepSeekClient({
      ...baseOptions,
      baseUrl: "https://api.deepseek.com/",
      fetcher,
    });

    for await (const _delta of client.chatStream({ messages: [] })) {
      // consume
    }

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"stream":true'),
      }),
    );
  });

  it("throws DeepSeekUpstreamError for non-ok responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      body: null,
    } as unknown as Response);
    const client = createDeepSeekClient({ ...baseOptions, fetcher });

    await expect(
      client.chatStream({ messages: [] }).next(),
    ).rejects.toBeInstanceOf(DeepSeekUpstreamError);
  });

  it("skips malformed chunks and keeps valid deltas", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(
          sseBody([
            "data: not-json\n\n",
            'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        ),
      );
    const client = createDeepSeekClient({ ...baseOptions, fetcher });

    const deltas: string[] = [];
    for await (const delta of client.chatStream({ messages: [] })) {
      deltas.push(delta);
    }
    expect(deltas).toEqual(["a"]);
  });

  it("throws DeepSeekTimeoutError when the upstream hangs past the timeout", async () => {
    const fetcher = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ): Promise<Response> => {
        await new Promise<void>((resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
        throw new Error("unreachable");
      },
    );
    const client = createDeepSeekClient({
      ...baseOptions,
      timeoutMs: 50,
      fetcher,
    });

    await expect(
      client.chatStream({ messages: [] }).next(),
    ).rejects.toBeInstanceOf(DeepSeekTimeoutError);
  });

  it("propagates an external abort signal", async () => {
    const fetcher = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ): Promise<Response> => {
        await new Promise<void>((resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
        throw new Error("unreachable");
      },
    );
    const client = createDeepSeekClient({ ...baseOptions, fetcher });
    const controller = new AbortController();

    const pending = client
      .chatStream({ messages: [], signal: controller.signal })
      .next();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
