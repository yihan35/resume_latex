import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

function assertInsideProjectRoot(
  projectRoot: string,
  absolutePath: string,
): void {
  const resolvedRoot = path.resolve(projectRoot);
  const relativePath = path.relative(resolvedRoot, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Requested path is outside project root");
  }
}

function assertExistingComponentsInsideProjectRoot(
  projectRoot: string,
  absolutePath: string,
): void {
  const resolvedRoot = path.resolve(projectRoot);
  let realRoot: string;

  try {
    realRoot = realpathSync(resolvedRoot);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  const relativePath = path.relative(resolvedRoot, absolutePath);
  const parts = relativePath === "" ? [] : relativePath.split(path.sep);
  let currentPath = resolvedRoot;

  for (const part of parts) {
    currentPath = path.join(currentPath, part);

    try {
      const stats = lstatSync(currentPath);

      if (stats.isSymbolicLink()) {
        currentPath = realpathSync(currentPath);
        assertInsideProjectRoot(realRoot, currentPath);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }

      throw error;
    }
  }
}

export function resolveProjectPath(
  projectRoot: string,
  requestedPath: string,
): string {
  const resolvedRoot = path.resolve(projectRoot);
  const absolutePath = path.resolve(resolvedRoot, requestedPath);

  assertInsideProjectRoot(resolvedRoot, absolutePath);
  assertExistingComponentsInsideProjectRoot(resolvedRoot, absolutePath);

  return absolutePath;
}

export function normalizeRelativePath(
  projectRoot: string,
  absolutePath: string,
): string {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(absolutePath);

  assertInsideProjectRoot(resolvedRoot, resolvedPath);
  assertExistingComponentsInsideProjectRoot(resolvedRoot, resolvedPath);

  return path.relative(resolvedRoot, resolvedPath).split(path.sep).join("/");
}

export function resolveProjectTexPath(
  projectRoot: string,
  requestedPath: string,
): string {
  const absolutePath = resolveProjectPath(projectRoot, requestedPath);

  if (path.extname(absolutePath) !== ".tex") {
    throw new Error("Only .tex files can be edited");
  }

  return absolutePath;
}
