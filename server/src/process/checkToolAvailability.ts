import { runCommand, type CommandRunner } from "./runCommand.js";

export type ToolAvailabilityChecker = (command: string) => Promise<boolean>;

const PROBE_TIMEOUT_MS = 2_000;
const PROBE_MAX_OUTPUT_BYTES = 1_024;

export function createToolAvailabilityChecker(options: {
  cwd: string;
  runner?: CommandRunner;
}): ToolAvailabilityChecker {
  const runner = options.runner ?? runCommand;

  return async (command) => {
    try {
      const result = await runner(command, ["--version"], {
        cwd: options.cwd,
        timeoutMs: PROBE_TIMEOUT_MS,
        maxOutputBytes: PROBE_MAX_OUTPUT_BYTES,
      });
      return result.code === 0 && !result.timedOut;
    } catch {
      return false;
    }
  };
}
