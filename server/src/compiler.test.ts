import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  compileResume,
  summarizeLatexLog,
  type CommandRunner
} from "./compiler.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-compiler-"));
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

describe("compiler", () => {
  it("runs xelatex from the selected resume directory and reports the generated PDF", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");
    const calls: Array<{
      command: string;
      args: string[];
      cwd: string;
    }> = [];
    const runner: CommandRunner = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      await writeFile(path.join(options.cwd, "简历.pdf"), "%PDF-1.7\n");
      return { code: 0, stdout: "compiled", stderr: "" };
    };

    const result = await compileResume(root, "多模态", runner);

    expect(calls).toEqual([
      {
        command: "xelatex",
        args: [
          "-synctex=1",
          "-interaction=nonstopmode",
          "-halt-on-error",
          "简历.tex"
        ],
        cwd: path.join(root, "多模态")
      }
    ]);
    expect(result.ok).toBe(true);
    expect(result.pdfPath).toBe("多模态/简历.pdf");
    expect(result.stdout).toBe("compiled");
    expect(result.stderr).toBe("");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("returns failure details from LaTeX error output without requiring a PDF", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");
    const runner: CommandRunner = async () => ({
      code: 1,
      stdout: [
        "before",
        "! Undefined control sequence.",
        "l.12 \\badcommand",
        "after"
      ].join("\n"),
      stderr: ""
    });

    const result = await compileResume(root, "多模态", runner);

    expect(result.ok).toBe(false);
    expect(result.logSummary).toContain("Undefined control sequence");
    expect(result.logSummary).toContain("l.12");
  });

  it("does not treat an unchanged stale PDF as a successful compile", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");
    await writeProjectFile(root, "多模态/简历.pdf", "%PDF-old\n");
    const runner: CommandRunner = async () => ({
      code: 0,
      stdout: "compile exited without writing a pdf",
      stderr: ""
    });

    const result = await compileResume(root, "多模态", runner);

    expect(result.ok).toBe(false);
  });

  it("summarizes LaTeX log lines around error markers", () => {
    const summary = summarizeLatexLog(
      ["context", "! Missing $ inserted.", "l.20 x", "next"].join("\n")
    );

    expect(summary).toContain("Missing $ inserted.");
    expect(summary).toContain("l.20 x");
  });
});
