import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverResumes, discoverTexFiles } from "./discovery.js";

const tempRoots: string[] = [];
const defaultEntryFiles = ["resume.tex", "main.tex", "简历.tex"];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "resume-discovery-"));
  tempRoots.push(root);
  return root;
}

async function touch(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "% fixture\n");
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("discovery", () => {
  it("discovers each supported entry file using the configured priority", async () => {
    const root = await makeTempRoot();

    await touch(path.join(root, "alpha", "resume.tex"));
    await touch(path.join(root, "beta", "main.tex"));
    await touch(path.join(root, "gamma", "简历.tex"));
    await touch(path.join(root, "preferred", "resume.tex"));
    await touch(path.join(root, "preferred", "main.tex"));

    await expect(discoverResumes(root, defaultEntryFiles)).resolves.toEqual([
      {
        id: "alpha",
        name: "alpha",
        dir: "alpha",
        entryPath: "alpha/resume.tex",
        pdfPath: "alpha/resume.pdf",
      },
      {
        id: "beta",
        name: "beta",
        dir: "beta",
        entryPath: "beta/main.tex",
        pdfPath: "beta/main.pdf",
      },
      {
        id: "gamma",
        name: "gamma",
        dir: "gamma",
        entryPath: "gamma/简历.tex",
        pdfPath: "gamma/简历.pdf",
      },
      {
        id: "preferred",
        name: "preferred",
        dir: "preferred",
        entryPath: "preferred/resume.tex",
        pdfPath: "preferred/resume.pdf",
      },
    ]);
  });

  it("uses a custom entry priority", async () => {
    const root = await makeTempRoot();
    await touch(path.join(root, "candidate", "resume.tex"));
    await touch(path.join(root, "candidate", "main.tex"));

    await expect(
      discoverResumes(root, ["main.tex", "resume.tex"]),
    ).resolves.toEqual([
      {
        id: "candidate",
        name: "candidate",
        dir: "candidate",
        entryPath: "candidate/main.tex",
        pdfPath: "candidate/main.pdf",
      },
    ]);
  });

  it("skips hidden and generated directories while finding nested tex includes", async () => {
    const root = await makeTempRoot();
    await touch(path.join(root, "sample", "resume.tex"));
    await touch(path.join(root, "sample", "sections", "experience.tex"));
    await touch(path.join(root, "notes.tex"));
    await touch(path.join(root, ".hidden", "resume.tex"));
    await touch(path.join(root, "node_modules", "dependency.tex"));
    await touch(path.join(root, "build", "generated.tex"));
    await touch(path.join(root, "coverage", "generated.tex"));
    await touch(path.join(root, "dist", "generated.tex"));

    await expect(discoverResumes(root, defaultEntryFiles)).resolves.toEqual([
      {
        id: "sample",
        name: "sample",
        dir: "sample",
        entryPath: "sample/resume.tex",
        pdfPath: "sample/resume.pdf",
      },
    ]);
    await expect(discoverTexFiles(root)).resolves.toEqual([
      { path: "notes.tex", name: "notes.tex", dir: "" },
      { path: "sample/resume.tex", name: "resume.tex", dir: "sample" },
      {
        path: "sample/sections/experience.tex",
        name: "experience.tex",
        dir: "sample/sections",
      },
    ]);
  });
});
