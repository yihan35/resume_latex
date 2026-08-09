import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface PdfViewerProps {
  pdfPath: string | null;
  version: number;
  onPdfClick: (page: number, x: number, y: number) => void;
}

type PdfState = "empty" | "loading" | "ready" | "error";

interface RenderMetrics {
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PdfViewer({ pdfPath, version, onPdfClick }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderMetricsRef = useRef<RenderMetrics | null>(null);
  const [state, setState] = useState<PdfState>(
    pdfPath === null ? "empty" : "loading",
  );
  const [error, setError] = useState<string>();
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (container === null || pdfPath === null) {
      setContainerWidth(0);
      return;
    }

    function updateContainerWidth(width: number) {
      const nextWidth = Math.round(width);
      setContainerWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    }

    updateContainerWidth(container.clientWidth);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      updateContainerWidth(
        entries[0]?.contentRect.width ?? container.clientWidth,
      );
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [pdfPath]);

  useEffect(() => {
    if (pdfPath === null) {
      return;
    }

    const currentPdfPath = pdfPath;
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let renderTask: RenderTask | null = null;

    async function renderFirstPage() {
      const canvas = canvasRef.current;
      const container = containerRef.current;

      if (canvas === null || container === null) {
        return;
      }

      if (containerWidth === 0 && container.clientWidth > 0) {
        return;
      }

      setState("loading");
      setError(undefined);
      renderMetricsRef.current = null;

      const query = new URLSearchParams({
        path: currentPdfPath,
        v: String(version),
      });
      const task = getDocument({ url: `/api/pdf?${query.toString()}` });
      loadingTask = task;
      const pdf: PDFDocumentProxy = await task.promise;

      if (cancelled) {
        await task.destroy();
        return;
      }

      const page = await pdf.getPage(1);

      if (cancelled) {
        await task.destroy();
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(
        260,
        containerWidth || container.clientWidth,
      );
      const scale = availableWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;
      const context = canvas.getContext("2d");

      if (cancelled) {
        await task.destroy();
        return;
      }

      if (context === null) {
        throw new Error("Canvas is not available in this browser.");
      }

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);

      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
      await task.destroy();

      if (!cancelled) {
        renderMetricsRef.current = {
          scale,
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
        };
        setState("ready");
      }
    }

    void renderFirstPage().catch((caughtError: unknown) => {
      if (cancelled) {
        return;
      }

      setError(
        getErrorMessage(
          caughtError,
          "PDF is not available. Compile the resume to generate it.",
        ),
      );
      setState("error");
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [containerWidth, pdfPath, version]);

  function handleCanvasClick(event: MouseEvent<HTMLCanvasElement>) {
    const metrics = renderMetricsRef.current;

    if (metrics === null) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const viewportX =
      ((event.clientX - rect.left) / rect.width) * metrics.viewportWidth;
    const viewportY =
      ((event.clientY - rect.top) / rect.height) * metrics.viewportHeight;
    onPdfClick(1, viewportX / metrics.scale, viewportY / metrics.scale);
  }

  if (pdfPath === null) {
    return (
      <div className="pdf-empty" aria-live="polite">
        Select a resume to preview its PDF.
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {state === "loading" ? (
        <div className="pdf-loading" aria-live="polite">
          Loading PDF...
        </div>
      ) : null}
      {state === "error" ? (
        <div className="pdf-error" role="alert">
          {error ?? "PDF is not available. Compile the resume to generate it."}
        </div>
      ) : null}
      <canvas
        aria-label="PDF page 1"
        className="pdf-canvas"
        hidden={state !== "ready"}
        onClick={handleCanvasClick}
        ref={canvasRef}
      />
    </div>
  );
}
