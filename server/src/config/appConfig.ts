import { statSync } from "node:fs";
import path from "node:path";

const DEFAULT_ENTRY_FILES = ["resume.tex", "main.tex", "简历.tex"];

export interface AppConfig {
  repoRoot: string;
  projectRoot: string;
  serverPort: number;
  clientPort: number;
  entryFiles: readonly string[];
  latexCommand: string;
  synctexCommand: string;
}

function parsePort(
  value: string | undefined,
  fallback: number,
  variableName: string,
): number {
  const source = value?.trim() ?? String(fallback);

  if (!/^\d+$/.test(source)) {
    throw new Error(`${variableName} must be a port between 1 and 65535`);
  }

  const port = Number(source);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${variableName} must be a port between 1 and 65535`);
  }

  return port;
}

function parseEntryFiles(value: string | undefined): readonly string[] {
  const source = value ?? DEFAULT_ENTRY_FILES.join(",");
  const entryFiles = [
    ...new Set(source.split(",").map((entry) => entry.trim())),
  ].filter(Boolean);

  if (entryFiles.length === 0) {
    throw new Error("RESUME_ENTRY_FILES must contain at least one entry file");
  }

  return Object.freeze(entryFiles);
}

function resolveProjectRoot(
  cwd: string,
  configuredRoot: string | undefined,
): string {
  const projectRoot = path.resolve(cwd, configuredRoot ?? "./examples");

  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(projectRoot);
  } catch {
    throw new Error("Configured project root does not exist");
  }

  if (!stats.isDirectory()) {
    throw new Error("Configured project root must be a directory");
  }

  return projectRoot;
}

export function createAppConfig(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): AppConfig {
  const cwd = path.resolve(options?.cwd ?? process.cwd());
  const env = options?.env ?? process.env;
  const entryFiles = parseEntryFiles(env.RESUME_ENTRY_FILES);

  return Object.freeze({
    repoRoot: cwd,
    projectRoot: resolveProjectRoot(cwd, env.RESUME_PROJECT_ROOT),
    serverPort: parsePort(env.RESUME_EDITOR_PORT, 43871, "RESUME_EDITOR_PORT"),
    clientPort: parsePort(
      env.RESUME_EDITOR_CLIENT_PORT,
      5173,
      "RESUME_EDITOR_CLIENT_PORT",
    ),
    entryFiles,
    latexCommand: env.RESUME_LATEX_COMMAND?.trim() || "xelatex",
    synctexCommand: env.RESUME_SYNCTEX_COMMAND?.trim() || "synctex",
  });
}
