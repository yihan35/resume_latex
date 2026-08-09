import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

export interface RenderedPdfPage {
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  destroy(): Promise<void>;
}

function abortError() {
  return new DOMException("PDF rendering was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

export async function renderFirstPdfPage(options: {
  url: string;
  canvas: HTMLCanvasElement;
  availableWidth: number;
  signal: AbortSignal;
}): Promise<RenderedPdfPage> {
  const { availableWidth, canvas, signal, url } = options;
  let loadingTask: PDFDocumentLoadingTask | null = null;
  let renderTask: RenderTask | null = null;
  let destroyed = false;

  const destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    renderTask?.cancel();
    const tasks = [loadingTask?.destroy()].filter(
      (task): task is Promise<void> => task !== undefined,
    );
    await Promise.allSettled(tasks);
  };
  const onAbort = () => {
    void destroy();
  };

  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.mjs?url"),
    ]);
    throwIfAborted(signal);
    GlobalWorkerOptions.workerSrc = worker.default;
    loadingTask = getDocument({ url });
    const document = await loadingTask.promise;
    throwIfAborted(signal);
    const page = await document.getPage(1);
    throwIfAborted(signal);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(1, availableWidth) / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const outputScale = window.devicePixelRatio || 1;
    const context = canvas.getContext("2d");
    if (context === null)
      throw new Error("Canvas is not available in this browser.");

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);
    renderTask = page.render({ canvas, canvasContext: context, viewport });
    await renderTask.promise;
    throwIfAborted(signal);

    const renderedPage = {
      destroy,
      scale,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    };
    await destroy();
    return renderedPage;
  } catch (error) {
    await destroy();
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
