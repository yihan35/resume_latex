import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { compileResume, getFile, getProject, lookupSynctex } from "./api";
import { BuildLog, type BuildLogStatus } from "./components/BuildLog";
import { PdfViewer } from "./components/PdfViewer";
import { TexEditor } from "./components/TexEditor";
import { TexFileTree } from "./components/TexFileTree";
import type { CurrentFileDraft, ProjectResponse, ResumeInfo } from "./types";

type ProjectLoadState = "loading" | "ready" | "error";
type FileLoadState = "idle" | "loading" | "ready" | "error";
type CompileState = "idle" | "compiling" | "success" | "error";
const MIN_TEX_FONT_SIZE = 8;
const MAX_TEX_FONT_SIZE = 20;

function isFileInResume(filePath: string, resume: ResumeInfo) {
  return (
    filePath === resume.entryPath ||
    filePath === resume.dir ||
    filePath.startsWith(`${resume.dir}/`)
  );
}

function defaultTexPathForResume(project: ProjectResponse, resumeDir: string) {
  const resume = project.resumes.find(
    (candidate) => candidate.dir === resumeDir,
  );

  if (resume === undefined) {
    return project.texFiles[0]?.path ?? null;
  }

  return (
    project.texFiles.find((file) => file.path === resume.entryPath)?.path ??
    project.texFiles.find((file) => isFileInResume(file.path, resume))?.path ??
    resume.entryPath
  );
}

function resumeDirForTexPath(project: ProjectResponse, filePath: string) {
  return (
    project.resumes
      .filter((resume) => isFileInResume(filePath, resume))
      .sort((left, right) => right.dir.length - left.dir.length)[0]?.dir ?? null
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeOpenFile(
  requestedPath: string,
  response: { path?: string; content?: string },
): CurrentFileDraft {
  return {
    path:
      typeof response.path === "string" && response.path.length > 0
        ? response.path
        : requestedPath,
    content: typeof response.content === "string" ? response.content : "",
  };
}

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

async function readTexFile(path: string): Promise<CurrentFileDraft> {
  return normalizeOpenFile(path, await getFile(path));
}

export function App() {
  const [project, setProject] = useState<ProjectResponse>({
    resumes: [],
    texFiles: [],
  });
  const [loadState, setLoadState] = useState<ProjectLoadState>("loading");
  const [loadError, setLoadError] = useState<string>();
  const [fileLoadState, setFileLoadState] = useState<FileLoadState>("idle");
  const [fileError, setFileError] = useState<string>();
  const [selectedResumeDir, setSelectedResumeDir] = useState<string | null>(
    null,
  );
  const [isFilePaneCollapsed, setIsFilePaneCollapsed] = useState(false);
  const [paneSplit, setPaneSplit] = useState(0.5);
  const [selectedTexPath, setSelectedTexPath] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<CurrentFileDraft | null>(null);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [targetLineRequestId, setTargetLineRequestId] = useState(0);
  const [compileState, setCompileState] = useState<CompileState>("idle");
  const [compileError, setCompileError] = useState<string>();
  const [compileResult, setCompileResult] = useState<Awaited<
    ReturnType<typeof compileResume>
  > | null>(null);
  const [pdfVersion, setPdfVersion] = useState(0);
  const [texFontSize, setTexFontSize] = useState(13);
  const [activityMessage, setActivityMessage] = useState<string>();
  const isMountedRef = useRef(true);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const filePaneRef = useRef<HTMLElement | null>(null);
  const paneResizerRef = useRef<HTMLDivElement | null>(null);
  const fileRequestIdRef = useRef(0);
  const compileRequestIdRef = useRef(0);
  const synctexRequestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadTexFile = useCallback(
    async (
      path: string,
      nextTargetLine: number | null = null,
      isCurrentRequest: () => boolean = () => true,
    ) => {
      const requestId = fileRequestIdRef.current + 1;
      fileRequestIdRef.current = requestId;

      setSelectedTexPath(path);
      setFileLoadState("loading");
      setFileError(undefined);
      setTargetLine(null);

      try {
        const nextOpenFile = await readTexFile(path);

        if (!isMountedRef.current || requestId !== fileRequestIdRef.current) {
          return false;
        }

        if (!isCurrentRequest()) {
          return false;
        }

        setOpenFile(nextOpenFile);
        setSelectedTexPath(nextOpenFile.path);
        setTargetLine(nextTargetLine);
        if (nextTargetLine !== null) {
          setTargetLineRequestId((currentId) => currentId + 1);
        }
        setFileLoadState("ready");
        return true;
      } catch (error) {
        if (!isMountedRef.current || requestId !== fileRequestIdRef.current) {
          return false;
        }

        if (!isCurrentRequest()) {
          return false;
        }

        setOpenFile(null);
        setFileError(errorMessage(error, "Unable to load TeX file"));
        setFileLoadState("error");
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadProject() {
      setLoadState("loading");
      setLoadError(undefined);
      setFileError(undefined);
      setCompileError(undefined);

      try {
        const nextProject = await getProject();

        if (isCancelled || !isMountedRef.current) {
          return;
        }

        const initialResumeDir = nextProject.resumes[0]?.dir ?? null;
        const initialTexPath =
          initialResumeDir === null
            ? (nextProject.texFiles[0]?.path ?? null)
            : defaultTexPathForResume(nextProject, initialResumeDir);
        let initialOpenFile: CurrentFileDraft | null = null;
        let nextFileLoadState: FileLoadState =
          initialTexPath === null ? "idle" : "ready";
        let nextFileError: string | undefined;

        if (initialTexPath !== null) {
          setFileLoadState("loading");

          try {
            initialOpenFile = await readTexFile(initialTexPath);
          } catch (error) {
            nextFileLoadState = "error";
            nextFileError = errorMessage(error, "Unable to load TeX file");
          }
        }

        if (isCancelled || !isMountedRef.current) {
          return;
        }

        setProject(nextProject);
        setSelectedResumeDir(initialResumeDir);
        setSelectedTexPath(initialOpenFile?.path ?? initialTexPath);
        setOpenFile(initialOpenFile);
        setTargetLine(null);
        setFileError(nextFileError);
        setFileLoadState(nextFileLoadState);
        setLoadState("ready");
      } catch (error) {
        if (isCancelled || !isMountedRef.current) {
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "Unable to load project",
        );
        setLoadState("error");
      }
    }

    void loadProject();

    return () => {
      isCancelled = true;
    };
  }, []);

  const selectedResume = useMemo(
    () =>
      project.resumes.find((resume) => resume.dir === selectedResumeDir) ??
      null,
    [project.resumes, selectedResumeDir],
  );
  const selectedFile = useMemo(
    () =>
      project.texFiles.find((file) => file.path === selectedTexPath) ?? null,
    [project.texFiles, selectedTexPath],
  );
  const editorTitle =
    selectedFile?.name ?? openFile?.path.split("/").at(-1) ?? "Editor";
  const editorPath =
    fileLoadState === "loading"
      ? selectedTexPath
      : (openFile?.path ?? selectedTexPath);
  const openFileLineCount =
    openFile === null ? null : countLines(openFile.content);
  const previewPdfPath =
    selectedResume?.pdfPath ?? compileResult?.pdfPath ?? null;
  const buildStatus: BuildLogStatus =
    compileState === "compiling"
      ? "compiling"
      : loadState === "error" || compileState === "error"
        ? "error"
        : loadState === "loading" || fileLoadState === "loading"
          ? "loading"
          : fileLoadState === "error" && compileState === "idle"
            ? "error"
            : compileState === "success"
              ? "success"
              : "ready";
  const visibleFileError = compileState === "idle" ? fileError : undefined;
  const visibleError = loadError ?? compileError ?? visibleFileError;
  const canCompile =
    loadState === "ready" &&
    fileLoadState !== "loading" &&
    compileState !== "compiling" &&
    selectedResume !== null;
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
    compileRequestIdRef.current += 1;
    synctexRequestIdRef.current += 1;
    setCompileState("idle");
    setCompileResult(null);
    setCompileError(undefined);
    setActivityMessage(undefined);
    const owningResumeDir = resumeDirForTexPath(project, path);
    if (owningResumeDir !== null) {
      setSelectedResumeDir(owningResumeDir);
    }

    void loadTexFile(path);
  }

  function handleEditorChange(content: string) {
    setOpenFile((currentOpenFile) =>
      currentOpenFile === null
        ? currentOpenFile
        : { ...currentOpenFile, content },
    );
  }

  function handleAdjustTexFontSize(delta: number) {
    setTexFontSize((currentFontSize) =>
      clampTexFontSize(currentFontSize + delta),
    );
  }

  async function handleCompile() {
    if (selectedResume === null || compileState === "compiling") {
      return;
    }

    const requestId = compileRequestIdRef.current + 1;
    compileRequestIdRef.current = requestId;
    setCompileState("compiling");
    setCompileError(undefined);
    setActivityMessage("Compiling current resume...");

    try {
      const result = await compileResume({
        resumeDir: selectedResume.dir,
        ...(openFile === null ? {} : { currentFile: openFile }),
      });

      if (!isMountedRef.current || requestId !== compileRequestIdRef.current) {
        return;
      }

      setCompileResult(result);

      if (result.ok) {
        setCompileState("success");
        setPdfVersion((currentVersion) => currentVersion + 1);
        setActivityMessage(`Compiled ${selectedResume.name}.`);
      } else {
        setCompileState("error");
        setActivityMessage("Compile finished with errors.");
      }
    } catch (error) {
      if (!isMountedRef.current || requestId !== compileRequestIdRef.current) {
        return;
      }

      setCompileResult(null);
      setCompileError(errorMessage(error, "Compile request failed"));
      setCompileState("error");
      setActivityMessage("Compile request failed.");
    }
  }

  async function handlePdfClick(page: number, x: number, y: number) {
    if (selectedResume === null) {
      setActivityMessage("Select a resume before looking up a source line.");
      return;
    }

    setActivityMessage("Looking up source line...");
    const requestId = synctexRequestIdRef.current + 1;
    synctexRequestIdRef.current = requestId;
    fileRequestIdRef.current += 1;
    const stableOpenFile = openFile;
    setFileError(undefined);
    setFileLoadState((currentState) =>
      currentState === "loading"
        ? stableOpenFile === null
          ? "idle"
          : "ready"
        : currentState,
    );
    if (stableOpenFile !== null) {
      setSelectedTexPath(stableOpenFile.path);
      const stableResumeDir = resumeDirForTexPath(project, stableOpenFile.path);
      if (stableResumeDir !== null) {
        setSelectedResumeDir(stableResumeDir);
      }
    } else {
      setSelectedTexPath(null);
    }
    setTargetLine(null);

    try {
      const result = await lookupSynctex({
        resumeDir: selectedResume.dir,
        page,
        x,
        y,
      });

      if (!isMountedRef.current || requestId !== synctexRequestIdRef.current) {
        return;
      }

      if (!result.found) {
        setActivityMessage("No matching source line.");
        return;
      }

      const owningResumeDir = resumeDirForTexPath(project, result.file);
      if (owningResumeDir !== null) {
        setSelectedResumeDir(owningResumeDir);
      }

      const opened = await loadTexFile(
        result.file,
        result.line,
        () => requestId === synctexRequestIdRef.current,
      );

      if (
        opened &&
        isMountedRef.current &&
        requestId === synctexRequestIdRef.current
      ) {
        setActivityMessage(`Opened ${result.file} source line ${result.line}.`);
      }
    } catch (error) {
      if (!isMountedRef.current || requestId !== synctexRequestIdRef.current) {
        return;
      }

      setActivityMessage(errorMessage(error, "SyncTeX lookup failed."));
    }
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
          {loadState === "loading" || fileLoadState === "loading" ? (
            <div className="editor-placeholder" aria-live="polite">
              Loading TeX file...
            </div>
          ) : (
            <TexEditor
              content={openFile?.content ?? ""}
              fontSize={texFontSize}
              onChange={handleEditorChange}
              path={openFile?.path ?? null}
              targetLine={targetLine}
              targetLineRequestId={targetLineRequestId}
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
              error={visibleError}
              result={compileResult}
              status={buildStatus}
            />
          </aside>
        </aside>
      </section>
    </main>
  );
}
