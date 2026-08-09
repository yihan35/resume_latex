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

  it("reads through an in-root symlink to a tex target", async () => {
    const root = await makeTempRoot();
    const sourceDirectory = path.join(root, "sources");
    const target = path.join(sourceDirectory, "cv.tex");
    await mkdir(sourceDirectory);
    await writeFile(target, "linked", "utf8");
    await fs.promises.symlink(target, path.join(root, "resume.tex"), "file");

    await expect(readTexFile(root, "resume.tex")).resolves.toBe("linked");
  });

  it("does not read a non-tex file through a tex-named symlink", async () => {
    const root = await makeTempRoot();
    const target = path.join(root, ".env");
    await writeFile(target, "SECRET=value", "utf8");
    await fs.promises.symlink(target, path.join(root, "resume.tex"), "file");

    await expect(readTexFile(root, "resume.tex")).rejects.toThrow(
      "Only .tex files can be edited",
    );
  });

  it("rejects a read when the validated parent is replaced before open", async () => {
    const root = await makeTempRoot();
    const outside = await makeTempRoot();
    const directory = path.join(root, "sample");
    const relocatedDirectory = path.join(root, "sample-relocated");
    await mkdir(directory);
    await writeFile(path.join(directory, "resume.tex"), "inside", "utf8");
    await writeFile(path.join(outside, "resume.tex"), "outside", "utf8");
    const actualOpen = fs.promises.open.bind(fs.promises);

    vi.spyOn(fs.promises, "open").mockImplementationOnce(
      async (filePath, flags, mode) => {
        fs.renameSync(directory, relocatedDirectory);
        fs.symlinkSync(outside, directory, "dir");
        return actualOpen(filePath, flags, mode);
      },
    );

    await expect(readTexFile(root, "sample/resume.tex")).rejects.toThrow(
      "Requested path is outside project root",
    );
    await expect(
      readFile(path.join(relocatedDirectory, "resume.tex"), "utf8"),
    ).resolves.toBe("inside");
    await expect(
      readFile(path.join(outside, "resume.tex"), "utf8"),
    ).resolves.toBe("outside");
  });

  it("does not path-read a file missing from the validated snapshot", async () => {
    const root = await makeTempRoot();
    const outside = await makeTempRoot();
    const directory = path.join(root, "sample");
    const relocatedDirectory = path.join(root, "sample-relocated");
    await mkdir(directory);
    const destination = path.join(
      await fs.promises.realpath(directory),
      "resume.tex",
    );
    await writeFile(path.join(outside, "resume.tex"), "outside", "utf8");
    const actualLstat = fs.promises.lstat.bind(fs.promises);
    let destinationChecks = 0;

    vi.spyOn(fs.promises, "lstat").mockImplementation(async (filePath) => {
      try {
        return await actualLstat(filePath);
      } catch (error) {
        if (filePath === destination && (destinationChecks += 1) === 2) {
          fs.renameSync(directory, relocatedDirectory);
          fs.symlinkSync(outside, directory, "dir");
        }

        throw error;
      }
    });

    await expect(readTexFile(root, "sample/resume.tex")).rejects.toThrow(
      "Requested path is outside project root",
    );
    await expect(
      readFile(path.join(outside, "resume.tex"), "utf8"),
    ).resolves.toBe("outside");
  });

  it("rejects a final-file symlink installed immediately before open", async () => {
    const root = await makeTempRoot();
    const destination = path.join(root, "resume.tex");
    const target = path.join(root, ".env");
    await writeFile(destination, "inside", "utf8");
    await writeFile(target, "SECRET=value", "utf8");
    const actualOpen = fs.promises.open.bind(fs.promises);

    vi.spyOn(fs.promises, "open").mockImplementationOnce(
      async (filePath, flags, mode) => {
        fs.unlinkSync(destination);
        fs.symlinkSync(target, destination, "file");
        return actualOpen(filePath, flags, mode);
      },
    );

    await expect(readTexFile(root, "resume.tex")).rejects.toThrow(
      "Only .tex files can be edited",
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

  it("atomically saves the real tex target without replacing its symlink", async () => {
    const root = await makeTempRoot();
    const sourceDirectory = path.join(root, "sources");
    const target = path.join(sourceDirectory, "cv.tex");
    const linkedPath = path.join(root, "resume.tex");
    await mkdir(sourceDirectory);
    await writeFile(target, "before", "utf8");
    await fs.promises.symlink(target, linkedPath, "file");

    await saveTexFileAtomically(root, "resume.tex", "after");

    expect((await fs.promises.lstat(linkedPath)).isSymbolicLink()).toBe(true);
    await expect(readFile(target, "utf8")).resolves.toBe("after");
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

  it("rejects a save when the validated parent is replaced during temp open", async () => {
    const root = await makeTempRoot();
    const outside = await makeTempRoot();
    const directory = path.join(root, "sample");
    const relocatedDirectory = path.join(root, "sample-relocated");
    await mkdir(directory);
    await writeFile(path.join(directory, "resume.tex"), "inside", "utf8");
    await writeFile(path.join(outside, "resume.tex"), "outside", "utf8");
    const actualOpen = fs.promises.open.bind(fs.promises);
    const actualUnlink = fs.promises.unlink.bind(fs.promises);
    let createdTemporaryMode: number | undefined;
    let removedTemporaryContent: string | undefined;

    vi.spyOn(fs.promises, "open").mockImplementationOnce(
      async (filePath, flags, mode) => {
        fs.renameSync(directory, relocatedDirectory);
        fs.symlinkSync(outside, directory, "dir");
        const handle = await actualOpen(filePath, flags, mode);
        createdTemporaryMode = (await handle.stat()).mode & 0o777;
        return handle;
      },
    );
    vi.spyOn(fs.promises, "unlink").mockImplementationOnce(async (filePath) => {
      removedTemporaryContent = await readFile(filePath, "utf8");
      return actualUnlink(filePath);
    });

    await expect(
      saveTexFileAtomically(root, "sample/resume.tex", "after"),
    ).rejects.toThrow("Requested path is outside project root");
    await expect(
      readFile(path.join(relocatedDirectory, "resume.tex"), "utf8"),
    ).resolves.toBe("inside");
    await expect(
      readFile(path.join(outside, "resume.tex"), "utf8"),
    ).resolves.toBe("outside");
    expect(createdTemporaryMode).toBe(0o600);
    expect(removedTemporaryContent).toBe("");
    expect(
      (await readdir(outside)).filter((name) => /^\..*\.tmp$/.test(name)),
    ).toEqual([]);
  });

  it("detects parent replacement immediately after rename", async () => {
    const root = await makeTempRoot();
    const outside = await makeTempRoot();
    const directory = path.join(root, "sample");
    const relocatedDirectory = path.join(root, "sample-relocated");
    await mkdir(directory);
    await writeFile(path.join(directory, "resume.tex"), "before", "utf8");
    await writeFile(path.join(outside, "resume.tex"), "outside", "utf8");
    const actualRename = fs.promises.rename.bind(fs.promises);

    vi.spyOn(fs.promises, "rename").mockImplementationOnce(
      async (source, destination) => {
        await actualRename(source, destination);
        fs.renameSync(directory, relocatedDirectory);
        fs.symlinkSync(outside, directory, "dir");
      },
    );

    await expect(
      saveTexFileAtomically(root, "sample/resume.tex", "after"),
    ).rejects.toThrow("Requested path is outside project root");
    await expect(
      readFile(path.join(relocatedDirectory, "resume.tex"), "utf8"),
    ).resolves.toBe("after");
    await expect(
      readFile(path.join(outside, "resume.tex"), "utf8"),
    ).resolves.toBe("outside");
  });

  it("detects parent replacement after temp close and before rename", async () => {
    const root = await makeTempRoot();
    const outside = await makeTempRoot();
    const directory = path.join(root, "sample");
    const relocatedDirectory = path.join(root, "sample-relocated");
    await mkdir(directory);
    await writeFile(path.join(directory, "resume.tex"), "before", "utf8");
    await writeFile(path.join(outside, "resume.tex"), "outside", "utf8");
    const actualOpen = fs.promises.open.bind(fs.promises);

    vi.spyOn(fs.promises, "open").mockImplementationOnce(
      async (filePath, flags, mode) => {
        const handle = await actualOpen(filePath, flags, mode);
        const actualClose = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementationOnce(async () => {
          await actualClose();
          fs.renameSync(directory, relocatedDirectory);
          fs.symlinkSync(outside, directory, "dir");
        });
        return handle;
      },
    );

    await expect(
      saveTexFileAtomically(root, "sample/resume.tex", "after"),
    ).rejects.toThrow("Requested path is outside project root");
    await expect(
      readFile(path.join(relocatedDirectory, "resume.tex"), "utf8"),
    ).resolves.toBe("before");
    await expect(
      readFile(path.join(outside, "resume.tex"), "utf8"),
    ).resolves.toBe("outside");
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
