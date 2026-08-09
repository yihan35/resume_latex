import { readdir } from "node:fs/promises";
import path from "node:path";

import type { ResumeInfo, TexFileInfo } from "../../../shared/contracts.js";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "build",
  "coverage",
  "dist",
  "dist-server",
  "out",
  "output",
]);
const collator = new Intl.Collator("zh-CN");

function toRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith(".") || EXCLUDED_DIRS.has(name);
}

export async function discoverResumes(
  projectRoot: string,
  entryFiles: readonly string[],
): Promise<ResumeInfo[]> {
  const resolvedRoot = path.resolve(projectRoot);
  const entries = await readdir(resolvedRoot, { withFileTypes: true });
  const resumes: ResumeInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) {
      continue;
    }

    const directoryPath = path.join(resolvedRoot, entry.name);
    const children = await readdir(directoryPath, { withFileTypes: true });
    const childNames = new Set(
      children.filter((child) => child.isFile()).map((child) => child.name),
    );
    const entryFile = entryFiles.find((candidate) => childNames.has(candidate));

    if (entryFile === undefined) {
      continue;
    }

    const dir = toRelativePath(resolvedRoot, directoryPath);
    const entryPath = `${dir}/${entryFile}`;
    const extension = path.extname(entryFile);
    const pdfName = `${entryFile.slice(0, -extension.length)}.pdf`;

    resumes.push({
      id: dir,
      name: entry.name,
      dir,
      entryPath,
      pdfPath: `${dir}/${pdfName}`,
    });
  }

  return resumes.sort(
    (left, right) =>
      collator.compare(left.name, right.name) ||
      collator.compare(left.dir, right.dir),
  );
}

export async function discoverTexFiles(
  projectRoot: string,
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
        const relativePath = toRelativePath(resolvedRoot, childPath);
        const dir = path.posix.dirname(relativePath);
        files.push({
          path: relativePath,
          name: entry.name,
          dir: dir === "." ? "" : dir,
        });
      }
    }
  }

  await walk(resolvedRoot);

  return files.sort((left, right) => collator.compare(left.path, right.path));
}
