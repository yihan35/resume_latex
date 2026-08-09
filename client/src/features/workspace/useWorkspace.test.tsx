import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "../../lib/apiClient";
import { useWorkspace } from "./useWorkspace";

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

describe("useWorkspace", () => {
  it("saves a dirty draft before compiling the selected resume", async () => {
    const events: string[] = [];
    const api: ApiClient = {
      getProject: vi.fn(async () => project),
      getFile: vi.fn(async () => ({
        path: "backend/main.tex",
        content: "saved",
      })),
      saveFile: vi.fn(async (input) => {
        events.push(`save:${input.content}`);
        return { ok: true as const };
      }),
      compile: vi.fn(async (input) => {
        events.push(`compile:${input.resumeId}`);
        return {
          ok: true,
          elapsedMs: 1,
          pdfPath: "backend/new.pdf",
          logSummary: "",
          stdout: "",
          stderr: "",
        };
      }),
      lookupSynctex: vi.fn(),
    };
    const { result } = renderHook(() => useWorkspace({ api }));

    await waitFor(() => expect(result.current.state.fileState).toBe("ready"));
    act(() => result.current.editCurrentFile("changed"));
    await act(async () => {
      await result.current.compileSelectedResume();
    });

    expect(events).toEqual(["save:changed", "compile:backend"]);
    expect(result.current.state.drafts["backend/main.tex"]).toMatchObject({
      savedContent: "changed",
      saveState: "idle",
    });
    expect(result.current.state).toMatchObject({
      compileState: "success",
      pdfVersion: 1,
      compileResult: { pdfPath: "backend/new.pdf" },
    });
  });

  it("does not apply a file completion after that request is aborted", async () => {
    const resolveFiles: Array<
      (value: { path: string; content: string }) => void
    > = [];
    const getFile = vi.fn(
      () =>
        new Promise<{ path: string; content: string }>((resolve) => {
          resolveFiles.push(resolve);
        }),
    );
    const api: ApiClient = {
      getProject: vi.fn(async () => project),
      getFile,
      saveFile: vi.fn(),
      compile: vi.fn(),
      lookupSynctex: vi.fn(),
    };
    const { result } = renderHook(() => useWorkspace({ api }));

    await waitFor(() => expect(getFile).toHaveBeenCalledTimes(1));
    act(() => {
      void result.current.selectFile("other.tex");
    });
    act(() => resolveFiles[0]!({ path: "backend/main.tex", content: "late" }));

    await waitFor(() =>
      expect(result.current.state.selectedTexPath).toBe("other.tex"),
    );
    expect(result.current.state.drafts["backend/main.tex"]).toBeUndefined();
  });
});
