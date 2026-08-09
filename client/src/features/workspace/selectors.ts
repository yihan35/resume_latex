import type { WorkspaceState } from "./types";

export function selectCurrentDraft(state: WorkspaceState) {
  return state.selectedTexPath === null
    ? undefined
    : state.drafts[state.selectedTexPath];
}

export function selectSelectedResume(state: WorkspaceState) {
  return (
    state.project?.resumes.find(
      (resume) => resume.id === state.selectedResumeId,
    ) ?? null
  );
}

export function selectIsCurrentDraftDirty(state: WorkspaceState) {
  const draft = selectCurrentDraft(state);
  return draft !== undefined && draft.content !== draft.savedContent;
}

export function selectCanSave(state: WorkspaceState) {
  const draft = selectCurrentDraft(state);
  return (
    draft !== undefined &&
    draft.content !== draft.savedContent &&
    draft.saveState !== "saving"
  );
}

export function selectCanCompile(state: WorkspaceState) {
  return (
    state.projectState === "ready" &&
    state.fileState !== "loading" &&
    state.compileState !== "compiling" &&
    selectSelectedResume(state) !== null
  );
}
