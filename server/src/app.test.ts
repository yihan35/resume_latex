import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-app-"));
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

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((tempRoot) => rm(tempRoot, { recursive: true, force: true })),
  );
});

describe("app", () => {
  function expectNoAbsolutePathLeak(body: unknown, root: string): void {
    const serializedBody = JSON.stringify(body);

    expect(serializedBody).not.toContain("/Users");
    expect(serializedBody).not.toContain("/tmp");
    expect(serializedBody).not.toContain(root);
  }

  it("returns discovered resumes and tex files", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "resume_common.tex", "% common\n");
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");

    const response = await request(createApp({ projectRoot: root }))
      .get("/api/project")
      .expect(200);

    expect(response.body.resumes).toEqual([
      {
        name: "多模态",
        dir: "多模态",
        texPath: "多模态/简历.tex",
        pdfPath: "多模态/简历.pdf",
      },
    ]);
    expect(response.body.texFiles).toEqual(
      expect.arrayContaining([
        { path: "resume_common.tex", name: "resume_common.tex", dir: "" },
        { path: "多模态/简历.tex", name: "简历.tex", dir: "多模态" },
      ]),
    );
    expect(response.body.texFiles).toHaveLength(2);
  });

  it("reads a tex file by query path", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% existing\n");

    const response = await request(createApp({ projectRoot: root }))
      .get("/api/file")
      .query({ path: "多模态/简历.tex" })
      .expect(200);

    expect(response.body).toEqual({
      path: "多模态/简历.tex",
      content: "% existing\n",
    });
  });

  it("saves a tex file from a valid JSON body", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% before\n");

    await request(createApp({ projectRoot: root }))
      .put("/api/file")
      .send({ path: "多模态/简历.tex", content: "% after\n" })
      .expect(200, { ok: true });

    await expect(
      readFile(path.join(root, "多模态", "简历.tex"), "utf8"),
    ).resolves.toBe("% after\n");
  });

  it("returns 400 for unsafe file reads", async () => {
    const root = await makeTempRoot();

    const response = await request(createApp({ projectRoot: root }))
      .get("/api/file")
      .query({ path: "../secret.tex" })
      .expect(400);

    expect(response.body.error).toMatch(/outside project root/);
  });

  it("returns 404 JSON without absolute paths for missing file reads", async () => {
    const root = await makeTempRoot();

    const response = await request(createApp({ projectRoot: root }))
      .get("/api/file")
      .query({ path: "多模态/简历.tex" })
      .expect(404);

    expect(response.body).toEqual({ error: "File not found" });
    expectNoAbsolutePathLeak(response.body, root);
  });

  it("returns 400 for invalid save bodies", async () => {
    const root = await makeTempRoot();

    const response = await request(createApp({ projectRoot: root }))
      .put("/api/file")
      .send({ path: "多模态/简历.tex" })
      .expect(400);

    expect(response.body.error).toMatch(/Invalid save body/);
  });

  it("returns 400 JSON for malformed save JSON", async () => {
    const root = await makeTempRoot();

    const response = await request(createApp({ projectRoot: root }))
      .put("/api/file")
      .set("Content-Type", "application/json")
      .send('{"path":"多模态/简历.tex",')
      .expect(400);

    expect(response.body).toEqual({ error: "Malformed JSON" });
  });

  it("returns 413 JSON for oversized save JSON", async () => {
    const root = await makeTempRoot();

    const response = await request(createApp({ projectRoot: root }))
      .put("/api/file")
      .send({ path: "多模态/简历.tex", content: "x".repeat(1024 * 1024) })
      .expect(413);

    expect(response.body).toEqual({ error: "Request body too large" });
  });

  it("returns 400 for unsafe saves without writing outside root", async () => {
    const root = await makeTempRoot();
    const outsidePath = path.join(path.dirname(root), "secret.tex");
    await rm(outsidePath, { force: true });

    const response = await request(createApp({ projectRoot: root }))
      .put("/api/file")
      .send({ path: "../secret.tex", content: "secret" })
      .expect(400);

    expect(response.body.error).toMatch(
      /outside project root|Invalid file path/,
    );
    expectNoAbsolutePathLeak(response.body, root);
    await expect(readFile(outsidePath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
