import { mkdtemp, mkdir, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app.js";
import type { AppConfig } from "../../config/appConfig.js";
import {
  createDeepSeekClient,
  DeepSeekUpstreamError,
  type DeepSeekChatMessage,
  type DeepSeekChatOptions,
  type DeepSeekClient,
} from "../../domain/deepseek.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), "resume-ai-"));
  roots.push(value);
  return value;
}

function config(projectRoot: string, deepseekApiKey = "test-key"): AppConfig {
  return {
    repoRoot: projectRoot,
    projectRoot,
    serverPort: 43871,
    clientPort: 5173,
    entryFiles: ["resume.tex"],
    latexCommand: "xelatex",
    synctexCommand: "synctex",
    deepseekApiKey,
    deepseekModel: "deepseek-v4-flash",
    deepseekBaseUrl: "https://api.deepseek.com",
    deepseekTimeoutMs: 5000,
  };
}

interface SseResponseLike {
  on(event: string | symbol, listener: (...args: unknown[]) => void): unknown;
  text?: string;
}

function sseParser() {
  return (
    res: SseResponseLike,
    callback: (error: Error | null, body: string) => void,
  ) => {
    let data = "";
    res.on("data", (chunk) => {
      data += (chunk as Buffer).toString();
    });
    res.on("end", () => {
      res.text = data;
      callback(null, data);
    });
  };
}

async function write(
  rootPath: string,
  file: string,
  content: string,
): Promise<void> {
  const target = path.join(rootPath, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((value) => rm(value, { recursive: true, force: true })),
  );
});

describe("AI chat route", () => {
  it("returns 503 AI_NOT_CONFIGURED when no API key is set", async () => {
    const projectRoot = await root();
    const app = createApp({
      config: config(projectRoot, ""),
      deepseek: createDeepSeekClient({
        apiKey: "",
        model: "deepseek-v4-flash",
        baseUrl: "https://api.deepseek.com",
        timeoutMs: 5000,
      }),
    });

    await request(app)
      .post("/api/ai/chat")
      .send({
        path: "sample/resume.tex",
        content: "% x",
        resumeId: "sample",
        messages: [],
      })
      .expect(503, {
        error: { code: "AI_NOT_CONFIGURED", message: "AI is not configured" },
      });
  });

  it("rejects invalid request bodies before streaming", async () => {
    const projectRoot = await root();
    await write(projectRoot, "sample/resume.tex", "% sample");
    const chatStream = vi.fn(async function* () {
      yield "x";
    });
    const deepseek = { chatStream } as unknown as DeepSeekClient;
    const app = createApp({ config: config(projectRoot), deepseek });

    await request(app)
      .post("/api/ai/chat")
      .send({ path: "a.tex", content: "% x", resumeId: "sample" })
      .expect(400, {
        error: { code: "INVALID_REQUEST", message: "Invalid AI chat request" },
      });
    expect(chatStream).not.toHaveBeenCalled();
  });

  it("returns 404 when the resume id is unknown", async () => {
    const projectRoot = await root();
    const deepseek = {
      chatStream: async function* () {
        yield "x";
      },
    } as unknown as DeepSeekClient;
    const app = createApp({ config: config(projectRoot), deepseek });

    await request(app)
      .post("/api/ai/chat")
      .send({
        path: "a.tex",
        content: "% x",
        resumeId: "missing",
        messages: [],
      })
      .expect(404, {
        error: { code: "FILE_NOT_FOUND", message: "Resume not found" },
      });
  });

  it("relays DeepSeek deltas and a done event as SSE", async () => {
    const projectRoot = await root();
    await write(projectRoot, "sample/resume.tex", "% sample");
    let receivedMessages: readonly DeepSeekChatMessage[] = [];
    const deepseek = {
      chatStream: async function* (options: DeepSeekChatOptions) {
        receivedMessages = options.messages;
        yield "你";
        yield "好";
      },
    } as unknown as DeepSeekClient;
    const app = createApp({ config: config(projectRoot), deepseek });

    const response = await request(app)
      .post("/api/ai/chat")
      .send({
        path: "sample/resume.tex",
        content: "% x",
        resumeId: "sample",
        messages: [{ role: "user", content: "优化" }],
      })
      .buffer(true)
      .parse(sseParser())
      .expect("Content-Type", /text\/event-stream/)
      .expect(200);

    expect(response.text).toContain('"type":"delta","text":"你"');
    expect(response.text).toContain('"type":"delta","text":"好"');
    expect(response.text).toContain('"type":"done"');
    const systemMessage = receivedMessages[0];
    expect(systemMessage).toMatchObject({
      role: "system",
      content: expect.stringContaining('resume "sample"'),
    });
    expect(systemMessage?.content).toContain("sample/resume.tex");
  });

  it("sends an AI_UPSTREAM_ERROR event when DeepSeek fails", async () => {
    const projectRoot = await root();
    await write(projectRoot, "sample/resume.tex", "% sample");
    const deepseek = {
      chatStream: async function* () {
        yield "";
        throw new DeepSeekUpstreamError("boom", 503);
      },
    } as unknown as DeepSeekClient;
    const app = createApp({ config: config(projectRoot), deepseek });

    const response = await request(app)
      .post("/api/ai/chat")
      .send({
        path: "a.tex",
        content: "% x",
        resumeId: "sample",
        messages: [],
      })
      .buffer(true)
      .parse(sseParser())
      .expect(200);

    expect(response.text).toContain('"type":"error"');
    expect(response.text).toContain('"code":"AI_UPSTREAM_ERROR"');
  });

  it("aborts the upstream stream when the client disconnects", async () => {
    const projectRoot = await root();
    await write(projectRoot, "sample/resume.tex", "% sample");
    let resolveAborted!: () => void;
    const aborted = new Promise<void>((resolve) => {
      resolveAborted = resolve;
    });
    const deepseek = {
      chatStream: async function* ({ signal }: { signal?: AbortSignal }) {
        yield "开始";
        signal?.addEventListener("abort", () => resolveAborted(), {
          once: true,
        });
        await aborted;
      },
    } as unknown as DeepSeekClient;
    const app = createApp({ config: config(projectRoot), deepseek });
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;

    try {
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/api/ai/chat",
            headers: { "Content-Type": "application/json" },
          },
          (res) => {
            res.once("data", () => req.destroy());
            res.on("close", () => resolve());
          },
        );
        req.on("error", () => undefined);
        req.write(
          JSON.stringify({
            path: "a.tex",
            content: "% x",
            resumeId: "sample",
            messages: [],
          }),
        );
        req.end();
      });

      await expect(
        Promise.race([
          aborted,
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]),
      ).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
