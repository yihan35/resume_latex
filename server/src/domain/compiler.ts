import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, rm, stat } from "node:fs/promises";
import path from "node:path";

import type {
  ApiErrorCode,
  CompileResult,
  ResumeInfo,
} from "../../../shared/contracts.js";
import { runCommand, type CommandRunner } from "../process/runCommand.js";
import { normalizeRelativePath, resolveProjectPath } from "./pathSafety.js";

const MAX_RETURNED_OUTPUT_BYTES = 5 * 1024 * 1024;

interface FileStat {
  mtimeMs: number;
  ctimeMs: number;
  size: number;
}

function codedError(code: ApiErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function fileStat(filePath: string): Promise<FileStat | null> {
  try {
    const stats = await stat(filePath);
    return {
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
      size: stats.size,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

function fileChanged(before: FileStat | null, after: FileStat | null): boolean {
  return (
    after !== null &&
    (before === null ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      after.size !== before.size)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capOutput(value: string): string {
  const bytes = Buffer.from(value);
  return bytes.length <= MAX_RETURNED_OUTPUT_BYTES
    ? value
    : bytes.subarray(0, MAX_RETURNED_OUTPUT_BYTES).toString("utf8");
}

export function sanitizeCompileLog(log: string, projectRoot: string): string {
  const resolvedRoot = path.resolve(projectRoot);
  const windowsAbsolutePath =
    /\b[A-Za-z]:[\\/](?:[^\s"'<>()[\]{}:]+[\\/])*[^\s"'<>()[\]{}:]*/g;
  const unixAbsolutePath = /\/(?:[^/\s"'<>()[\]{}:]+\/)*[^/\s"'<>()[\]{}:]+/g;

  return capOutput(log)
    .replace(new RegExp(escapeRegExp(resolvedRoot), "g"), "[project]")
    .replace(windowsAbsolutePath, "[path]")
    .replace(unixAbsolutePath, "[path]");
}

function isLatexErrorMarker(line: string): boolean {
  return line.startsWith("! ") || /^l\.\d+/.test(line);
}

export function summarizeLatexLog(log: string): string {
  const lines = log.split(/\r?\n/);
  const selectedIndexes = new Set<number>();

  lines.forEach((line, index) => {
    if (!isLatexErrorMarker(line)) {
      return;
    }
    for (let offset = -1; offset <= 1; offset += 1) {
      const selectedIndex = index + offset;
      if (selectedIndex >= 0 && selectedIndex < lines.length) {
        selectedIndexes.add(selectedIndex);
      }
    }
  });

  const summary = [...selectedIndexes]
    .sort((left, right) => left - right)
    .map((index) => lines[index])
    .filter((line): line is string => line !== undefined)
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return summary || log.trim();
}

async function preserveExistingPdf(pdfPath: string): Promise<string | null> {
  if ((await fileStat(pdfPath)) === null) {
    return null;
  }

  const backupPath = path.join(
    path.dirname(pdfPath),
    `.${path.basename(pdfPath)}.${randomUUID()}.last-successful`,
  );
  await copyFile(pdfPath, backupPath, constants.COPYFILE_EXCL);
  return backupPath;
}

async function restorePdf(
  pdfPath: string,
  backupPath: string | null,
): Promise<void> {
  if (backupPath === null) {
    await rm(pdfPath, { force: true });
    return;
  }
  await copyFile(backupPath, pdfPath);
}

export class CompileService {
  readonly #projectRoot: string;
  readonly #latexCommand: string;
  readonly #runner: CommandRunner;
  readonly #activeResumes = new Set<string>();

  constructor(options: {
    projectRoot: string;
    latexCommand: string;
    runner?: CommandRunner;
  }) {
    this.#projectRoot = options.projectRoot;
    this.#latexCommand = options.latexCommand;
    this.#runner = options.runner ?? runCommand;
  }

  async compile(resume: ResumeInfo): Promise<CompileResult> {
    if (this.#activeResumes.has(resume.id)) {
      throw codedError("COMPILE_BUSY", "This resume is already compiling");
    }
    this.#activeResumes.add(resume.id);

    try {
      return await this.#compileUnlocked(resume);
    } finally {
      this.#activeResumes.delete(resume.id);
    }
  }

  async #compileUnlocked(resume: ResumeInfo): Promise<CompileResult> {
    const startedAt = Date.now();
    const entryAbsolutePath = resolveProjectPath(
      this.#projectRoot,
      resume.entryPath,
    );
    const pdfAbsolutePath = resolveProjectPath(
      this.#projectRoot,
      resume.pdfPath,
    );

    if (path.extname(entryAbsolutePath) !== ".tex") {
      throw new Error("Only .tex files can be compiled");
    }
    if (path.extname(pdfAbsolutePath) !== ".pdf") {
      throw new Error("Invalid PDF path");
    }

    const resumeDirectory = path.dirname(entryAbsolutePath);
    const pdfPath = normalizeRelativePath(this.#projectRoot, pdfAbsolutePath);
    const pdfBefore = await fileStat(pdfAbsolutePath);
    const backupPath = await preserveExistingPdf(pdfAbsolutePath);
    let restored = false;

    const restoreLastSuccessfulPdf = async (): Promise<void> => {
      if (!restored) {
        await restorePdf(pdfAbsolutePath, backupPath);
        restored = true;
      }
    };

    try {
      const result = await this.#runner(
        this.#latexCommand,
        [
          "-synctex=1",
          "-interaction=nonstopmode",
          "-halt-on-error",
          path.basename(entryAbsolutePath),
        ],
        { cwd: resumeDirectory },
      );
      const pdfAfter = await fileStat(pdfAbsolutePath);
      const ok = result.code === 0 && fileChanged(pdfBefore, pdfAfter);

      if (!ok) {
        await restoreLastSuccessfulPdf();
      }
      if (result.code === 127) {
        throw codedError("LATEX_NOT_FOUND", "LaTeX command was not found");
      }

      const stdout = sanitizeCompileLog(result.stdout, this.#projectRoot);
      const stderr = sanitizeCompileLog(result.stderr, this.#projectRoot);
      const combinedLog = [stdout, stderr].filter(Boolean).join("\n");

      return {
        ok,
        elapsedMs: Date.now() - startedAt,
        pdfPath,
        logSummary: ok ? "" : capOutput(summarizeLatexLog(combinedLog)),
        stdout,
        stderr,
      };
    } catch (error) {
      await restoreLastSuccessfulPdf();
      throw error;
    } finally {
      if (backupPath !== null) {
        await rm(backupPath, { force: true });
      }
    }
  }
}

export type { CommandRunner } from "../process/runCommand.js";
