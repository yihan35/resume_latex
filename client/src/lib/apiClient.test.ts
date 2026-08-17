import { describe, expect, it, vi } from "vitest";

import { ApiClientError, createApiClient } from "./apiClient";
import type { AiChatStreamEvent } from "../../../shared/contracts";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("createApiClient", () => {
  it("decodes successful responses and forwards the cancellation signal", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({ path: "resume/main.tex", content: "% resume" }),
      );
    const api = createApiClient(fetcher);
    const controller = new AbortController();

    await expect(
      api.getFile("resume/main.tex", controller.signal),
    ).resolves.toEqual({
      path: "resume/main.tex",
      content: "% resume",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/file?path=resume%2Fmain.tex", {
      signal: controller.signal,
    });
  });

  it("exposes status and code from shared error envelopes", async () => {
    const api = createApiClient(
      vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { code: "FILE_NOT_FOUND", message: "File not found" } },
            404,
          ),
        ),
    );

    await expect(api.getProject()).rejects.toMatchObject({
      name: "ApiClientError",
      status: 404,
      code: "FILE_NOT_FOUND",
      message: "File not found",
    } satisfies Partial<ApiClientError>);
  });

  it("uses a safe internal error for malformed error bodies", async () => {
    const api = createApiClient(
      vi.fn().mockResolvedValue(response({ error: "private" }, 500)),
    );

    await expect(api.getProject()).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Request failed with status 500",
    } satisfies Partial<ApiClientError>);
  });

  it("rejects unknown error codes as malformed envelopes", async () => {
    const api = createApiClient(
      vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { code: "PRIVATE_FAILURE", message: "private detail" } },
            500,
          ),
        ),
    );

    await expect(api.getProject()).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Request failed with status 500",
    } satisfies Partial<ApiClientError>);
  });

  it("uses a safe internal error when an error response cannot be decoded", async () => {
    const api = createApiClient(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => Promise.reject(new SyntaxError("invalid json")),
      } as unknown as Response),
    );

    await expect(api.getProject()).rejects.toMatchObject({
      status: 502,
      code: "INTERNAL_ERROR",
      message: "Request failed with status 502",
    } satisfies Partial<ApiClientError>);
  });

  it("streams AI chat events and forwards the abort signal", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode('data: {"type":"delta","text":"你"}\n\n'),
        );
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      },
    });
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body,
    } as unknown as Response);
    const api = createApiClient(fetcher);
    const controller = new AbortController();

    const events: AiChatStreamEvent[] = [];
    for await (const event of await api.chatAi(
      { path: "a.tex", content: "% x", messages: [] },
      controller.signal,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "你" },
      { type: "done" },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/ai/chat",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("throws shared error envelopes for failed AI requests", async () => {
    const api = createApiClient(
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              code: "AI_NOT_CONFIGURED",
              message: "AI is not configured",
            },
          },
          503,
        ),
      ),
    );

    await expect(
      api.chatAi({ path: "a.tex", content: "% x", messages: [] }),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      status: 503,
      code: "AI_NOT_CONFIGURED",
    } satisfies Partial<ApiClientError>);
  });
});
