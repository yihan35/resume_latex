export type {
  FileResponse,
  ProjectResponse,
  ResumeInfo,
  SaveFileRequest,
  SaveFileResponse,
  TexFileInfo,
} from "../../shared/contracts";

import type { CompileResult, SynctexResult } from "../../shared/contracts";

export interface CurrentFileDraft {
  path: string;
  content: string;
}

export interface CompileRequest {
  resumeDir: string;
  currentFile?: CurrentFileDraft;
}

export interface SynctexRequest {
  resumeDir: string;
  page: number;
  x: number;
  y: number;
}

export type { CompileResult, SynctexResult };
