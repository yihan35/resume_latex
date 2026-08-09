# Resume LaTeX Editor Open-Source Refactor Design

**Status:** Approved in conversation on 2026-08-09

## Context

Resume LaTeX Editor is a local React and Express application for discovering
LaTeX resume variants, editing source files, compiling with XeLaTeX, previewing
the generated PDF, and navigating from PDF coordinates back to source with
SyncTeX.

The current application is functional: its 82 tests pass, TypeScript type
checking passes, and a production build succeeds. It is not ready for a public
repository because the application directory is not a Git repository, generated
and runtime directories are present, open-source metadata is missing, several
dependencies have published vulnerabilities, old internal documents contain
absolute personal paths, and several source files combine too many
responsibilities.

The directory above the application contains private resumes, application
records, phone-number-bearing filenames, and other personal material. That
directory is explicitly outside the public project boundary.

## Goals

- Make `resume-editor/` the complete and only public repository root.
- Preserve the product's edit, save, compile, preview, and SyncTeX workflows.
- Modernize the supported runtime and direct dependencies.
- Split large frontend and backend files into focused, independently testable
  modules.
- Prevent silent draft loss and concurrent compilation conflicts.
- Retain strict filesystem and process-execution security boundaries.
- Provide fictional example content so a fresh clone can be evaluated without
  private resume files.
- Add complete English and Chinese usage, development, security, and
  contribution documentation.
- Establish automated quality checks and dependency maintenance on GitHub.
- Publish an audited `main` branch to
  `git@github.com:yihan35/resume_latex.git`.

## Non-Goals

- Do not publish any real resume, application record, phone number, email
  address, personal absolute path, or generated private document.
- Do not turn the application into a hosted service or expose it to a network.
- Do not add accounts, a database, collaboration, telemetry, or cloud storage.
- Do not build a generic LaTeX IDE or plugin system.
- Do not rewrite the application in another framework or add a state-management
  dependency when React primitives are sufficient.
- Do not publish the project as an npm package in this release.

## Chosen Approach

Use a modernized refactor rather than a compatibility-only cleanup or a full
rewrite. Keep the React client, local Express server, XeLaTeX compiler, SyncTeX
lookup, and HTTP boundary. Upgrade the runtime and libraries, then reorganize
the implementation around cohesive feature modules and shared contracts.

The release targets Node.js 22.13 or newer. The dependency baseline is React
19, Express 5, Vite 8, Vitest 4, and PDF.js 6. Exact patch versions are locked
by `package-lock.json`. Build and test tools belong in `devDependencies`; only
libraries needed by the built application or production server remain in
`dependencies`.

## Repository Boundary

`resume-editor/` becomes an independent Git repository on branch `main`. Its
parent directory and siblings are never moved into this repository and are not
referenced by committed documentation or configuration.

The repository includes only source, tests, fictional examples, public
documentation, configuration, and GitHub metadata. It excludes:

- `node_modules/`
- frontend and server build output
- coverage output
- `.resume-editor/` runtime state, PIDs, and logs
- `.env.local` and other machine-local configuration
- LaTeX auxiliary output such as `.aux`, `.log`, `.out`, and `.synctex.gz`
- OS and editor metadata

The old internal design and implementation-plan documents are removed before
the public source commit because they contain private absolute paths and stale
requirements. This approved design replaces them.

## Project Structure

The target structure is:

```text
client/src/
  app/                 application composition and top-level error boundary
  components/          reusable presentational and layout components
  features/editor/     Monaco editor integration
  features/preview/    PDF rendering and SyncTeX click mapping
  features/workspace/  workspace reducer, hooks, selectors, and orchestration
  lib/                 browser-side HTTP and utility modules
server/src/
  app.ts               Express application composition only
  config/              environment loading, defaults, and validation
  domain/              discovery, files, compilation, and SyncTeX services
  http/                route modules, request validation, errors, middleware
  process/             bounded child-process runner
  index.ts             production entry point and lifecycle handling
shared/
  contracts.ts         request, response, and error contracts used by both sides
examples/
  sample/              fictional `resume.tex` project
```

Files may be grouped more tightly when two tiny modules always change together,
but each module must have one stated responsibility. `App.tsx` becomes a
composition layer rather than a store, controller, and view in one file.
`server/src/app.ts` composes middleware and routers rather than implementing all
route behavior inline.

## Resume Discovery and Configuration

The server discovers resume variants in first-level child directories of the
configured project root. Each directory is checked for entry files in this
default order:

1. `resume.tex`
2. `main.tex`
3. `简历.tex`

The first match becomes that resume's entry file. Its PDF name is the entry
file stem plus `.pdf`. Discovery returns the entry TeX path and PDF path; the
compiler never reconstructs them from untrusted client input.

Configuration is loaded from process environment and an optional ignored
`.env.local` file using Node's built-in environment-file support. Supported
settings are:

- `RESUME_PROJECT_ROOT`: absolute or repository-relative project root; defaults
  to `examples/`.
- `RESUME_ENTRY_FILES`: comma-separated discovery priority; defaults to the
  three filenames above.
- `RESUME_EDITOR_PORT`: production/API port; defaults to `43871`.
- `RESUME_EDITOR_CLIENT_PORT`: Vite development port; defaults to `5173`.
- `RESUME_LATEX_COMMAND`: XeLaTeX executable name or absolute path; defaults to
  `xelatex`.
- `RESUME_SYNCTEX_COMMAND`: SyncTeX executable name or absolute path; defaults
  to `synctex`.

Configuration is parsed once at startup into a typed immutable object. Invalid
ports, an absent project root, an empty entry-file list, or a project root that
is not a directory produces a concise startup error.

## Shared HTTP Contracts

`shared/contracts.ts` defines the successful response shapes, request bodies,
and the public error envelope. Both TypeScript projects compile against this
file so route and client types cannot drift.

The public error envelope is:

```ts
interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
```

Stable codes include `INVALID_REQUEST`, `FILE_NOT_FOUND`, `UNSAFE_PATH`,
`LATEX_NOT_FOUND`, `SYNCTEX_NOT_FOUND`, `COMPILE_BUSY`, `COMPILE_FAILED`, and
`INTERNAL_ERROR`. Public messages never contain an absolute filesystem path or
raw internal exception.

The existing API capabilities remain available:

- inspect project metadata
- read and save a `.tex` file
- compile a discovered resume
- serve a discovered resume's PDF
- look up a source position with SyncTeX
- inspect server health and optional-tool availability

Routes accept only the minimum identifiers they need. Compile, PDF, and SyncTeX
operations resolve identifiers against current discovery results rather than
trusting a client-supplied absolute path or command.

## Frontend State and Data Flow

The workspace feature owns a reducer-based state model containing:

- project load state and discovered metadata
- selected resume and file
- an in-memory draft map keyed by relative TeX path
- dirty and saving status per draft
- compile state and last result per resume
- PDF version and SyncTeX navigation state
- user-visible activity and error state

Opening a file populates its draft once. Editing updates the draft without
writing on every keystroke. Switching files preserves dirty drafts in memory.
Explicit save writes the selected draft. Compile saves the selected dirty draft
first, waits for that save, and then starts compilation. A successful compile
increments the PDF cache version; a failed compile leaves the last successful
PDF visible.

Effects use `AbortController` plus monotonic request IDs. When the selection
changes or the component unmounts, stale requests are cancelled and cannot
overwrite current state. Pure reducer transitions and selectors are tested
without rendering the full application.

The visual product remains a responsive three-pane editor. Existing keyboard
and pointer resizing, font controls, accessible labels, build output, and PDF
click navigation are preserved. Components receive explicit props and do not
reach into unrelated workspace state.

## Filesystem Safety and Saving

Every requested path is resolved relative to the configured project root. The
implementation verifies lexical containment and the real path of every existing
component so path traversal and escaping symbolic links are rejected.

Editable files must have a `.tex` extension. PDF responses must correspond to a
currently discovered resume. Compilation and SyncTeX operate only on metadata
created by discovery.

Saving uses a temporary file in the destination directory followed by an atomic
rename. The implementation preserves the original file mode when replacing an
existing file and removes the temporary file after a failure. A failed save
does not truncate the original source.

## Compilation and Process Execution

Commands are executed with `spawn(command, args, { shell: false })`. No request
value is interpolated into a shell command. The process runner retains explicit
timeouts, bounded stdout and stderr capture, idempotent completion, and forced
termination after a grace period.

Compilation is locked per resume directory. A second compile request for the
same resume while one is running receives HTTP 409 with `COMPILE_BUSY`; other
resume directories may compile independently. The compile result is successful
only when the command exits with code zero and the expected PDF is newly created
or changed.

Raw command output is sanitized before it crosses the HTTP boundary. The
configured project root and recognizable Unix or Windows absolute paths are
replaced. Failed builds return a concise LaTeX error summary plus bounded,
sanitized output. Missing executables produce tool-specific error codes.

## PDF and SyncTeX

The PDF viewer upgrades to PDF.js 6 and continues to render locally without
uploading documents. The worker is loaded as a separate browser asset. PDF.js
is lazy-loaded so the main application chunk stays below Vite's 500 kB warning
threshold.

The initial release continues to render the first PDF page because multi-page
navigation is outside the current product scope. Click coordinates are mapped
back to unscaled PDF coordinates and sent with the discovered resume identifier.
SyncTeX output is accepted only when the returned source real path is inside the
project root and points to a `.tex` file.

## Runtime Modes

The cross-platform development command is `npm run dev`, which runs the API and
Vite processes in the foreground and terminates both on Ctrl-C. The bespoke
background Bash start/stop scripts, PID files, `lsof`, and `pgrep` requirements
are removed.

`npm run build` emits the server and client production output. `npm start` runs
the built Express server, which serves both `/api/*` and the client assets while
binding only to `127.0.0.1`. The application is not designed for remote network
exposure; `SECURITY.md` makes this trust boundary explicit.

## Dependency and Package Metadata

`package.json` remains `private: true` to prevent accidental npm publication.
It adds a description, MIT license declaration, repository and issue URLs,
keywords, and an `engines.node` floor of `>=22.13.0`.

Runtime and development dependencies are reclassified. Direct dependencies are
upgraded to maintained releases compatible with the chosen Node floor. The
lockfile must produce no high or critical vulnerability from `npm audit` at
release time.

## Test Strategy

The existing 82 behavioral tests form the regression baseline and are migrated
rather than discarded. Tests are reorganized beside their focused modules.

Required coverage includes:

- discovery priority, custom entry filenames, and generated PDF names
- lexical traversal, Unix and Windows absolute paths, and symbolic-link escape
- atomic save success, cleanup, failure preservation, and file mode preservation
- process success, spawn failure, output bounds, timeout, and double events
- per-resume compile locking and independent parallel resumes
- structured error codes and absolute-path redaction on every API route
- workspace reducer transitions, dirty drafts, selection races, and stale
  request suppression
- compile-before-save ordering, failed compile PDF retention, and PDF refresh
- PDF first-page rendering and coordinate conversion
- SyncTeX success, miss, missing tool, and out-of-root result rejection
- responsive layout and accessible controls

Vitest uses V8 coverage with minimum thresholds of 80% for statements, lines,
and functions and 75% for branches. Coverage thresholds apply to maintained
source modules, with generated declarations and entry-only files excluded.

The quality commands are:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run check` to run the release-gating local checks in a documented order

## Open-Source Documentation and Metadata

The public repository contains:

- `README.md`: English overview, screenshot, features, prerequisites, quick
  start, configuration, architecture, development, security model,
  troubleshooting, limitations, and acknowledgements.
- `README.zh-CN.md`: equivalent Chinese guide.
- `LICENSE`: MIT License.
- `CONTRIBUTING.md`: setup, branch, style, tests, commits, and pull requests.
- `SECURITY.md`: supported version, private reporting instructions, local-only
  threat model, and filesystem trust boundary.
- `CHANGELOG.md`: initial public release notes following Keep a Changelog.
- `CODE_OF_CONDUCT.md`: Contributor Covenant.
- `.env.example`: safe configuration examples with no personal paths.
- `examples/sample/resume.tex`: compilable fictional resume content.
- `.github/workflows/ci.yml`: Node 22 and 24 quality matrix.
- `.github/dependabot.yml`: monthly npm and GitHub Actions updates.

README screenshots are created from the fictional sample only and inspected for
personal information before commit.

## Continuous Integration

GitHub Actions runs on pushes and pull requests to `main`. The matrix uses the
current Node 22 and Node 24 release lines and performs `npm ci`, formatting,
linting, type checking, tests, coverage, and production build. Expensive
duplicate steps may run once outside the matrix, but both Node versions must run
the type checker and behavioral tests.

Dependabot groups non-major npm updates and GitHub Actions updates monthly.
Major framework updates remain separate pull requests.

## Privacy and Release Audit

Before the initial source commit and again before push:

1. Inspect every tracked path with `git ls-files`.
2. Search tracked text for personal absolute paths, phone numbers, email
   addresses, secrets, private keys, and known real-name strings.
3. Inspect the staged diff and a `git archive` of `HEAD`, not just the working
   directory.
4. Confirm generated files, runtime state, `.env.local`, and parent-directory
   content are absent.
5. Run formatting, lint, type checking, all tests, coverage, production build,
   and npm vulnerability audit.
6. Start the production build against the fictional example and verify health,
   project discovery, file read, PDF behavior, and clean shutdown.
7. Push `main` to `git@github.com:yihan35/resume_latex.git` and verify the remote
   commit matches local `HEAD`.

No force push is required because the target remote is empty at design time.

## Acceptance Criteria

The refactor is complete only when all of the following are true:

- `resume-editor/` is an independent Git repository on `main` with the specified
  GitHub origin.
- No tracked file contains private resume content or identifiable personal data.
- A fresh clone on supported Node versions can install, check, build, and run
  using only documented commands.
- The fictional example is discovered without configuration and never uses real
  personal details.
- Existing edit, save, compile, preview, and SyncTeX workflows remain covered by
  passing tests.
- Dirty drafts survive file switches and atomic saves cannot truncate originals.
- Path traversal and symbolic-link escapes are rejected across all file-related
  routes.
- Concurrent compiles for one resume are rejected without affecting other
  resumes.
- API errors are structured and do not leak absolute paths.
- Production binds to loopback only and serves the built client and API.
- The main client chunk no longer triggers Vite's 500 kB size warning.
- Release checks and the GitHub Actions workflow pass.
- `npm audit` reports no high or critical vulnerability.
- English and Chinese README files, license, contribution guide, security policy,
  changelog, code of conduct, CI, and Dependabot configuration are present.
- The remote `main` commit equals the locally verified release commit.
