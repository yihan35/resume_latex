# Resume LaTeX Editor AI Assistant Design

**Status:** Approved in conversation on 2026-08-17

## Context

Resume LaTeX Editor is a local, privacy-first React and Express application
for editing LaTeX resumes, compiling with XeLaTeX, previewing the PDF, and
navigating with SyncTeX. It deliberately keeps all source files on the local
machine and exposes only loopback HTTP without authentication.

The user wants an in-app AI assistant that can see the LaTeX source of the
currently open resume and modify it on request. The model provider is
DeepSeek, accessed through its OpenAI-compatible chat completions API.

Calling an external AI service is an explicit, user-visible exception to the
privacy model: resume content will be sent to DeepSeek only when the user
actively sends a chat message.

## Goals

- Add a collapsible AI chat window to the app UI.
- Stream DeepSeek chat completions back to the chat window as they arrive.
- Give the model the current editor content, including unsaved draft edits.
- Let the user apply a proposed LaTeX change to the editor and review it
  before saving.
- Keep the DeepSeek API key server-side only; never send it to the browser.
- Add config, validation, error mapping, documentation, and tests following
  the existing repository patterns.

## Non-Goals

- Do not add user accounts, rate limiting, multi-user support, or telemetry.
- Do not store chat history on disk or in any database.
- Do not implement model tool/function calling in this release; a complete
  file replacement inside a fenced code block is the modification contract.
- Do not auto-save AI-generated content over the user's file; the user
  explicitly reviews and saves.
- Do not expose the API key or any DeepSeek configuration to the browser.

## Chosen Approach

Add a thin local proxy route on the existing Express server. The browser
posts the file path, the current editor content, and the message history to
`POST /api/ai/chat`; the server forwards a constructed chat request to
DeepSeek with `stream: true` and relays SSE events back to the browser. The
chat UI lives in a collapsible floating panel so the existing three-pane
workspace layout is untouched.

## Configuration

New environment variables, read by `createAppConfig` and validated at
startup:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | none | DeepSeek API key; required for the AI route |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Model name sent to DeepSeek |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API base URL |
| `DEEPSEEK_TIMEOUT_MS` | `120000` | Upstream request timeout |

`DEEPSEEK_API_KEY` is optional at startup so the app still runs without AI
configured; the chat route returns `503 AI_NOT_CONFIGURED` in that case. The
key is stored in the git-ignored `.env.local` and never returned to the
browser.

## Shared HTTP Contracts

Extend `shared/contracts.ts`:

```ts
export type ApiErrorCode =
  | ...existing codes
  | "AI_NOT_CONFIGURED"
  | "AI_UPSTREAM_ERROR";

export interface AiChatRequest {
  path: string;
  content: string;
  messages: AiChatMessage[];
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}
```

The response is a `text/event-stream` of SSE events, each a JSON payload:

```ts
export type AiChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; code: ApiErrorCode; message: string };
```

## Server Design

### DeepSeek client (`server/src/domain/deepseek.ts`)

A small, dependency-injected client:

- `createDeepSeekClient({ apiKey, model, baseUrl, timeoutMs, fetcher? })`
- `chatStream(request): AsyncIterable<string>` opens the DeepSeek chat
  completions endpoint with `stream: true` and yields text deltas.
- It sends only `{ role, content }` messages plus a system prompt built by
  the route. No tool calls, no temperature overrides unless needed.
- Accepts an `AbortSignal` so the route can cancel the upstream request when
  the browser disconnects.

### System prompt

The route builds the system prompt:

> You are an expert LaTeX resume assistant. Below is the current complete
> content of the file `{path}`. When the user asks you to modify it, reply
> with the COMPLETE new file content inside a single fenced code block
> labeled `latex`. Put any explanation outside the code block. Do not invent
> facts or fake file information. If no change is needed, say so and explain
> why.

The current content is placed in the last user message so the model always
sees the exact draft being edited.

### Route (`server/src/http/routes/ai.ts`)

`POST /api/ai/chat`:

1. Validate the body with `isAiChatRequest` (exact keys, bounded sizes).
2. Return `503 AI_NOT_CONFIGURED` when the API key is absent.
3. Read no files from disk; trust the `content` from the client, which is the
   current editor draft.
4. Open the DeepSeek stream and relay SSE events:
   `data: {"type":"delta","text":"..."}\n\n`, finishing with
   `data: {"type":"done"}\n\n`.
5. On upstream failure or timeout, write `data: {"type":"error",...}\n\n`
   with `AI_UPSTREAM_ERROR` (502-style semantics) and end the stream.
6. On client disconnect (`request.on("close")`), abort the upstream request.

The route follows the existing dependency-injection pattern: tests construct
`createAiRouter({ deepseek })` with a fake client.

## Frontend Design

### Chat state (`client/src/features/ai/useAiChat.ts`)

Local React state owned by the chat panel:

- `messages: AiChatMessage[]` plus the in-flight assistant reply.
- `status: "idle" | "streaming" | "error"`.
- A send function that appends the user message, calls
  `api.chatAi({ path, content, messages }, signal)`, consumes the SSE stream,
  and appends deltas to the assistant message.
- An abort function to stop an in-flight stream.

Chat history stays in memory only and is cleared on page reload.

### API client (`client/src/lib/apiClient.ts`)

Add `chatAi(input, signal): Promise<AsyncIterable<AiChatStreamEvent>>`. It
uses `fetch` with `ReadableStream` parsing of `text/event-stream`, decoding
`data:` lines as JSON. `AbortController` propagation is reused from the
existing client.

### Panel (`client/src/components/AiChatPanel.tsx`)

- Collapsible floating panel anchored bottom-right, toggled by an "AI 助手"
  button in `AppHeader` and by its own close button.
- Renders the message list, a streaming indicator, an error banner, and a
  text input with Send.
- After a stream completes, extracts a fenced ```latex code block from the
  final assistant message. If found, shows an "应用到编辑器" button that
  writes the extracted content into the editor draft via the existing
  `editCurrentFile` workspace action. The user then reviews and saves
  normally.
- Shows a first-use privacy notice: "对话内容将发送至 DeepSeek，发送即表示同意".
- Disables send until a file is open and a message is typed.

The panel stays mounted while collapsed so conversation history is
preserved.

### Layout and styles

- Add `.ai-chat-panel` (fixed positioning, collapsible) to `layout.css`.
- Add message bubbles, input, and buttons to `components.css`.
- Responsive behavior: on small screens the panel overlays full-width
  bottom area; the header toggle remains visible.

## Error Handling

| Condition | HTTP/event | Code |
| --- | --- | --- |
| Invalid request body | SSE error event | `INVALID_REQUEST` |
| No API key configured | SSE error event | `AI_NOT_CONFIGURED` |
| Upstream HTTP/network/timeout failure | SSE error event | `AI_UPSTREAM_ERROR` |
| Unexpected server error | SSE error event | `INTERNAL_ERROR` |

Non-SSE routes keep the existing JSON error contract. Error text shown in
the chat UI is bounded and does not expose the API key or absolute paths.

## Privacy

- The DeepSeek API key exists only in server configuration and is read from
  `.env.local` (git-ignored).
- Resume content is sent only when the user sends a chat message, and the UI
  states this explicitly before first use.
- Chat history is memory-only.
- README files document the external transfer and how to disable the feature
  (leave the key unset).

## Test Strategy

Server:

- `deepseek.test.ts`: mock fetcher; success deltas, HTTP error, timeout,
  abort propagation.
- `ai.test.ts` (supertest): missing key, invalid body, successful SSE relay,
  upstream error relay, client disconnect abort.
- `appConfig.test.ts`: new variables parsed and validated.
- `validation.test.ts`: `isAiChatRequest` boundary cases.

Frontend:

- `useAiChat.test.tsx`: send appends messages, streamed deltas accumulate,
  abort stops mid-stream, errors surface.
- `AiChatPanel.test.tsx`: renders history, disables send appropriately,
  applies a code block to the editor, shows privacy notice.

Quality gates: `npm run check` (format, lint, typecheck, coverage, privacy
check, build) must pass.

## Documentation

- Add AI feature usage to `README.md` and `README.zh-CN.md` (how to configure
  the key, how to use the chat window, privacy note).
- Add the new variables to the configuration table in both READMEs.

## Acceptance Criteria

- `npm run dev` starts and the header shows an "AI 助手" toggle.
- With `DEEPSEEK_API_KEY` set in `.env.local`, sending a message streams a
  reply and a ```latex code block offers "应用到编辑器".
- Applying a change updates the editor draft without saving; the user can
  save and compile as usual.
- Without the key, the chat panel reports "AI 未配置" without crashing.
- No API key or absolute local path appears in the browser network traffic.
- `npm run check` passes.
