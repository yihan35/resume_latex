import express, { type ErrorRequestHandler, type Express } from "express";
import { access } from "node:fs/promises";
import path from "node:path";

import { createCompileRouter } from "./http/routes/compile.js";
import { createFilesRouter } from "./http/routes/files.js";
import { createHealthRouter } from "./http/routes/health.js";
import { createPdfRouter } from "./http/routes/pdf.js";
import { createProjectRouter } from "./http/routes/project.js";
import { createSynctexRouter } from "./http/routes/synctex.js";
import { ApiError, errorStatus, toApiErrorResponse } from "./http/apiError.js";
import type { AppConfig } from "./config/appConfig.js";
import { CompileService } from "./domain/compiler.js";
import { discoverResumes } from "./domain/discovery.js";
import type { CommandRunner } from "./process/runCommand.js";

export interface AppDependencies {
  config: AppConfig;
  compiler?: CompileService;
  commandRunner?: CommandRunner;
  staticDir?: string;
}

function parserError(error: unknown): ApiError | undefined {
  const details =
    typeof error === "object" && error !== null
      ? (error as { status?: unknown; type?: unknown })
      : undefined;
  if (details?.status === 413 || details?.type === "entity.too.large") {
    return new ApiError(413, "INVALID_REQUEST", "Request body too large", {
      cause: error,
    });
  }
  if (details?.type === "entity.parse.failed" || error instanceof SyntaxError) {
    return new ApiError(400, "INVALID_REQUEST", "Malformed JSON", {
      cause: error,
    });
  }
  return undefined;
}

function createFindResume(config: AppConfig) {
  return async (id: string) => {
    const resumes = await discoverResumes(
      config.projectRoot,
      config.entryFiles,
    );
    return resumes.find((resume) => resume.id === id);
  };
}

function createCompiler(dependencies: AppDependencies): CompileService {
  return (
    dependencies.compiler ??
    new CompileService({
      projectRoot: dependencies.config.projectRoot,
      latexCommand: dependencies.config.latexCommand,
      ...(dependencies.commandRunner === undefined
        ? {}
        : { runner: dependencies.commandRunner }),
    })
  );
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  const { config } = dependencies;
  const findResume = createFindResume(config);
  const compiler = createCompiler(dependencies);

  app.use(express.json({ limit: "1mb" }));
  app.use(
    createHealthRouter({
      latexCommand: config.latexCommand,
      synctexCommand: config.synctexCommand,
    }),
  );
  app.use(
    createProjectRouter({
      projectRoot: config.projectRoot,
      entryFiles: config.entryFiles,
    }),
  );
  app.use(createFilesRouter({ projectRoot: config.projectRoot }));
  app.use(createCompileRouter({ findResume, compiler }));
  app.use(createPdfRouter({ projectRoot: config.projectRoot, findResume }));
  app.use(
    createSynctexRouter({
      projectRoot: config.projectRoot,
      synctexCommand: config.synctexCommand,
      findResume,
      ...(dependencies.commandRunner === undefined
        ? {}
        : { commandRunner: dependencies.commandRunner }),
    }),
  );
  app.use("/api", (_request, response) => {
    response.status(404).json({
      error: { code: "INVALID_REQUEST", message: "API route not found" },
    });
  });

  if (dependencies.staticDir !== undefined) {
    const staticDir = path.resolve(dependencies.staticDir);
    app.use(express.static(staticDir));
    app.get("/{*splat}", async (_request, response, next) => {
      const indexPath = path.join(staticDir, "index.html");
      try {
        await access(indexPath);
        response.sendFile(indexPath, (error) => {
          if (error !== undefined) next(error);
        });
      } catch (error) {
        next(error);
      }
    });
  }

  const jsonParserErrors: ErrorRequestHandler = (
    error,
    _request,
    _response,
    next,
  ) => {
    next(parserError(error) ?? error);
  };
  app.use(jsonParserErrors);
  app.use(((error, _request, response, _next) => {
    void _next;
    response.status(errorStatus(error)).json(toApiErrorResponse(error));
  }) satisfies ErrorRequestHandler);

  return app;
}
