import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readTexFile, saveTexFileAtomically } from "./fileStore.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-file-store-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempRoots
      .splice(0)
      .map((tempRoot) => rm(tempRoot, { recursive: true, force: true })),
  );
});

describe("file store", () => {
  it("reads a project-local tex file", async () => {
    const root = await makeTempRoot();
    const destination = path.join(root, "sample", "resume.tex");
    await mkdir(path.dirname(destination));
    await writeFile(destination, "before", "utf8");

    await expect(readTexFile(root, "sample/resume.tex")).resolves.toBe(
      "before",
    );
  });

  it("atomically replaces a tex file and preserves its mode", async () => {
    const root = await makeTempRoot();
    const destination = path.join(root, "sample", "resume.tex");
    await mkdir(path.dirname(destination));
    await writeFile(destination, "before", { encoding: "utf8", mode: 0o640 });
    const originalMode = (await stat(destination)).mode & 0o777;

    await saveTexFileAtomically(root, "sample/resume.tex", "after");

    expect(await readFile(destination, "utf8")).toBe("after");
    expect((await stat(destination)).mode & 0o777).toBe(originalMode);
  });

  it("creates a missing tex file when its parent directory exists", async () => {
    const root = await makeTempRoot();
    const destination = path.join(root, "sample", "resume.tex");
    await mkdir(path.dirname(destination));

    await saveTexFileAtomically(root, "sample/resume.tex", "new");

    await expect(readFile(destination, "utf8")).resolves.toBe("new");
  });

  it("does not create missing parent directories", async () => {
    const root = await makeTempRoot();

    await expect(
      saveTexFileAtomically(root, "missing/resume.tex", "new"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("keeps the original and removes its temp file when rename fails", async () => {
    const root = await makeTempRoot();
    const directory = path.join(root, "sample");
    const destination = path.join(directory, "resume.tex");
    await mkdir(directory);
    await writeFile(destination, "before", "utf8");
    vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(
      new Error("forced rename failure"),
    );

    await expect(
      saveTexFileAtomically(root, "sample/resume.tex", "after"),
    ).rejects.toThrow("forced rename failure");

    expect(await readFile(destination, "utf8")).toBe("before");
    expect(
      (await readdir(directory)).filter((name) => /^\..*\.tmp$/.test(name)),
    ).toEqual([]);
  });

  it("rejects non-tex saves", async () => {
    const root = await makeTempRoot();

    await expect(
      saveTexFileAtomically(root, "sample/resume.pdf", "nope"),
    ).rejects.toThrow("Only .tex files can be edited");
  });
});
