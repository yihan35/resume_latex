import type { CompileResult } from "../types";

export type BuildLogStatus =
  "idle" | "loading" | "ready" | "compiling" | "success" | "error";

interface BuildLogProps {
  status: BuildLogStatus;
  error?: string | undefined;
  result?: CompileResult | null;
}

const statusLabel: Record<BuildLogStatus, string> = {
  idle: "Idle",
  loading: "Loading project",
  ready: "Ready",
  compiling: "Compiling",
  success: "Compile finished",
  error: "Error",
};

function buildOutputText(result: CompileResult) {
  return [
    result.logSummary.trim().length > 0
      ? `Summary\n${result.logSummary.trim()}`
      : "",
    result.stderr.trim().length > 0 ? `stderr\n${result.stderr.trim()}` : "",
    result.stdout.trim().length > 0 ? `stdout\n${result.stdout.trim()}` : "",
  ]
    .filter((section) => section.length > 0)
    .join("\n\n");
}

export function BuildLog({ status, error, result }: BuildLogProps) {
  const outputText =
    result === null || result === undefined ? "" : buildOutputText(result);

  return (
    <section className="build-log" aria-label="Build log">
      <div className="pane-title-row">
        <h2>Build</h2>
        <span className={`status-pill status-${status}`} aria-live="polite">
          {statusLabel[status]}
        </span>
      </div>

      {error === undefined ? null : (
        <p className="build-error" role="alert">
          {error}
        </p>
      )}

      {result === undefined || result === null ? (
        <p className="build-log-placeholder">No compile output yet.</p>
      ) : (
        <div className="build-result">
          <dl className="build-meta">
            <div>
              <dt>Result</dt>
              <dd>{result.ok ? "Success" : "Failed"}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{result.elapsedMs} ms</dd>
            </div>
            <div>
              <dt>PDF</dt>
              <dd>{result.pdfPath}</dd>
            </div>
          </dl>
          {outputText.length > 0 ? (
            <pre className="build-output">{outputText}</pre>
          ) : (
            <p className="build-log-placeholder">Compile completed cleanly.</p>
          )}
        </div>
      )}
    </section>
  );
}
