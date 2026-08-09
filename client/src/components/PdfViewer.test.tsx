import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfViewer } from "./PdfViewer";

const getDocumentMock = vi.hoisted(() => vi.fn());

vi.mock("pdfjs-dist", () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: {}
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "pdf.worker.mjs"
}));

function makePdf(baseWidth = 200, baseHeight = 400) {
  const viewport = (scale: number) => ({
    width: baseWidth * scale,
    height: baseHeight * scale
  });

  return {
    destroy: vi.fn(async () => undefined),
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => viewport(scale),
      render: vi.fn(() => ({
        cancel: vi.fn(),
        promise: Promise.resolve()
      }))
    }))
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function successfulDocument(baseWidth?: number, baseHeight?: number) {
  return {
    destroy: vi.fn(),
    promise: Promise.resolve(makePdf(baseWidth, baseHeight))
  };
}

describe("PdfViewer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getDocumentMock.mockReset();
  });

  it("converts canvas clicks to unscaled PDF coordinates", async () => {
    getDocumentMock.mockReturnValueOnce(successfulDocument());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 520,
      height: 520,
      left: 0,
      right: 260,
      top: 0,
      width: 260,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    const onPdfClick = vi.fn();

    render(<PdfViewer pdfPath="resume.pdf" version={1} onPdfClick={onPdfClick} />);

    const canvas = await screen.findByLabelText("PDF page 1");
    await waitFor(() => expect(canvas).not.toHaveAttribute("hidden"));

    fireEvent.click(canvas, { clientX: 130, clientY: 260 });

    expect(onPdfClick).toHaveBeenCalledWith(1, 100, 200);
  });

  it("scales the page against the full preview width", async () => {
    getDocumentMock.mockReturnValueOnce(successfulDocument(200, 400));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.classList.contains("pdf-viewer") ? 500 : 0;
      }
    });

    render(<PdfViewer pdfPath="resume.pdf" version={1} onPdfClick={vi.fn()} />);

    const canvas = await screen.findByLabelText("PDF page 1");
    await waitFor(() => expect(canvas).not.toHaveAttribute("hidden"));

    expect(canvas).toHaveStyle({ width: "500px" });
    expect(screen.queryByRole("button", { name: /跳到底部/ })).not.toBeInTheDocument();
  });

  it("rerenders to fill the preview after its container is resized", async () => {
    let previewWidth = 320;
    let resizeCallback!: ResizeObserverCallback;
    getDocumentMock.mockReturnValue(successfulDocument(200, 400));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.classList.contains("pdf-viewer") ? previewWidth : 0;
      }
    });
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    render(<PdfViewer pdfPath="resume.pdf" version={1} onPdfClick={vi.fn()} />);

    const canvas = await screen.findByLabelText("PDF page 1");
    await waitFor(() => expect(canvas).toHaveStyle({ width: "320px" }));

    previewWidth = 500;
    act(() => {
      resizeCallback(
        [
          {
            contentRect: { width: previewWidth }
          } as ResizeObserverEntry
        ],
        {} as ResizeObserver
      );
    });

    await waitFor(() => expect(canvas).toHaveStyle({ width: "500px" }));
  });

  it("hides a previously rendered page when the next PDF load fails", async () => {
    let rejectMissingPdf!: (error: Error) => void;
    const missingPdfPromise = new Promise<never>((_resolve, reject) => {
      rejectMissingPdf = reject;
    });
    getDocumentMock
      .mockReturnValueOnce(successfulDocument())
      .mockReturnValueOnce({
        destroy: vi.fn(),
        promise: missingPdfPromise
      });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D);

    const { rerender } = render(
      <PdfViewer pdfPath="resume.pdf" version={1} onPdfClick={vi.fn()} />
    );

    const canvas = await screen.findByLabelText("PDF page 1");
    await waitFor(() => expect(canvas).not.toHaveAttribute("hidden"));

    rerender(<PdfViewer pdfPath="missing.pdf" version={2} onPdfClick={vi.fn()} />);
    rejectMissingPdf(new Error("missing PDF"));

    expect(await screen.findByRole("alert")).toHaveTextContent("missing PDF");
    expect(canvas).toHaveAttribute("hidden");
  });

  it("does not let a canceled old page render mutate the canvas", async () => {
    const delayedPage = deferred<{
      getViewport: (input: { scale: number }) => { width: number; height: number };
      render: ReturnType<typeof vi.fn>;
    }>();
    const oldPdf = {
      destroy: vi.fn(async () => undefined),
      getPage: vi.fn(async () => delayedPage.promise)
    };
    const newPdf = makePdf();
    getDocumentMock
      .mockReturnValueOnce({
        destroy: vi.fn(),
        promise: Promise.resolve(oldPdf)
      })
      .mockReturnValueOnce({
        destroy: vi.fn(),
        promise: Promise.resolve(newPdf)
      });
    const setTransform = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      setTransform
    } as unknown as CanvasRenderingContext2D);

    const { rerender } = render(
      <PdfViewer pdfPath="old.pdf" version={1} onPdfClick={vi.fn()} />
    );

    rerender(<PdfViewer pdfPath="new.pdf" version={2} onPdfClick={vi.fn()} />);
    await waitFor(() => expect(setTransform).toHaveBeenCalledTimes(1));

    delayedPage.resolve({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 200 * scale,
        height: 400 * scale
      }),
      render: vi.fn(() => ({
        cancel: vi.fn(),
        promise: Promise.resolve()
      }))
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setTransform).toHaveBeenCalledTimes(1);
  });
});
