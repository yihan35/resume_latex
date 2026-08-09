import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { BuildLog, type BuildLogStatus } from "./components/BuildLog";
import { PdfViewer } from "./components/PdfViewer";
import { TexEditor } from "./components/TexEditor";
import { TexFileTree } from "./components/TexFileTree";
import {
  selectCanCompile,
  selectCurrentDraft,
  selectSelectedResume,
} from "./features/workspace/selectors";
import { useWorkspace } from "./features/workspace/useWorkspace";

const MIN_TEX_FONT_SIZE = 8;
const MAX_TEX_FONT_SIZE = 20;

function countLines(content: string) {
  if (content.length === 0) {
    return 0;
  }

  return content.split(/\r\n|\r|\n/).length;
}

function clampPaneSplit(value: number) {
  return Math.min(0.75, Math.max(0.25, value));
}

function clampTexFontSize(value: number) {
  return Math.min(MAX_TEX_FONT_SIZE, Math.max(MIN_TEX_FONT_SIZE, value));
}

export function App() {
  const workspace = useWorkspace();
  const { state } = workspace;
  const project = state.project ?? { resumes: [], texFiles: [] };
  const [isFilePaneCollapsed, setIsFilePaneCollapsed] = useState(false);
  const [paneSplit, setPaneSplit] = useState(0.5);
  const [texFontSize, setTexFontSize] = useState(13);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const filePaneRef = useRef<HTMLElement | null>(null);
  const paneResizerRef = useRef<HTMLDivElement | null>(null);
  const selectedResume = selectSelectedResume(state);
  const openFile = selectCurrentDraft(state) ?? null;
  const selectedTexPath = state.selectedTexPath;
  const selectedFile = useMemo(
    () =>
      project.texFiles.find((file) => file.path === selectedTexPath) ?? null,
    [project.texFiles, selectedTexPath],
  );
  const editorTitle =
    selectedFile?.name ?? openFile?.path.split("/").at(-1) ?? "Editor";
  const editorPath =
    state.fileState === "loading"
      ? selectedTexPath
      : (openFile?.path ?? selectedTexPath);
  const openFileLineCount =
    openFile === null ? null : countLines(openFile.content);
  const previewPdfPath =
    state.compileResult?.pdfPath ?? selectedResume?.pdfPath ?? null;
  const buildStatus: BuildLogStatus =
    state.compileState === "compiling"
      ? "compiling"
      : state.projectState === "error" || state.compileState === "error"
        ? "error"
        : state.projectState === "loading" || state.fileState === "loading"
          ? "loading"
          : state.fileState === "error" && state.compileState === "idle"
            ? "error"
            : state.compileState === "success"
              ? "success"
              : "ready";
  const visibleError = state.error;
  const canCompile = selectCanCompile(state);
  const workspaceStyle = useMemo(
    () =>
      ({
        "--editor-pane-fr": `${paneSplit.toFixed(3)}fr`,
        "--preview-pane-fr": `${(1 - paneSplit).toFixed(3)}fr`,
      }) as CSSProperties,
    [paneSplit],
  );

  const updatePaneSplitFromPointer = useCallback((clientX: number) => {
    if (!Number.isFinite(clientX)) {
      return;
    }

    const workspace = workspaceRef.current;
    const filePane = filePaneRef.current;

    if (workspace === null || filePane === null) {
      return;
    }

    const workspaceRect = workspace.getBoundingClientRect();
    const filePaneWidth = filePane.getBoundingClientRect().width;
    const resizerWidth =
      paneResizerRef.current?.getBoundingClientRect().width ?? 8;
    const availableWidth = workspaceRect.width - filePaneWidth - resizerWidth;

    if (availableWidth <= 0) {
      return;
    }

    const editorWidth = clientX - workspaceRect.left - filePaneWidth;
    const nextSplit = clampPaneSplit(editorWidth / availableWidth);
    setPaneSplit(Number(nextSplit.toFixed(3)));
  }, []);

  const handlePaneResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      updatePaneSplitFromPointer(event.clientX);

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        updatePaneSplitFromPointer(moveEvent.clientX);
      };
      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [updatePaneSplitFromPointer],
  );

  function handlePaneResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    setPaneSplit((currentSplit) =>
      Number(
        clampPaneSplit(
          currentSplit + (event.key === "ArrowRight" ? 0.05 : -0.05),
        ).toFixed(3),
      ),
    );
  }

  function handleSelectTexFile(path: string) {
    void workspace.selectFile(path);
  }

  function handleEditorChange(content: string) {
    workspace.editCurrentFile(content);
  }

  function handleAdjustTexFontSize(delta: number) {
    setTexFontSize((currentFontSize) =>
      clampTexFontSize(currentFontSize + delta),
    );
  }

  async function handleCompile() {
    await workspace.compileSelectedResume();
  }

  async function handlePdfClick(page: number, x: number, y: number) {
    await workspace.lookupSource(page, x, y);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-title">
          <h1>Resume LaTeX Editor</h1>
          <span>{selectedResume?.dir ?? "No resume selected"}</span>
        </div>
        <button
          className="compile-button"
          disabled={!canCompile}
          onClick={() => void handleCompile()}
          type="button"
        >
          编译当前简历
          <span className="sr-only"> Compile</span>
        </button>
      </header>

      <section
        className={`workspace${isFilePaneCollapsed ? " is-file-pane-collapsed" : ""}`}
        ref={workspaceRef}
        style={workspaceStyle}
      >
        <aside
          className={`file-pane${isFilePaneCollapsed ? " is-collapsed" : ""}`}
          aria-label="Project files"
          ref={filePaneRef}
        >
          <div className="pane-title-row file-pane-title-row">
            {isFilePaneCollapsed ? (
              <button
                aria-label="Expand files panel"
                className="file-pane-toggle"
                onClick={() => setIsFilePaneCollapsed(false)}
                title="Expand files panel"
                type="button"
              >
                <span aria-hidden="true">›</span>
              </button>
            ) : (
              <>
                <h2>Files</h2>
                <div className="pane-actions">
                  <span className="file-count">{project.texFiles.length}</span>
                  <button
                    aria-label="Collapse files panel"
                    className="file-pane-toggle"
                    onClick={() => setIsFilePaneCollapsed(true)}
                    title="Collapse files panel"
                    type="button"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                </div>
              </>
            )}
          </div>
          {isFilePaneCollapsed ? null : (
            <TexFileTree
              files={project.texFiles}
              onSelect={handleSelectTexFile}
              selectedPath={selectedTexPath}
            />
          )}
        </aside>

        <section className="editor-pane" aria-label="Editor">
          <div className="pane-title-row">
            <h2>{editorTitle}</h2>
            <div className="pane-actions">
              {openFileLineCount === null ? null : (
                <span className="line-count">{openFileLineCount} lines</span>
              )}
              <div
                aria-label="TeX font size"
                className="font-size-controls"
                role="group"
              >
                <button
                  aria-label="Decrease TeX font size"
                  className="font-size-button"
                  disabled={texFontSize <= MIN_TEX_FONT_SIZE}
                  onClick={() => handleAdjustTexFontSize(-1)}
                  title="Decrease TeX font size"
                  type="button"
                >
                  <span aria-hidden="true">-</span>
                </button>
                <span className="font-size-value">{texFontSize}px</span>
                <button
                  aria-label="Increase TeX font size"
                  className="font-size-button"
                  disabled={texFontSize >= MAX_TEX_FONT_SIZE}
                  onClick={() => handleAdjustTexFontSize(1)}
                  title="Increase TeX font size"
                  type="button"
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              <span className="selected-path">
                {editorPath ?? "Select a TeX file"}
              </span>
            </div>
          </div>
          {state.projectState === "loading" || state.fileState === "loading" ? (
            <div className="editor-placeholder" aria-live="polite">
              Loading TeX file...
            </div>
          ) : (
            <TexEditor
              content={openFile?.content ?? ""}
              fontSize={texFontSize}
              onChange={handleEditorChange}
              path={openFile?.path ?? null}
              targetLine={state.targetLine}
              targetLineRequestId={state.targetLineRequestId}
            />
          )}
        </section>

        <div
          aria-label="Resize editor and PDF panes"
          aria-orientation="vertical"
          aria-valuemax={75}
          aria-valuemin={25}
          aria-valuenow={Math.round(paneSplit * 100)}
          className="pane-resizer"
          onKeyDown={handlePaneResizeKeyDown}
          onPointerDown={handlePaneResizePointerDown}
          ref={paneResizerRef}
          role="separator"
          tabIndex={0}
        />

        <aside className="right-rail" aria-label="Preview and build">
          <section className="pdf-pane" aria-label="PDF preview">
            <div className="pane-title-row">
              <h2>PDF</h2>
              <span className="selected-path">
                {previewPdfPath ?? "No PDF selected"}
              </span>
            </div>
            <PdfViewer
              onPdfClick={(page, x, y) => void handlePdfClick(page, x, y)}
              pdfPath={previewPdfPath}
              version={state.pdfVersion}
            />
            {state.activityMessage === undefined ? null : (
              <p className="activity-message" role="status">
                {state.activityMessage}
              </p>
            )}
          </section>

          <aside className="build-pane" aria-label="Build panel">
            <BuildLog
              error={visibleError}
              result={state.compileResult}
              status={buildStatus}
            />
          </aside>
        </aside>
      </section>
    </main>
  );
}
