import { useMemo, useRef, useState, type CSSProperties } from "react";

import { AppHeader } from "../components/AppHeader";
import { AiChatPanel } from "../components/AiChatPanel";
import { EditorPane } from "../components/EditorPane";
import { FilePane } from "../components/FilePane";
import { PaneResizer } from "../components/PaneResizer";
import { PreviewPane } from "../components/PreviewPane";
import { type BuildLogStatus } from "../components/BuildLog";
import {
  selectCanCompile,
  selectCurrentDraft,
  selectIsCurrentDraftDirty,
  selectSelectedResume,
} from "../features/workspace/selectors";
import { useWorkspace } from "../features/workspace/useWorkspace";

function countLines(content: string) {
  return content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length;
}

export function App() {
  const workspace = useWorkspace();
  const { state } = workspace;
  const project = state.project ?? { resumes: [], texFiles: [] };
  const [aiOpen, setAiOpen] = useState(false);
  const [isFilePaneCollapsed, setIsFilePaneCollapsed] = useState(false);
  const [paneSplit, setPaneSplit] = useState(0.5);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const filePaneRef = useRef<HTMLElement | null>(null);
  const selectedResume = selectSelectedResume(state);
  const openFile = selectCurrentDraft(state) ?? null;
  const selectedFile = useMemo(
    () =>
      project.texFiles.find((file) => file.path === state.selectedTexPath) ??
      null,
    [project.texFiles, state.selectedTexPath],
  );
  const editorTitle =
    selectedFile?.name ?? openFile?.path.split("/").at(-1) ?? "Editor";
  const editorPath =
    state.fileState === "loading"
      ? state.selectedTexPath
      : (openFile?.path ?? state.selectedTexPath);
  const previewPdfPath =
    state.previewPdfPath ?? selectedResume?.pdfPath ?? null;
  const buildStatus: BuildLogStatus =
    state.compileState === "compiling"
      ? "compiling"
      : state.projectState === "error" ||
          state.compileState === "error" ||
          (state.fileState === "error" && state.compileState === "idle")
        ? "error"
        : state.projectState === "loading" || state.fileState === "loading"
          ? "loading"
          : state.compileState === "success"
            ? "success"
            : "ready";
  const workspaceStyle = useMemo(
    () =>
      ({
        "--editor-pane-fr": `${paneSplit.toFixed(3)}fr`,
        "--preview-pane-fr": `${(1 - paneSplit).toFixed(3)}fr`,
      }) as CSSProperties,
    [paneSplit],
  );

  return (
    <main className="app-shell">
      <AppHeader
        aiOpen={aiOpen}
        canCompile={selectCanCompile(state)}
        onCompile={workspace.compileSelectedResume}
        onToggleAi={() => setAiOpen((value) => !value)}
        resumeDirectory={selectedResume?.dir}
      />
      <section
        className={`workspace${isFilePaneCollapsed ? " is-file-pane-collapsed" : ""}`}
        ref={workspaceRef}
        style={workspaceStyle}
      >
        <FilePane
          collapsed={isFilePaneCollapsed}
          files={project.texFiles}
          onCollapsedChange={setIsFilePaneCollapsed}
          onSelect={(path) => void workspace.selectFile(path)}
          ref={filePaneRef}
          selectedPath={state.selectedTexPath}
        />
        <EditorPane
          content={openFile?.content ?? ""}
          isDirty={selectIsCurrentDraftDirty(state)}
          isLoading={
            state.projectState === "loading" || state.fileState === "loading"
          }
          isSaving={openFile?.saveState === "saving"}
          lineCount={openFile === null ? null : countLines(openFile.content)}
          onChange={workspace.editCurrentFile}
          onSave={workspace.saveCurrentFile}
          path={editorPath}
          targetLine={state.targetLine}
          targetLineRequestId={state.targetLineRequestId}
          title={editorTitle}
        />
        <PaneResizer
          filePaneRef={filePaneRef}
          onPaneSplitChange={setPaneSplit}
          paneSplit={paneSplit}
          workspaceRef={workspaceRef}
        />
        <PreviewPane
          activityMessage={state.activityMessage}
          buildError={state.error}
          buildResult={state.compileResult}
          buildStatus={buildStatus}
          onPdfClick={(page, x, y) => void workspace.lookupSource(page, x, y)}
          pdfPath={previewPdfPath}
          pdfVersion={state.pdfVersion}
          resumeId={selectedResume?.id ?? null}
        />
      </section>
      <AiChatPanel
        fileContent={openFile?.content ?? ""}
        filePath={openFile?.path ?? null}
        onApply={workspace.editCurrentFile}
        onClose={() => setAiOpen(false)}
        open={aiOpen}
      />
    </main>
  );
}
