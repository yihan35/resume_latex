import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/;

function outsideProjectRoot(): never {
  throw new Error("Requested path is outside project root");
}

function assertInsideProjectRoot(
  projectRoot: string,
  absolutePath: string,
): void {
  const relativePath = path.relative(projectRoot, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    outsideProjectRoot();
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function assertExistingComponentsInsideProjectRoot(
  projectRoot: string,
  absolutePath: string,
): void {
  let realRoot: string;

  try {
    realRoot = realpathSync(projectRoot);
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }

  const relativePath = path.relative(projectRoot, absolutePath);
  const parts = relativePath === "" ? [] : relativePath.split(path.sep);
  let currentPath = projectRoot;

  for (const part of parts) {
    currentPath = path.join(currentPath, part);

    try {
      if (lstatSync(currentPath).isSymbolicLink()) {
        currentPath = realpathSync(currentPath);
        assertInsideProjectRoot(realRoot, currentPath);
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return;
      }

      throw error;
    }
  }
}

function normalizeRequestedPath(requestedPath: string): string {
  const portablePath = requestedPath.replaceAll("\\", "/");

  if (
    path.posix.isAbsolute(portablePath) ||
    WINDOWS_DRIVE_PATH.test(portablePath)
  ) {
    outsideProjectRoot();
  }

  return portablePath;
}

function resolvePortablePath(
  projectRoot: string,
  portablePath: string,
): string {
  return path.resolve(projectRoot, ...portablePath.split("/"));
}

function validateProjectPath(projectRoot: string, absolutePath: string): void {
  assertInsideProjectRoot(projectRoot, absolutePath);
  assertExistingComponentsInsideProjectRoot(projectRoot, absolutePath);
}

export function resolveProjectPath(
  projectRoot: string,
  requestedPath: string,
): string {
  const resolvedRoot = path.resolve(projectRoot);
  const portablePath = normalizeRequestedPath(requestedPath);
  const absolutePath = resolvePortablePath(resolvedRoot, portablePath);

  validateProjectPath(resolvedRoot, absolutePath);

  return absolutePath;
}

export function normalizeRelativePath(
  projectRoot: string,
  absolutePath: string,
): string {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(absolutePath.replaceAll("\\", path.sep));

  validateProjectPath(resolvedRoot, resolvedPath);

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

  let existingPathIsSymlink: boolean;

  try {
    existingPathIsSymlink = lstatSync(absolutePath).isSymbolicLink();
  } catch (error) {
    if (isMissingFileError(error)) {
      try {
        return path.join(
          realpathSync(path.dirname(absolutePath)),
          path.basename(absolutePath),
        );
      } catch (parentError) {
        if (isMissingFileError(parentError)) {
          return absolutePath;
        }

        throw parentError;
      }
    }

    throw error;
  }

  let realPath: string;

  try {
    realPath = realpathSync(absolutePath);
  } catch (error) {
    if (existingPathIsSymlink && isMissingFileError(error)) {
      throw new Error("Only .tex files can be edited", { cause: error });
    }

    throw error;
  }

  if (path.extname(realPath) !== ".tex") {
    throw new Error("Only .tex files can be edited");
  }

  return realPath;
}
