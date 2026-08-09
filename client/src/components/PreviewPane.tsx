import type { CompileResult } from "../../../shared/contracts";

import { PdfViewer } from "../features/preview/PdfViewer";
import { BuildLog, type BuildLogStatus } from "./BuildLog";

interface PreviewPaneProps {
  activityMessage?: string | undefined;
  buildError?: string | undefined;
  buildResult: CompileResult | null;
  buildStatus: BuildLogStatus;
  pdfPath: string | null;
  resumeId: string | null;
  pdfVersion: number;
  onPdfClick: (page: number, x: number, y: number) => void;
}

export function PreviewPane({
  activityMessage,
  buildError,
  buildResult,
  buildStatus,
  pdfPath,
  resumeId,
  pdfVersion,
  onPdfClick,
}: PreviewPaneProps) {
  return (
    <aside className="right-rail" aria-label="Preview and build">
      <section className="pdf-pane" aria-label="PDF preview">
        <div className="pane-title-row">
          <h2>PDF</h2>
          <span className="selected-path">{pdfPath ?? "No PDF selected"}</span>
        </div>
        <PdfViewer
          onPdfClick={onPdfClick}
          pdfPath={pdfPath}
          resumeId={resumeId}
          version={pdfVersion}
        />
        {activityMessage === undefined ? null : (
          <p className="activity-message" role="status">
            {activityMessage}
          </p>
        )}
      </section>
      <aside className="build-pane" aria-label="Build panel">
        <BuildLog
          error={buildError}
          result={buildResult}
          status={buildStatus}
        />
      </aside>
    </aside>
  );
}
