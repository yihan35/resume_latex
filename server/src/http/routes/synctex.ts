import { Router } from "express";

import type { ResumeInfo } from "../../../../shared/contracts.js";
import { lookupSynctex } from "../../domain/synctex.js";
import type { CommandRunner } from "../../process/runCommand.js";
import { ApiError, errorCode, isUnsafePathError } from "../apiError.js";
import { isSynctexRequest } from "../validation.js";

function synctexError(error: unknown): ApiError {
  if (isUnsafePathError(error)) {
    return new ApiError(400, "UNSAFE_PATH", "Invalid SyncTeX path", {
      cause: error,
    });
  }
  if (errorCode(error) === "SYNCTEX_NOT_FOUND") {
    return new ApiError(
      503,
      "SYNCTEX_NOT_FOUND",
      "SyncTeX command was not found",
      { cause: error },
    );
  }
  return new ApiError(500, "INTERNAL_ERROR", "Internal server error", {
    cause: error,
  });
}

export function createSynctexRouter(options: {
  projectRoot: string;
  synctexCommand: string;
  commandRunner?: CommandRunner;
  findResume: (id: string) => Promise<ResumeInfo | undefined>;
}): Router {
  const router = Router();

  router.post("/api/synctex", async (request, response) => {
    if (!isSynctexRequest(request.body)) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid SyncTeX request");
    }
    const resume = await options.findResume(request.body.resumeId);
    if (resume === undefined) {
      throw new ApiError(404, "FILE_NOT_FOUND", "Resume not found");
    }

    try {
      response.json(
        await lookupSynctex({
          projectRoot: options.projectRoot,
          synctexCommand: options.synctexCommand,
          resume,
          page: request.body.page,
          x: request.body.x,
          y: request.body.y,
          ...(options.commandRunner === undefined
            ? {}
            : { runner: options.commandRunner }),
        }),
      );
    } catch (error) {
      throw synctexError(error);
    }
  });

  return router;
}
