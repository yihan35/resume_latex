import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { scanBuffer, scanText } from "./privacy-check.mjs";

describe("scanText", () => {
  it.each([
    [
      "Unix home path",
      "/" + "Users/alice/projects/resume.tex",
      "unix-home-path",
    ],
    [
      "Linux home path",
      "/" + "home/alice/projects/resume.tex",
      "unix-home-path",
    ],
    [
      "Windows user profile",
      "C:\\" + "Users\\Alice\\Documents\\resume.tex",
      "windows-user-profile-path",
    ],
    ["Chinese mobile number", "138" + "1234" + "5678", "chinese-mobile-number"],
    ["email address", "person" + "@company.test", "email-address"],
    ["PEM private key", "-----BEGIN " + "PRIVATE KEY-----", "pem-private-key"],
    [
      "encrypted PEM private key",
      "-----BEGIN " + "ENCRYPTED PRIVATE KEY-----",
      "pem-private-key",
    ],
    [
      "credential assignment",
      "OPENAI_API_" + "KEY=live-value-123",
      "credential-assignment",
    ],
  ])("flags a %s", (_label, text, rule) => {
    expect(scanText("fixture.txt", text)).toEqual([
      { path: "fixture.txt", line: 1, rule },
    ]);
  });

  it("reports every affected line without returning sensitive values", () => {
    const text = [
      "public line",
      "/" + "Users/alice/private.tex",
      "contact=" + "person" + "@company.test",
    ].join("\n");

    expect(scanText("notes.txt", text)).toEqual([
      { path: "notes.txt", line: 2, rule: "unix-home-path" },
      { path: "notes.txt", line: 3, rule: "email-address" },
    ]);
  });

  it("allows the public SSH origin and example.com addresses", () => {
    const publicMetadata = [
      "git@github.com:yihan35/resume_latex.git",
      "maintainer@example.com",
      "https://example.com/alex-chen",
    ].join("\n");

    expect(scanText("package.json", publicMetadata)).toEqual([]);
  });

  it("does not exempt unrelated GitHub SSH origins", () => {
    const unrelatedOrigin = "git" + "@github.com:someone/private.git";

    expect(scanText("package.json", unrelatedOrigin)).toEqual([
      { path: "package.json", line: 1, rule: "email-address" },
    ]);
  });

  it("allows explicitly synthetic credential values", () => {
    const syntheticValues = [
      "API_KEY=test",
      "TOKEN=fake-token",
      "PASSWORD=dummy",
      "CLIENT_SECRET=placeholder",
      "ACCESS_KEY=redacted",
      "SECRET=changeme",
      "CREDENTIAL=your-value",
    ].join("\n");

    expect(scanText("security-fixtures.txt", syntheticValues)).toEqual([]);
  });

  it("allows known synthetic security fixtures in test files", () => {
    const securityFixtures = [
      "/home/alice/private.tex",
      String.raw`C:\Users\Alice\resume\secret.tex`,
      String.raw`/Users/Jane Doe/Private Resume/main.tex`,
      "SECRET=value",
    ].join("\n");

    expect(scanText("server/src/security.test.ts", securityFixtures)).toEqual(
      [],
    );
  });
});

describe("scanBuffer", () => {
  it("skips binary files containing a NUL byte in the first 8 KiB", () => {
    const binary = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]),
      Buffer.from("/" + "Users/alice/private.tex"),
    ]);

    expect(scanBuffer("image.png", binary)).toEqual([]);
  });

  it("scans UTF-8 text buffers", () => {
    const text = Buffer.from("138" + "1234" + "5678", "utf8");

    expect(scanBuffer("fixture.txt", text)).toEqual([
      { path: "fixture.txt", line: 1, rule: "chinese-mobile-number" },
    ]);
  });
});

describe("privacy-check CLI", () => {
  it("scans an archive root and prints only location and rule metadata", () => {
    const root = mkdtempSync(path.join(tmpdir(), "privacy-check-"));
    const script = path.resolve(process.cwd(), "scripts/privacy-check.mjs");

    try {
      writeFileSync(
        path.join(root, "private.txt"),
        ["safe line", "person" + "@company.test"].join("\n"),
      );
      writeFileSync(
        path.join(root, "image.png"),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
      );

      const result = spawnSync(process.execPath, [script, "--root", root], {
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("private.txt:2: email-address\n");
      expect(result.stdout).not.toContain("person");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
