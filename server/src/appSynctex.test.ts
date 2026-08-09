import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import type { CommandRunner } from "./compiler.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-app-synctex-"));
  tempRoots.push(tempRoot);
  return tempRoot;
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

describe("app synctex route", () => {
  it("returns a source location for a PDF coordinate lookup", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.pdf", "%PDF-1.7\n");
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");
    const runner: CommandRunner = async () => ({
      code: 0,
      stdout: `Input:${path.join(root, "多模态", "简历.tex")}\nLine:38\nColumn:1\n`,
      stderr: "",
    });

    const response = await request(
      createApp({ projectRoot: root, commandRunner: runner }),
    )
      .post("/api/synctex")
      .send({ resumeDir: "多模态", page: 1, x: 42, y: 84 })
      .expect(200);

    expect(response.body).toEqual({
      found: true,
      file: "多模态/简历.tex",
      line: 38,
      column: 1,
    });
  });

  it("returns 400 JSON for invalid request bodies", async () => {
    const root = await makeTempRoot();
    const response = await request(createApp({ projectRoot: root }))
      .post("/api/synctex")
      .send({ resumeDir: "多模态", page: "1", x: 42, y: 84 })
      .expect(400);

    expect(response.body).toEqual({ error: "Invalid synctex body" });
  });

  it.each([
    { page: 0, x: 42, y: 84 },
    { page: -1, x: 42, y: 84 },
    { page: 1.5, x: 42, y: 84 },
    { page: 1, x: -1, y: 84 },
    { page: 1, x: 42, y: -1 },
  ])("returns 400 JSON for invalid coordinates %j", async (body) => {
    const root = await makeTempRoot();
    const response = await request(createApp({ projectRoot: root }))
      .post("/api/synctex")
      .send({ resumeDir: "多模态", ...body })
      .expect(400);

    expect(response.body).toEqual({ error: "Invalid synctex body" });
  });

  it("allows decimal x and y coordinates with page 1", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.pdf", "%PDF-1.7\n");
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");
    const runner: CommandRunner = async () => ({
      code: 0,
      stdout: `Input:${path.join(root, "多模态", "简历.tex")}\nLine:38\nColumn:1\n`,
      stderr: "",
    });

    const response = await request(
      createApp({ projectRoot: root, commandRunner: runner }),
    )
      .post("/api/synctex")
      .send({ resumeDir: "多模态", page: 1, x: 42.5, y: 84.25 })
      .expect(200);

    expect(response.body).toEqual({
      found: true,
      file: "多模态/简历.tex",
      line: 38,
      column: 1,
    });
  });

  it("returns not found when synctex exits nonzero", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.pdf", "%PDF-1.7\n");
    const runner: CommandRunner = async () => ({
      code: 1,
      stdout: "",
      stderr: "no match",
    });

    const response = await request(
      createApp({ projectRoot: root, commandRunner: runner }),
    )
      .post("/api/synctex")
      .send({ resumeDir: "多模态", page: 1, x: 42, y: 84 })
      .expect(200);

    expect(response.body).toEqual({ found: false });
  });

  it("does not leak absolute paths from outside source results", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.pdf", "%PDF-1.7\n");
    const runner: CommandRunner = async () => ({
      code: 0,
      stdout: "Input:/tmp/secret.tex\nLine:38\nColumn:1\n",
      stderr: "",
    });

    const response = await request(
      createApp({ projectRoot: root, commandRunner: runner }),
    )
      .post("/api/synctex")
      .send({ resumeDir: "多模态", page: 1, x: 42, y: 84 })
      .expect(200);

    expect(response.body).toEqual({ found: false });
    expectNoAbsolutePathLeak(response.body, root);
  });
});
