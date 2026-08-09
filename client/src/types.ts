export interface ResumeInfo {
  name: string;
  dir: string;
  texPath: string;
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

export interface CurrentFileDraft {
  path: string;
  content: string;
}

export interface CompileRequest {
  resumeDir: string;
  currentFile?: CurrentFileDraft;
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
  resumeDir: string;
  page: number;
  x: number;
  y: number;
}

export type SynctexResult =
  | { found: false }
  | {
      found: true;
      file: string;
      line: number;
      column?: number;
    };
