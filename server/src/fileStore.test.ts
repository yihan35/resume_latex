import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readTexFile, saveTexFile } from "./fileStore.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-file-store-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((tempRoot) =>
      rm(tempRoot, { recursive: true, force: true })
    )
  );
});

describe("file store", () => {
  it("reads a project-local tex file", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% existing resume\n");

    await expect(readTexFile(root, "多模态/简历.tex")).resolves.toBe(
      "% existing resume\n"
    );
  });

  it("saves a project-local tex file", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% before\n");

    await saveTexFile(root, "多模态/简历.tex", "% after\n");

    await expect(
      readFile(path.join(root, "多模态", "简历.tex"), "utf8")
    ).resolves.toBe("% after\n");
  });

  it("rejects non-tex saves", async () => {
    const root = await makeTempRoot();

    await expect(saveTexFile(root, "多模态/简历.pdf", "nope")).rejects.toThrow(
      /Only \.tex files/
    );
  });
});
