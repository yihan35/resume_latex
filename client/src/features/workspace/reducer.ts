import type { WorkspaceAction, WorkspaceState } from "./types";

export const initialWorkspaceState: WorkspaceState = {
  project: null,
  projectState: "loading",
  selectedResumeId: null,
  selectedTexPath: null,
  drafts: {},
  projectRequestId: 0,
  fileState: "idle",
  fileRequestId: 0,
  compileRequestId: 0,
  synctexRequestId: 0,
  compileState: "idle",
  compileResult: null,
  pdfVersion: 0,
  targetLine: null,
  targetLineRequestId: 0,
};

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "projectLoading":
      return {
        ...state,
        projectState: "loading",
        projectRequestId: action.requestId,
        error: undefined,
      };
    case "projectLoaded":
      if (action.requestId !== state.projectRequestId) return state;
      return {
        ...initialWorkspaceState,
        project: action.project,
        projectState: "ready",
        selectedResumeId: action.project.resumes[0]?.id ?? null,
      };
    case "projectFailed":
      return action.requestId !== state.projectRequestId
        ? state
        : { ...state, projectState: "error", error: action.error };
    case "resumeSelected":
      return {
        ...state,
        selectedResumeId: action.resumeId,
        compileRequestId: action.compileRequestId,
        synctexRequestId: action.synctexRequestId,
        compileState: "idle",
        compileResult: null,
        targetLine: null,
        activityMessage: undefined,
        error: undefined,
      };
    case "fileRequested":
      return {
        ...state,
        selectedTexPath: action.path,
        fileState: "loading",
        fileRequestId: action.requestId,
        targetLine: null,
        error: undefined,
      };
    case "fileLoaded": {
      if (action.requestId !== state.fileRequestId) return state;
      const currentDraft = state.drafts[action.path];
      return {
        ...state,
        selectedTexPath: action.path,
        drafts:
          currentDraft === undefined
            ? {
                ...state.drafts,
                [action.path]: {
                  path: action.path,
                  content: action.content,
                  savedContent: action.content,
                  saveState: "idle",
                  saveRequestId: 0,
                },
              }
            : state.drafts,
        fileState: "ready",
        targetLine: action.targetLine ?? null,
        targetLineRequestId:
          action.targetLineRequestId ?? state.targetLineRequestId,
      };
    }
    case "fileFailed":
      return action.requestId !== state.fileRequestId
        ? state
        : { ...state, fileState: "error", error: action.error };
    case "fileCancelled":
      return action.requestId !== state.fileRequestId
        ? state
        : {
            ...state,
            selectedTexPath: action.path,
            fileState: action.path === null ? "idle" : "ready",
            targetLine: null,
          };
    case "editCurrentFile": {
      if (state.selectedTexPath === null) return state;
      const path = state.selectedTexPath;
      const draft = state.drafts[path];
      if (draft === undefined) return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [path]: { ...draft, content: action.content, error: undefined },
        },
      };
    }
    case "saveStarted": {
      const draft = state.drafts[action.path];
      if (draft === undefined) return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.path]: {
            ...draft,
            saveState: "saving",
            saveRequestId: action.requestId,
            error: undefined,
          },
        },
      };
    }
    case "saveSucceeded": {
      const draft = state.drafts[action.path];
      if (draft === undefined || draft.saveRequestId !== action.requestId)
        return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.path]: {
            ...draft,
            savedContent: action.content ?? draft.content,
            saveState: "idle",
            error: undefined,
          },
        },
      };
    }
    case "saveFailed": {
      const draft = state.drafts[action.path];
      if (draft === undefined || draft.saveRequestId !== action.requestId)
        return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.path]: { ...draft, saveState: "error", error: action.error },
        },
        error: action.error,
      };
    }
    case "saveCancelled": {
      const draft = state.drafts[action.path];
      if (draft === undefined || draft.saveRequestId !== action.requestId)
        return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.path]: { ...draft, saveState: "idle", error: undefined },
        },
      };
    }
    case "compileStarted":
      return {
        ...state,
        compileRequestId: action.requestId,
        compileState: "compiling",
        error: undefined,
        activityMessage: "Compiling current resume...",
      };
    case "compileCancelled":
      return action.requestId !== state.compileRequestId
        ? state
        : { ...state, compileState: "idle" };
    case "compileSucceeded": {
      if (action.requestId !== state.compileRequestId) return state;
      if (!action.result.ok) {
        return {
          ...state,
          compileState: "error",
          error: undefined,
          activityMessage: "Compile finished with errors.",
        };
      }
      return {
        ...state,
        compileState: "success",
        compileResult: action.result,
        pdfVersion: state.pdfVersion + 1,
        activityMessage: "Compiled current resume.",
      };
    }
    case "compileFailed":
      return action.requestId !== state.compileRequestId
        ? state
        : {
            ...state,
            compileState: "error",
            error: action.error,
            activityMessage: "Compile request failed.",
          };
    case "synctexStarted":
      return {
        ...state,
        synctexRequestId: action.requestId,
        targetLine: null,
        error: undefined,
        activityMessage: "Looking up source line...",
      };
    case "synctexNotFound":
      return action.requestId !== state.synctexRequestId
        ? state
        : { ...state, activityMessage: "No matching source line." };
    case "synctexOpened":
      return action.requestId !== state.synctexRequestId
        ? state
        : {
            ...state,
            activityMessage: `Opened ${action.file} source line ${action.line}.`,
          };
    case "synctexFailed":
      return action.requestId !== state.synctexRequestId
        ? state
        : { ...state, activityMessage: action.error };
  }
}
