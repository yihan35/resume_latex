import type {
  CompileRequest,
  CompileResult,
  FileResponse,
  ProjectResponse,
  SaveFileRequest,
  SaveFileResponse,
  SynctexRequest,
  SynctexResult
} from "./types";

interface ErrorResponse {
  error?: string;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorResponse;
    return body.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response =
    init === undefined ? await fetch(url) : await fetch(url, init);

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

function jsonRequest(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

export function getProject(): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>("/api/project");
}

export function getFile(path: string): Promise<FileResponse> {
  const query = new URLSearchParams({ path });
  return requestJson<FileResponse>(`/api/file?${query.toString()}`);
}

export function saveFile(
  request: SaveFileRequest
): Promise<SaveFileResponse> {
  return requestJson<SaveFileResponse>(
    "/api/file",
    jsonRequest("PUT", request)
  );
}

export function compileResume(
  request: CompileRequest
): Promise<CompileResult> {
  return requestJson<CompileResult>(
    "/api/compile",
    jsonRequest("POST", request)
  );
}

export function lookupSynctex(
  request: SynctexRequest
): Promise<SynctexResult> {
  return requestJson<SynctexResult>(
    "/api/synctex",
    jsonRequest("POST", request)
  );
}
