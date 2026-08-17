import type {
  AiChatRequest,
  AiChatStreamEvent,
  ApiErrorCode,
  ApiErrorResponse,
  CompileRequest,
  CompileResult,
  FileResponse,
  ProjectResponse,
  SaveFileRequest,
  SaveFileResponse,
  SynctexRequest,
  SynctexResult,
} from "../../../shared/contracts";

export interface ApiClient {
  getProject(signal?: AbortSignal): Promise<ProjectResponse>;
  getFile(path: string, signal?: AbortSignal): Promise<FileResponse>;
  saveFile(
    input: SaveFileRequest,
    signal?: AbortSignal,
  ): Promise<SaveFileResponse>;
  compile(input: CompileRequest, signal?: AbortSignal): Promise<CompileResult>;
  lookupSynctex(
    input: SynctexRequest,
    signal?: AbortSignal,
  ): Promise<SynctexResult>;
  chatAi(
    input: AiChatRequest,
    signal?: AbortSignal,
  ): Promise<AsyncIterable<AiChatStreamEvent>>;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type Fetcher = typeof fetch;

const apiErrorCodes = new Set<ApiErrorCode>([
  "INVALID_REQUEST",
  "FILE_NOT_FOUND",
  "UNSAFE_PATH",
  "LATEX_NOT_FOUND",
  "SYNCTEX_NOT_FOUND",
  "COMPILE_BUSY",
  "COMPILE_FAILED",
  "AI_NOT_CONFIGURED",
  "AI_UPSTREAM_ERROR",
  "INTERNAL_ERROR",
]);

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    apiErrorCodes.has(error.code as ApiErrorCode) &&
    "message" in error &&
    typeof error.message === "string"
  );
}

async function requestJson<T>(
  fetcher: Fetcher,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(url, init);

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiClientError(
        response.status,
        "INTERNAL_ERROR",
        `Request failed with status ${response.status}`,
      );
    }
    if (isApiErrorResponse(body)) {
      throw new ApiClientError(
        response.status,
        body.error.code,
        body.error.message,
      );
    }
    throw new ApiClientError(
      response.status,
      "INTERNAL_ERROR",
      `Request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

function jsonRequest(
  method: "POST" | "PUT",
  body: unknown,
  signal?: AbortSignal,
): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  };
}

async function* sseEvents(
  response: Response,
): AsyncGenerator<AiChatStreamEvent> {
  if (response.body === null) {
    throw new ApiClientError(
      response.status,
      "INTERNAL_ERROR",
      "Empty AI response",
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let separator: number;
      while ((separator = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "") continue;
          yield JSON.parse(payload) as AiChatStreamEvent;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function chatAi(
  fetcher: Fetcher,
  input: AiChatRequest,
  signal?: AbortSignal,
): Promise<AsyncIterable<AiChatStreamEvent>> {
  const response = await fetcher("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Fall through to the safe internal error below.
    }
    if (isApiErrorResponse(body)) {
      throw new ApiClientError(
        response.status,
        body.error.code,
        body.error.message,
      );
    }
    throw new ApiClientError(
      response.status,
      "INTERNAL_ERROR",
      `Request failed with status ${response.status}`,
    );
  }

  return sseEvents(response);
}

function signalInit(signal?: AbortSignal): RequestInit | undefined {
  return signal === undefined ? undefined : { signal };
}

export function createApiClient(fetcher: Fetcher = fetch): ApiClient {
  return {
    getProject: (signal) =>
      requestJson(fetcher, "/api/project", signalInit(signal)),
    getFile: (path, signal) => {
      const query = new URLSearchParams({ path });
      return requestJson(
        fetcher,
        `/api/file?${query.toString()}`,
        signalInit(signal),
      );
    },
    saveFile: (input, signal) =>
      requestJson(fetcher, "/api/file", jsonRequest("PUT", input, signal)),
    compile: (input, signal) =>
      requestJson(fetcher, "/api/compile", jsonRequest("POST", input, signal)),
    lookupSynctex: (input, signal) =>
      requestJson(fetcher, "/api/synctex", jsonRequest("POST", input, signal)),
    chatAi: (input, signal) => chatAi(fetcher, input, signal),
  };
}
