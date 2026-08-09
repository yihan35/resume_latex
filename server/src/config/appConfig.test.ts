import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAppConfig } from "./appConfig.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "resume-config-"));
  tempRoots.push(root);
  return root;
}

async function makeExampleRoot(cwd: string): Promise<string> {
  const examples = path.join(cwd, "examples");
  await mkdir(examples, { recursive: true });
  return examples;
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("createAppConfig", () => {
  it("uses the cwd examples directory and documented defaults", async () => {
    const cwd = await makeTempRoot();
    const examples = await makeExampleRoot(cwd);

    const config = createAppConfig({ cwd, env: {} });

    expect(config).toEqual({
      repoRoot: cwd,
      projectRoot: examples,
      serverPort: 43871,
      clientPort: 5173,
      entryFiles: ["resume.tex", "main.tex", "简历.tex"],
      latexCommand: "xelatex",
      synctexCommand: "synctex",
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.entryFiles)).toBe(true);
  });

  it("resolves a relative project root and normalizes entry-file priority", async () => {
    const cwd = await makeTempRoot();
    const projectRoot = path.join(cwd, "resumes");
    await mkdir(projectRoot);

    const config = createAppConfig({
      cwd,
      env: {
        RESUME_PROJECT_ROOT: "resumes",
        RESUME_ENTRY_FILES: " main.tex, resume.tex, main.tex, 简历.tex ",
        RESUME_EDITOR_PORT: "44000",
        RESUME_EDITOR_CLIENT_PORT: "5200",
        RESUME_LATEX_COMMAND: "latex-bin",
        RESUME_SYNCTEX_COMMAND: "synctex-bin",
      },
    });

    expect(config).toMatchObject({
      projectRoot,
      serverPort: 44000,
      clientPort: 5200,
      entryFiles: ["main.tex", "resume.tex", "简历.tex"],
      latexCommand: "latex-bin",
      synctexCommand: "synctex-bin",
    });
  });

  it.each([
    ["RESUME_EDITOR_PORT", "0"],
    ["RESUME_EDITOR_PORT", "65536"],
    ["RESUME_EDITOR_PORT", "invalid"],
    ["RESUME_EDITOR_CLIENT_PORT", "0"],
    ["RESUME_EDITOR_CLIENT_PORT", "65536"],
  ])("rejects an invalid %s value of %s", async (name, value) => {
    const cwd = await makeTempRoot();
    await makeExampleRoot(cwd);

    expect(() => createAppConfig({ cwd, env: { [name]: value } })).toThrow(
      /port/i,
    );
  });

  it("rejects a missing project root", async () => {
    const cwd = await makeTempRoot();

    expect(() =>
      createAppConfig({ cwd, env: { RESUME_PROJECT_ROOT: "missing" } }),
    ).toThrow(/project root/i);
  });

  it("rejects a project root that is a file", async () => {
    const cwd = await makeTempRoot();
    await writeFile(path.join(cwd, "resume.tex"), "% fixture\n");

    expect(() =>
      createAppConfig({ cwd, env: { RESUME_PROJECT_ROOT: "resume.tex" } }),
    ).toThrow(/directory/i);
  });

  it("rejects an entry-file list that becomes empty after trimming", async () => {
    const cwd = await makeTempRoot();
    await makeExampleRoot(cwd);

    expect(() =>
      createAppConfig({ cwd, env: { RESUME_ENTRY_FILES: " , , " } }),
    ).toThrow(/entry/i);
  });
});
