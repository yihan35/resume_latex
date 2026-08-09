import process from "node:process";

import { describe, expect, it } from "vitest";

import { runCommand } from "./processRunner.js";

describe("processRunner", () => {
  it("returns code 127 and stderr for spawn errors", async () => {
    const result = await runCommand(
      "resume-editor-clearly-not-a-real-command",
      [],
      { cwd: process.cwd() }
    );

    expect(result.code).toBe(127);
    expect(result.stderr).toContain("resume-editor-clearly-not-a-real-command");
  });

  it("captures stdout and stderr", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.stdout.write('out'); process.stderr.write('err');"],
      { cwd: process.cwd() }
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
  });

  it("times out delayed commands", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "setTimeout(() => process.stdout.write('late'), 1000);"],
      { cwd: process.cwd(), timeoutMs: 25 }
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("timed out");
  });

  it("kills commands that ignore SIGTERM after timing out", async () => {
    const startedAt = Date.now();

    const result = await runCommand(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"
      ],
      { cwd: process.cwd(), timeoutMs: 25 }
    );

    expect(Date.now() - startedAt).toBeLessThan(1500);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("timed out");
  }, 2000);

  it("returns nonzero when a timed-out command exits zero after SIGTERM", async () => {
    const result = await runCommand(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);"
      ],
      { cwd: process.cwd(), timeoutMs: 25 }
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("timed out");
  });

  it("truncates stdout and stderr at the configured output cap", async () => {
    const result = await runCommand(
      process.execPath,
      [
        "-e",
        "process.stdout.write('a'.repeat(100)); process.stderr.write('b'.repeat(100));"
      ],
      { cwd: process.cwd(), maxOutputBytes: 16 }
    );

    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(16);
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(16);
  });
});
