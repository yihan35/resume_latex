import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CommandRunner } from "./compiler.js";
import { lookupSynctex, parseSynctexEditOutput } from "./synctex.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-synctex-"));
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

describe("synctex", () => {
  it("parses Input, Line, and Column output to a project-relative path", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");

    const result = parseSynctexEditOutput(
      root,
      [`Input:${path.join(root, "多模态", "简历.tex")}`, "Line:42", "Column:7"].join(
        "\n"
      )
    );

    expect(result).toEqual({
      found: true,
      file: "多模态/简历.tex",
      line: 42,
      column: 7
    });
  });

  it("returns not found when output has no Input line", async () => {
    const root = await makeTempRoot();

    expect(parseSynctexEditOutput(root, "Line:42\nColumn:7\n")).toEqual({
      found: false
    });
  });

  it("parses real-ish SyncTeX output framing with an optional negative column", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");

    const result = parseSynctexEditOutput(
      root,
      [
        "SyncTeX result begin",
        `Output:${path.join(root, "多模态", "简历.pdf")}`,
        `Input:${path.join(root, "多模态", "简历.tex")}`,
        "Line:38",
        "Column:-1",
        "SyncTeX result end"
      ].join("\n")
    );

    expect(result).toEqual({
      found: true,
      file: "多模态/简历.tex",
      line: 38
    });
  });

  it.each(["", "Line:not-a-number\n"])(
    "returns not found for missing or invalid Line output %#",
    async (lineOutput) => {
      const root = await makeTempRoot();
      await writeProjectFile(root, "多模态/简历.tex", "% resume\n");

      expect(
        parseSynctexEditOutput(
          root,
          [`Input:${path.join(root, "多模态", "简历.tex")}`, lineOutput].join(
            "\n"
          )
        )
      ).toEqual({ found: false });
    }
  );

  it("parses a result without Column output", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");

    expect(
      parseSynctexEditOutput(
        root,
        [`Input:${path.join(root, "多模态", "简历.tex")}`, "Line:42"].join("\n")
      )
    ).toEqual({
      found: true,
      file: "多模态/简历.tex",
      line: 42
    });
  });

  it("runs synctex edit against the selected PDF and parses the result", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.pdf", "%PDF-1.7\n");
    await writeProjectFile(root, "多模态/简历.tex", "% resume\n");
    const calls: Array<{
      command: string;
      args: string[];
      cwd: string;
    }> = [];
    const runner: CommandRunner = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return {
        code: 0,
        stdout: `Input:${path.join(root, "多模态", "简历.tex")}\nLine:38\n`,
        stderr: "Column:1\n"
      };
    };

    const result = await lookupSynctex(
      root,
      { resumeDir: "多模态", page: 2, x: 123.5, y: 456.25 },
      runner
    );

    expect(calls).toEqual([
      {
        command: "synctex",
        args: [
          "edit",
          "-o",
          `2:123.5:456.25:${path.join(root, "多模态", "简历.pdf")}`
        ],
        cwd: path.join(root, "多模态")
      }
    ]);
    expect(result).toEqual({
      found: true,
      file: "多模态/简历.tex",
      line: 38,
      column: 1
    });
  });

  it("returns not found when synctex exits nonzero", async () => {
    const root = await makeTempRoot();
    await writeProjectFile(root, "多模态/简历.pdf", "%PDF-1.7\n");
    const runner: CommandRunner = async () => ({
      code: 1,
      stdout: "",
      stderr: "no match"
    });

    await expect(
      lookupSynctex(root, { resumeDir: "多模态", page: 1, x: 10, y: 20 }, runner)
    ).resolves.toEqual({ found: false });
  });
});
