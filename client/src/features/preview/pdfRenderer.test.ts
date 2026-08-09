import { afterEach, describe, expect, it, vi } from "vitest";

import { renderFirstPdfPage } from "./pdfRenderer";

const getDocumentMock = vi.hoisted(() => vi.fn());
const workerOptionsMock = vi.hoisted(() => ({}) as { workerSrc?: string });

vi.mock("pdfjs-dist", () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: workerOptionsMock,
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "pdf.worker.test.mjs",
}));

function createCanvas() {
  const canvas = document.createElement("canvas");
  const setTransform = vi.fn();
  const context = {
    clearRect: vi.fn(),
    setTransform,
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  return { canvas, context, setTransform };
}

function createDocument() {
  const renderTask = { cancel: vi.fn(), promise: Promise.resolve() };
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 200 * scale,
      height: 400 * scale,
    })),
    render: vi.fn(() => renderTask),
  };
  const pdf = {
    destroy: vi.fn(async () => undefined),
    getPage: vi.fn(async () => page),
  };
  const loadingTask = {
    destroy: vi.fn(async () => undefined),
    promise: Promise.resolve(pdf),
  };
  return { loadingTask, page, pdf, renderTask };
}

describe("renderFirstPdfPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getDocumentMock.mockReset();
    delete workerOptionsMock.workerSrc;
  });

  it("renders page one at device-pixel resolution and reports CSS metrics", async () => {
    const document = createDocument();
    getDocumentMock.mockReturnValue(document.loadingTask);
    const { canvas, setTransform } = createCanvas();
    vi.stubGlobal("devicePixelRatio", 2);

    const result = await renderFirstPdfPage({
      availableWidth: 300,
      canvas,
      signal: new AbortController().signal,
      url: "/api/pdf?path=resume.pdf",
    });

    expect(getDocumentMock).toHaveBeenCalledWith({
      url: "/api/pdf?path=resume.pdf",
    });
    expect(document.page.getViewport).toHaveBeenNthCalledWith(1, { scale: 1 });
    expect(document.pdf.getPage).toHaveBeenCalledWith(1);
    expect(canvas).toHaveAttribute("width", "600");
    expect(canvas).toHaveAttribute("height", "1200");
    expect(canvas.style.width).toBe("300px");
    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(result).toMatchObject({
      scale: 1.5,
      viewportWidth: 300,
      viewportHeight: 600,
    });
    expect(workerOptionsMock.workerSrc).toBe("pdf.worker.test.mjs");
    expect(document.loadingTask.destroy).toHaveBeenCalledTimes(1);
  });

  it("cancels the render and destroys PDF resources when aborted", async () => {
    let resolveRender!: () => void;
    const document = createDocument();
    document.renderTask.promise = new Promise<void>((resolve) => {
      resolveRender = resolve;
    });
    getDocumentMock.mockReturnValue(document.loadingTask);
    const { canvas } = createCanvas();
    const controller = new AbortController();

    const rendering = renderFirstPdfPage({
      availableWidth: 300,
      canvas,
      signal: controller.signal,
      url: "/api/pdf?path=resume.pdf",
    });
    await vi.waitFor(() =>
      expect(document.page.render).toHaveBeenCalledTimes(1),
    );
    controller.abort();
    resolveRender();

    await expect(rendering).rejects.toMatchObject({ name: "AbortError" });
    expect(document.renderTask.cancel).toHaveBeenCalledTimes(1);
    expect(document.loadingTask.destroy).toHaveBeenCalledTimes(1);
  });
});
