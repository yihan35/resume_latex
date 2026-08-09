import { randomUUID } from "node:crypto";
import fs from "node:fs";
import {
  open,
  readFile,
  stat,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

import { resolveProjectTexPath } from "./pathSafety.js";

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function existingMode(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).mode & 0o7777;
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function removeTemporaryFile(
  temporaryFile: FileHandle | undefined,
  temporaryPath: string,
): Promise<void> {
  let cleanupError: Error | undefined;

  if (temporaryFile !== undefined) {
    try {
      await temporaryFile.close();
    } catch (error) {
      cleanupError =
        error instanceof Error
          ? error
          : new Error("Unable to close temporary file", { cause: error });
    }
  }

  try {
    await unlink(temporaryPath);
  } catch (error) {
    if (!isMissingFileError(error) && cleanupError === undefined) {
      cleanupError =
        error instanceof Error
          ? error
          : new Error("Unable to remove temporary file", { cause: error });
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
  const filePath = resolveProjectTexPath(projectRoot, relativePath);
  return readFile(filePath, "utf8");
}

export async function saveTexFileAtomically(
  projectRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const destination = resolveProjectTexPath(projectRoot, relativePath);
  const destinationMode = await existingMode(destination);
  const temporaryPath = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );
  let temporaryFile: FileHandle | undefined;
  let renameCompleted = false;

  try {
    temporaryFile = await open(temporaryPath, "wx", destinationMode ?? 0o666);
    await temporaryFile.writeFile(content, "utf8");

    if (destinationMode !== undefined) {
      await temporaryFile.chmod(destinationMode);
    }

    await temporaryFile.sync();
    await temporaryFile.close();
    temporaryFile = undefined;
    await fs.promises.rename(temporaryPath, destination);
    renameCompleted = true;
  } finally {
    if (!renameCompleted) {
      await removeTemporaryFile(temporaryFile, temporaryPath);
    }
  }
}
