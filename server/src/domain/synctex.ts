import path from "node:path";

import type {
  ApiErrorCode,
  ResumeInfo,
  SynctexResult,
} from "../../../shared/contracts.js";
import { runCommand, type CommandRunner } from "../process/runCommand.js";
import { normalizeRelativePath, resolveProjectPath } from "./pathSafety.js";

function codedError(code: ApiErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function firstFieldValue(output: string, field: string): string | undefined {
  const line = output
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${field}:`));
  return line?.slice(field.length + 1).trim();
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalColumn(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseSynctexEditOutput(
  projectRoot: string,
  output: string,
): SynctexResult {
  const inputPath = firstFieldValue(output, "Input");
  const line = parsePositiveInteger(firstFieldValue(output, "Line"));
  const column = parseOptionalColumn(firstFieldValue(output, "Column"));

  if (inputPath === undefined || line === undefined) {
    return { found: false };
  }

  try {
    const file = normalizeRelativePath(projectRoot, inputPath);
    if (path.posix.extname(file) !== ".tex") {
      return { found: false };
    }
    return {
      found: true,
      file,
      line,
      ...(column === undefined ? {} : { column }),
    };
  } catch {
    return { found: false };
  }
}

function validateCoordinates(page: number, x: number, y: number): void {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isFinite(x) ||
    x < 0 ||
    !Number.isFinite(y) ||
    y < 0
  ) {
    throw codedError("INVALID_REQUEST", "Invalid SyncTeX coordinates");
  }
}

export async function lookupSynctex(options: {
  projectRoot: string;
  synctexCommand: string;
  resume: ResumeInfo;
  page: number;
  x: number;
  y: number;
  runner?: CommandRunner;
}): Promise<SynctexResult> {
  validateCoordinates(options.page, options.x, options.y);
  const pdfAbsolutePath = resolveProjectPath(
    options.projectRoot,
    options.resume.pdfPath,
  );
  if (path.extname(pdfAbsolutePath) !== ".pdf") {
    throw new Error("Invalid PDF path");
  }

  const result = await (options.runner ?? runCommand)(
    options.synctexCommand,
    [
      "edit",
      "-o",
      `${options.page}:${options.x}:${options.y}:${pdfAbsolutePath}`,
    ],
    { cwd: path.dirname(pdfAbsolutePath) },
  );

  if (result.code === 127) {
    throw codedError("SYNCTEX_NOT_FOUND", "SyncTeX command was not found");
  }
  if (result.code !== 0) {
    return { found: false };
  }

  return parseSynctexEditOutput(
    options.projectRoot,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
}
