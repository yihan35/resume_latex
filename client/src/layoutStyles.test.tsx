import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app/App";

vi.mock("./features/workspace/useWorkspace", () => ({
  useWorkspace: () => ({
    compileSelectedResume: vi.fn(),
    editCurrentFile: vi.fn(),
    lookupSource: vi.fn(),
    saveCurrentFile: vi.fn(),
    selectFile: vi.fn(),
    state: {
      compileResult: null,
      compileState: "idle",
      drafts: {},
      error: undefined,
      fileState: "idle",
      pdfVersion: 0,
      project: { resumes: [], texFiles: [] },
      projectState: "ready",
      selectedResumeId: null,
      selectedTexPath: null,
      targetLine: null,
      targetLineRequestId: 0,
    },
  }),
}));

describe("workspace layout behavior", () => {
  afterEach(() => vi.clearAllMocks());

  it("exposes labeled panes, collapse controls, and an accessible bounded resizer", () => {
    render(<App />);

    expect(
      screen.getByRole("complementary", { name: "Project files" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Editor" })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Preview and build" }),
    ).toBeInTheDocument();
    const resizer = screen.getByRole("separator", {
      name: "Resize editor and PDF panes",
    });
    expect(resizer).toHaveAttribute("aria-valuemin", "25");
    expect(resizer).toHaveAttribute("aria-valuemax", "75");
    fireEvent.keyDown(resizer, { key: "ArrowRight" });
    expect(resizer).toHaveAttribute("aria-valuenow", "55");
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse files panel" }),
    );
    expect(
      screen.getByRole("button", { name: "Expand files panel" }),
    ).toBeInTheDocument();
  });

  it("keeps font-size controls within their configured bounds", () => {
    render(<App />);
    const decrease = screen.getByRole("button", {
      name: "Decrease TeX font size",
    });
    const increase = screen.getByRole("button", {
      name: "Increase TeX font size",
    });

    for (let index = 0; index < 6; index += 1) fireEvent.click(decrease);
    expect(decrease).toBeDisabled();
    for (let index = 0; index < 20; index += 1) fireEvent.click(increase);
    expect(increase).toBeDisabled();
  });
});
