import { readFile, writeFile } from "node:fs/promises";

import { resolveProjectTexPath } from "./pathSafety.js";

export async function readTexFile(
  projectRoot: string,
  relativePath: string,
): Promise<string> {
  const filePath = resolveProjectTexPath(projectRoot, relativePath);
  return readFile(filePath, "utf8");
}

export async function saveTexFile(
  projectRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = resolveProjectTexPath(projectRoot, relativePath);
  await writeFile(filePath, content, "utf8");
}
