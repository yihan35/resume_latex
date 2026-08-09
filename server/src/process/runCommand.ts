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
      stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
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
      const output = capturedOutput();
      finish({
        code: 127,
        stdout: output.stdout,
        stderr: [output.stderr, error.message].filter(Boolean).join("\n"),
        timedOut,
      });
    });

    child.on("close", (code) => {
      const output = capturedOutput();
      finish({
        code: timedOut ? TIMEOUT_EXIT_CODE : (code ?? 1),
        stdout: output.stdout,
        stderr: [
          output.stderr,
          timedOut ? `Command timed out after ${timeoutMs}ms` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        timedOut,
      });
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      if (!completed) {
        forceKillTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, TIMEOUT_KILL_GRACE_MS);
      }
    }, timeoutMs);
  });
