import type {
  AiChatMessage,
  AiChatRequest,
  CompileRequest,
  SaveFileRequest,
  SynctexRequest,
} from "../../../shared/contracts.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === keys[index])
  );
}

const MAX_AI_PATH_LENGTH = 512;
const MAX_AI_CONTENT_LENGTH = 400_000;
const MAX_AI_RESUME_ID_LENGTH = 200;
const MAX_AI_MESSAGES = 100;
const MAX_AI_MESSAGE_LENGTH = 100_000;

function isAiChatMessage(value: unknown): value is AiChatMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["content", "role"]) &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    value.content.length <= MAX_AI_MESSAGE_LENGTH
  );
}

export function isAiChatRequest(value: unknown): value is AiChatRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["content", "messages", "path", "resumeId"]) &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    value.path.length <= MAX_AI_PATH_LENGTH &&
    typeof value.resumeId === "string" &&
    value.resumeId.length > 0 &&
    value.resumeId.length <= MAX_AI_RESUME_ID_LENGTH &&
    typeof value.content === "string" &&
    value.content.length <= MAX_AI_CONTENT_LENGTH &&
    Array.isArray(value.messages) &&
    value.messages.length <= MAX_AI_MESSAGES &&
    value.messages.every(isAiChatMessage)
  );
}

export function isSaveFileRequest(value: unknown): value is SaveFileRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["content", "path"]) &&
    typeof value.path === "string" &&
    typeof value.content === "string"
  );
}

export function isCompileRequest(value: unknown): value is CompileRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["resumeId"]) &&
    typeof value.resumeId === "string" &&
    value.resumeId.length > 0
  );
}

export function isSynctexRequest(value: unknown): value is SynctexRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["page", "resumeId", "x", "y"]) &&
    typeof value.resumeId === "string" &&
    value.resumeId.length > 0 &&
    typeof value.page === "number" &&
    Number.isInteger(value.page) &&
    value.page >= 1 &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    value.x >= 0 &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    value.y >= 0
  );
}
