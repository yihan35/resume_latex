import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  default: { spawn: spawnMock },
  spawn: spawnMock,
}));

import { runCommand } from "./runCommand.js";

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = vi.fn();
}

afterEach(() => {
  vi.useRealTimers();
  spawnMock.mockReset();
});

describe("runCommand", () => {
  it("captures both output streams and disables shell execution", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const pending = runCommand("latex-bin", ["resume.tex"], {
      cwd: "/project/resume",
    });
    child.stdout.end("compiled");
    child.stderr.end("warning");
    child.emit("close", 0);

    await expect(pending).resolves.toEqual({
      code: 0,
      stdout: "compiled",
      stderr: "warning",
      timedOut: false,
    });
    expect(spawnMock).toHaveBeenCalledWith("latex-bin", ["resume.tex"], {
      cwd: "/project/resume",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
  });

  it("maps spawn errors to code 127 and resolves only once", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const pending = runCommand("missing-tool", [], { cwd: "/project" });
    child.emit("error", new Error("spawn missing-tool ENOENT"));
    child.stderr.end("late error");
    child.emit("close", 0);

    await expect(pending).resolves.toEqual({
      code: 127,
      stdout: "",
      stderr: "spawn missing-tool ENOENT",
      timedOut: false,
    });
  });

  it("reserves capped stderr space for a spawn diagnostic", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const pending = runCommand("missing-tool", [], {
      cwd: "/project",
      maxOutputBytes: 32,
    });
    child.stderr.write("x".repeat(100));
    child.emit("error", new Error("spawn ENOENT"));

    const result = await pending;
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(32);
    expect(result.stderr).toContain("spawn ENOENT");
  });

  it("records a timeout, terminates, then force-kills after the grace period", async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    child.kill.mockImplementation((signal: NodeJS.Signals) => {
      if (signal === "SIGKILL") {
        child.emit("close", null);
      }
      return true;
    });
    spawnMock.mockReturnValue(child);

    const pending = runCommand("slow-tool", [], {
      cwd: "/project",
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toEqual({
      code: 124,
      stdout: "",
      stderr: "Command timed out after 25ms",
      timedOut: true,
    });
    expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");
  });

  it("keeps a timeout nonzero when SIGTERM leads to a zero exit", async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    child.kill.mockImplementation(() => {
      child.emit("close", 0);
      return true;
    });
    spawnMock.mockReturnValue(child);

    const pending = runCommand("slow-tool", [], {
      cwd: "/project",
      timeoutMs: 10,
    });
    await vi.advanceTimersByTimeAsync(10);

    await expect(pending).resolves.toMatchObject({
      code: 124,
      timedOut: true,
    });
  });

  it("finishes at the kill grace deadline when the child never closes", async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    child.kill.mockReturnValue(false);
    spawnMock.mockReturnValue(child);

    const pending = runCommand("stuck-tool", [], {
      cwd: "/project",
      timeoutMs: 25,
      maxOutputBytes: 40,
    });
    child.stderr.write("x".repeat(100));
    await vi.advanceTimersByTimeAsync(275);

    const result = await pending;
    expect(result).toMatchObject({ code: 124, timedOut: true });
    expect(result.stderr).toContain("timed out after 25ms");
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(40);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  it("caps stdout and stderr independently", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const pending = runCommand("noisy-tool", [], {
      cwd: "/project",
      maxOutputBytes: 4,
    });
    child.stdout.end("abcdefgh");
    child.stderr.end("12345678");
    child.emit("close", 1);

    await expect(pending).resolves.toEqual({
      code: 1,
      stdout: "abcd",
      stderr: "1234",
      timedOut: false,
    });
  });
});
