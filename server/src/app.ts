import express, { type ErrorRequestHandler, type Express } from "express";
import { access } from "node:fs/promises";
import path from "node:path";

import { CompileService } from "./domain/compiler.js";
import { discoverResumes, discoverTexFiles } from "./domain/discovery.js";
import { readTexFile, saveTexFileAtomically } from "./domain/fileStore.js";
import { resolveProjectPath } from "./domain/pathSafety.js";
import { lookupSynctex } from "./domain/synctex.js";
import type { CommandRunner } from "./process/runCommand.js";

interface AppOptions {
  projectRoot: string;
  entryFiles?: readonly string[];
  latexCommand?: string;
  synctexCommand?: string;
  commandRunner?: CommandRunner;
}

const defaultEntryFiles = ["resume.tex", "main.tex", "简历.tex"];

interface HttpErrorBody {
  status: number;
  error: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

function isUnsafePathError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message === "Requested path is outside project root" ||
    message === "Only .tex files can be edited"
  );
}

function readFileError(error: unknown): HttpErrorBody {
  if (errorCode(error) === "ENOENT") {
    return { status: 404, error: "File not found" };
  }

  if (isUnsafePathError(error)) {
    return { status: 400, error: errorMessage(error) };
  }

  return { status: 400, error: "Unable to read file" };
}

function saveFileError(error: unknown): HttpErrorBody {
  if (isUnsafePathError(error)) {
    return { status: 400, error: errorMessage(error) };
  }

  return { status: 400, error: "Unable to save file" };
}

function compileError(error: unknown): HttpErrorBody {
  if (isUnsafePathError(error)) {
    return { status: 400, error: errorMessage(error) };
  }

  return { status: 400, error: "Unable to compile resume" };
}

function pdfError(error: unknown): HttpErrorBody {
  if (errorCode(error) === "ENOENT") {
    return { status: 404, error: "PDF not found" };
  }

  if (errorMessage(error) === "Requested path is outside project root") {
    return { status: 400, error: "Invalid PDF path" };
  }

  return { status: 400, error: "Unable to read PDF" };
}

function isFileBody(body: unknown): body is { path: string; content: string } {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const candidate = body as { path?: unknown; content?: unknown };
  return (
    typeof candidate.path === "string" && typeof candidate.content === "string"
  );
}

function isCompileBody(body: unknown): body is {
  resumeDir: string;
  currentFile?: { path: string; content: string };
} {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const candidate = body as { resumeDir?: unknown; currentFile?: unknown };

  if (typeof candidate.resumeDir !== "string") {
    return false;
  }

  return (
    candidate.currentFile === undefined || isFileBody(candidate.currentFile)
  );
}

function isSynctexBody(
  body: unknown,
): body is { resumeDir: string; page: number; x: number; y: number } {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const candidate = body as {
    resumeDir?: unknown;
    page?: unknown;
    x?: unknown;
    y?: unknown;
  };

  return (
    typeof candidate.resumeDir === "string" &&
    typeof candidate.page === "number" &&
    Number.isInteger(candidate.page) &&
    candidate.page >= 1 &&
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    candidate.x >= 0 &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    candidate.y >= 0
  );
}

const jsonParser = express.json({ limit: "1mb" });

const jsonErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  const details =
    typeof error === "object" && error !== null ? error : undefined;
  const status =
    details !== undefined &&
    "status" in details &&
    typeof details.status === "number"
      ? details.status
      : undefined;
  const type =
    details !== undefined &&
    "type" in details &&
    typeof details.type === "string"
      ? details.type
      : undefined;

  if (status === 413 || type === "entity.too.large") {
    response.status(413).json({ error: "Request body too large" });
    return;
  }

  if (status === 400 || error instanceof SyntaxError) {
    response.status(400).json({ error: "Malformed JSON" });
    return;
  }

  next(error);
};

const fallbackErrorHandler: ErrorRequestHandler = (
  _error,
  _request,
  response,
  _next,
) => {
  void _next;
  response.status(500).json({ error: "Internal server error" });
};

export function createApp(options: AppOptions): Express {
  const app = express();
  const entryFiles = options.entryFiles ?? defaultEntryFiles;
  const compiler = new CompileService({
    projectRoot: options.projectRoot,
    latexCommand: options.latexCommand ?? "xelatex",
    ...(options.commandRunner === undefined
      ? {}
      : { runner: options.commandRunner }),
  });

  async function findResume(resumeDir: string) {
    resolveProjectPath(options.projectRoot, resumeDir);
    const resumes = await discoverResumes(options.projectRoot, entryFiles);
    return resumes.find((resume) => resume.dir === resumeDir);
  }

  app.use(jsonParser);

  app.get("/api/project", async (_request, response, next) => {
    try {
      const [resumes, texFiles] = await Promise.all([
        discoverResumes(options.projectRoot, entryFiles),
        discoverTexFiles(options.projectRoot),
      ]);

      response.json({ resumes, texFiles });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/file", async (request, response) => {
    const requestedPath = request.query.path;

    if (typeof requestedPath !== "string") {
      response.status(400).json({ error: "Invalid file path" });
      return;
    }

    try {
      const content = await readTexFile(options.projectRoot, requestedPath);
      response.json({ path: requestedPath, content });
    } catch (error) {
      const responseBody = readFileError(error);
      response.status(responseBody.status).json({ error: responseBody.error });
    }
  });

  app.put("/api/file", async (request, response) => {
    if (!isFileBody(request.body)) {
      response.status(400).json({ error: "Invalid save body" });
      return;
    }

    try {
      await saveTexFileAtomically(
        options.projectRoot,
        request.body.path,
        request.body.content,
      );
      response.json({ ok: true });
    } catch (error) {
      const responseBody = saveFileError(error);
      response.status(responseBody.status).json({ error: responseBody.error });
    }
  });

  app.post("/api/compile", async (request, response) => {
    if (!isCompileBody(request.body)) {
      response.status(400).json({ error: "Invalid compile body" });
      return;
    }

    try {
      if (request.body.currentFile !== undefined) {
        await saveTexFileAtomically(
          options.projectRoot,
          request.body.currentFile.path,
          request.body.currentFile.content,
        );
      }

      const resume = await findResume(request.body.resumeDir);
      if (resume === undefined) {
        throw new Error("Resume not found");
      }
      const result = await compiler.compile(resume);
      response.json(result);
    } catch (error) {
      const responseBody = compileError(error);
      response.status(responseBody.status).json({ error: responseBody.error });
    }
  });

  app.post("/api/synctex", async (request, response) => {
    if (!isSynctexBody(request.body)) {
      response.status(400).json({ error: "Invalid synctex body" });
      return;
    }

    try {
      const resume = await findResume(request.body.resumeDir);
      if (resume === undefined) {
        throw new Error("Resume not found");
      }
      const result = await lookupSynctex({
        projectRoot: options.projectRoot,
        synctexCommand: options.synctexCommand ?? "synctex",
        resume,
        page: request.body.page,
        x: request.body.x,
        y: request.body.y,
        ...(options.commandRunner === undefined
          ? {}
          : { runner: options.commandRunner }),
      });
      response.json(result);
    } catch (error) {
      if (errorMessage(error) === "Requested path is outside project root") {
        response.status(400).json({ error: "Invalid synctex path" });
        return;
      }

      response.status(400).json({ error: "Unable to run synctex lookup" });
    }
  });

  app.get("/api/pdf", async (request, response) => {
    const requestedPath = request.query.path;

    if (typeof requestedPath !== "string") {
      response.status(400).json({ error: "Invalid PDF path" });
      return;
    }

    let pdfPath: string;

    try {
      pdfPath = resolveProjectPath(options.projectRoot, requestedPath);

      if (path.extname(pdfPath) !== ".pdf") {
        response.status(400).json({ error: "Invalid PDF path" });
        return;
      }

      await access(pdfPath);
    } catch (error) {
      const responseBody = pdfError(error);
      response.status(responseBody.status).json({ error: responseBody.error });
      return;
    }

    response.type("application/pdf");
    response.sendFile(pdfPath);
  });

  app.use(jsonErrorHandler);
  app.use(fallbackErrorHandler);

  return app;
}
