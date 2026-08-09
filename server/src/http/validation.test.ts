import { describe, expect, it } from "vitest";

import {
  isCompileRequest,
  isSaveFileRequest,
  isSynctexRequest,
} from "./validation.js";

describe("request validation", () => {
  it("accepts only the exact save request shape", () => {
    expect(
      isSaveFileRequest({ path: "sample/resume.tex", content: "% hi" }),
    ).toBe(true);
    expect(
      isSaveFileRequest({
        path: "sample/resume.tex",
        content: "% hi",
        unexpected: true,
      }),
    ).toBe(false);
  });

  it("accepts only a resume id for compile requests", () => {
    expect(isCompileRequest({ resumeId: "sample" })).toBe(true);
    expect(isCompileRequest({ resumeDir: "sample" })).toBe(false);
  });

  it("requires exact SyncTeX keys and finite coordinates", () => {
    expect(
      isSynctexRequest({ resumeId: "sample", page: 1, x: 4.5, y: 8 }),
    ).toBe(true);
    expect(
      isSynctexRequest({ resumeId: "sample", page: 1, x: Infinity, y: 8 }),
    ).toBe(false);
    expect(
      isSynctexRequest({
        resumeId: "sample",
        page: 1,
        x: 4,
        y: 8,
        extra: true,
      }),
    ).toBe(false);
  });
});
