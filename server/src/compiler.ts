import { stat } from "node:fs/promises";
import path from "node:path";

import {
  normalizeRelativePath,
  resolveProjectPath,
} from "./domain/pathSafety.js";
import { runCommand } from "./processRunner.js";

const LEGACY_MAIN_TEX = "简历.tex";
const LEGACY_MAIN_PDF = "简历.pdf";

export type CommandRunner = typeof runCommand;

export interface CompileResult {
  ok: boolean;
  elapsedMs: number;
  pdfPath: string;
  logSummary: string;
  stdout: string;
  stderr: string;
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

async function fileStat(filePath: string): Promise<{
  mtimeMs: number;
  size: number;
} | null> {
  try {
    const stats = await stat(filePath);
    return {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeCompileLog(log: string, projectRoot: string): string {
  const resolvedRoot = path.resolve(projectRoot);

  return log
    .replace(new RegExp(escapeRegExp(resolvedRoot), "g"), "[project]")
    .replace(/\/(?:Users|tmp|var)\/[^\s"'<>)]*/g, "[path]");
}

export async function compileResume(
  projectRoot: string,
  resumeDir: string,
  runner: CommandRunner = runCommand,
): Promise<CompileResult> {
  const startedAt = Date.now();
  const resumeDirectory = resolveProjectPath(projectRoot, resumeDir);
  const pdfAbsolutePath = path.join(resumeDirectory, LEGACY_MAIN_PDF);
  const pdfPath = normalizeRelativePath(projectRoot, pdfAbsolutePath);
  const pdfBefore = await fileStat(pdfAbsolutePath);
  const result = await runner(
    "xelatex",
    [
      "-synctex=1",
      "-interaction=nonstopmode",
      "-halt-on-error",
      LEGACY_MAIN_TEX,
    ],
    { cwd: resumeDirectory },
  );
  const pdfAfter = await fileStat(pdfAbsolutePath);
  const pdfCreatedOrModified =
    pdfAfter !== null &&
    (pdfBefore === null ||
      pdfAfter.mtimeMs > pdfBefore.mtimeMs ||
      pdfAfter.size !== pdfBefore.size);
  const ok = result.code === 0 && pdfCreatedOrModified;
  const stdout = sanitizeCompileLog(result.stdout, projectRoot);
  const stderr = sanitizeCompileLog(result.stderr, projectRoot);
  const combinedLog = [stdout, stderr].filter(Boolean).join("\n");

  return {
    ok,
    elapsedMs: Date.now() - startedAt,
    pdfPath,
    logSummary: ok ? "" : summarizeLatexLog(combinedLog),
    stdout,
    stderr,
  };
}
