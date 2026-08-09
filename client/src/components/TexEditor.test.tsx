import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TexEditor } from "./TexEditor";

const editorMock = vi.hoisted(() => ({
  focus: vi.fn(),
  revealLineNearTop: vi.fn(),
  revealPositionInCenter: vi.fn(),
  setPosition: vi.fn(),
  setScrollTop: vi.fn()
}));

const editorPropsMock = vi.hoisted(() => vi.fn());
let pendingOnMount: ((editor: typeof editorMock) => void) | undefined;
let autoMountEditor = true;
let editorMounted = false;

function mountEditor() {
  const onMount = pendingOnMount;
  pendingOnMount = undefined;
  editorMounted = true;
  onMount?.(editorMock);
}

vi.mock("@monaco-editor/react", () => ({
  default: ({
    onChange,
    onMount,
    options,
    value
  }: {
    onChange?: (value: string | undefined) => void;
    onMount?: (editor: typeof editorMock) => void;
    options?: Record<string, unknown>;
    value?: string;
  }) => {
    pendingOnMount = onMount;
    editorPropsMock({ options });
    if (autoMountEditor && !editorMounted) {
      mountEditor();
    }

    return (
      <textarea
        aria-label="LaTeX editor"
        onChange={(event) => onChange?.(event.currentTarget.value)}
        value={value ?? ""}
      />
    );
  }
}));

describe("TexEditor", () => {
  afterEach(() => {
    vi.clearAllMocks();
    pendingOnMount = undefined;
    autoMountEditor = true;
    editorMounted = false;
  });

  it("lets Monaco recompute layout when the pane size changes", () => {
    render(
      <TexEditor
        content="first"
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={null}
        targetLineRequestId={0}
      />
    );

    expect(editorPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          automaticLayout: true
        })
      })
    );
  });

  it("passes the selected editor font size to Monaco", () => {
    render(
      <TexEditor
        content="first"
        fontSize={16}
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={null}
        targetLineRequestId={0}
      />
    );

    expect(editorPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          fontSize: 16
        })
      })
    );
  });

  it("reveals target source lines without overriding Monaco wrapped-line scroll", () => {
    const { rerender } = render(
      <TexEditor
        content="first"
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={null}
        targetLineRequestId={0}
      />
    );

    rerender(
      <TexEditor
        content="first"
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={86}
        targetLineRequestId={1}
      />
    );

    expect(editorMock.setPosition).toHaveBeenCalledWith({
      column: 1,
      lineNumber: 86
    });
    expect(editorMock.revealPositionInCenter).toHaveBeenCalledWith({
      column: 1,
      lineNumber: 86
    });
    expect(editorMock.revealLineNearTop).not.toHaveBeenCalled();
    expect(editorMock.setScrollTop).not.toHaveBeenCalled();
    expect(editorMock.focus).toHaveBeenCalled();
  });

  it("repeats source-line jumps when the requested line number is unchanged", () => {
    const { rerender } = render(
      <TexEditor
        content="first"
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={86}
        targetLineRequestId={1}
      />
    );

    rerender(
      <TexEditor
        content="first"
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={86}
        targetLineRequestId={2}
      />
    );

    expect(editorMock.revealPositionInCenter).toHaveBeenCalledTimes(2);
  });

  it("reveals a pending target line when Monaco mounts after the jump request", () => {
    autoMountEditor = false;

    render(
      <TexEditor
        content="first"
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={51}
        targetLineRequestId={1}
      />
    );

    expect(editorMock.revealPositionInCenter).not.toHaveBeenCalled();

    act(() => {
      mountEditor();
    });

    expect(editorMock.setPosition).toHaveBeenCalledWith({
      column: 1,
      lineNumber: 51
    });
    expect(editorMock.revealPositionInCenter).toHaveBeenCalledWith({
      column: 1,
      lineNumber: 51
    });
    expect(editorMock.focus).toHaveBeenCalled();
  });
});
