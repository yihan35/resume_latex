import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverResumes, discoverTexFiles } from "./discovery.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-discovery-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

async function touch(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "");
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((tempRoot) =>
      rm(tempRoot, { recursive: true, force: true })
    )
  );
});

describe("discovery", () => {
  it("finds first-level resume directories containing the main tex file", async () => {
    const root = await makeTempRoot();

    await touch(path.join(root, "多模态", "简历.tex"));
    await touch(path.join(root, "docs", "notes.tex"));

    await expect(discoverResumes(root)).resolves.toEqual([
      {
        name: "多模态",
        dir: "多模态",
        texPath: "多模态/简历.tex",
        pdfPath: "多模态/简历.pdf"
      }
    ]);
  });

  it("recursively lists tex files while skipping excluded directories", async () => {
    const root = await makeTempRoot();

    await touch(path.join(root, "agent", "简历.tex"));
    await touch(path.join(root, "resume_common.tex"));
    await touch(path.join(root, "docs", "notes.tex"));
    await touch(path.join(root, ".superpowers", "cache.tex"));
    await touch(path.join(root, "build", "generated.tex"));
    await touch(path.join(root, "out", "generated.tex"));
    await touch(path.join(root, "output", "generated.tex"));

    await expect(discoverTexFiles(root)).resolves.toEqual([
      { path: "agent/简历.tex", name: "简历.tex", dir: "agent" },
      { path: "docs/notes.tex", name: "notes.tex", dir: "docs" },
      { path: "resume_common.tex", name: "resume_common.tex", dir: "" }
    ]);
  });
});
