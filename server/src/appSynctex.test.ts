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
  const value = await mkdtemp(path.join(os.tmpdir(), "resume-app-synctex-"));
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

describe("app SyncTeX route", () => {
  it("looks up a source location using a resume id", async () => {
    const projectRoot = await root();
    await write(projectRoot, "sample/resume.tex", "% resume\n");
    await write(projectRoot, "sample/resume.pdf", "%PDF-1.7\n");
    const runner: CommandRunner = async () => ({
      code: 0,
      stdout: `Input:${path.join(projectRoot, "sample", "resume.tex")}\nLine:38\nColumn:1\n`,
      stderr: "",
      timedOut: false,
    });

    const response = await request(
      createApp({ config: config(projectRoot), commandRunner: runner }),
    )
      .post("/api/synctex")
      .send({ resumeId: "sample", page: 1, x: 42.5, y: 84.25 })
      .expect(200);

    expect(response.body).toEqual({
      found: true,
      file: "sample/resume.tex",
      line: 38,
      column: 1,
    });
  });

  it("uses public invalid request envelopes for malformed SyncTeX bodies", async () => {
    const projectRoot = await root();

    await request(createApp({ config: config(projectRoot) }))
      .post("/api/synctex")
      .send({ resumeId: "sample", page: 1, x: Number.POSITIVE_INFINITY, y: 1 })
      .expect(400, {
        error: { code: "INVALID_REQUEST", message: "Invalid SyncTeX request" },
      });
  });

  it("does not leak absolute paths from outside source results", async () => {
    const projectRoot = await root();
    await write(projectRoot, "sample/resume.tex", "% resume\n");
    await write(projectRoot, "sample/resume.pdf", "%PDF-1.7\n");
    const runner: CommandRunner = async () => ({
      code: 0,
      stdout: "Input:/tmp/secret.tex\nLine:38\nColumn:1\n",
      stderr: "",
      timedOut: false,
    });

    const response = await request(
      createApp({ config: config(projectRoot), commandRunner: runner }),
    )
      .post("/api/synctex")
      .send({ resumeId: "sample", page: 1, x: 42, y: 84 })
      .expect(200, { found: false });

    expect(JSON.stringify(response.body)).not.toContain(projectRoot);
  });
});
