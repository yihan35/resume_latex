import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AiChatStreamEvent } from "../../../../shared/contracts";
import type { ApiClient } from "../../lib/apiClient";
import { useAiChat } from "./useAiChat";

function fakeApi(events: AiChatStreamEvent[]): {
  api: ApiClient;
  chatAi: ReturnType<typeof vi.fn>;
} {
  const chatAi = vi.fn(async function* () {
    for (const event of events) yield event;
  });
  return { api: { chatAi } as unknown as ApiClient, chatAi };
}

describe("useAiChat", () => {
  it("appends the user message and streams the assistant reply", async () => {
    const { api, chatAi } = fakeApi([
      { type: "delta", text: "你" },
      { type: "delta", text: "好" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useAiChat({ api }));

    await act(async () => {
      await result.current.send({
        path: "a.tex",
        content: "% x",
        prompt: "优化",
      });
    });

    expect(result.current.messages).toEqual([
      { role: "user", content: "优化" },
      { role: "assistant", content: "你好" },
    ]);
    expect(result.current.status).toBe("idle");
    expect(chatAi).toHaveBeenCalledWith(
      {
        path: "a.tex",
        content: "% x",
        messages: [],
      },
      expect.any(AbortSignal),
    );
  });

  it("surfaces an error event and keeps the partial reply", async () => {
    const { api } = fakeApi([
      { type: "delta", text: "部分" },
      { type: "error", code: "AI_UPSTREAM_ERROR", message: "服务不可用" },
    ]);
    const { result } = renderHook(() => useAiChat({ api }));

    await act(async () => {
      await result.current.send({
        path: "a.tex",
        content: "% x",
        prompt: "优化",
      });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("服务不可用");
    expect(result.current.messages[1]).toEqual({
      role: "assistant",
      content: "部分",
    });
  });

  it("keeps the partial reply when the user stops mid-stream", async () => {
    const api = {
      chatAi: vi.fn(async function* (_input: unknown, signal?: AbortSignal) {
        let rejectAbort!: (reason?: unknown) => void;
        const aborted = new Promise<void>((_resolve, reject) => {
          rejectAbort = reject;
        });
        signal?.addEventListener(
          "abort",
          () => rejectAbort(new DOMException("aborted", "AbortError")),
          { once: true },
        );
        yield { type: "delta", text: "部分" } as AiChatStreamEvent;
        if (signal?.aborted === true) {
          throw new DOMException("aborted", "AbortError");
        }
        await aborted;
      }),
    } as unknown as ApiClient;
    const { result } = renderHook(() => useAiChat({ api }));

    const sendPromise = result.current.send({
      path: "a.tex",
      content: "% x",
      prompt: "优化",
    });
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.messages[1]).toEqual({
      role: "assistant",
      content: "部分",
    });
  });
});
