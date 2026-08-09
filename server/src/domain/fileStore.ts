import { randomUUID } from "node:crypto";
import fs, { type Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

import { resolveProjectPath, resolveProjectTexPath } from "./pathSafety.js";

interface FileIdentity {
  dev: number;
  ino: number;
}

interface LocationSnapshot {
  projectRoot: string;
  relativePath: string;
  destination: string;
  parentPath: string;
  parentRelativePath: string;
  parentIdentity: FileIdentity;
  destinationStats: Stats | undefined;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function outsideProjectRoot(): never {
  throw new Error("Requested path is outside project root");
}

function identityOf(stats: Stats): FileIdentity {
  return { dev: stats.dev, ino: stats.ino };
}

function hasIdentity(stats: Stats, identity: FileIdentity): boolean {
  return stats.dev === identity.dev && stats.ino === identity.ino;
}

async function lstatIfExists(filePath: string): Promise<Stats | undefined> {
  try {
    return await fs.promises.lstat(filePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function captureLocation(
  projectRoot: string,
  relativePath: string,
): Promise<LocationSnapshot> {
  const destination = resolveProjectTexPath(projectRoot, relativePath);
  const resolvedRoot = path.resolve(projectRoot);
  const parentPath = path.dirname(destination);
  const snapshot: LocationSnapshot = {
    projectRoot,
    relativePath,
    destination,
    parentPath,
    parentRelativePath: path.relative(resolvedRoot, parentPath),
    parentIdentity: identityOf(await fs.promises.stat(parentPath)),
    destinationStats: await lstatIfExists(destination),
  };

  await validateLocation(snapshot, snapshot.destinationStats);
  return snapshot;
}

async function validateParent(snapshot: LocationSnapshot): Promise<void> {
  const resolvedParent = resolveProjectPath(
    snapshot.projectRoot,
    snapshot.parentRelativePath,
  );

  if (resolvedParent !== snapshot.parentPath) {
    outsideProjectRoot();
  }

  const parentStats = await fs.promises.stat(snapshot.parentPath);

  if (!hasIdentity(parentStats, snapshot.parentIdentity)) {
    outsideProjectRoot();
  }
}

async function validateNamedIdentity(
  filePath: string,
  expected: FileIdentity | undefined,
): Promise<void> {
  const actual = await lstatIfExists(filePath);

  if (
    (actual === undefined) !== (expected === undefined) ||
    (actual !== undefined &&
      expected !== undefined &&
      !hasIdentity(actual, expected))
  ) {
    outsideProjectRoot();
  }
}

async function validateLocation(
  snapshot: LocationSnapshot,
  expectedDestination: Stats | FileIdentity | undefined,
): Promise<void> {
  resolveProjectTexPath(snapshot.projectRoot, snapshot.relativePath);
  await validateParent(snapshot);
  await validateNamedIdentity(
    snapshot.destination,
    expectedDestination === undefined
      ? undefined
      : "mode" in expectedDestination
        ? identityOf(expectedDestination)
        : expectedDestination,
  );
}

async function rejectChangedDestination(
  destination: string,
  cause?: unknown,
): Promise<never> {
  if ((await lstatIfExists(destination))?.isSymbolicLink() === true) {
    throw new Error("Only .tex files can be edited");
  }

  if (cause !== undefined) {
    throw cause instanceof Error
      ? cause
      : new Error("Unable to open tex file", { cause });
  }

  outsideProjectRoot();
}

async function closeFile(
  file: FileHandle | undefined,
): Promise<Error | undefined> {
  if (file === undefined) {
    return undefined;
  }

  try {
    await file.close();
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error
      : new Error("Unable to close temporary file", { cause: error });
  }
}

async function removeVerifiedTemporaryFile(
  temporaryFile: FileHandle | undefined,
  temporaryPath: string,
  temporaryIdentity: FileIdentity | undefined,
): Promise<void> {
  const cleanupError = await closeFile(temporaryFile);

  if (temporaryIdentity !== undefined) {
    const namedTemporaryFile = await lstatIfExists(temporaryPath);

    if (
      namedTemporaryFile !== undefined &&
      hasIdentity(namedTemporaryFile, temporaryIdentity)
    ) {
      try {
        await fs.promises.unlink(temporaryPath);
      } catch (error) {
        if (!isMissingFileError(error) && cleanupError === undefined) {
          throw error;
        }
      }
    }
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }
}

export async function readTexFile(
  projectRoot: string,
  relativePath: string,
): Promise<string> {
  const snapshot = await captureLocation(projectRoot, relativePath);
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  let file: FileHandle;

  try {
    file = await fs.promises.open(
      snapshot.destination,
      fs.constants.O_RDONLY | noFollow,
    );
  } catch (error) {
    return rejectChangedDestination(snapshot.destination, error);
  }

  try {
    if (snapshot.destinationStats === undefined) {
      outsideProjectRoot();
    }

    const expectedIdentity = identityOf(snapshot.destinationStats);

    if (!hasIdentity(await file.stat(), expectedIdentity)) {
      await rejectChangedDestination(snapshot.destination);
    }

    await validateLocation(snapshot, expectedIdentity);
    const content = await file.readFile("utf8");
    await validateLocation(snapshot, expectedIdentity);

    if (!hasIdentity(await file.stat(), expectedIdentity)) {
      await rejectChangedDestination(snapshot.destination);
    }

    return content;
  } finally {
    await file.close();
  }
}

export async function saveTexFileAtomically(
  projectRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const snapshot = await captureLocation(projectRoot, relativePath);
  const destinationMode = snapshot.destinationStats?.mode;
  const temporaryPath = path.join(
    snapshot.parentPath,
    `.${path.basename(snapshot.destination)}.${randomUUID()}.tmp`,
  );
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  let temporaryFile: FileHandle | undefined;
  let temporaryIdentity: FileIdentity | undefined;
  let renamePerformed = false;

  try {
    temporaryFile = await fs.promises.open(
      temporaryPath,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        noFollow,
      destinationMode ?? 0o666,
    );
    temporaryIdentity = identityOf(await temporaryFile.stat());
    await validateParent(snapshot);
    await validateNamedIdentity(temporaryPath, temporaryIdentity);
    await validateLocation(snapshot, snapshot.destinationStats);
    await temporaryFile.writeFile(content, "utf8");

    if (destinationMode !== undefined) {
      await temporaryFile.chmod(destinationMode & 0o7777);
    }

    await temporaryFile.sync();
    await validateParent(snapshot);
    await validateNamedIdentity(temporaryPath, temporaryIdentity);
    await validateLocation(snapshot, snapshot.destinationStats);
    await temporaryFile.close();
    temporaryFile = undefined;
    await validateParent(snapshot);
    await validateNamedIdentity(temporaryPath, temporaryIdentity);
    await validateLocation(snapshot, snapshot.destinationStats);
    await fs.promises.rename(temporaryPath, snapshot.destination);
    renamePerformed = true;
    await validateLocation(snapshot, temporaryIdentity);
  } finally {
    if (!renamePerformed) {
      await removeVerifiedTemporaryFile(
        temporaryFile,
        temporaryPath,
        temporaryIdentity,
      );
    }
  }
}
