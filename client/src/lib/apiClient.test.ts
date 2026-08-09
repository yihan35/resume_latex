import { describe, expect, it, vi } from "vitest";

import { ApiClientError, createApiClient } from "./apiClient";

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
});
