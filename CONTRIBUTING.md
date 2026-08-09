# Contributing

Thank you for helping improve Resume LaTeX Editor.

## Development setup

Install Node.js `22.13.0` or newer, npm, XeLaTeX, and SyncTeX. Then install the
locked dependency set:

```sh
npm ci
```

Start the API and Vite development servers:

```sh
npm run dev
```

The default fictional sample is available at `http://127.0.0.1:5173`.

## Tests and checks

Run a focused test while iterating:

```sh
npx vitest run scripts/privacy-check.test.ts
npx vitest run server/src/domain/pathSafety.test.ts
```

Run the full release-gating checks before opening a pull request:

```sh
npm run check
```

The check pipeline verifies formatting, lint, types, tests and coverage, privacy,
and the production build. Individual commands are also available:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run privacy:check
npm run build
```

## Privacy

Use only fictional data in tests, examples, screenshots, logs, and issue reports.
Never commit real resumes, contact details, application records, local absolute
paths, credentials, private keys, generated PDFs, or `.env.local` files. Run
`npm run privacy:check` before every pull request. When adding a privacy rule,
add a focused test that proves its finding and its safe exceptions.

## Changes and commits

- Keep changes focused and preserve the local-only security boundary.
- Add or update tests for behavior changes.
- Run Prettier with `npm run format` when needed.
- Write concise imperative commits; Conventional Commit prefixes such as
  `feat:`, `fix:`, `docs:`, and `test:` are encouraged.

## Pull requests

Describe the problem, the chosen approach, and verification performed. Link any
related issue, call out security or compatibility effects, and include only
fictional screenshots when the interface changes. By participating, you agree to
follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through
the private process in [SECURITY.md](SECURITY.md).
