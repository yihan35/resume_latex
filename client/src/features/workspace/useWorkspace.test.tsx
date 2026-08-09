import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "../../lib/apiClient";
import { selectCanSave } from "./selectors";
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

const projectWithTwoResumes = {
  resumes: [
    ...project.resumes,
    {
      id: "data",
      name: "Data",
      dir: "data",
      entryPath: "data/main.tex",
      pdfPath: "data/main.pdf",
    },
  ],
  texFiles: [
    ...project.texFiles,
    { path: "backend/other.tex", name: "other.tex", dir: "backend" },
    { path: "data/main.tex", name: "main.tex", dir: "data" },
  ],
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

  it("does not compile the old resume when selection changes while its dirty save is pending", async () => {
    let resolveSave!: () => void;
    const compile = vi.fn(async () => ({
      ok: true,
      elapsedMs: 1,
      pdfPath: "backend/main.pdf",
      logSummary: "",
      stdout: "",
      stderr: "",
    }));
    const api: ApiClient = {
      getProject: vi.fn(async () => projectWithTwoResumes),
      getFile: vi.fn(async (path) => ({ path, content: "saved" })),
      saveFile: vi.fn(
        () =>
          new Promise<{ ok: true }>((resolve) => {
            resolveSave = () => resolve({ ok: true });
          }),
      ),
      compile,
      lookupSynctex: vi.fn(),
    };
    const { result } = renderHook(() => useWorkspace({ api }));

    await waitFor(() => expect(result.current.state.fileState).toBe("ready"));
    act(() => result.current.editCurrentFile("changed"));
    act(() => {
      void result.current.compileSelectedResume();
      void result.current.selectResume("data");
    });
    act(() => resolveSave());

    await waitFor(() =>
      expect(result.current.state.selectedResumeId).toBe("data"),
    );
    expect(compile).not.toHaveBeenCalled();
  });

  it("ignores a SyncTeX result when another file in the same resume is selected", async () => {
    let resolveSynctex!: (value: {
      found: true;
      file: string;
      line: number;
    }) => void;
    const getFile = vi.fn(async (path: string) => ({ path, content: path }));
    const api: ApiClient = {
      getProject: vi.fn(async () => projectWithTwoResumes),
      getFile,
      saveFile: vi.fn(),
      compile: vi.fn(),
      lookupSynctex: vi.fn(
        () =>
          new Promise<{ found: true; file: string; line: number }>(
            (resolve) => {
              resolveSynctex = resolve;
            },
          ),
      ),
    };
    const { result } = renderHook(() => useWorkspace({ api }));

    await waitFor(() => expect(result.current.state.fileState).toBe("ready"));
    act(() => {
      void result.current.lookupSource(1, 10, 10);
      void result.current.selectFile("backend/other.tex");
    });
    act(() =>
      resolveSynctex({ found: true, file: "backend/main.tex", line: 9 }),
    );

    await waitFor(() => expect(getFile).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.state.selectedTexPath).toBe("backend/other.tex"),
    );
  });

  it("returns an aborted first draft save to dirty idle while the next draft saves", async () => {
    let resolveSecondSave!: () => void;
    const api: ApiClient = {
      getProject: vi.fn(async () => projectWithTwoResumes),
      getFile: vi.fn(async (path) => ({ path, content: "saved" })),
      saveFile: vi.fn((input, signal) => {
        if (input.path === "backend/main.tex") {
          return new Promise<never>((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        }
        return new Promise<{ ok: true }>((resolve) => {
          resolveSecondSave = () => resolve({ ok: true });
        });
      }),
      compile: vi.fn(),
      lookupSynctex: vi.fn(),
    };
    const { result } = renderHook(() => useWorkspace({ api }));

    await waitFor(() => expect(result.current.state.fileState).toBe("ready"));
    act(() => {
      result.current.editCurrentFile("first change");
      void result.current.saveCurrentFile();
      void result.current.selectFile("backend/other.tex");
    });
    await waitFor(() =>
      expect(result.current.state.selectedTexPath).toBe("backend/other.tex"),
    );
    act(() => {
      result.current.editCurrentFile("second change");
      void result.current.saveCurrentFile();
    });

    await waitFor(() =>
      expect(result.current.state.drafts["backend/main.tex"]?.saveState).toBe(
        "idle",
      ),
    );
    await act(async () => {
      await result.current.selectFile("backend/main.tex");
    });
    expect(selectCanSave(result.current.state)).toBe(true);

    act(() => resolveSecondSave());
    await waitFor(() =>
      expect(
        result.current.state.drafts["backend/other.tex"]?.savedContent,
      ).toBe("second change"),
    );
  });
});
