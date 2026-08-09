import { access } from "node:fs/promises";
import { Router } from "express";

import type { ResumeInfo } from "../../../../shared/contracts.js";
import { resolveProjectPath } from "../../domain/pathSafety.js";
import { ApiError, errorCode, isUnsafePathError } from "../apiError.js";

function pdfError(error: unknown): ApiError {
  if (isUnsafePathError(error)) {
    return new ApiError(400, "UNSAFE_PATH", "Invalid PDF path", {
      cause: error,
    });
  }
  if (errorCode(error) === "ENOENT") {
    return new ApiError(404, "FILE_NOT_FOUND", "PDF not found", {
      cause: error,
    });
  }
  return new ApiError(500, "INTERNAL_ERROR", "Internal server error", {
    cause: error,
  });
}

export function createPdfRouter(options: {
  projectRoot: string;
  findResume: (id: string) => Promise<ResumeInfo | undefined>;
}): Router {
  const router = Router();

  router.get("/api/pdf", async (request, response, next) => {
    const resumeId = request.query.resumeId;
    if (typeof resumeId !== "string" || resumeId.length === 0) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid resume id");
    }
    const resume = await options.findResume(resumeId);
    if (resume === undefined) {
      throw new ApiError(404, "FILE_NOT_FOUND", "Resume not found");
    }

    try {
      const pdfPath = resolveProjectPath(options.projectRoot, resume.pdfPath);
      await access(pdfPath);
      response.type("application/pdf");
      response.sendFile(
        resume.pdfPath,
        { root: options.projectRoot, dotfiles: "deny" },
        (error) => {
          if (error !== undefined) next(pdfError(error));
        },
      );
    } catch (error) {
      throw pdfError(error);
    }
  });

  return router;
}
