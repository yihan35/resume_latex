#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const BINARY_PREFIX_BYTES = 8 * 1024;

const SAFE_ASSIGNMENT_VALUES = new Set([
  "changeme",
  "dummy",
  "example",
  "fake",
  "fake-token",
  "not-a-secret",
  "placeholder",
  "redacted",
  "sample",
  "synthetic",
  "test",
  "xxx",
  "your-value",
]);
const SYNTHETIC_UNIX_TEST_PATHS = ["/home/" + "alice", "/Users/" + "Jane Doe"];
const GITHUB_SSH_ACCOUNT = "git" + "@github" + ".com";
const PUBLIC_GITHUB_SSH_ORIGINS = [
  `${GITHUB_SSH_ACCOUNT}:yihan35/resume_latex.git`,
  `git+ssh://${GITHUB_SSH_ACCOUNT}/yihan35/resume_latex.git`,
];

const RULES = [
  {
    name: "unix-home-path",
    hasFinding: hasUnixHomePath,
  },
  {
    name: "windows-user-profile-path",
    hasFinding: hasWindowsUserProfilePath,
  },
  {
    name: "chinese-mobile-number",
    hasFinding: (line) => /(?<!\d)1[3-9]\d{9}(?!\d)/.test(line),
  },
  {
    name: "email-address",
    hasFinding: hasPrivateEmail,
  },
  {
    name: "pem-private-key",
    hasFinding: (line) =>
      /-----BEGIN (?:(?:RSA|EC|OPENSSH|DSA|ENCRYPTED) )?PRIVATE KEY-----/.test(
        line,
      ),
  },
  {
    name: "credential-assignment",
    hasFinding: hasCredentialAssignment,
  },
];

function isTestFile(filePath) {
  return /\.test\.[cm]?[jt]sx?$/.test(filePath);
}

function hasUnixHomePath(line, filePath) {
  if (
    isTestFile(filePath) &&
    SYNTHETIC_UNIX_TEST_PATHS.some((testPath) => line.includes(testPath))
  ) {
    return false;
  }
  return /\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/|\b)/.test(line);
}

function hasWindowsUserProfilePath(line, filePath) {
  if (isTestFile(filePath) && /C:\\\\?Users\\\\?Alice\\/i.test(line)) {
    return false;
  }
  return /(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])Users[\\/][^\\/\s]+/i.test(
    line,
  );
}

function isOriginBoundary(character) {
  return (
    character === undefined ||
    /\s/.test(character) ||
    "\"'`()[]{},;#".includes(character)
  );
}

function isApprovedGitHubSshOccurrence(line, matchIndex) {
  if (matchIndex === undefined) return false;

  return PUBLIC_GITHUB_SSH_ORIGINS.some((origin) => {
    const accountOffset = origin.indexOf(GITHUB_SSH_ACCOUNT);
    const originStart = matchIndex - accountOffset;
    if (originStart < 0) return false;
    const originEnd = originStart + origin.length;

    return (
      line.slice(originStart, originEnd) === origin &&
      isOriginBoundary(line[originStart - 1]) &&
      isOriginBoundary(line[originEnd])
    );
  });
}

function hasPrivateEmail(line) {
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  return Array.from(line.matchAll(emailPattern)).some((match) => {
    const address = match[0].toLowerCase();
    if (address.endsWith("@example.com")) return false;
    if (
      address === GITHUB_SSH_ACCOUNT &&
      isApprovedGitHubSshOccurrence(line, match.index)
    ) {
      return false;
    }
    return true;
  });
}

function hasCredentialAssignment(line, filePath) {
  const assignmentPattern =
    /\b(?:[a-z0-9]+[_-])*(?:api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key|secret|token|password|passwd|credential)(?:[_-][a-z0-9]+)*\b\s*[:=]\s*([^\s,;#]+)/gi;

  return Array.from(line.matchAll(assignmentPattern)).some((match) => {
    const rawValue = match[1] ?? "";
    const value = rawValue.replace(/^["']|["')\]}]+$/g, "").toLowerCase();
    if (SAFE_ASSIGNMENT_VALUES.has(value)) return false;
    if (isTestFile(filePath) && value === "value") return false;
    if (/^<[^>]+>$/.test(value)) return false;
    if (/^\$\{?\{?[^}]+\}?\}?$/.test(value)) return false;
    if (/^(?:process\.)?env\./.test(value)) return false;
    return value.length > 0;
  });
}

export function scanText(filePath, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const rule of RULES) {
      if (rule.hasFinding(line, filePath)) {
        findings.push({ path: filePath, line: index + 1, rule: rule.name });
      }
    }
  }

  return findings;
}

export function scanBuffer(filePath, buffer) {
  if (buffer.subarray(0, BINARY_PREFIX_BYTES).includes(0)) return [];
  return scanText(filePath, buffer.toString("utf8"));
}

async function regularFile(filePath) {
  try {
    return (await lstat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function listArchiveFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }

  await visit(root);
  return files;
}

function listGitFiles(root) {
  const output = execFileSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { encoding: "utf8" },
  );

  return output
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => path.join(root, filePath));
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) {
    return { root: REPOSITORY_ROOT, source: "git" };
  }
  if (arguments_.length === 2 && arguments_[0] === "--root") {
    return { root: path.resolve(arguments_[1]), source: "archive" };
  }
  throw new Error("Usage: node scripts/privacy-check.mjs [--root <directory>]");
}

async function run(arguments_) {
  const options = parseArguments(arguments_);
  const rootStats = await lstat(options.root).catch(() => undefined);
  if (rootStats?.isDirectory() !== true) {
    throw new Error("Privacy scan root must be an existing directory");
  }

  const files =
    options.source === "git"
      ? listGitFiles(options.root)
      : await listArchiveFiles(options.root);
  const findings = [];

  for (const absolutePath of files) {
    if (!(await regularFile(absolutePath))) continue;
    const relativePath = path
      .relative(options.root, absolutePath)
      .split(path.sep)
      .join("/");
    findings.push(...scanBuffer(relativePath, await readFile(absolutePath)));
  }

  for (const finding of findings) {
    process.stdout.write(`${finding.path}:${finding.line}: ${finding.rule}\n`);
  }
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  run(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    });
}
