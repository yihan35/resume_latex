import { describe, expect, it } from "vitest";

import { initialWorkspaceState, workspaceReducer } from "./reducer";

const project = {
  resumes: [
    {
      id: "backend",
      name: "Backend",
      dir: "backend",
      entryPath: "backend/main.tex",
      pdfPath: "backend/main.pdf",
    },
  ],
  texFiles: [{ path: "backend/main.tex", name: "main.tex", dir: "backend" }],
};

describe("workspaceReducer", () => {
  it("keeps edits dirty while switching between loaded drafts", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "fileRequested",
      requestId: 1,
      path: "one.tex",
    });
    state = workspaceReducer(state, {
      type: "fileLoaded",
      requestId: 1,
      path: "one.tex",
      content: "one",
    });
    state = workspaceReducer(state, {
      type: "editCurrentFile",
      content: "one edited",
    });
    state = workspaceReducer(state, {
      type: "fileRequested",
      requestId: 2,
      path: "two.tex",
    });
    state = workspaceReducer(state, {
      type: "fileLoaded",
      requestId: 2,
      path: "two.tex",
      content: "two",
    });
    state = workspaceReducer(state, {
      type: "fileRequested",
      requestId: 3,
      path: "one.tex",
    });
    state = workspaceReducer(state, {
      type: "fileLoaded",
      requestId: 3,
      path: "one.tex",
      content: "one server copy",
    });

    expect(state.drafts["one.tex"]).toMatchObject({
      content: "one edited",
      savedContent: "one",
    });
    expect(state.drafts["two.tex"]).toMatchObject({
      content: "two",
      savedContent: "two",
    });
  });

  it("marks a saved draft clean but retains failed content", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "fileRequested",
      requestId: 1,
      path: "main.tex",
    });
    state = workspaceReducer(state, {
      type: "fileLoaded",
      requestId: 1,
      path: "main.tex",
      content: "saved",
    });
    state = workspaceReducer(state, {
      type: "editCurrentFile",
      content: "changed",
    });
    state = workspaceReducer(state, {
      type: "saveStarted",
      path: "main.tex",
      requestId: 1,
    });
    state = workspaceReducer(state, {
      type: "saveFailed",
      path: "main.tex",
      requestId: 1,
      error: "offline",
    });

    expect(state.drafts["main.tex"]).toMatchObject({
      content: "changed",
      savedContent: "saved",
      saveState: "error",
    });
    state = workspaceReducer(state, {
      type: "saveStarted",
      path: "main.tex",
      requestId: 2,
    });
    state = workspaceReducer(state, {
      type: "saveSucceeded",
      path: "main.tex",
      requestId: 2,
    });
    expect(state.drafts["main.tex"]).toMatchObject({
      content: "changed",
      savedContent: "changed",
      saveState: "idle",
    });
  });

  it("ignores stale completions and preserves the prior preview after a failed compile", () => {
    let state = workspaceReducer(initialWorkspaceState, {
      type: "compileStarted",
      requestId: 2,
    });
    state = workspaceReducer(state, {
      type: "compileSucceeded",
      requestId: 1,
      result: {
        ok: true,
        elapsedMs: 1,
        pdfPath: "old.pdf",
        logSummary: "old",
        stdout: "",
        stderr: "",
      },
    });
    expect(state.compileState).toBe("compiling");
    state = workspaceReducer(state, {
      type: "compileSucceeded",
      requestId: 2,
      result: {
        ok: true,
        elapsedMs: 2,
        pdfPath: "new.pdf",
        logSummary: "new",
        stdout: "",
        stderr: "",
      },
    });
    state = workspaceReducer(state, { type: "compileStarted", requestId: 3 });
    state = workspaceReducer(state, {
      type: "compileSucceeded",
      requestId: 3,
      result: {
        ok: false,
        elapsedMs: 3,
        pdfPath: "bad.pdf",
        logSummary: "bad",
        stdout: "",
        stderr: "",
      },
    });

    expect(state).toMatchObject({
      compileState: "error",
      pdfVersion: 1,
      compileResult: { pdfPath: "new.pdf" },
    });
  });

  it("clears compile and navigation state when a project is loaded", () => {
    const state = workspaceReducer(
      {
        ...initialWorkspaceState,
        compileState: "success",
        compileResult: {
          ok: true,
          elapsedMs: 1,
          pdfPath: "old.pdf",
          logSummary: "",
          stdout: "",
          stderr: "",
        },
        targetLine: 7,
        selectedTexPath: "old.tex",
        activityMessage: "old",
      },
      { type: "projectLoaded", requestId: 0, project },
    );

    expect(state).toMatchObject({
      project,
      projectState: "ready",
      selectedResumeId: "backend",
      selectedTexPath: null,
      compileState: "idle",
      compileResult: null,
      targetLine: null,
    });
  });
});
