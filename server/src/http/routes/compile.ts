import { Router } from "express";

import type { ResumeInfo } from "../../../../shared/contracts.js";
import type { CompileService } from "../../domain/compiler.js";
import { ApiError, errorCode } from "../apiError.js";
import { isCompileRequest } from "../validation.js";

function compileError(error: unknown): ApiError {
  if (errorCode(error) === "COMPILE_BUSY") {
    return new ApiError(409, "COMPILE_BUSY", "Resume is already compiling", {
      cause: error,
    });
  }
  if (errorCode(error) === "LATEX_NOT_FOUND") {
    return new ApiError(503, "LATEX_NOT_FOUND", "LaTeX command was not found", {
      cause: error,
    });
  }
  return new ApiError(500, "INTERNAL_ERROR", "Internal server error", {
    cause: error,
  });
}

export function createCompileRouter(options: {
  findResume: (id: string) => Promise<ResumeInfo | undefined>;
  compiler: Pick<CompileService, "compile">;
}): Router {
  const router = Router();

  router.post("/api/compile", async (request, response) => {
    if (!isCompileRequest(request.body)) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid compile request");
    }

    const resume = await options.findResume(request.body.resumeId);
    if (resume === undefined) {
      throw new ApiError(404, "FILE_NOT_FOUND", "Resume not found");
    }

    try {
      response.json(await options.compiler.compile(resume));
    } catch (error) {
      throw compileError(error);
    }
  });

  return router;
}
