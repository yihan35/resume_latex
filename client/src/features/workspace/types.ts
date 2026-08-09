import type {
  CompileResult,
  ProjectResponse,
} from "../../../../shared/contracts";

export interface DraftState {
  path: string;
  content: string;
  savedContent: string;
  saveState: "idle" | "saving" | "error";
  saveRequestId?: number;
  error?: string | undefined;
}

export interface WorkspaceState {
  project: ProjectResponse | null;
  projectState: "loading" | "ready" | "error";
  selectedResumeId: string | null;
  selectedTexPath: string | null;
  drafts: Record<string, DraftState>;
  projectRequestId: number;
  fileState: "idle" | "loading" | "ready" | "error";
  fileRequestId: number;
  compileRequestId: number;
  synctexRequestId: number;
  compileState: "idle" | "compiling" | "success" | "error";
  compileResult: CompileResult | null;
  pdfVersion: number;
  targetLine: number | null;
  targetLineRequestId: number;
  activityMessage?: string | undefined;
  error?: string | undefined;
}

export type WorkspaceAction =
  | { type: "projectLoading"; requestId: number }
  | { type: "projectLoaded"; requestId: number; project: ProjectResponse }
  | { type: "projectFailed"; requestId: number; error: string }
  | {
      type: "resumeSelected";
      resumeId: string | null;
      compileRequestId: number;
      synctexRequestId: number;
    }
  | { type: "fileRequested"; requestId: number; path: string }
  | {
      type: "fileLoaded";
      requestId: number;
      path: string;
      content: string;
      targetLine?: number | null;
      targetLineRequestId?: number;
    }
  | { type: "fileFailed"; requestId: number; error: string }
  | { type: "fileCancelled"; requestId: number; path: string | null }
  | { type: "editCurrentFile"; content: string }
  | { type: "saveStarted"; path: string; requestId: number }
  | { type: "saveSucceeded"; path: string; requestId: number; content?: string }
  | { type: "saveFailed"; path: string; requestId: number; error: string }
  | { type: "saveCancelled"; path: string; requestId: number }
  | { type: "compileStarted"; requestId: number }
  | { type: "compileCancelled"; requestId: number }
  | { type: "compileSucceeded"; requestId: number; result: CompileResult }
  | { type: "compileFailed"; requestId: number; error: string }
  | { type: "synctexStarted"; requestId: number }
  | { type: "synctexNotFound"; requestId: number }
  | { type: "synctexOpened"; requestId: number; file: string; line: number }
  | { type: "synctexFailed"; requestId: number; error: string };
