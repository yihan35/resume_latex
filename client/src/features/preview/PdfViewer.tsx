import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { renderFirstPdfPage, type RenderedPdfPage } from "./pdfRenderer";

interface PdfViewerProps {
  pdfPath: string | null;
  version: number;
  onPdfClick: (page: number, x: number, y: number) => void;
}

type PdfState = "empty" | "loading" | "ready" | "error";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "PDF is not available. Compile the resume to generate it.";
}

export function PdfViewer({ pdfPath, version, onPdfClick }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedPageRef = useRef<RenderedPdfPage | null>(null);
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
    const updateWidth = (width: number) => {
      const nextWidth = Math.round(width);
      setContainerWidth((current) =>
        current === nextWidth ? current : nextWidth,
      );
    };
    updateWidth(container.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      updateWidth(entries[0]?.contentRect.width ?? container.clientWidth),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [pdfPath]);

  useEffect(() => {
    if (pdfPath === null) {
      renderedPageRef.current = null;
      return;
    }
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas === null || container === null) return;
    const width = Math.max(260, containerWidth || container.clientWidth);
    const controller = new AbortController();
    renderedPageRef.current = null;
    const query = new URLSearchParams({ path: pdfPath, v: String(version) });
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setState("loading");
      setError(undefined);
    });

    void renderFirstPdfPage({
      availableWidth: width,
      canvas,
      signal: controller.signal,
      url: `/api/pdf?${query.toString()}`,
    })
      .then((renderedPage) => {
        if (controller.signal.aborted) {
          void renderedPage.destroy();
          return;
        }
        renderedPageRef.current = renderedPage;
        setState("ready");
      })
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(caughtError));
        setState("error");
      });

    return () => {
      controller.abort();
      const renderedPage = renderedPageRef.current;
      renderedPageRef.current = null;
      if (renderedPage !== null) void renderedPage.destroy();
    };
  }, [containerWidth, pdfPath, version]);

  function handleCanvasClick(event: MouseEvent<HTMLCanvasElement>) {
    const metrics = renderedPageRef.current;
    if (metrics === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportX =
      ((event.clientX - rect.left) / rect.width) * metrics.viewportWidth;
    const viewportY =
      ((event.clientY - rect.top) / rect.height) * metrics.viewportHeight;
    onPdfClick(1, viewportX / metrics.scale, viewportY / metrics.scale);
  }

  if (pdfPath === null)
    return (
      <div className="pdf-empty" aria-live="polite">
        Select a resume to preview its PDF.
      </div>
    );

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {state === "loading" ? (
        <div className="pdf-loading" aria-live="polite">
          Loading PDF...
        </div>
      ) : null}
      {state === "error" ? (
        <div className="pdf-error" role="alert">
          {error}
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
