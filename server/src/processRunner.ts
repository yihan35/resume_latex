import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface CommandOptions {
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const TIMEOUT_KILL_GRACE_MS = 250;
const TIMEOUT_EXIT_CODE = 124;

function appendCappedChunk(
  chunks: Buffer[],
  chunk: Buffer,
  capturedBytes: number,
  maxOutputBytes: number,
): number {
  const remainingBytes = maxOutputBytes - capturedBytes;

  if (remainingBytes <= 0) {
    return capturedBytes;
  }

  if (chunk.length <= remainingBytes) {
    chunks.push(chunk);
    return capturedBytes + chunk.length;
  }

  chunks.push(chunk.subarray(0, remainingBytes));
  return maxOutputBytes;
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let resolved = false;
    let timedOut = false;
    let killTimeout: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimeout = setTimeout(() => {
        child.kill("SIGKILL");
      }, TIMEOUT_KILL_GRACE_MS);
    }, timeoutMs);

    function resolveOnce(result: CommandResult): void {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimeout(timeout);
      if (killTimeout !== undefined) {
        clearTimeout(killTimeout);
      }
      resolve(result);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes = appendCappedChunk(
        stdoutChunks,
        chunk,
        stdoutBytes,
        maxOutputBytes,
      );
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes = appendCappedChunk(
        stderrChunks,
        chunk,
        stderrBytes,
        maxOutputBytes,
      );
    });

    child.on("error", (error) => {
      resolveOnce({
        code: 127,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: [Buffer.concat(stderrChunks).toString("utf8"), error.message]
          .filter(Boolean)
          .join("\n"),
      });
    });

    child.on("close", (code) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const timeoutMessage = timedOut
        ? `Command timed out after ${timeoutMs}ms`
        : "";

      resolveOnce({
        code: timedOut ? TIMEOUT_EXIT_CODE : (code ?? 1),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: [stderr, timeoutMessage].filter(Boolean).join("\n"),
      });
    });
  });
}
