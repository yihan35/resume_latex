import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "./config/appConfig.js";
import { createApp } from "./app.js";
import type { CommandRunner } from "./process/runCommand.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-app-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

function config(projectRoot: string): AppConfig {
  return {
    repoRoot: projectRoot,
    projectRoot,
    serverPort: 43871,
    clientPort: 5173,
    entryFiles: ["resume.tex", "main.tex", "简历.tex"],
    latexCommand: "xelatex",
    synctexCommand: "synctex",
    deepseekApiKey: "test-key",
    deepseekModel: "deepseek-v4-flash",
    deepseekBaseUrl: "https://api.deepseek.com",
    deepseekTimeoutMs: 5000,
  };
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((tempRoot) => rm(tempRoot, { recursive: true, force: true })),
  );
});

describe("app", () => {
  it("probes configured tools with bounded commands and hides probe output", async () => {
    const root = await makeTempRoot();
    const privateDiagnostic = path.join(root, "private-tool-output");
    const calls: Array<{
      command: string;
      args: readonly string[];
      options: { cwd: string; timeoutMs?: number; maxOutputBytes?: number };
    }> = [];
    const commandRunner: CommandRunner = async (command, args, options) => {
      calls.push({ command, args, options });
      return command === "xelatex"
        ? {
            code: 0,
            stdout: `XeTeX at ${privateDiagnostic}`,
            stderr: "",
            timedOut: false,
          }
        : {
            code: 127,
            stdout: "",
            stderr: `spawn ${privateDiagnostic} ENOENT`,
            timedOut: false,
          };
    };

    const response = await request(
      createApp({ config: config(root), commandRunner }),
    )
      .get("/api/health")
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      tools: { latex: true, synctex: false },
    });
    expect(JSON.stringify(response.body)).not.toContain(privateDiagnostic);
    expect(calls).toEqual([
      {
        command: "xelatex",
        args: ["--version"],
        options: { cwd: root, timeoutMs: 2_000, maxOutputBytes: 1_024 },
      },
      {
        command: "synctex",
        args: ["--version"],
        options: { cwd: root, timeoutMs: 2_000, maxOutputBytes: 1_024 },
      },
    ]);
  });

  it("returns discovered resumes and tex files", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "resume_common.tex", "% common\n");
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");

    const response = await request(createApp({ config: config(root) }))
      .get("/api/project")
      .expect(200);

    expect(response.body.resumes).toEqual([
      {
        id: "多模态",
        name: "多模态",
        dir: "多模态",
        entryPath: "多模态/简历.tex",
        pdfPath: "多模态/简历.pdf",
      },
    ]);
    expect(response.body.texFiles).toEqual(
      expect.arrayContaining([
        { path: "resume_common.tex", name: "resume_common.tex", dir: "" },
        { path: "多模态/简历.tex", name: "简历.tex", dir: "多模态" },
      ]),
    );
  });

  it("reads and atomically saves a tex file", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% before\n");
    const app = createApp({ config: config(root) });

    await request(app)
      .put("/api/file")
      .send({ path: "多模态/简历.tex", content: "% after\n" })
      .expect(200, { ok: true });
    await expect(
      readFile(path.join(root, "多模态", "简历.tex"), "utf8"),
    ).resolves.toBe("% after\n");
    await request(app)
      .get("/api/file")
      .query({ path: "多模态/简历.tex" })
      .expect(200, { path: "多模态/简历.tex", content: "% after\n" });
  });

  it("returns public envelopes for invalid and missing file requests", async () => {
    const root = await makeTempRoot();
    const app = createApp({ config: config(root) });

    await request(app)
      .put("/api/file")
      .send({ path: "resume.tex" })
      .expect(400, {
        error: { code: "INVALID_REQUEST", message: "Invalid save request" },
      });
    await request(app)
      .get("/api/file")
      .query({ path: "missing.tex" })
      .expect(404, {
        error: { code: "FILE_NOT_FOUND", message: "File not found" },
      });
  });

  it("serves static assets and falls back to the SPA for non-API GET requests", async () => {
    const root = await makeTempRoot();
    const staticDir = path.join(root, "client");
    await writeProjectFile(staticDir, "index.html", "<main>resume app</main>");
    await writeProjectFile(staticDir, "assets/app.js", "console.log('app')");
    const app = createApp({ config: config(root), staticDir });

    await request(app).get("/assets/app.js").expect(200, "console.log('app')");
    await request(app)
      .get("/workspace/resume")
      .expect(200, "<main>resume app</main>");
    await request(app)
      .get("/api/not-a-route")
      .expect(404, {
        error: { code: "INVALID_REQUEST", message: "API route not found" },
      });
  });
});
