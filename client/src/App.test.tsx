import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { App } from "./app/App";
import type { SynctexResult } from "../../shared/contracts";

type SuccessfulSynctexResult = Extract<SynctexResult, { found: true }>;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
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

function stubProjectFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url === "/api/project") {
      return jsonResponse(projectFixture);
    }

    if (url.startsWith("/api/file?")) {
      const path = new URLSearchParams(url.split("?")[1]).get("path") ?? "";
      return jsonResponse({ path, content: `% ${path}\n` });
    }

    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads project resumes and tex files into the editor shell", async () => {
    const fetchMock = stubProjectFetch();

    render(<App />);

    const fileTree = await screen.findByRole("tree", { name: /tex files/i });
    expect(
      within(fileTree).getByText("backend-engineer/main.tex"),
    ).toBeInTheDocument();
    expect(
      within(fileTree).getByText("backend-engineer/sections/experience.tex"),
    ).toBeInTheDocument();
    expect(
      within(fileTree).getByText("data-scientist/main.tex"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: /resumes/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /compile/i })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/project",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps the selected tex file aligned when selecting from the file tree", async () => {
    stubProjectFetch();

    render(<App />);

    const editorPane = screen.getByRole("region", { name: /editor/i });
    await within(editorPane).findByText("backend-engineer/main.tex");

    fireEvent.click(await screen.findByText("data-scientist/main.tex"));

    await waitFor(() => {
      expect(
        within(editorPane).getByText("data-scientist/main.tex"),
      ).toBeInTheDocument();
    });
  });

  it("syncs the active resume when selecting a tex file from another resume", async () => {
    stubProjectFetch();

    render(<App />);

    const fileTree = await screen.findByRole("tree", { name: /tex files/i });
    expect(
      within(fileTree).getByText("backend-engineer/main.tex"),
    ).toBeInTheDocument();
    fireEvent.click(within(fileTree).getByText("data-scientist/main.tex"));

    await waitFor(() => {
      expect(
        screen.getAllByText("data-scientist/main.pdf").length,
      ).toBeGreaterThan(0);
    });
  });

  it("collapses the files pane so the editor and PDF preview can use equal columns", async () => {
    stubProjectFetch();

    render(<App />);

    const filesPane = await screen.findByRole("complementary", {
      name: /project files/i,
    });
    const workspace = filesPane.closest(".workspace");

    fireEvent.click(screen.getByRole("button", { name: /collapse files/i }));

    expect(filesPane).toHaveClass("is-collapsed");
    expect(workspace).toHaveClass("is-file-pane-collapsed");
    expect(
      screen.queryByRole("tree", { name: /tex files/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /expand files/i }),
    ).toBeInTheDocument();
  });

  it("resizes the editor and PDF panes by dragging the divider", async () => {
    stubProjectFetch();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getMockRect(this: HTMLElement) {
        const width = this.classList.contains("workspace")
          ? 1000
          : this.classList.contains("file-pane")
            ? 44
            : this.classList.contains("pane-resizer")
              ? 8
              : 0;

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: width,
          top: 0,
          width,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      },
    );

    render(<App />);

    const filesPane = await screen.findByRole("complementary", {
      name: /project files/i,
    });
    fireEvent.click(screen.getByRole("button", { name: /collapse files/i }));
    const workspace = filesPane.closest(".workspace");
    const divider = screen.getByRole("separator", {
      name: /resize editor and pdf panes/i,
    });

    fireEvent(
      divider,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 500 }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", { bubbles: true, clientX: 684 }),
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));

    expect(workspace).toHaveStyle({
      "--editor-pane-fr": "0.675fr",
      "--preview-pane-fr": "0.325fr",
    });
  });

  it("models successful SyncTeX lookups with a required file field", () => {
    expectTypeOf<SuccessfulSynctexResult>().toEqualTypeOf<{
      found: true;
      file: string;
      line: number;
      column?: number;
    }>();

    function readSourceFile(result: SuccessfulSynctexResult) {
      return result.file.toUpperCase();
    }

    expect(readSourceFile({ found: true, file: "main.tex", line: 12 })).toBe(
      "MAIN.TEX",
    );

    const pathCompatibility: SuccessfulSynctexResult = {
      found: true,
      file: "main.tex",
      // @ts-expect-error `path` is not part of the public SyncTeX success shape.
      path: "main.tex",
      line: 12,
    };
    void pathCompatibility;
  });
});
