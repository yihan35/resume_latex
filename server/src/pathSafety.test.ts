import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  it("resolves a project-relative tex path under the project root", () => {
    expect(resolveProjectTexPath("/tmp/resume-root", "多模态/简历.tex")).toBe(
      "/tmp/resume-root/多模态/简历.tex",
    );
  });

  it("rejects relative traversal outside the project root", () => {
    expect(() =>
      resolveProjectTexPath("/tmp/resume-root", "../secret.tex"),
    ).toThrow(/outside project root/);
  });

  it("rejects absolute paths outside the project root", () => {
    expect(() =>
      resolveProjectTexPath("/tmp/resume-root", "/tmp/secret.tex"),
    ).toThrow(/outside project root/);
  });

  it("rejects non-tex editor paths", () => {
    expect(() =>
      resolveProjectTexPath("/tmp/resume-root", "多模态/简历.pdf"),
    ).toThrow(/Only \.tex files/);
  });

  it("resolves a generic project path without requiring a tex extension", () => {
    expect(resolveProjectPath("/tmp/resume-root", "多模态/简历.pdf")).toBe(
      "/tmp/resume-root/多模态/简历.pdf",
    );
  });

  it("normalizes an absolute path to a forward-slash project-relative path", () => {
    expect(
      normalizeRelativePath(
        "/tmp/resume-root",
        "/tmp/resume-root/多模态/简历.tex",
      ),
    ).toBe("多模态/简历.tex");
  });

  it("rejects project-local symlinks that resolve outside the project root", () => {
    const root = makeTempRoot("resume-root-");
    const outside = makeTempRoot("resume-outside-");

    writeFileSync(path.join(outside, "secret.tex"), "");
    symlinkSync(outside, path.join(root, "link"), "dir");

    expect(() => resolveProjectTexPath(root, "link/secret.tex")).toThrow(
      /outside project root/,
    );
  });
});
