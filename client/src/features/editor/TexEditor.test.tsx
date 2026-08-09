import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TexEditor } from "./TexEditor";

const editorMock = vi.hoisted(() => ({
  focus: vi.fn(),
  revealPositionInCenter: vi.fn(),
  setPosition: vi.fn(),
}));
const editorPropsMock = vi.hoisted(() => vi.fn());

vi.mock("@monaco-editor/react", () => ({
  default: ({
    onMount,
    options,
  }: {
    onMount: (editor: typeof editorMock) => void;
    options: Record<string, unknown>;
  }) => {
    editorPropsMock(options);
    return (
      <button onClick={() => onMount(editorMock)} type="button">
        Mount editor
      </button>
    );
  },
}));

describe("TexEditor", () => {
  afterEach(() => vi.clearAllMocks());

  it("configures Monaco for responsive layout and the requested font size", () => {
    const { getByRole } = render(
      <TexEditor
        content="first"
        fontSize={16}
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={null}
        targetLineRequestId={0}
      />,
    );
    act(() => getByRole("button", { name: "Mount editor" }).click());

    expect(editorPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ automaticLayout: true, fontSize: 16 }),
    );
  });

  it("reveals a source line after Monaco mounts", () => {
    const { getByRole } = render(
      <TexEditor
        content="first"
        onChange={vi.fn()}
        path="resume.tex"
        targetLine={51}
        targetLineRequestId={1}
      />,
    );
    act(() => getByRole("button", { name: "Mount editor" }).click());

    expect(editorMock.setPosition).toHaveBeenCalledWith({
      column: 1,
      lineNumber: 51,
    });
    expect(editorMock.revealPositionInCenter).toHaveBeenCalledWith({
      column: 1,
      lineNumber: 51,
    });
  });
});
