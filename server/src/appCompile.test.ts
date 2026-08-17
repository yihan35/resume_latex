import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import type { AppConfig } from "./config/appConfig.js";
import type { CommandRunner } from "./process/runCommand.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), "resume-app-compile-"));
  roots.push(value);
  return value;
}

function config(projectRoot: string): AppConfig {
  return {
    repoRoot: projectRoot,
    projectRoot,
    serverPort: 43871,
    clientPort: 5173,
    entryFiles: ["resume.tex", "简历.tex"],
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

describe("app compile routes", () => {
  it("compiles a discovered resume by id and serves only its discovered PDF", async () => {
    const projectRoot = await root();
    await write(projectRoot, "candidate/resume.tex", "% resume\n");
    const runner: CommandRunner = async (_command, _args, options) => {
      await writeFile(path.join(options.cwd, "resume.pdf"), "%PDF-1.7\n");
      return { code: 0, stdout: "compiled", stderr: "", timedOut: false };
    };
    const app = createApp({
      config: config(projectRoot),
      commandRunner: runner,
    });

    const compileResponse = await request(app)
      .post("/api/compile")
      .send({ resumeId: "candidate" })
      .expect(200);
    expect(compileResponse.body).toMatchObject({
      ok: true,
      pdfPath: "candidate/resume.pdf",
    });

    const pdf = await request(app)
      .get("/api/pdf")
      .query({ resumeId: "candidate" })
      .expect(200);
    expect(pdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect(Buffer.from(pdf.body).toString("utf8")).toBe("%PDF-1.7\n");
  });

  it("preserves the previous PDF after a failed compile", async () => {
    const projectRoot = await root();
    await write(projectRoot, "candidate/简历.tex", "% resume\n");
    await write(projectRoot, "candidate/简历.pdf", "%PDF-old\n");
    const runner: CommandRunner = async () => ({
      code: 1,
      stdout: "! Undefined control sequence.\nl.12 \\badcommand\n",
      stderr: "",
      timedOut: false,
    });
    const app = createApp({
      config: config(projectRoot),
      commandRunner: runner,
    });

    const compileResponse = await request(app)
      .post("/api/compile")
      .send({ resumeId: "candidate" })
      .expect(200);
    expect(compileResponse.body).toMatchObject({ ok: false });

    const pdf = await request(app)
      .get("/api/pdf")
      .query({ resumeId: "candidate" })
      .expect(200);
    expect(Buffer.from(pdf.body).toString("utf8")).toBe("%PDF-old\n");
  });

  it("serves a discovered PDF when the trusted root is below a hidden directory", async () => {
    const tempRoot = await root();
    const projectRoot = path.join(
      tempRoot,
      ".worktrees",
      "release",
      "examples",
    );
    await write(projectRoot, "candidate/resume.tex", "% resume\n");
    await write(projectRoot, "candidate/resume.pdf", "%PDF-hidden-root\n");

    const pdf = await request(createApp({ config: config(projectRoot) }))
      .get("/api/pdf")
      .query({ resumeId: "candidate" })
      .expect(200);

    expect(Buffer.from(pdf.body).toString("utf8")).toBe("%PDF-hidden-root\n");
  });

  it("does not expose an arbitrary PDF path", async () => {
    const projectRoot = await root();
    await write(projectRoot, "candidate/resume.tex", "% resume\n");
    await write(projectRoot, "candidate/resume.pdf", "%PDF-1.7\n");

    await request(createApp({ config: config(projectRoot) }))
      .get("/api/pdf")
      .query({ path: "candidate/resume.pdf" })
      .expect(400, {
        error: { code: "INVALID_REQUEST", message: "Invalid resume id" },
      });
  });
});
