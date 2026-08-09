import { Router } from "express";

import { readTexFile, saveTexFileAtomically } from "../../domain/fileStore.js";
import { ApiError, errorCode, isUnsafePathError } from "../apiError.js";
import { isSaveFileRequest } from "../validation.js";

function fileError(error: unknown): ApiError {
  if (isUnsafePathError(error)) {
    return new ApiError(400, "UNSAFE_PATH", "Invalid file path", {
      cause: error,
    });
  }
  if (errorCode(error) === "ENOENT") {
    return new ApiError(404, "FILE_NOT_FOUND", "File not found", {
      cause: error,
    });
  }
  return new ApiError(500, "INTERNAL_ERROR", "Internal server error", {
    cause: error,
  });
}

export function createFilesRouter(options: { projectRoot: string }): Router {
  const router = Router();

  router.get("/api/file", async (request, response) => {
    const requestedPath = request.query.path;
    if (typeof requestedPath !== "string") {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid file path");
    }

    try {
      const content = await readTexFile(options.projectRoot, requestedPath);
      response.json({ path: requestedPath, content });
    } catch (error) {
      throw fileError(error);
    }
  });

  router.put("/api/file", async (request, response) => {
    if (!isSaveFileRequest(request.body)) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid save request");
    }

    try {
      await saveTexFileAtomically(
        options.projectRoot,
        request.body.path,
        request.body.content,
      );
      response.json({ ok: true });
    } catch (error) {
      throw fileError(error);
    }
  });

  return router;
}
