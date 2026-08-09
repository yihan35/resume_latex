import { describe, expect, it } from "vitest";

import { ApiError, toApiErrorResponse } from "./apiError.js";

describe("ApiError", () => {
  it("serializes public status code and message", () => {
    const error = new ApiError(400, "INVALID_REQUEST", "Invalid request");

    expect(toApiErrorResponse(error)).toEqual({
      error: { code: "INVALID_REQUEST", message: "Invalid request" },
    });
    expect(error.status).toBe(400);
  });

  it("hides unknown errors behind the internal error envelope", () => {
    expect(
      toApiErrorResponse(new Error("/tmp/private-project failed")),
    ).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });
});
