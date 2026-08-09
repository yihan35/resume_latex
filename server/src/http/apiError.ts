import type {
  ApiErrorCode,
  ApiErrorResponse,
} from "../../../shared/contracts.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

export function toApiErrorResponse(error: unknown): ApiErrorResponse {
  if (error instanceof ApiError) {
    return { error: { code: error.code, message: error.message } };
  }

  return {
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  };
}

export function errorStatus(error: unknown): number {
  return error instanceof ApiError ? error.status : 500;
}

export function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

export function isUnsafePathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Requested path is outside project root" ||
      error.message === "Only .tex files can be edited" ||
      error.message === "Only .tex files can be compiled" ||
      error.message === "Invalid PDF path")
  );
}
