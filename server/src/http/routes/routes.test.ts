import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../config/appConfig.js";
import { createApp } from "../../app.js";
import type { CommandRunner } from "../../process/runCommand.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), "resume-http-"));
  roots.push(value);
  return value;
}

function config(projectRoot: string): AppConfig {
  return {
    repoRoot: projectRoot,
    projectRoot,
    serverPort: 43871,
    clientPort: 5173,
    entryFiles: ["resume.tex"],
    latexCommand: "xelatex",
    synctexCommand: "synctex",
    deepseekApiKey: "test-key",
    deepseekModel: "deepseek-v4-flash",
    deepseekBaseUrl: "https://api.deepseek.com",
    deepseekTimeoutMs: 5000,
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

describe("HTTP routes", () => {
  it("reports injected tool availability and caches it for the application", async () => {
    const projectRoot = await root();
    const checkToolAvailability = vi.fn(
      async (command: string) => command === "xelatex",
    );
    const app = createApp({
      config: config(projectRoot),
      checkToolAvailability,
    });

    const response = await request(app).get("/api/health").expect(200);
    await request(app).get("/api/health").expect(200, response.body);

    expect(response.body).toEqual({
      ok: true,
      tools: { latex: true, synctex: false },
    });
    expect(checkToolAvailability).toHaveBeenCalledTimes(2);
  });

  it("uses public envelopes for malformed and oversized JSON", async () => {
    const projectRoot = await root();
    const app = createApp({ config: config(projectRoot) });

    await request(app)
      .put("/api/file")
      .set("Content-Type", "application/json")
      .send('{"path":"sample/resume.tex",')
      .expect(400, {
        error: { code: "INVALID_REQUEST", message: "Malformed JSON" },
      });

    await request(app)
      .put("/api/file")
      .send({ path: "sample/resume.tex", content: "x".repeat(1024 * 1024) })
      .expect(413, {
        error: { code: "INVALID_REQUEST", message: "Request body too large" },
      });
  });

  it("rejects unsafe paths without leaking the project root", async () => {
    const projectRoot = await root();

    const response = await request(createApp({ config: config(projectRoot) }))
      .put("/api/file")
      .send({ path: "../secret.tex", content: "secret" })
      .expect(400);

    expect(response.body).toEqual({
      error: { code: "UNSAFE_PATH", message: "Invalid file path" },
    });
    expect(JSON.stringify(response.body)).not.toContain(projectRoot);
  });

  it("uses resume ids for unknown compile and SyncTeX requests", async () => {
    const projectRoot = await root();
    const app = createApp({ config: config(projectRoot) });

    await request(app)
      .post("/api/compile")
      .send({ resumeId: "missing" })
      .expect(404, {
        error: { code: "FILE_NOT_FOUND", message: "Resume not found" },
      });
    await request(app)
      .post("/api/synctex")
      .send({ resumeId: "missing", page: 1, x: 0, y: 0 })
      .expect(404, {
        error: { code: "FILE_NOT_FOUND", message: "Resume not found" },
      });
  });

  it("returns a busy error envelope before starting a second compile", async () => {
    const projectRoot = await root();
    await write(projectRoot, "sample/resume.tex", "% resume");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: (() => void) | undefined;
    const startedCompile = new Promise<void>((resolve) => {
      started = resolve;
    });
    const runner: CommandRunner = async (_command, _args, options) => {
      started?.();
      await gate;
      await writeFile(path.join(options.cwd, "resume.pdf"), "%PDF-1.7");
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    };
    const app = createApp({
      config: config(projectRoot),
      commandRunner: runner,
    });
    const first = request(app)
      .post("/api/compile")
      .send({ resumeId: "sample" })
      .expect(200)
      .then((response) => response);
    await startedCompile;

    await request(app)
      .post("/api/compile")
      .send({ resumeId: "sample" })
      .expect(409, {
        error: { code: "COMPILE_BUSY", message: "Resume is already compiling" },
      });
    release?.();
    await first;
  });
});
