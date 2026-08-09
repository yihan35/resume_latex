import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  normalizeRelativePath,
  resolveProjectPath,
  resolveProjectTexPath,
} from "./pathSafety.js";

const tempRoots: string[] = [];

function makeTempRoot(prefix: string): string {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("path safety", () => {
  it("normalizes valid Unicode nested paths to POSIX separators", () => {
    const root = makeTempRoot("resume-path-");

    expect(resolveProjectTexPath(root, "多模态\\sections/简历.tex")).toBe(
      path.join(root, "多模态", "sections", "简历.tex"),
    );
    expect(
      normalizeRelativePath(
        root,
        path.join(root, "多模态", "sections", "简历.tex"),
      ),
    ).toBe("多模态/sections/简历.tex");
  });

  it.each([
    "../escape.tex",
    "/tmp/escape.tex",
    "C:\\escape.tex",
    "D:/escape.tex",
    "\\\\server\\share\\escape.tex",
    "//server/share/escape.tex",
    "nested\\..\\..\\escape.tex",
  ])("rejects path forms that can escape on any host: %s", (requestedPath) => {
    const root = makeTempRoot("resume-path-");

    expect(() => resolveProjectTexPath(root, requestedPath)).toThrow(
      "Requested path is outside project root",
    );
  });

  it("rejects a symlinked directory whose real path leaves the root", () => {
    const root = makeTempRoot("resume-path-");
    const outside = makeTempRoot("resume-outside-");

    writeFileSync(path.join(outside, "escape.tex"), "secret");
    symlinkSync(outside, path.join(root, "linked-directory"), "dir");

    expect(() =>
      resolveProjectTexPath(root, "linked-directory/escape.tex"),
    ).toThrow("Requested path is outside project root");
  });

  it("rejects a symlinked final file whose real path leaves the root", () => {
    const root = makeTempRoot("resume-path-");
    const outside = makeTempRoot("resume-outside-");
    const outsideFile = path.join(outside, "escape.tex");

    writeFileSync(outsideFile, "secret");
    symlinkSync(outsideFile, path.join(root, "linked-file.tex"), "file");

    expect(() => resolveProjectTexPath(root, "linked-file.tex")).toThrow(
      "Requested path is outside project root",
    );
  });

  it("resolves a tex symlink to its in-root tex target", () => {
    const root = makeTempRoot("resume-path-");
    const sourceDirectory = path.join(root, "sources");
    const target = path.join(sourceDirectory, "cv.tex");

    mkdirSync(sourceDirectory);
    writeFileSync(target, "resume");
    symlinkSync(target, path.join(root, "resume.tex"), "file");

    expect(resolveProjectTexPath(root, "resume.tex")).toBe(
      realpathSync(target),
    );
  });

  it("rejects a tex-named symlink to a non-tex file inside the root", () => {
    const root = makeTempRoot("resume-path-");
    const target = path.join(root, ".env");

    writeFileSync(target, "SECRET=value");
    symlinkSync(target, path.join(root, "resume.tex"), "file");

    expect(() => resolveProjectTexPath(root, "resume.tex")).toThrow(
      "Only .tex files can be edited",
    );
  });

  it("resolves generic project paths without requiring a tex extension", () => {
    const root = makeTempRoot("resume-path-");

    expect(resolveProjectPath(root, "多模态/简历.pdf")).toBe(
      path.join(root, "多模态", "简历.pdf"),
    );
  });

  it("requires the case-sensitive .tex extension", () => {
    const root = makeTempRoot("resume-path-");

    expect(() => resolveProjectTexPath(root, "resume.TEX")).toThrow(
      "Only .tex files can be edited",
    );
  });
});
