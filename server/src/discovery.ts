import { readdir } from "node:fs/promises";
import path from "node:path";

import { EXCLUDED_DIRS, MAIN_PDF, MAIN_TEX } from "./config.js";
import { normalizeRelativePath } from "./pathSafety.js";

export interface ResumeInfo {
  name: string;
  dir: string;
  texPath: string;
  pdfPath: string;
}

export interface TexFileInfo {
  path: string;
  name: string;
  dir: string;
}

const collator = new Intl.Collator("zh-CN");

function sortByPath<T extends { path: string }>(items: T[]): T[] {
  return items.sort((left, right) => collator.compare(left.path, right.path));
}

function shouldSkipDirectory(dirName: string): boolean {
  return dirName.startsWith(".") || EXCLUDED_DIRS.has(dirName);
}

export async function discoverResumes(
  projectRoot: string
): Promise<ResumeInfo[]> {
  const resolvedRoot = path.resolve(projectRoot);
  const entries = await readdir(resolvedRoot, { withFileTypes: true });
  const resumes: ResumeInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) {
      continue;
    }

    const directoryPath = path.join(resolvedRoot, entry.name);
    const childEntries = await readdir(directoryPath, { withFileTypes: true });

    if (!childEntries.some((child) => child.isFile() && child.name === MAIN_TEX)) {
      continue;
    }

    const dir = normalizeRelativePath(resolvedRoot, directoryPath);

    resumes.push({
      name: entry.name,
      dir,
      texPath: `${dir}/${MAIN_TEX}`,
      pdfPath: `${dir}/${MAIN_PDF}`
    });
  }

  return resumes.sort((left, right) =>
    collator.compare(left.name, right.name) || collator.compare(left.dir, right.dir)
  );
}

export async function discoverTexFiles(
  projectRoot: string
): Promise<TexFileInfo[]> {
  const resolvedRoot = path.resolve(projectRoot);
  const files: TexFileInfo[] = [];

  async function walk(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      const childPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          await walk(childPath);
        }
        continue;
      }

      if (entry.isFile() && path.extname(entry.name) === ".tex") {
        const relativePath = normalizeRelativePath(resolvedRoot, childPath);
        const relativeDir = path.posix.dirname(relativePath);

        files.push({
          path: relativePath,
          name: entry.name,
          dir: relativeDir === "." ? "" : relativeDir
        });
      }
    }
  }

  await walk(resolvedRoot);

  return sortByPath(files);
}
