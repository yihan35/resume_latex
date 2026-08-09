import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ResumeInfo } from "../../../shared/contracts.js";
import type { CommandResult, CommandRunner } from "../process/runCommand.js";
import { lookupSynctex, parseSynctexEditOutput } from "./synctex.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "resume-synctex-"));
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

function resume(dir = "candidate", entry = "resume.tex"): ResumeInfo {
  const stem = path.basename(entry, ".tex");
  return {
    id: dir,
    name: dir,
    dir,
    entryPath: `${dir}/${entry}`,
    pdfPath: `${dir}/${stem}.pdf`,
  };
}

function commandResult(overrides: Partial<CommandResult> = {}): CommandResult {
  return { code: 0, stdout: "", stderr: "", timedOut: false, ...overrides };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("parseSynctexEditOutput", () => {
  it("parses an in-root TeX result and optional column", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");

    expect(
      parseSynctexEditOutput(
        root,
        `Input:${path.join(root, "candidate/resume.tex")}\nLine:42\nColumn:7\n`,
      ),
    ).toEqual({
      found: true,
      file: "candidate/resume.tex",
      line: 42,
      column: 7,
    });
  });

  it("omits a missing or negative column", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    const input = `Input:${path.join(root, "candidate/resume.tex")}\nLine:42`;

    expect(parseSynctexEditOutput(root, input)).toEqual({
      found: true,
      file: "candidate/resume.tex",
      line: 42,
    });
    expect(parseSynctexEditOutput(root, `${input}\nColumn:-1`)).toEqual({
      found: true,
      file: "candidate/resume.tex",
      line: 42,
    });
  });

  it("rejects out-of-root and non-TeX source results", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.pdf", "%PDF-1.7\n");

    expect(
      parseSynctexEditOutput(root, "Input:/tmp/secret.tex\nLine:9\n"),
    ).toEqual({ found: false });
    expect(
      parseSynctexEditOutput(
        root,
        `Input:${path.join(root, "candidate/resume.pdf")}\nLine:9\n`,
      ),
    ).toEqual({ found: false });
  });

  it("returns a miss for absent or invalid required fields", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/resume.tex", "% resume\n");
    const inputPath = path.join(root, "candidate/resume.tex");

    expect(parseSynctexEditOutput(root, "Line:42\n")).toEqual({ found: false });
    expect(
      parseSynctexEditOutput(root, `Input:${inputPath}\nLine:0\n`),
    ).toEqual({ found: false });
    expect(
      parseSynctexEditOutput(root, `Input:${inputPath}\nLine:not-a-number\n`),
    ).toEqual({ found: false });
  });
});

describe("lookupSynctex", () => {
  it("uses the configured command and discovered PDF metadata", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "candidate/application.pdf", "%PDF-1.7\n");
    await writeProjectFile(root, "candidate/application.tex", "% resume\n");
    const calls: Array<{
      command: string;
      args: readonly string[];
      cwd: string;
    }> = [];
    const runner: CommandRunner = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return commandResult({
        stdout: `Input:${path.join(root, "candidate/application.tex")}\nLine:38\n`,
        stderr: "Column:1\n",
      });
    };

    const result = await lookupSynctex({
      projectRoot: root,
      synctexCommand: "custom-synctex",
      resume: resume("candidate", "application.tex"),
      page: 2,
      x: 123.5,
      y: 456.25,
      runner,
    });

    expect(calls).toEqual([
      {
        command: "custom-synctex",
        args: [
          "edit",
          "-o",
          `2:123.5:456.25:${path.join(root, "candidate/application.pdf")}`,
        ],
        cwd: path.join(root, "candidate"),
      },
    ]);
    expect(result).toEqual({
      found: true,
      file: "candidate/application.tex",
      line: 38,
      column: 1,
    });
  });

  it("returns a miss for an ordinary nonzero exit", async () => {
    const root = await makeTempRoot();
    const runner: CommandRunner = async () =>
      commandResult({ code: 1, stderr: "no match" });

    await expect(
      lookupSynctex({
        projectRoot: root,
        synctexCommand: "synctex",
        resume: resume(),
        page: 1,
        x: 10,
        y: 20,
        runner,
      }),
    ).resolves.toEqual({ found: false });
  });

  it("maps a missing configured command to SYNCTEX_NOT_FOUND", async () => {
    const root = await makeTempRoot();
    const runner: CommandRunner = async () => commandResult({ code: 127 });

    await expect(
      lookupSynctex({
        projectRoot: root,
        synctexCommand: "missing-synctex",
        resume: resume(),
        page: 1,
        x: 10,
        y: 20,
        runner,
      }),
    ).rejects.toMatchObject({ code: "SYNCTEX_NOT_FOUND" });
  });

  it.each([
    { page: 0, x: 10, y: 20 },
    { page: 1.5, x: 10, y: 20 },
    { page: 1, x: -1, y: 20 },
    { page: 1, x: 10, y: Number.NaN },
  ])("rejects invalid lookup coordinates %#", async ({ page, x, y }) => {
    const root = await makeTempRoot();
    const runner: CommandRunner = async () => commandResult();

    await expect(
      lookupSynctex({
        projectRoot: root,
        synctexCommand: "synctex",
        resume: resume(),
        page,
        x,
        y,
        runner,
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
