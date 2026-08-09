import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ResumeInfo } from "../../../shared/contracts.js";
import type { CommandResult, CommandRunner } from "../process/runCommand.js";
import {
  CompileService,
  sanitizeCompileLog,
  summarizeLatexLog,
} from "./compiler.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "resume-compiler-"));
  tempRoots.push(root);
  return root;
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

function resume(dir: string, entry = "resume.tex"): ResumeInfo {
  const stem = entry.slice(0, -path.extname(entry).length);
  return {
    id: dir,
    name: dir,
    dir,
    entryPath: `${dir}/${entry}`,
    pdfPath: `${dir}/${stem}.pdf`,
  };
}

function commandResult(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    code: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CompileService", () => {
  it("uses the configured command and discovered entry and PDF paths", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    const calls: Array<{
      command: string;
      args: readonly string[];
      cwd: string;
    }> = [];
    const runner: CommandRunner = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      await writeFile(path.join(options.cwd, "resume.pdf"), "%PDF-1.7\n");
      return commandResult({ stdout: "compiled" });
    };
    const compiler = new CompileService({
      projectRoot: root,
      latexCommand: "custom-xelatex",
      runner,
    });

    const result = await compiler.compile(resume("candidate"));

    expect(calls).toEqual([
      {
        command: "custom-xelatex",
        args: [
          "-synctex=1",
          "-interaction=nonstopmode",
          "-halt-on-error",
          "resume.tex",
        ],
        cwd: path.join(root, "candidate"),
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      pdfPath: "candidate/resume.pdf",
      stdout: "compiled",
      stderr: "",
      logSummary: "",
    });
  });

  it("compiles a non-default discovered entry basename", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/application.tex", "% resume\n");
    let invokedEntry = "";
    const runner: CommandRunner = async (_command, args, options) => {
      invokedEntry = args.at(-1) ?? "";
      await writeFile(path.join(options.cwd, "application.pdf"), "%PDF-1.7\n");
      return commandResult();
    };

    const result = await new CompileService({
      projectRoot: root,
      latexCommand: "xelatex",
      runner,
    }).compile(resume("candidate", "application.tex"));

    expect(invokedEntry).toBe("application.tex");
    expect(result.pdfPath).toBe("candidate/application.pdf");
    expect(result.ok).toBe(true);
  });

  it("rejects a second compile for the same resume while allowing another resume", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "alpha/resume.tex", "% alpha\n");
    await writeProjectFile(root, "beta/main.tex", "% beta\n");
    let releaseAlpha: (() => void) | undefined;
    const alphaGate = new Promise<void>((resolve) => {
      releaseAlpha = resolve;
    });
    const runner: CommandRunner = async (_command, args, options) => {
      if (path.basename(options.cwd) === "alpha") {
        await alphaGate;
      }
      const entry = args.at(-1) ?? "";
      await writeFile(
        path.join(options.cwd, `${path.basename(entry, ".tex")}.pdf`),
        "%PDF-1.7\n",
      );
      return commandResult();
    };
    const compiler = new CompileService({
      projectRoot: root,
      latexCommand: "xelatex",
      runner,
    });

    const first = compiler.compile(resume("alpha"));
    await expect(compiler.compile(resume("alpha"))).rejects.toMatchObject({
      code: "COMPILE_BUSY",
    });
    await expect(
      compiler.compile(resume("beta", "main.tex")),
    ).resolves.toMatchObject({
      ok: true,
      pdfPath: "beta/main.pdf",
    });
    releaseAlpha?.();
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("releases the per-resume lock after the runner rejects", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    let attempts = 0;
    const runner: CommandRunner = async (_command, _args, options) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("runner failed");
      }
      await writeFile(path.join(options.cwd, "resume.pdf"), "%PDF-1.7\n");
      return commandResult();
    };
    const compiler = new CompileService({
      projectRoot: root,
      latexCommand: "xelatex",
      runner,
    });

    await expect(compiler.compile(resume("candidate"))).rejects.toThrow(
      "runner failed",
    );
    await expect(compiler.compile(resume("candidate"))).resolves.toMatchObject({
      ok: true,
    });
  });

  it("preserves the last successful PDF when a failed command overwrites it", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    await writeProjectFile(root, "candidate/resume.pdf", "%PDF-old\n");
    const runner: CommandRunner = async (_command, _args, options) => {
      await writeFile(path.join(options.cwd, "resume.pdf"), "broken output\n");
      return commandResult({ code: 1, stderr: "compile failed" });
    };

    const result = await new CompileService({
      projectRoot: root,
      latexCommand: "xelatex",
      runner,
    }).compile(resume("candidate"));

    expect(result.ok).toBe(false);
    await expect(
      readFile(path.join(root, "candidate/resume.pdf"), "utf8"),
    ).resolves.toBe("%PDF-old\n");
  });

  it("does not treat an unchanged stale PDF as success", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    await writeProjectFile(root, "candidate/resume.pdf", "%PDF-old\n");
    const runner: CommandRunner = async () => commandResult();

    const result = await new CompileService({
      projectRoot: root,
      latexCommand: "xelatex",
      runner,
    }).compile(resume("candidate"));

    expect(result.ok).toBe(false);
  });

  it("maps a missing configured compiler to LATEX_NOT_FOUND", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    const runner: CommandRunner = async () =>
      commandResult({ code: 127, stderr: "spawn ENOENT" });

    await expect(
      new CompileService({
        projectRoot: root,
        latexCommand: "missing-latex",
        runner,
      }).compile(resume("candidate")),
    ).rejects.toMatchObject({ code: "LATEX_NOT_FOUND" });
  });

  it("redacts project, Unix, and Windows absolute paths from returned output", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    const runner: CommandRunner = async () =>
      commandResult({
        code: 1,
        stdout: `${path.join(root, "candidate/resume.tex")}:12 failed at /home/alice/private.tex`,
        stderr: String.raw`C:\Users\Alice\resume\secret.tex failed`,
      });

    const result = await new CompileService({
      projectRoot: root,
      latexCommand: "xelatex",
      runner,
    }).compile(resume("candidate"));

    expect(`${result.stdout}\n${result.stderr}`).not.toContain(root);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("/home/alice");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(
      "C:\\Users\\Alice",
    );
    expect(`${result.stdout}\n${result.stderr}`).toContain("[path]");
  });

  it("bounds compiler output after path redaction expands it", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    const maxOutputBytes = 5 * 1024 * 1024;
    const runner: CommandRunner = async () =>
      commandResult({
        code: 1,
        stdout: `${"a".repeat(maxOutputBytes - 2)}/x`,
      });

    const result = await new CompileService({
      projectRoot: root,
      latexCommand: "xelatex",
      runner,
    }).compile(resume("candidate"));

    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(
      maxOutputBytes,
    );
    expect(Buffer.byteLength(result.logSummary)).toBeLessThanOrEqual(
      maxOutputBytes,
    );
  });
});

describe("compiler log helpers", () => {
  it("summarizes lines surrounding LaTeX error markers", () => {
    expect(
      summarizeLatexLog(
        ["context", "! Missing $ inserted.", "l.20 x", "next"].join("\n"),
      ),
    ).toContain("l.20 x");
  });

  it("redacts standalone absolute paths", () => {
    expect(
      sanitizeCompileLog(
        String.raw`/var/tmp/build.log C:\work\resume\main.tex`,
        "/project",
      ),
    ).toBe("[path] [path]");
  });

  it("redacts quoted and unquoted space-containing paths and UNC paths", () => {
    const output = sanitizeCompileLog(
      String.raw`open "/Users/Jane Doe/Private Resume/main.tex" then /Users/Jane Doe/Private Resume/main.tex:12 and "\\server\Private Share\resume.tex"`,
      "/project",
    );

    expect(output).not.toContain("Jane");
    expect(output).not.toContain("Private Resume");
    expect(output).not.toContain("server");
    expect(output).not.toContain("Private Share");
    expect(output.match(/\[path\]/g)).toHaveLength(3);
  });
});
