# Resume LaTeX Editor

[简体中文](README.zh-CN.md)

A local, privacy-first workspace for editing LaTeX resumes. It keeps source
files on your machine, discovers resumes only inside a configured trusted root,
and combines a file tree, Monaco editor, PDF preview, build output, and SyncTeX
navigation in one focused interface.

> This application binds to loopback and has no authentication. Keep it local
> and open only trusted LaTeX projects.

## Workflow

### Load the fictional sample

![Loaded fictional sample with the file tree, TeX editor, and PDF preview](docs/assets/app-overview.png)

The default project opens `examples/sample/resume.tex` without requiring any
personal data.

### Edit and save explicitly

![A fictional summary edit with the Save control showing an unsaved draft](docs/assets/editing-workflow.png)

Drafts stay in the editor until you choose **Save**. Compiling first saves the
current dirty draft.

### Compile and jump from PDF to source

![A successful fictional build with PDF preview, build output, and a SyncTeX source jump](docs/assets/compile-synctex.png)

Compile with XeLaTeX, then click the rendered PDF to jump to the corresponding
source line through SyncTeX.

## Features

- Discovers resume entry files and `.tex` sources under one trusted root.
- Edits with Monaco, adjustable font size, explicit save, and dirty-draft
  protection.
- Compiles the selected resume with XeLaTeX and shows sanitized build output.
- Renders a responsive, high-density preview of the first PDF page.
- Maps PDF clicks back to source through SyncTeX.
- Confines file access, validates requests, limits process output, and reports
  stable public errors without exposing local absolute paths.
- Includes a fictional sample, automated privacy scanning, tests, and a
  production build.

## Prerequisites

- Node.js `22.13.0` or newer (Node 22 and 24 are tested) and npm.
- XeLaTeX and SyncTeX available on `PATH`.
  - macOS: install MacTeX or BasicTeX and ensure `/Library/TeX/texbin` is on
    `PATH`.
  - Linux: install a TeX Live distribution with XeLaTeX, SyncTeX, and the LaTeX
    packages used by your resume.
  - Windows: install MiKTeX or TeX Live, enable package installation as needed,
    and add its binaries to `PATH`.

## Quick start with the sample

```sh
git clone git@github.com:yihan35/resume_latex.git
cd resume_latex
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The API runs at
`http://127.0.0.1:43871`, and the fictional sample loads automatically.

For a production build:

```sh
npm run build
npm start
```

Then open `http://127.0.0.1:43871`.

## Configuration

The server reads process environment variables and an optional ignored
`.env.local` file at startup. Copy `.env.example` to `.env.local`, or set the
same values in your shell.

| Setting                     | Default                        | Purpose                                       |
| --------------------------- | ------------------------------ | --------------------------------------------- |
| `RESUME_PROJECT_ROOT`       | `./examples`                   | Trusted root containing resume directories    |
| `RESUME_ENTRY_FILES`        | `resume.tex,main.tex,简历.tex` | Comma-separated entry-file discovery priority |
| `RESUME_EDITOR_PORT`        | `43871`                        | Production and API server port                |
| `RESUME_EDITOR_CLIENT_PORT` | `5173`                         | Vite development server port                  |
| `RESUME_LATEX_COMMAND`      | `xelatex`                      | XeLaTeX executable name or absolute path      |
| `RESUME_SYNCTEX_COMMAND`    | `synctex`                      | SyncTeX executable name or absolute path      |

Relative project roots resolve from the repository directory. Invalid ports,
missing roots, non-directory roots, and empty entry-file lists stop startup with
a concise error.

## Development

```sh
npm run dev             # API and Vite development servers
npm run typecheck       # server and client TypeScript checks
npm test                # complete Vitest suite
npm run test:coverage   # tests with V8 coverage
npm run format:check    # Prettier verification
npm run lint            # ESLint verification
npm run privacy:check   # tracked and intended-untracked public files
npm run check           # all release-gating checks and production build
npm run build           # server and client production bundles
npm start               # serve the built app on the API port
```

Run one test file while iterating:

```sh
npx vitest run scripts/privacy-check.test.ts
```

## Architecture

```text
client/src/
  app/                  application shell and error boundary
  components/           file, editor, preview, and build panes
  features/editor/      Monaco integration
  features/preview/     PDF.js first-page renderer
  features/workspace/   reducer, selectors, and async orchestration
  lib/                   typed API client
server/src/
  config/                environment parsing and validation
  domain/                discovery, file safety, compile, and SyncTeX
  http/                  Express routes, validation, and public errors
  process/               bounded child-process execution
shared/                  client/server HTTP contracts
examples/sample/         fictional default resume
scripts/                 privacy automation
```

The browser calls typed Express routes. Server routes resolve identifiers
against current discovery results, domain services enforce the trusted root,
and configured local executables perform compilation and SyncTeX lookup.

## Security model

- The server listens on `127.0.0.1` only and deliberately provides no auth.
- `RESUME_PROJECT_ROOT` is a trusted boundary; do not load untrusted TeX.
- File operations accept safe relative `.tex` paths and reject escapes,
  symlink substitutions, malformed requests, and oversized bodies.
- Compile, PDF, and SyncTeX requests use discovered resume identifiers instead
  of client-supplied commands or absolute paths.
- Compiler output and public errors are bounded and sanitized before reaching
  the browser.

This is defense in depth for a single-user local tool, not a sandbox for hostile
documents. See [SECURITY.md](SECURITY.md) for reporting and supported versions.

## Current limitation

The preview intentionally renders only page 1, and PDF-to-source lookup sends
page 1 coordinates. Multi-page navigation is not yet implemented.

## Troubleshooting

- **No resume appears:** confirm the trusted root exists and contains a
  subdirectory with one configured entry filename.
- **XeLaTeX or SyncTeX is unavailable:** run `xelatex --version` and
  `synctex --version`, or set the corresponding command variable.
- **A TeX package is missing:** install it through your TeX distribution, then
  compile again.
- **A port is occupied:** change `RESUME_EDITOR_PORT` or
  `RESUME_EDITOR_CLIENT_PORT` before startup.
- **The PDF is absent or stale:** save, compile, and inspect the Build pane.
  Compilation uses `-synctex=1` so source lookup depends on a successful build.
- **The production page does not load:** run `npm run build` before `npm start`.

## Project governance

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), the
[Code of Conduct](CODE_OF_CONDUCT.md), [Security Policy](SECURITY.md), and
[Changelog](CHANGELOG.md).

## License

Released under the [MIT License](LICENSE). Built with React, Monaco Editor,
PDF.js, Express, Vite, and the local TeX toolchain.
