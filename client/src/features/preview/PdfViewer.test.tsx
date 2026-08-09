import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfViewer } from "./PdfViewer";

const renderFirstPdfPageMock = vi.hoisted(() => vi.fn());

vi.mock("./pdfRenderer", () => ({
  renderFirstPdfPage: renderFirstPdfPageMock,
}));

describe("PdfViewer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    renderFirstPdfPageMock.mockReset();
  });

  it("maps canvas clicks from scaled pixels back to PDF coordinates", async () => {
    renderFirstPdfPageMock.mockResolvedValue({
      destroy: vi.fn(),
      scale: 1.5,
      viewportHeight: 600,
      viewportWidth: 300,
    });
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getBoundingClientRect",
    ).mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const onPdfClick = vi.fn();

    render(
      <PdfViewer
        onPdfClick={onPdfClick}
        pdfPath="resume.pdf"
        resumeId="sample"
        version={1}
      />,
    );

    const canvas = await screen.findByLabelText("PDF page 1");
    await waitFor(() => expect(canvas).not.toHaveAttribute("hidden"));
    fireEvent.click(canvas, { clientX: 150, clientY: 300 });

    expect(onPdfClick).toHaveBeenCalledWith(1, 100, 200);
    expect(renderFirstPdfPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/api/pdf?resumeId=sample&v=1" }),
    );
  });
});
