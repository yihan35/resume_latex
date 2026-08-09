# Resume LaTeX Editor Open-Source Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Resume LaTeX Editor into a modern, secure, documented, privacy-audited public repository and publish its verified `main` branch to GitHub.

**Architecture:** Preserve the local React client, loopback-only Express server, XeLaTeX compiler, PDF.js preview, and SyncTeX lookup. Split the client by workspace/editor/preview responsibilities, split the server into configuration/domain/process/HTTP modules, and compile both sides against shared API contracts.

**Tech Stack:** Node.js 22.13+, TypeScript 5.9, React 19, Express 5, Vite 8, Vitest 4, PDF.js 6, Monaco Editor, React Testing Library, Supertest, ESLint 10, and Prettier 3.

## Global Constraints

- `resume-editor/` is the only repository root; never copy or stage a parent or sibling path.
- No tracked file may contain a real resume, application record, phone number, email address, private absolute path, secret, or generated private document.
- Bind every runtime listener to `127.0.0.1`; remote network exposure is unsupported.
- Support Node.js `>=22.13.0` and test the current Node 22 and Node 24 release lines.
- Use React primitives for state; do not add a third-party state-management library.
- Use `spawn(command, args, { shell: false })`; never build shell commands from request data.
- Resolve and realpath-check every filesystem operation against the configured project root.
- Keep `package.json` private to prevent accidental npm publication.
- Default entry-file priority is `resume.tex`, `main.tex`, then `简历.tex`.
- Default project content is fictional content under `examples/`.
- Preserve edit, explicit save, compile, first-page preview, and SyncTeX navigation behavior.
- A failed compile must keep the last successful PDF available.
- The main client chunk must build without Vite's 500 kB warning.
- Release coverage thresholds are 80% for statements, lines, and functions and 75% for branches.
- Release audit must report no high or critical npm vulnerability.
- Do not push until tracked-file, staged-diff, archive, runtime, and privacy checks pass.

---

## Target File Map

### Repository and tooling

- `.gitignore` — generated, runtime, local-environment, LaTeX auxiliary, OS, and editor exclusions.
- `.gitattributes` — LF normalization and binary declarations.
- `.nvmrc` — supported Node 22 development line.
- `.env.example` — fictional and portable configuration example.
- `package.json` / `package-lock.json` — metadata, scripts, classified dependencies, and deterministic resolution.
- `eslint.config.js` — TypeScript, browser, Node, React Hooks, and React Refresh lint policy.
- `.prettierignore` — generated output exclusions.
- `tsconfig.base.json` — shared strict TypeScript settings.
- `tsconfig.json` — client, shared, and tool configuration.
- `server/tsconfig.json` — Node server build configuration.
- `vite.config.ts` / `vitest.config.ts` — development, build, test, and coverage policy.

### Shared contracts

- `shared/contracts.ts` — API requests, responses, identifiers, results, and public errors.

### Server

- `server/src/config/appConfig.ts` — environment-file loading, parsing, validation, and defaults.
- `server/src/domain/discovery.ts` — resume and TeX discovery.
- `server/src/domain/pathSafety.ts` — lexical and realpath containment.
- `server/src/domain/fileStore.ts` — TeX reads and atomic writes.
- `server/src/domain/compiler.ts` — per-resume compile lock and compile results.
- `server/src/domain/synctex.ts` — SyncTeX execution and safe result parsing.
- `server/src/process/runCommand.ts` — bounded, timeout-aware, shell-free child processes.
- `server/src/http/apiError.ts` — typed internal errors and public envelope conversion.
- `server/src/http/validation.ts` — request type guards.
- `server/src/http/routes/*.ts` — health, project, file, compile, PDF, and SyncTeX routers.
- `server/src/app.ts` — dependency construction and Express composition.
- `server/src/index.ts` — startup, static production assets, listener lifecycle, and signals.

### Client

- `client/src/app/App.tsx` — application composition only.
- `client/src/app/ErrorBoundary.tsx` — top-level render failure state.
- `client/src/app/main.tsx` — React entry.
- `client/src/lib/apiClient.ts` — typed, abortable HTTP client and `ApiClientError`.
- `client/src/features/workspace/types.ts` — draft and workspace state.
- `client/src/features/workspace/reducer.ts` — pure transitions.
- `client/src/features/workspace/selectors.ts` — derived state.
- `client/src/features/workspace/useWorkspace.ts` — project/file/save/compile/SyncTeX orchestration.
- `client/src/features/editor/TexEditor.tsx` — Monaco adapter.
- `client/src/features/preview/PdfViewer.tsx` — preview state and canvas UI.
- `client/src/features/preview/pdfRenderer.ts` — lazy PDF.js loading and first-page rendering.
- `client/src/components/*.tsx` — header, file pane, editor pane, preview pane, build log, and resizer.
- `client/src/styles/*.css` — base tokens, layout, and components.

### Public project material

- `examples/sample/resume.tex` — fictional compilable sample.
- `README.md` / `README.zh-CN.md` — English and Chinese guides.
- `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` — public governance.
- `docs/assets/app-overview.png` — full application overview using the fictional example.
- `docs/assets/editing-workflow.png` — edit, dirty-state, and save workflow using fictional content.
- `docs/assets/compile-synctex.png` — compile, PDF preview, build result, and SyncTeX workflow.
- `.github/workflows/ci.yml` — Node 22/24 checks.
- `.github/dependabot.yml` — monthly grouped maintenance.
- `scripts/privacy-check.mjs` — tracked-file privacy scanner.

---

### Task 1: Establish a Sanitized Source Baseline

**Files:**
- Create: `.gitignore`
- Create: `.gitattributes`
- Delete: `docs/superpowers/specs/2026-06-03-resume-latex-editor-design.md`
- Delete: `docs/superpowers/plans/2026-06-03-resume-latex-editor.md`
- Track unchanged baseline: `README.md`, `client/`, `server/`, `scripts/`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `server/tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- Remove generated working directories after confirming their names: `.resume-editor/`, `dist/`, `dist-server/`

**Interfaces:**
- Consumes: approved design at `docs/superpowers/specs/2026-08-09-open-source-refactor-design.md`.
- Produces: a reproducible, privacy-reviewed baseline commit containing current application behavior but no generated or internal-path documentation.

- [ ] **Step 1: Create repository exclusions**

Create `.gitignore`:

```gitignore
# Dependencies
node_modules/

# Build and coverage
dist/
dist-server/
coverage/
*.tsbuildinfo

# Runtime state
.resume-editor/
*.pid
*.log

# Local environment
.env
.env.local
.env.*.local
!.env.example

# LaTeX generated files
*.aux
*.fls
*.fdb_latexmk
*.out
*.synctex.gz
*.toc

# Editors and operating systems
.DS_Store
.idea/
.vscode/
*.swp
```

Create `.gitattributes`:

```gitattributes
* text=auto eol=lf
*.png binary
*.pdf binary
```

- [ ] **Step 2: Remove internal documents and generated state**

Delete only the two 2026-06-03 internal documents and the three verified
generated directories named in the Files block. Keep the approved 2026-08-09
design. Leave `node_modules/` ignored so it can support baseline verification.

- [ ] **Step 3: Verify baseline behavior**

```bash
npm run typecheck
npm test
npm run build
```

Expected: type checking succeeds, 82 tests pass, and build succeeds with only
the known legacy client chunk-size warning.

- [ ] **Step 4: Stage an explicit allowlist and inspect it**

Use `git add` only for paths listed in the Files block plus `.gitignore` and
`.gitattributes`; never stage `..`. Run:

```bash
git diff --cached --name-only
git diff --cached --check
git diff --cached --stat
```

Expected: no parent path, generated directory, internal document, PDF, Word
document, PID, or runtime log appears.

- [ ] **Step 5: Scan staged blobs and commit**

Search staged text for Unix/Windows home paths, PEM private key headers, common
credential assignments, email addresses, and 11-digit Chinese mobile numbers.
Inspect every match and print no sensitive value into logs.

```bash
git commit -m "chore: establish sanitized source baseline"
```

Expected: the commit contains the public application baseline and exclusions.

---

### Task 2: Modernize the Toolchain and Package Metadata

**Files:**
- Create: `.nvmrc`
- Create: `.prettierignore`
- Create: `eslint.config.js`
- Create: `tsconfig.base.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `server/tsconfig.json`
- Modify: `vite.config.ts`
- Modify: `vitest.config.ts`
- Delete: `scripts/start.sh`
- Delete: `scripts/stop.sh`

**Interfaces:**
- Consumes: the Task 1 source baseline.
- Produces: Node `>=22.13.0` metadata; cross-platform development/build/check scripts; strict shared TypeScript settings.

- [ ] **Step 1: Prove the new quality commands are absent**

```bash
npm run lint
npm run format:check
npm run test:coverage
```

Expected: each fails because the script is absent, proving no global executable
is masking missing project configuration.

- [ ] **Step 2: Replace package metadata and scripts**

Set `name`, `version`, `private`, `type`, and these public fields:

```json
{
  "description": "A local, privacy-first LaTeX resume editor with PDF preview and SyncTeX navigation.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+ssh://git@github.com/yihan35/resume_latex.git"
  },
  "bugs": { "url": "https://github.com/yihan35/resume_latex/issues" },
  "homepage": "https://github.com/yihan35/resume_latex#readme",
  "engines": { "node": ">=22.13.0" }
}
```

Use these scripts:

```json
{
  "dev": "concurrently -k -s first -n server,client \"npm:dev:server\" \"npm:dev:client\"",
  "dev:server": "tsx watch server/src/index.ts",
  "dev:client": "vite --host 127.0.0.1",
  "build": "npm run build:server && npm run build:client",
  "build:server": "tsc -p server/tsconfig.json",
  "build:client": "vite build",
  "start": "node dist-server/index.js",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "lint": "eslint .",
  "typecheck": "tsc -p server/tsconfig.json --noEmit && tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "check": "npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run build"
}
```

- [ ] **Step 3: Install the approved versions**

Runtime dependencies:

```text
@monaco-editor/react@4.7.0
express@5.2.1
monaco-editor@0.56.0
pdfjs-dist@6.2.108
react@19.2.8
react-dom@19.2.8
```

Development dependencies:

```text
@eslint/js@10.0.1
@testing-library/jest-dom@7.0.0
@testing-library/react@16.3.2
@types/express@5.0.6
@types/node@22.20.1
@types/react@19.2.18
@types/react-dom@19.2.4
@types/supertest@7.2.1
@vitejs/plugin-react@6.0.5
@vitest/coverage-v8@4.1.10
concurrently@10.0.4
eslint@10.8.1
eslint-plugin-react-hooks@7.1.1
eslint-plugin-react-refresh@0.5.3
globals@17.9.0
jsdom@29.1.1
prettier@3.9.6
supertest@7.2.2
tsx@4.23.11
typescript@5.9.3
typescript-eslint@8.66.0
vite@8.2.1
vitest@4.1.10
```

Remove `@rollup/wasm-node`, the `rollup` alias, and `overrides`. Regenerate the
lockfile with `npm install`; never hand-edit resolved lock entries.

- [ ] **Step 4: Configure Node, formatting, linting, TypeScript, and coverage**

Create `.nvmrc` containing `22`. Ignore generated/dependency/runtime paths in
`.prettierignore`. Create flat ESLint config from `@eslint/js` recommended,
`typescript-eslint` recommended type-checked, React Hooks flat recommended, and
React Refresh rules; apply browser globals to `client/` and Node globals to
`server/`, `scripts/`, and configs.

Use this configuration shape:

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "dist-server/**", "coverage/**", ".resume-editor/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    }
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules
    }
  },
  {
    files: ["server/**/*.ts", "scripts/**/*.{js,mjs,ts}", "*.config.ts"],
    languageOptions: { globals: globals.node }
  }
);
```

Create `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`,
`forceConsistentCasingInFileNames`, and `skipLibCheck`. Extend it from client and
server configs and include `shared/**/*.ts` in both. Configure V8 coverage in
Vitest without numeric thresholds until Task 10.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 5: Fix upgrade compatibility and verify**

Change only code required by React 19, Express 5, TypeScript 5.9, Vite 8, Vitest
4, PDF.js 6, formatting, or lint rules; do not move modules in this task.

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

Expected: formatting, lint, type checking, 82 regressions, build, and audit pass.
The legacy client chunk warning may remain until Task 8.

- [ ] **Step 6: Commit the toolchain upgrade**

```bash
git add .nvmrc .prettierignore eslint.config.js tsconfig.base.json package.json package-lock.json tsconfig.json server/tsconfig.json vite.config.ts vitest.config.ts scripts/start.sh scripts/stop.sh
git commit -m "build: modernize development toolchain"
```

---

### Task 3: Add Shared Contracts, Validated Configuration, and Multi-Entry Discovery

**Files:**
- Create: `shared/contracts.ts`
- Create: `server/src/config/appConfig.ts`
- Create: `server/src/config/appConfig.test.ts`
- Create: `server/src/domain/discovery.ts`
- Create: `server/src/domain/discovery.test.ts`
- Create: `.env.example`
- Create: `examples/sample/resume.tex`
- Modify: `client/src/types.ts`
- Modify: `client/src/App.tsx`
- Modify: `server/src/app.ts`
- Modify: `server/src/index.ts`
- Delete: `server/src/config.ts`
- Delete: `server/src/discovery.ts`
- Delete: `server/src/discovery.test.ts`

**Interfaces:**
- Consumes: strict shared TypeScript inclusion from Task 2.
- Produces: `AppConfig`, `createAppConfig`, shared API contracts, `discoverResumes`, and `discoverTexFiles`.

- [ ] **Step 1: Write failing configuration and discovery tests**

The central contract begins with:

```ts
export interface ResumeInfo {
  id: string;
  name: string;
  dir: string;
  entryPath: string;
  pdfPath: string;
}

export interface TexFileInfo {
  path: string;
  name: string;
  dir: string;
}

export interface ProjectResponse {
  resumes: ResumeInfo[];
  texFiles: TexFileInfo[];
}
```

Configuration tests assert default project root `<cwd>/examples`, ports 43871
and 5173, entry priority `resume.tex,main.tex,简历.tex`, and tool defaults
`xelatex`/`synctex`. Add invalid-port, missing-root, non-directory-root, and
empty-entry-list cases.

Discovery tests create directories containing each supported entry filename, a
directory with both `resume.tex` and `main.tex`, hidden/generated directories,
nested TeX includes, and a custom entry priority.

- [ ] **Step 2: Confirm the focused tests fail**

```bash
npx vitest run server/src/config/appConfig.test.ts server/src/domain/discovery.test.ts
```

Expected: FAIL because the modules and exports do not exist.

- [ ] **Step 3: Implement shared contracts**

Add these exact public types:

```ts
export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "FILE_NOT_FOUND"
  | "UNSAFE_PATH"
  | "LATEX_NOT_FOUND"
  | "SYNCTEX_NOT_FOUND"
  | "COMPILE_BUSY"
  | "COMPILE_FAILED"
  | "INTERNAL_ERROR";

export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string };
}
export interface FileResponse { path: string; content: string }
export interface SaveFileRequest { path: string; content: string }
export interface SaveFileResponse { ok: true }
export interface CompileRequest { resumeId: string }
export interface CompileResult {
  ok: boolean;
  elapsedMs: number;
  pdfPath: string;
  logSummary: string;
  stdout: string;
  stderr: string;
}
export interface SynctexRequest {
  resumeId: string;
  page: number;
  x: number;
  y: number;
}
export type SynctexResult =
  | { found: false }
  | { found: true; file: string; line: number; column?: number };
```

- [ ] **Step 4: Implement typed configuration**

```ts
export interface AppConfig {
  repoRoot: string;
  projectRoot: string;
  serverPort: number;
  clientPort: number;
  entryFiles: readonly string[];
  latexCommand: string;
  synctexCommand: string;
}

export function createAppConfig(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): AppConfig;
```

Resolve relative roots against `cwd`, validate with `statSync`, require ports
1–65535, split/trim/deduplicate `RESUME_ENTRY_FILES`, and freeze config and list.

- [ ] **Step 5: Implement discovery and fictional example**

```ts
export async function discoverResumes(
  projectRoot: string,
  entryFiles: readonly string[]
): Promise<ResumeInfo[]>;
export async function discoverTexFiles(projectRoot: string): Promise<TexFileInfo[]>;
```

Use the first entry match, derive PDF from entry stem, use relative directory as
stable ID, and skip dot-directories plus dependency/build/coverage directories.
Create `examples/sample/resume.tex` for fictional Alex Chen using only standard
TeX packages and `example.com`; include no phone number.

Create `.env.example`:

```dotenv
RESUME_PROJECT_ROOT=./examples
RESUME_ENTRY_FILES=resume.tex,main.tex,简历.tex
RESUME_EDITOR_PORT=43871
RESUME_EDITOR_CLIENT_PORT=5173
RESUME_LATEX_COMMAND=xelatex
RESUME_SYNCTEX_COMMAND=synctex
```

- [ ] **Step 6: Integrate and verify**

Replace frontend `texPath` with `entryPath`, import shared contracts, construct
config once in the server entry, and pass root plus entry files to discovery.

```bash
npx vitest run server/src/config/appConfig.test.ts server/src/domain/discovery.test.ts client/src/App.test.tsx client/src/App.workflow.test.tsx
npm run typecheck
npm test
```

Expected: focused and full suites pass; default discovery finds the sample.

- [ ] **Step 7: Commit contracts and discovery**

```bash
git add shared server/src/config server/src/domain/discovery.ts server/src/domain/discovery.test.ts server/src/config.ts server/src/discovery.ts server/src/discovery.test.ts client/src/types.ts client/src/App.tsx server/src/app.ts server/src/index.ts .env.example examples
git commit -m "feat: support configurable resume discovery"
```

---

### Task 4: Harden Paths and Add Atomic TeX Saving

**Files:**
- Create: `server/src/domain/pathSafety.ts`
- Create: `server/src/domain/pathSafety.test.ts`
- Create: `server/src/domain/fileStore.ts`
- Create: `server/src/domain/fileStore.test.ts`
- Modify: `server/src/app.ts`
- Delete: `server/src/pathSafety.ts`
- Delete: `server/src/pathSafety.test.ts`
- Delete: `server/src/fileStore.ts`
- Delete: `server/src/fileStore.test.ts`

**Interfaces:**
- Consumes: relative TeX paths and project root from Task 3.
- Produces: `resolveProjectPath`, `normalizeRelativePath`, `resolveProjectTexPath`, `readTexFile`, and `saveTexFileAtomically`.

- [ ] **Step 1: Write failing containment and atomic-save tests**

Cover `../escape.tex`, `/tmp/escape.tex`, Windows drive and UNC paths, mixed
separators, a symlinked directory leaving the root, and a symlinked final file.
Assert valid Unicode and nested paths normalize to POSIX `/`.

File-store tests prove:

```ts
await saveTexFileAtomically(root, "sample/resume.tex", "after");
expect(await readFile(destination, "utf8")).toBe("after");
expect((await stat(destination)).mode & 0o777).toBe(originalMode);
```

Force rename failure and assert original content remains plus no `.*.tmp` file.

- [ ] **Step 2: Confirm the focused tests fail**

```bash
npx vitest run server/src/domain/pathSafety.test.ts server/src/domain/fileStore.test.ts
```

Expected: FAIL because the domain modules and atomic-save export are absent.

- [ ] **Step 3: Implement lexical and realpath containment**

```ts
export function resolveProjectPath(projectRoot: string, requestedPath: string): string;
export function normalizeRelativePath(projectRoot: string, absolutePath: string): string;
export function resolveProjectTexPath(projectRoot: string, requestedPath: string): string;
```

Reject POSIX absolute paths, Windows drive/UNC forms on every host, lexical `..`
escape, and any existing symlink whose real path leaves the real root.
`resolveProjectTexPath` requires a case-sensitive `.tex` extension.

- [ ] **Step 4: Implement atomic saving**

```ts
export async function readTexFile(root: string, relativePath: string): Promise<string>;
export async function saveTexFileAtomically(
  root: string,
  relativePath: string,
  content: string
): Promise<void>;
```

Create an unpredictable temporary file beside the destination, preserve the
existing mode, write UTF-8, rename over destination, and remove the temp file in
`finally` when rename did not complete. Do not create missing parent directories.

- [ ] **Step 5: Integrate and verify file behavior**

Replace old imports and use atomic saving from both explicit-save and current
compile paths.

```bash
npx vitest run server/src/domain/pathSafety.test.ts server/src/domain/fileStore.test.ts server/src/app.test.ts server/src/appCompile.test.ts
npm test
```

Expected: focused and complete regression suites pass.

- [ ] **Step 6: Commit filesystem hardening**

```bash
git add server/src/domain/pathSafety.ts server/src/domain/pathSafety.test.ts server/src/domain/fileStore.ts server/src/domain/fileStore.test.ts server/src/pathSafety.ts server/src/pathSafety.test.ts server/src/fileStore.ts server/src/fileStore.test.ts server/src/app.ts
git commit -m "refactor: harden atomic file operations"
```

---

### Task 5: Refactor Process Execution, Compilation Locks, and SyncTeX

**Files:**
- Create: `server/src/process/runCommand.ts`
- Create: `server/src/process/runCommand.test.ts`
- Create: `server/src/domain/compiler.ts`
- Create: `server/src/domain/compiler.test.ts`
- Create: `server/src/domain/synctex.ts`
- Create: `server/src/domain/synctex.test.ts`
- Modify: `server/src/app.ts`
- Delete: `server/src/processRunner.ts`
- Delete: `server/src/processRunner.test.ts`
- Delete: `server/src/compiler.ts`
- Delete: `server/src/compiler.test.ts`
- Delete: `server/src/synctex.ts`
- Delete: `server/src/synctex.test.ts`

**Interfaces:**
- Consumes: `AppConfig`, `ResumeInfo`, and path helpers.
- Produces: `runCommand`, `CompileService`, `parseSynctexEditOutput`, and `lookupSynctex`.

- [ ] **Step 1: Write failing process and domain tests**

Use this process contract:

```ts
export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs?: number; maxOutputBytes?: number }
) => Promise<CommandResult>;
```

Retain success/error/timeout/output-cap/double-event cases and assert spawn uses
`shell: false`. Compiler tests hold one runner promise open, assert the same
resume rejects with `COMPILE_BUSY`, and assert another resume runs concurrently.
Add missing-command mapping and Windows/Unix path redaction. SyncTeX tests cover
configured command, success, miss, missing command, out-of-root and non-TeX
results, and optional column.

- [ ] **Step 2: Confirm focused tests fail**

```bash
npx vitest run server/src/process/runCommand.test.ts server/src/domain/compiler.test.ts server/src/domain/synctex.test.ts
```

Expected: FAIL because moved modules and `CompileService` are absent.

- [ ] **Step 3: Implement the bounded process runner**

```ts
spawn(command, [...args], {
  cwd: options.cwd,
  shell: false,
  stdio: ["ignore", "pipe", "pipe"]
});
```

Default to 60 seconds and 5 MiB per output stream. Resolve once, record timeout,
send `SIGTERM`, then `SIGKILL` after 250 ms, and clear timers on completion.

- [ ] **Step 4: Implement per-resume compilation locking**

```ts
export class CompileService {
  constructor(options: {
    projectRoot: string;
    latexCommand: string;
    runner?: CommandRunner;
  });
  compile(resume: ResumeInfo): Promise<CompileResult>;
}
```

Lock with `Set<string>` keyed by `resume.id`, release in `finally`, execute the
discovered entry basename in its directory, and require code zero plus a new or
changed PDF. Map spawn code 127 to `LATEX_NOT_FOUND`. Sanitize the project root
and recognizable Unix/Windows absolute paths before returning bounded output.

- [ ] **Step 5: Implement safe configured SyncTeX lookup**

```ts
export async function lookupSynctex(options: {
  projectRoot: string;
  synctexCommand: string;
  resume: ResumeInfo;
  page: number;
  x: number;
  y: number;
  runner?: CommandRunner;
}): Promise<SynctexResult>;
```

Use discovered PDF metadata, validate positive integer page and finite
non-negative coordinates, map code 127 to `SYNCTEX_NOT_FOUND`, return a miss for
ordinary nonzero exit, and accept only an in-root `.tex` result.

- [ ] **Step 6: Verify and commit process/domain refactor**

```bash
npx vitest run server/src/process/runCommand.test.ts server/src/domain/compiler.test.ts server/src/domain/synctex.test.ts server/src/appCompile.test.ts server/src/appSynctex.test.ts
npm test
git add server/src/process server/src/domain/compiler.ts server/src/domain/compiler.test.ts server/src/domain/synctex.ts server/src/domain/synctex.test.ts server/src/processRunner.ts server/src/processRunner.test.ts server/src/compiler.ts server/src/compiler.test.ts server/src/synctex.ts server/src/synctex.test.ts server/src/app.ts
git commit -m "refactor: isolate compile and synctex services"
```

Expected: all tests pass and no request value reaches a shell.

---

### Task 6: Modularize HTTP Routes and Serve Production Assets

**Files:**
- Create: `server/src/http/apiError.ts`
- Create: `server/src/http/apiError.test.ts`
- Create: `server/src/http/validation.ts`
- Create: `server/src/http/validation.test.ts`
- Create: `server/src/http/routes/health.ts`
- Create: `server/src/http/routes/project.ts`
- Create: `server/src/http/routes/files.ts`
- Create: `server/src/http/routes/compile.ts`
- Create: `server/src/http/routes/pdf.ts`
- Create: `server/src/http/routes/synctex.ts`
- Create: `server/src/http/routes/routes.test.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/app.test.ts`
- Modify: `server/src/appCompile.test.ts`
- Modify: `server/src/appSynctex.test.ts`

**Interfaces:**
- Consumes: config and domain services from Tasks 3–5.
- Produces: `ApiError`, `toApiErrorResponse`, focused routers, `/api/health`, `createApp`, and production SPA fallback.

- [ ] **Step 1: Write failing error and route tests**

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    options?: { cause?: unknown }
  );
}
```

Assert malformed and oversized JSON use `INVALID_REQUEST`, unsafe paths use
`UNSAFE_PATH`, unknown errors use `INTERNAL_ERROR`, and no body contains the
project root. Health must return:

```ts
{
  ok: true,
  tools: { latex: expect.any(Boolean), synctex: expect.any(Boolean) }
}
```

Update compile/SyncTeX bodies to `resumeId`; test unknown resume and 409 busy.

- [ ] **Step 2: Confirm route tests fail**

```bash
npx vitest run server/src/http/apiError.test.ts server/src/http/validation.test.ts server/src/http/routes/routes.test.ts
```

Expected: FAIL because HTTP modules and health route are absent.

- [ ] **Step 3: Implement errors, validators, and routers**

Only `ApiError` status/code/message is public; unknown errors become status 500,
code `INTERNAL_ERROR`, message `Internal server error`. Guards check exact save,
compile, and SyncTeX request properties and finite numbers.

Each route exports one factory with minimum dependencies. The compile factory is:

```ts
export function createCompileRouter(options: {
  findResume: (id: string) => Promise<ResumeInfo | undefined>;
  compiler: Pick<CompileService, "compile">;
}): Router;
```

File routes use atomic saving. Compile/PDF/SyncTeX resolve fresh discovered
metadata by ID. PDF serves only the discovered path. All async errors reach one
terminal middleware.

- [ ] **Step 4: Reduce `app.ts` to composition**

```ts
export interface AppDependencies {
  config: AppConfig;
  compiler?: CompileService;
  commandRunner?: CommandRunner;
  staticDir?: string;
}
export function createApp(dependencies: AppDependencies): Express;
```

Compose JSON parsing, six routers, optional static assets, non-API GET SPA
fallback, API JSON 404, parser-error mapping, and terminal errors. Keep
route-specific behavior out of `app.ts`.

- [ ] **Step 5: Implement loopback production lifecycle**

Load `.env.local` when it exists, construct config once, pass built client dir as
`staticDir`, listen on `127.0.0.1`, and close on `SIGINT`/`SIGTERM`. Log the
loopback URL and configured project path only.

```ts
function getErrorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

try {
  process.loadEnvFile(path.resolve(".env.local"));
} catch (error) {
  if (getErrorCode(error) !== "ENOENT") throw error;
}

const server = app.listen(config.serverPort, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
```

- [ ] **Step 6: Verify and commit the modular server**

```bash
npx vitest run server/src/http server/src/app.test.ts server/src/appCompile.test.ts server/src/appSynctex.test.ts
npm run typecheck
npm test
npm run build
git add server/src/http server/src/app.ts server/src/index.ts server/src/app.test.ts server/src/appCompile.test.ts server/src/appSynctex.test.ts
git commit -m "refactor: modularize server routes"
```

Expected: structured errors and production build pass; no non-test server source
file exceeds 250 lines.

---

### Task 7: Build the Workspace Reducer and Abortable API Client

**Files:**
- Create: `client/src/lib/apiClient.ts`
- Create: `client/src/lib/apiClient.test.ts`
- Create: `client/src/features/workspace/types.ts`
- Create: `client/src/features/workspace/reducer.ts`
- Create: `client/src/features/workspace/reducer.test.ts`
- Create: `client/src/features/workspace/selectors.ts`
- Create: `client/src/features/workspace/selectors.test.ts`
- Create: `client/src/features/workspace/useWorkspace.ts`
- Create: `client/src/features/workspace/useWorkspace.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/App.workflow.test.tsx`
- Delete: `client/src/api.ts`
- Delete: `client/src/types.ts`

**Interfaces:**
- Consumes: shared contracts and modular API from Tasks 3 and 6.
- Produces: `ApiClient`, `ApiClientError`, `WorkspaceState`, `WorkspaceAction`, reducer, selectors, and `useWorkspace`.

- [ ] **Step 1: Write failing API client and reducer tests**

```ts
export interface ApiClient {
  getProject(signal?: AbortSignal): Promise<ProjectResponse>;
  getFile(path: string, signal?: AbortSignal): Promise<FileResponse>;
  saveFile(input: SaveFileRequest, signal?: AbortSignal): Promise<SaveFileResponse>;
  compile(input: CompileRequest, signal?: AbortSignal): Promise<CompileResult>;
  lookupSynctex(input: SynctexRequest, signal?: AbortSignal): Promise<SynctexResult>;
}
```

Test success decoding, `ApiClientError.status/code`, invalid error envelopes, and
signal forwarding.

```ts
export interface DraftState {
  path: string;
  content: string;
  savedContent: string;
  saveState: "idle" | "saving" | "error";
  error?: string;
}
```

Reducer tests prove edits become dirty, switching preserves multiple drafts,
save success updates `savedContent`, save failure retains content, stale request
IDs are ignored, and project reset clears compile/navigation state. Compile
success increments `pdfVersion`; compile failure retains the prior `pdfVersion`
and the last successful `compileResult.pdfPath` used for preview.

- [ ] **Step 2: Confirm focused tests fail**

```bash
npx vitest run client/src/lib/apiClient.test.ts client/src/features/workspace/reducer.test.ts client/src/features/workspace/selectors.test.ts
```

Expected: FAIL because the client and workspace modules are absent.

- [ ] **Step 3: Implement the typed API client**

`ApiClientError` exposes `status`, `code`, and the public message. `requestJson`
forwards an optional signal, parses the shared error envelope, uses
`INTERNAL_ERROR` for invalid error bodies, and never casts an error body to a
success result.

- [ ] **Step 4: Implement pure state and selectors**

```ts
export interface WorkspaceState {
  project: ProjectResponse | null;
  projectState: "loading" | "ready" | "error";
  selectedResumeId: string | null;
  selectedTexPath: string | null;
  drafts: Record<string, DraftState>;
  fileRequestId: number;
  compileRequestId: number;
  synctexRequestId: number;
  compileState: "idle" | "compiling" | "success" | "error";
  compileResult: CompileResult | null;
  pdfVersion: number;
  targetLine: number | null;
  activityMessage?: string;
  error?: string;
}
```

Export `selectCurrentDraft`, `selectSelectedResume`,
`selectIsCurrentDraftDirty`, `selectCanSave`, and `selectCanCompile`. Every async
completion action carries its explicit request ID.

- [ ] **Step 5: Implement cancellation-aware orchestration**

`useWorkspace({ api = createApiClient() })` exposes:

```ts
loadProject(): Promise<void>;
selectResume(id: string): Promise<void>;
selectFile(path: string): Promise<void>;
editCurrentFile(content: string): void;
saveCurrentFile(): Promise<boolean>;
compileSelectedResume(): Promise<void>;
lookupSource(page: number, x: number, y: number): Promise<void>;
```

Own one abort controller per operation. Compile awaits a dirty save and stops on
false. Cleanup aborts all work. Request IDs prevent old results mutating state.

- [ ] **Step 6: Integrate while preserving legacy markup**

Replace state orchestration in `App.tsx` with hook state/actions but keep current
view markup in this task so failures isolate state behavior.

```bash
npx vitest run client/src/lib/apiClient.test.ts client/src/features/workspace client/src/App.workflow.test.tsx
npm run typecheck
npm test
```

Expected: dirty drafts survive switches, compile awaits save, stale work is
ignored, and prior behavior remains green.

- [ ] **Step 7: Commit workspace state refactor**

```bash
git add client/src/lib client/src/features/workspace client/src/App.tsx client/src/App.workflow.test.tsx client/src/api.ts client/src/types.ts
git commit -m "refactor: centralize workspace state"
```

---

### Task 8: Modularize the Client and Lazy-Load PDF.js

**Files:**
- Create: `client/src/app/App.tsx`
- Create: `client/src/app/ErrorBoundary.tsx`
- Create: `client/src/app/main.tsx`
- Create: `client/src/components/AppHeader.tsx`
- Create: `client/src/components/FilePane.tsx`
- Create: `client/src/components/EditorPane.tsx`
- Create: `client/src/components/PreviewPane.tsx`
- Create: `client/src/components/PaneResizer.tsx`
- Move/modify: `client/src/components/BuildLog.tsx`
- Move/modify: `client/src/components/TexFileTree.tsx`
- Create: `client/src/features/editor/TexEditor.tsx`
- Create: `client/src/features/editor/TexEditor.test.tsx`
- Create: `client/src/features/preview/PdfViewer.tsx`
- Create: `client/src/features/preview/PdfViewer.test.tsx`
- Create: `client/src/features/preview/pdfRenderer.ts`
- Create: `client/src/features/preview/pdfRenderer.test.ts`
- Create: `client/src/styles/base.css`
- Create: `client/src/styles/layout.css`
- Create: `client/src/styles/components.css`
- Modify: `client/src/main.tsx`
- Modify: `client/src/App.test.tsx`
- Modify: `client/src/layoutStyles.test.tsx`
- Delete: `client/src/App.tsx`
- Delete: old editor/PDF component files and `client/src/styles.css`

**Interfaces:**
- Consumes: `useWorkspace` from Task 7.
- Produces: composition-only `App`, focused panes, accessible error boundary, lazy `renderFirstPdfPage`, and split styles.

- [ ] **Step 1: Write failing renderer and component tests**

```ts
export interface RenderedPdfPage {
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  destroy(): Promise<void>;
}
export async function renderFirstPdfPage(options: {
  url: string;
  canvas: HTMLCanvasElement;
  availableWidth: number;
  signal: AbortSignal;
}): Promise<RenderedPdfPage>;
```

Assert first-page selection, device-pixel scaling, abort cleanup, render
cancellation, document destruction, and coordinate metrics. Update layout tests
to assert pane labels, accessible resizer values, collapse controls, font bounds,
and responsive classes through rendered behavior rather than CSS source strings.

- [ ] **Step 2: Confirm focused tests fail**

```bash
npx vitest run client/src/features/preview/pdfRenderer.test.ts client/src/features/preview/PdfViewer.test.tsx client/src/features/editor/TexEditor.test.tsx
```

Expected: FAIL because feature modules are absent.

- [ ] **Step 3: Implement lazy PDF.js rendering**

```ts
const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
  import("pdfjs-dist"),
  import("pdfjs-dist/build/pdf.worker.mjs?url")
]);
GlobalWorkerOptions.workerSrc = worker.default;
```

Use `AbortController`, `ResizeObserver`, and returned metrics. Map clicks back to
unscaled PDF coordinates. Render page 1 only. Destroy load/render/document
resources on success, failure, abort, and unmount.

- [ ] **Step 4: Split view components and styles**

Call `useWorkspace` exactly once in `App`. `AppHeader` owns compile control,
`FilePane` file selection, `EditorPane` title/font/save/editor, `PreviewPane`
PDF/build output, and `PaneResizer` pointer/keyboard sizing. Presentational files
must not import API client or reducer.

`ErrorBoundary` renders an accessible recovery message and reload control. Move
tokens/reset to `base.css`, grid/responsive behavior to `layout.css`, and
controls/panes/status/output to `components.css`. Preserve 980 px and 720 px
breakpoints.

- [ ] **Step 5: Verify bundle and commit**

```bash
npx vitest run client/src
npm run typecheck
npm run build
git add client/src
git commit -m "refactor: modularize editor workspace"
```

Expected: client tests pass, PDF.js and worker are separate lazy chunks, the main
JavaScript chunk is below 500 kB, and Vite prints no chunk-size warning.

---

### Task 9: Add Privacy Automation, Documentation, and GitHub Maintenance

**Files:**
- Create: `scripts/privacy-check.mjs`
- Create: `scripts/privacy-check.test.ts`
- Create: `README.zh-CN.md`
- Rewrite: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CHANGELOG.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create after runtime verification: `docs/assets/app-overview.png`
- Create after runtime verification: `docs/assets/editing-workflow.png`
- Create after runtime verification: `docs/assets/compile-synctex.png`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete fictional example and runtime commands.
- Produces: `npm run privacy:check`, bilingual docs, governance, CI, Dependabot, and three fictional workflow images.

- [ ] **Step 1: Write a failing privacy-scanner test**

```js
export function scanText(path, text) {
  return Array.from(findings);
}
```

Tests flag Unix user-home paths, Windows user-profile paths, Chinese mobile
numbers, generic email addresses, PEM private-key headers, and credential
assignments with values. Tests allow the specified GitHub SSH origin,
`example.com`, synthetic security-test words, and binary files.

- [ ] **Step 2: Confirm scanner test fails**

```bash
npx vitest run scripts/privacy-check.test.ts
```

Expected: FAIL because the scanner module is absent.

- [ ] **Step 3: Implement tracked-file scanning**

By default use `git ls-files --cached --others --exclude-standard -z` so tracked,
staged, and intended untracked public files are covered while ignored generated
content is skipped. Accept `--root <directory>` to scan an extracted archive
without Git. Read regular files, skip a buffer containing NUL in its first 8 KiB,
scan UTF-8, print `path:line: rule` without sensitive values, and exit nonzero on
findings. Add `"privacy:check": "node scripts/privacy-check.mjs"` and run it
before build in `npm run check`.

- [ ] **Step 4: Create legal and governance files**

Use MIT with `Copyright (c) 2026 yihan35`. Use Contributor Covenant 2.1 and
direct enforcement/security reports to GitHub private security advisories, not
email. `SECURITY.md` states loopback-only operation, trusted roots, no auth,
supported `0.1.x`, and advisory reporting. `CHANGELOG.md` follows Keep a
Changelog with Unreleased and `0.1.0`. `CONTRIBUTING.md` documents Node/TeX,
install/dev/focused-test/check flows, privacy, commits, and pull requests.

- [ ] **Step 5: Write equivalent English and Chinese READMEs**

Both include privacy-first summary, the same three fictional workflow images with
English or Chinese captions, features,
macOS/Linux/Windows prerequisites, sample quick start, all environment settings,
development/check/build/start commands, architecture tree, security boundary,
first-page limitation, troubleshooting, governance links, and MIT. Commands,
defaults, and configuration must match exactly.

- [ ] **Step 6: Create CI and Dependabot**

CI triggers for push/PR to `main`, uses checkout/setup-node v4 and npm cache.
Node 22 and 24 both run `npm ci`, typecheck, and tests. Node 22 quality runs
format check, lint, coverage, privacy scan, build, and high-level audit.
Dependabot v2 checks npm and Actions monthly, groups non-major npm updates, and
keeps majors separate.

- [ ] **Step 7: Generate and inspect the fictional workflow images**

Run the default sample and capture only the application viewport. Save:

```text
docs/assets/app-overview.png      loaded sample, file tree, editor, and preview
docs/assets/editing-workflow.png  edited fictional line plus visible dirty/save state
docs/assets/compile-synctex.png   successful build, PDF preview, build output, and source jump state
```

Inspect every image at full resolution for real names, local paths, browser
chrome, notifications, or private content. Crop consistently and save only after
all three inspections pass.

- [ ] **Step 8: Verify and commit public material**

```bash
npx vitest run scripts/privacy-check.test.ts
npm run privacy:check
npm run format:check
npm run lint
git add scripts/privacy-check.mjs scripts/privacy-check.test.ts package.json README.md README.zh-CN.md LICENSE CONTRIBUTING.md SECURITY.md CHANGELOG.md CODE_OF_CONDUCT.md .github docs/assets/app-overview.png docs/assets/editing-workflow.png docs/assets/compile-synctex.png
git commit -m "docs: prepare public project release"
```

Expected: all checks pass and every image contains fictional sample data only.

---

### Task 10: Enforce Coverage, Audit the Release, and Push `main`

**Files:**
- Modify: `vitest.config.ts`
- Modify tests under `client/src/**` and `server/src/**` only for uncovered specified behavior
- Inspect: every tracked file and complete commit range
- Push: `main` to `git@github.com:yihan35/resume_latex.git`

**Interfaces:**
- Consumes: all prior tasks and empty configured origin.
- Produces: enforced coverage, verified release commit, matching local/remote `main`, and passing GitHub Actions.

- [ ] **Step 1: Enable coverage thresholds**

```ts
thresholds: {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80
}
```

Exclude generated output, declarations, test setup, tool configs, and entry-only
files. Do not exclude domain services, reducers, hooks, routes, API client, PDF
renderer, or process runner.

- [ ] **Step 2: Run coverage and close specified gaps**

```bash
npm run test:coverage
```

Expected: thresholds pass. If they fail, use the report to add a test for the
exact uncovered specified branch: error, cancellation, cleanup, locking, path
containment, tool absence, or draft state. Do not lower thresholds or exclude
maintained modules.

- [ ] **Step 3: Run the complete local release gate**

```bash
npm ci
npm run check
npm audit --audit-level=high
```

Expected: deterministic install, privacy, format, lint, typecheck, coverage,
behavioral tests, production build, and audit pass; no chunk warning remains.

- [ ] **Step 4: Smoke-test production**

Start `npm start`, confirm loopback-only `127.0.0.1:43871`, and verify:

```text
GET /api/health                       -> 200 structured health
GET /api/project                      -> fictional sample metadata
GET /api/file?path=sample/resume.tex  -> fictional source only
GET /                                 -> built client HTML
```

In browser, edit/save sample, compile when XeLaTeX exists, retain old PDF on a
deliberate compile error, and navigate via SyncTeX or show its documented miss.
Restore the committed sample and verify clean shutdown.

- [ ] **Step 5: Audit paths, content, history, and archive**

```bash
git status --short
git diff --check
git ls-files
git log --stat --oneline
npm run privacy:check
```

Create a temporary `git archive HEAD`, list and extract it, and run
`node scripts/privacy-check.mjs --root <extracted-directory>`. Inspect
`git diff 3a8cb6a..HEAD`. Expected: clean tree; no old internal docs,
generated/runtime/env/PDF/Word/parent content.

- [ ] **Step 6: Commit release-gate changes when present**

```bash
git add vitest.config.ts client/src server/src
git commit -m "test: enforce release quality gates"
```

Do not create an empty commit when coverage already passes without changes.

- [ ] **Step 7: Reconfirm empty remote and push without force**

```bash
git fetch origin
git ls-remote --heads origin
git push -u origin main
```

Expected: no remote branch before push, followed by normal creation of
`origin/main`. If a branch appears before push, stop and compare histories.

- [ ] **Step 8: Verify remote identity and CI**

Compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/main`; SHAs
must match. Wait for Node 22/24 and quality jobs. Reproduce any CI portability
failure, add a regression test, rerun the entire release gate, commit, push
normally, and re-verify.

- [ ] **Step 9: Complete the requirement audit**

For every acceptance criterion in the approved design, record one direct item
of evidence: tracked file, focused test, command output, runtime response, bundle
size, audit result, remote SHA, or CI check. Mark the Goal complete only when
every criterion has passing evidence and no work remains.
