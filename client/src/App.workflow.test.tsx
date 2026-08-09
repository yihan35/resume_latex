import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("@monaco-editor/react", () => ({
  default: ({
    options,
    value,
    onChange,
  }: {
    options?: { fontSize?: number };
    value?: string;
    onChange?: (value: string | undefined) => void;
  }) => (
    <textarea
      aria-label="LaTeX editor"
      data-font-size={options?.fontSize}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      value={value ?? ""}
    />
  ),
}));

vi.mock("./components/PdfViewer", () => ({
  PdfViewer: ({
    pdfPath,
    onPdfClick,
  }: {
    pdfPath: string | null;
    onPdfClick: (page: number, x: number, y: number) => void;
  }) => (
    <div aria-label="Mock PDF viewer">
      <span>{pdfPath ?? "No PDF"}</span>
      <button onClick={() => onPdfClick(1, 72, 144)} type="button">
        Jump from PDF
      </button>
    </div>
  ),
}));

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function deferredResponse<T>(_sample?: T) {
  let resolve!: (body: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((nextResolve, nextReject) => {
    resolve = (body) => nextResolve(jsonResponse(body));
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

const projectFixture = {
  resumes: [
    {
      id: "backend-engineer",
      name: "Backend Engineer",
      dir: "backend-engineer",
      entryPath: "backend-engineer/main.tex",
      pdfPath: "backend-engineer/main.pdf",
    },
    {
      id: "data-scientist",
      name: "Data Scientist",
      dir: "data-scientist",
      entryPath: "data-scientist/main.tex",
      pdfPath: "data-scientist/main.pdf",
    },
  ],
  texFiles: [
    {
      path: "backend-engineer/main.tex",
      name: "main.tex",
      dir: "backend-engineer",
    },
    {
      path: "backend-engineer/sections/experience.tex",
      name: "experience.tex",
      dir: "backend-engineer/sections",
    },
    {
      path: "data-scientist/main.tex",
      name: "main.tex",
      dir: "data-scientist",
    },
  ],
};

const fileBodies = new Map<string, string>([
  ["backend-engineer/main.tex", "% default backend resume\n"],
  [
    "backend-engineer/sections/experience.tex",
    "% backend experience section\n",
  ],
  ["data-scientist/main.tex", "% default data resume\n"],
]);

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input.toString();
}

function requestBody(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body ?? "{}")) as unknown;
}

function stubWorkflowFetch() {
  const compileRequests: unknown[] = [];
  const synctexRequests: unknown[] = [];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url === "/api/project") {
        return jsonResponse(projectFixture);
      }

      if (url.startsWith("/api/file?")) {
        const path = new URLSearchParams(url.split("?")[1]).get("path") ?? "";
        return jsonResponse({
          path,
          content: fileBodies.get(path) ?? "",
        });
      }

      if (url === "/api/compile") {
        compileRequests.push(requestBody(init));
        return jsonResponse({
          ok: true,
          elapsedMs: 450,
          pdfPath: "backend-engineer/main.pdf",
          logSummary: "compiled ok",
          stdout: "stdout text",
          stderr: "",
        });
      }

      if (url === "/api/synctex") {
        synctexRequests.push(requestBody(init));
        return jsonResponse({
          found: true,
          file: "backend-engineer/sections/experience.tex",
          line: 7,
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  );

  vi.stubGlobal("fetch", fetchMock);

  return { compileRequests, fetchMock, synctexRequests };
}

describe("App workflow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens the default tex file, edits locally, and compiles the selected resume with the draft file", async () => {
    const { compileRequests, fetchMock } = stubWorkflowFetch();

    render(<App />);

    const editor = await screen.findByLabelText("LaTeX editor");
    expect(editor).toHaveValue("% default backend resume\n");

    fireEvent.change(editor, {
      target: { value: "% edited backend resume\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /编译当前简历/ }));

    await waitFor(() => expect(compileRequests).toHaveLength(1));
    expect(compileRequests[0]).toEqual({
      resumeDir: "backend-engineer",
      currentFile: {
        path: "backend-engineer/main.tex",
        content: "% edited backend resume\n",
      },
    });
    expect(screen.getByText(/compiled ok/)).toBeInTheDocument();
    expect(screen.getByText(/stdout text/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/file?path=backend-engineer%2Fmain.tex",
    );
  });

  it("jumps from a PDF click to the SyncTeX source file returned by the backend", async () => {
    const { synctexRequests } = stubWorkflowFetch();

    render(<App />);

    await screen.findByLabelText("LaTeX editor");

    fireEvent.click(screen.getByRole("button", { name: "Jump from PDF" }));

    await waitFor(() => expect(synctexRequests).toHaveLength(1));
    expect(synctexRequests[0]).toEqual({
      resumeDir: "backend-engineer",
      page: 1,
      x: 72,
      y: 144,
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText("LaTeX editor") as HTMLTextAreaElement).value,
      ).toContain("% backend experience section");
    });
    expect(
      within(screen.getByRole("region", { name: /editor/i })).getByText(
        "backend-engineer/sections/experience.tex",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/source line 7/i)).toBeInTheDocument();
  });

  it("shows source length and adjusts the TeX editor font size", async () => {
    stubWorkflowFetch();

    render(<App />);

    const editor = await screen.findByLabelText("LaTeX editor");
    fireEvent.change(editor, {
      target: {
        value: [
          "% resume",
          "\\section{教育经历}",
          "education body",
          "\\section{技能掌握}",
          "skills body",
        ].join("\n"),
      },
    });

    expect(screen.getByText("5 lines")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /跳到技能/ }),
    ).not.toBeInTheDocument();
    expect(editor).toHaveAttribute("data-font-size", "13");

    fireEvent.click(
      screen.getByRole("button", { name: /increase tex font size/i }),
    );
    expect(editor).toHaveAttribute("data-font-size", "14");

    fireEvent.click(
      screen.getByRole("button", { name: /decrease tex font size/i }),
    );
    expect(editor).toHaveAttribute("data-font-size", "13");

    const decreaseFontSize = screen.getByRole("button", {
      name: /decrease tex font size/i,
    });
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(decreaseFontSize);
    }
    expect(editor).toHaveAttribute("data-font-size", "8");
    expect(decreaseFontSize).toBeDisabled();
  });

  it("ignores compile results after switching to another resume", async () => {
    const compileResponse = deferredResponse({
      ok: true,
      elapsedMs: 450,
      pdfPath: "backend-engineer/main.pdf",
      logSummary: "backend compile finished late",
      stdout: "",
      stderr: "",
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/project") {
          return jsonResponse(projectFixture);
        }

        if (url.startsWith("/api/file?")) {
          const path = new URLSearchParams(url.split("?")[1]).get("path") ?? "";
          return jsonResponse({ path, content: fileBodies.get(path) ?? "" });
        }

        if (url === "/api/compile") {
          void init;
          return compileResponse.promise;
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByLabelText("LaTeX editor");
    fireEvent.click(screen.getByRole("button", { name: /编译当前简历/ }));
    fireEvent.click(screen.getByText("data-scientist/main.tex"));
    await waitFor(() => {
      expect(
        screen.getAllByText("data-scientist/main.pdf").length,
      ).toBeGreaterThan(0);
    });

    compileResponse.resolve({
      ok: true,
      elapsedMs: 450,
      pdfPath: "backend-engineer/main.pdf",
      logSummary: "backend compile finished late",
      stdout: "",
      stderr: "",
    });

    await waitFor(() => {
      expect(
        screen.queryByText(/backend compile finished late/),
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByText("data-scientist/main.pdf").length,
      ).toBeGreaterThan(0);
    });
  });

  it("ignores stale SyncTeX responses after a newer PDF click", async () => {
    const firstSynctexResponse = deferredResponse({
      found: true,
      file: "backend-engineer/sections/experience.tex",
      line: 7,
    });
    const secondSynctexResponse = deferredResponse({
      found: true,
      file: "data-scientist/main.tex",
      line: 3,
    });
    let synctexCount = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/project") {
          return jsonResponse(projectFixture);
        }

        if (url.startsWith("/api/file?")) {
          const path = new URLSearchParams(url.split("?")[1]).get("path") ?? "";
          return jsonResponse({ path, content: fileBodies.get(path) ?? "" });
        }

        if (url === "/api/synctex") {
          void init;
          synctexCount += 1;
          return synctexCount === 1
            ? firstSynctexResponse.promise
            : secondSynctexResponse.promise;
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByLabelText("LaTeX editor");
    const jumpButton = screen.getByRole("button", { name: "Jump from PDF" });
    fireEvent.click(jumpButton);
    fireEvent.click(jumpButton);
    secondSynctexResponse.resolve({
      found: true,
      file: "data-scientist/main.tex",
      line: 3,
    });
    await waitFor(() => {
      expect(
        (screen.getByLabelText("LaTeX editor") as HTMLTextAreaElement).value,
      ).toContain("% default data resume");
    });

    firstSynctexResponse.resolve({
      found: true,
      file: "backend-engineer/sections/experience.tex",
      line: 7,
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText("LaTeX editor") as HTMLTextAreaElement).value,
      ).toContain("% default data resume");
      expect(screen.queryByText(/source line 7/i)).not.toBeInTheDocument();
    });
  });

  it("ignores stale SyncTeX failures after a newer PDF click succeeds", async () => {
    const firstSynctexResponse = deferredResponse();
    const secondSynctexResponse = deferredResponse({
      found: true,
      file: "data-scientist/main.tex",
      line: 3,
    });
    let synctexCount = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/project") {
          return jsonResponse(projectFixture);
        }

        if (url.startsWith("/api/file?")) {
          const path = new URLSearchParams(url.split("?")[1]).get("path") ?? "";
          return jsonResponse({ path, content: fileBodies.get(path) ?? "" });
        }

        if (url === "/api/synctex") {
          void init;
          synctexCount += 1;
          return synctexCount === 1
            ? firstSynctexResponse.promise
            : secondSynctexResponse.promise;
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByLabelText("LaTeX editor");
    const jumpButton = screen.getByRole("button", { name: "Jump from PDF" });
    fireEvent.click(jumpButton);
    fireEvent.click(jumpButton);
    secondSynctexResponse.resolve({
      found: true,
      file: "data-scientist/main.tex",
      line: 3,
    });
    await screen.findByText(/source line 3/i);

    firstSynctexResponse.reject(new Error("stale synctex failure"));

    await waitFor(() => {
      expect(
        screen.queryByText(/stale synctex failure/i),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/source line 3/i)).toBeInTheDocument();
    });
  });

  it("does not leave the editor loading when a stale source load is followed by a missing SyncTeX result", async () => {
    const firstSynctexResponse = deferredResponse({
      found: true,
      file: "backend-engineer/sections/experience.tex",
      line: 7,
    });
    const firstFileResponse = deferredResponse({
      path: "backend-engineer/sections/experience.tex",
      content: "% backend experience section\n",
    });
    const secondSynctexResponse = deferredResponse({ found: false });
    let synctexCount = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/project") {
          return jsonResponse(projectFixture);
        }

        if (url.startsWith("/api/file?")) {
          const path = new URLSearchParams(url.split("?")[1]).get("path") ?? "";

          if (path === "backend-engineer/sections/experience.tex") {
            return firstFileResponse.promise;
          }

          return jsonResponse({ path, content: fileBodies.get(path) ?? "" });
        }

        if (url === "/api/synctex") {
          void init;
          synctexCount += 1;
          return synctexCount === 1
            ? firstSynctexResponse.promise
            : secondSynctexResponse.promise;
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const editor = await screen.findByLabelText("LaTeX editor");
    expect(editor).toHaveValue("% default backend resume\n");
    const jumpButton = screen.getByRole("button", { name: "Jump from PDF" });
    fireEvent.click(jumpButton);
    firstSynctexResponse.resolve({
      found: true,
      file: "backend-engineer/sections/experience.tex",
      line: 7,
    });
    await screen.findByText("Loading TeX file...");

    fireEvent.click(jumpButton);
    secondSynctexResponse.resolve({ found: false });
    await screen.findByText("No matching source line.");
    firstFileResponse.resolve({
      path: "backend-engineer/sections/experience.tex",
      content: "% backend experience section\n",
    });

    await waitFor(() => {
      expect(screen.queryByText("Loading TeX file...")).not.toBeInTheDocument();
      expect(screen.getByLabelText("LaTeX editor")).toHaveValue(
        "% default backend resume\n",
      );
      expect(
        screen.getByRole("button", { name: /编译当前简历/ }),
      ).toBeEnabled();
    });
  });

  it("restores the resume that owns the open draft when canceling a pending file-tree load", async () => {
    const dataFileResponse = deferredResponse({
      path: "data-scientist/main.tex",
      content: "% default data resume\n",
    });
    const synctexResponse = deferredResponse({ found: false });
    const compileRequests: unknown[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/project") {
          return jsonResponse(projectFixture);
        }

        if (url.startsWith("/api/file?")) {
          const path = new URLSearchParams(url.split("?")[1]).get("path") ?? "";

          if (path === "data-scientist/main.tex") {
            return dataFileResponse.promise;
          }

          return jsonResponse({ path, content: fileBodies.get(path) ?? "" });
        }

        if (url === "/api/synctex") {
          void init;
          return synctexResponse.promise;
        }

        if (url === "/api/compile") {
          compileRequests.push(requestBody(init));
          return jsonResponse({
            ok: true,
            elapsedMs: 100,
            pdfPath: "backend-engineer/main.pdf",
            logSummary: "",
            stdout: "",
            stderr: "",
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByLabelText("LaTeX editor");
    fireEvent.click(screen.getByText("data-scientist/main.tex"));
    await screen.findByText("Loading TeX file...");

    fireEvent.click(screen.getByRole("button", { name: "Jump from PDF" }));
    synctexResponse.resolve({ found: false });

    await waitFor(() => {
      expect(
        screen.getAllByText("backend-engineer/main.pdf").length,
      ).toBeGreaterThan(0);
      expect(screen.getByLabelText("LaTeX editor")).toHaveValue(
        "% default backend resume\n",
      );
    });

    dataFileResponse.resolve({
      path: "data-scientist/main.tex",
      content: "% default data resume\n",
    });
    fireEvent.click(screen.getByRole("button", { name: /编译当前简历/ }));

    await waitFor(() => expect(compileRequests).toHaveLength(1));
    expect(compileRequests[0]).toEqual({
      resumeDir: "backend-engineer",
      currentFile: {
        path: "backend-engineer/main.tex",
        content: "% default backend resume\n",
      },
    });
  });
});
