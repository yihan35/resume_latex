import path from "node:path";

export const PROJECT_ROOT = path.resolve(
  process.env.RESUME_PROJECT_ROOT ?? path.join(process.cwd(), "..")
);

export const SERVER_PORT = Number.parseInt(
  process.env.RESUME_EDITOR_PORT ?? "43871",
  10
);

export const MAIN_TEX = "简历.tex";
export const MAIN_PDF = "简历.pdf";
export const EXCLUDED_DIRS = new Set([
  ".git",
  ".superpowers",
  "build",
  "node_modules",
  "dist",
  "dist-server",
  "out",
  "output"
]);
