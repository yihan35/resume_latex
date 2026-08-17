export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "FILE_NOT_FOUND"
  | "UNSAFE_PATH"
  | "LATEX_NOT_FOUND"
  | "SYNCTEX_NOT_FOUND"
  | "COMPILE_BUSY"
  | "COMPILE_FAILED"
  | "AI_NOT_CONFIGURED"
  | "AI_UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export interface ResumeInfo {
  id: string;
  name: string;
  dir: string;
  entryPath: string;
  pdfPath: string;
}

export interface TexFileInfo {
  path: string;
  name: string;
  dir: string;
}

export interface ProjectResponse {
  resumes: ResumeInfo[];
  texFiles: TexFileInfo[];
}

export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string };
}

export interface FileResponse {
  path: string;
  content: string;
}

export interface SaveFileRequest {
  path: string;
  content: string;
}

export interface SaveFileResponse {
  ok: true;
}

export interface CompileRequest {
  resumeId: string;
}

export interface CompileResult {
  ok: boolean;
  elapsedMs: number;
  pdfPath: string;
  logSummary: string;
  stdout: string;
  stderr: string;
}

export interface SynctexRequest {
  resumeId: string;
  page: number;
  x: number;
  y: number;
}

export type SynctexResult =
  | { found: false }
  | { found: true; file: string; line: number; column?: number };

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  path: string;
  content: string;
  messages: AiChatMessage[];
}

export type AiChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; code: ApiErrorCode; message: string };
