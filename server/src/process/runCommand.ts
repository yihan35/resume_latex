import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs?: number; maxOutputBytes?: number },
) => Promise<CommandResult>;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const TIMEOUT_KILL_GRACE_MS = 250;
const TIMEOUT_EXIT_CODE = 124;

function appendCappedChunk(
  chunks: Buffer[],
  value: Buffer | string,
  capturedBytes: number,
  maxOutputBytes: number,
): number {
  const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const remainingBytes = maxOutputBytes - capturedBytes;

  if (remainingBytes <= 0) {
    return capturedBytes;
  }

  chunks.push(
    chunk.length <= remainingBytes ? chunk : chunk.subarray(0, remainingBytes),
  );
  return capturedBytes + Math.min(chunk.length, remainingBytes);
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value);
  if (bytes.length <= maxBytes) {
    return value;
  }

  let result = bytes.subarray(0, Math.max(0, maxBytes)).toString("utf8");
  while (Buffer.byteLength(result) > maxBytes) {
    result = result.slice(0, -1);
  }
  return result;
}

function decodeCaptured(chunks: Buffer[], maxBytes: number): string {
  return truncateUtf8(Buffer.concat(chunks).toString("utf8"), maxBytes);
}

function appendDiagnostic(
  chunks: Buffer[],
  diagnostic: string,
  maxBytes: number,
): string {
  const boundedDiagnostic = truncateUtf8(diagnostic, maxBytes);
  const diagnosticBytes = Buffer.byteLength(boundedDiagnostic);
  const hasCapturedOutput = chunks.some((chunk) => chunk.length > 0);
  const separator = hasCapturedOutput && diagnosticBytes > 0 ? "\n" : "";
  const capturedBudget = Math.max(
    0,
    maxBytes - diagnosticBytes - Buffer.byteLength(separator),
  );
  const captured = decodeCaptured(chunks, capturedBudget);

  return `${captured}${captured.length > 0 ? separator : ""}${boundedDiagnostic}`;
}

export const runCommand: CommandRunner = (command, args, options) =>
  new Promise((resolve) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let completed = false;
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const capturedOutput = (): Pick<CommandResult, "stdout" | "stderr"> => ({
      stdout: decodeCaptured(stdoutChunks, maxOutputBytes),
      stderr: decodeCaptured(stderrChunks, maxOutputBytes),
    });

    const timeoutMessage = (): string =>
      `Command timed out after ${timeoutMs}ms`;

    const timeoutResult = (extraDiagnostic = ""): CommandResult => ({
      code: TIMEOUT_EXIT_CODE,
      stdout: decodeCaptured(stdoutChunks, maxOutputBytes),
      stderr: appendDiagnostic(
        stderrChunks,
        [extraDiagnostic, timeoutMessage()].filter(Boolean).join("\n"),
        maxOutputBytes,
      ),
      timedOut: true,
    });

    const finish = (result: CommandResult): void => {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer !== undefined) {
        clearTimeout(forceKillTimer);
      }
      resolve(result);
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutBytes = appendCappedChunk(
        stdoutChunks,
        chunk,
        stdoutBytes,
        maxOutputBytes,
      );
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrBytes = appendCappedChunk(
        stderrChunks,
        chunk,
        stderrBytes,
        maxOutputBytes,
      );
    });

    child.on("error", (error) => {
      if (timedOut) {
        finish(timeoutResult(error.message));
        return;
      }

      finish({
        code: 127,
        stdout: decodeCaptured(stdoutChunks, maxOutputBytes),
        stderr: appendDiagnostic(stderrChunks, error.message, maxOutputBytes),
        timedOut: false,
      });
    });

    child.on("close", (code) => {
      if (timedOut) {
        finish(timeoutResult());
        return;
      }

      const output = capturedOutput();
      finish({
        code: code ?? 1,
        stdout: output.stdout,
        stderr: output.stderr,
        timedOut: false,
      });
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch (error) {
        finish(timeoutResult(error instanceof Error ? error.message : ""));
        return;
      }
      if (!completed) {
        forceKillTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch (error) {
            finish(timeoutResult(error instanceof Error ? error.message : ""));
            return;
          }
          finish(timeoutResult());
        }, TIMEOUT_KILL_GRACE_MS);
      }
    }, timeoutMs);
  });
