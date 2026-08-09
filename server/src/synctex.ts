import path from "node:path";

import { MAIN_PDF } from "./config.js";
import type { CommandRunner } from "./compiler.js";
import { normalizeRelativePath, resolveProjectPath } from "./pathSafety.js";
import { runCommand } from "./processRunner.js";

export interface SynctexResult {
  found: boolean;
  file?: string;
  line?: number;
  column?: number;
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
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseSynctexEditOutput(
  projectRoot: string,
  output: string
): SynctexResult {
  const inputPath = firstFieldValue(output, "Input");
  const line = parsePositiveInteger(firstFieldValue(output, "Line"));
  const column = parsePositiveInteger(firstFieldValue(output, "Column"));

  if (inputPath === undefined || line === undefined) {
    return { found: false };
  }

  try {
    return {
      found: true,
      file: normalizeRelativePath(projectRoot, inputPath),
      line,
      ...(column === undefined ? {} : { column })
    };
  } catch {
    return { found: false };
  }
}

export async function lookupSynctex(
  projectRoot: string,
  input: { resumeDir: string; page: number; x: number; y: number },
  runner: CommandRunner = runCommand
): Promise<SynctexResult> {
  const pdfAbsolutePath = resolveProjectPath(
    projectRoot,
    path.join(input.resumeDir, MAIN_PDF)
  );
  const pdfDirectory = path.dirname(pdfAbsolutePath);
  const result = await runner(
    "synctex",
    [
      "edit",
      "-o",
      `${input.page}:${input.x}:${input.y}:${pdfAbsolutePath}`
    ],
    { cwd: pdfDirectory }
  );

  if (result.code !== 0) {
    return { found: false };
  }

  return parseSynctexEditOutput(
    projectRoot,
    [result.stdout, result.stderr].filter(Boolean).join("\n")
  );
}
