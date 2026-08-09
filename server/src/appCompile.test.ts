import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import type { CommandRunner } from "./process/runCommand.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-app-compile-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  content: string | Buffer,
): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function expectNoAbsolutePathLeak(body: unknown, root: string): void {
  const serializedBody = JSON.stringify(body);

  expect(serializedBody).not.toContain("/Users");
  expect(serializedBody).not.toContain("/tmp");
  expect(serializedBody).not.toContain(root);
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((tempRoot) => rm(tempRoot, { recursive: true, force: true })),
  );
});

describe("app compile routes", () => {
  it("saves the current file before compiling and serves the generated PDF", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/resume.tex", "% before\n");
    const runner: CommandRunner = async (_command, _args, options) => {
      await writeFile(path.join(options.cwd, "resume.pdf"), "%PDF-1.7\n");
      return { code: 0, stdout: "compiled", stderr: "", timedOut: false };
    };
    const app = createApp({ projectRoot: root, commandRunner: runner });

    const compileResponse = await request(app)
      .post("/api/compile")
      .send({
        resumeDir: "多模态",
        currentFile: {
          path: "多模态/resume.tex",
          content: "% after\n",
        },
      })
      .expect(200);

    expect(compileResponse.body.ok).toBe(true);
    expect(compileResponse.body.pdfPath).toBe("多模态/resume.pdf");
    await expect(
      readFile(path.join(root, "多模态", "resume.tex"), "utf8"),
    ).resolves.toBe("% after\n");

    const pdfResponse = await request(app)
      .get("/api/pdf")
      .query({ path: "多模态/resume.pdf" })
      .expect(200);

    expect(pdfResponse.headers["content-type"]).toMatch(/application\/pdf/);
    expect(Buffer.from(pdfResponse.body).toString("utf8")).toBe("%PDF-1.7\n");
  });

  it("reports failed compiles without deleting an old PDF", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");
    await writeProjectFile(root, "多模态/简历.pdf", "%PDF-old\n");
    const runner: CommandRunner = async () => ({
      code: 1,
      stdout: "! Undefined control sequence.\nl.12 \\badcommand\n",
      stderr: "",
      timedOut: false,
    });
    const app = createApp({ projectRoot: root, commandRunner: runner });

    const compileResponse = await request(app)
      .post("/api/compile")
      .send({ resumeDir: "多模态" })
      .expect(200);

    expect(compileResponse.body.ok).toBe(false);
    expect(compileResponse.body.logSummary).toContain(
      "Undefined control sequence",
    );

    const pdfResponse = await request(app)
      .get("/api/pdf")
      .query({ path: "多模态/简历.pdf" })
      .expect(200);

    expect(Buffer.from(pdfResponse.body).toString("utf8")).toBe("%PDF-old\n");
  });

  it("rejects a concurrent compile before it can overwrite the active source", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% before\n");
    let releaseCompile: (() => void) | undefined;
    let markRunnerStarted: (() => void) | undefined;
    const compileGate = new Promise<void>((resolve) => {
      releaseCompile = resolve;
    });
    const runnerStarted = new Promise<void>((resolve) => {
      markRunnerStarted = resolve;
    });
    const runner: CommandRunner = async (_command, _args, options) => {
      markRunnerStarted?.();
      await compileGate;
      await writeFile(path.join(options.cwd, "resume.pdf"), "%PDF-1.7\n");
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    };
    const app = createApp({ projectRoot: root, commandRunner: runner });

    const firstRequest = request(app)
      .post("/api/compile")
      .send({
        resumeDir: "candidate",
        currentFile: { path: "candidate/resume.tex", content: "% first\n" },
      })
      .expect(200)
      .then((response) => response);
    await runnerStarted;

    const secondResponse = await request(app)
      .post("/api/compile")
      .send({
        resumeDir: "candidate",
        currentFile: { path: "candidate/resume.tex", content: "% second\n" },
      });
    const sourceDuringCompile = await readFile(
      path.join(root, "candidate/resume.tex"),
      "utf8",
    );
    releaseCompile?.();
    await firstRequest;

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body).toEqual({
      error: "Resume is already compiling",
    });
    expect(sourceDuringCompile).toBe("% first\n");
  });

  it("redacts absolute paths from compile logs", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");
    const runner: CommandRunner = async () => ({
      code: 1,
      stdout: [
        `${path.join(root, "多模态", "简历.tex")}:12: Undefined control sequence`,
        "! Undefined control sequence.",
        "l.12 \\badcommand",
      ].join("\n"),
      stderr: `transcript written on /tmp/xelatex/build.log under ${root}`,
      timedOut: false,
    });
    const app = createApp({ projectRoot: root, commandRunner: runner });

    const response = await request(app)
      .post("/api/compile")
      .send({ resumeDir: "多模态" })
      .expect(200);

    expect(response.body.logSummary).toContain("Undefined control sequence");
    expectNoAbsolutePathLeak(response.body, root);
  });

  it("returns 400 JSON for unsafe compile paths without absolute path leaks", async () => {
    const root = await makeTempRoot();
    const app = createApp({ projectRoot: root });

    const resumeResponse = await request(app)
      .post("/api/compile")
      .send({ resumeDir: "../outside" })
      .expect(400);

    expect(resumeResponse.body.error).toMatch(/outside project root/);
    expectNoAbsolutePathLeak(resumeResponse.body, root);

    const currentFileResponse = await request(app)
      .post("/api/compile")
      .send({
        resumeDir: "多模态",
        currentFile: { path: "../outside.tex", content: "secret" },
      })
      .expect(400);

    expect(currentFileResponse.body.error).toMatch(/outside project root/);
    expectNoAbsolutePathLeak(currentFileResponse.body, root);
  });

  it("returns 404 JSON for missing PDFs without leaking absolute paths", async () => {
    const root = await makeTempRoot();
    const response = await request(createApp({ projectRoot: root }))
      .get("/api/pdf")
      .query({ path: "多模态/简历.pdf" })
      .expect(404);

    expect(response.body).toEqual({ error: "PDF not found" });
    expectNoAbsolutePathLeak(response.body, root);
  });

  it("returns 400 JSON for non-PDF and traversal PDF paths", async () => {
    const root = await makeTempRoot();
    const app = createApp({ projectRoot: root });

    await request(app)
      .get("/api/pdf")
      .query({ path: "多模态/简历.tex" })
      .expect(400);

    const traversalResponse = await request(app)
      .get("/api/pdf")
      .query({ path: "../secret.pdf" })
      .expect(400);

    expectNoAbsolutePathLeak(traversalResponse.body, root);
  });
});
