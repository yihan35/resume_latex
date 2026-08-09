import type {
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
