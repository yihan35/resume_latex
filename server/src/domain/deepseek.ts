import type { AiChatMessage } from "../../../shared/contracts.js";

export type DeepSeekChatMessage =
  | AiChatMessage
  | { role: "system"; content: string };

export interface DeepSeekChatOptions {
  messages: readonly DeepSeekChatMessage[];
  signal?: AbortSignal;
}

export interface DeepSeekClientOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
}

export interface DeepSeekClient {
  chatStream(options: DeepSeekChatOptions): AsyncIterable<string>;
}

export class DeepSeekUpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DeepSeekUpstreamError";
  }
}

export class DeepSeekTimeoutError extends DeepSeekUpstreamError {
  constructor() {
    super("DeepSeek request timed out");
    this.name = "DeepSeekTimeoutError";
  }
}

export function createDeepSeekClient(
  options: DeepSeekClientOptions,
): DeepSeekClient {
  const fetcher = options.fetcher ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return {
    async *chatStream({ messages, signal }) {
      const controller = new AbortController();
      let timedOut = false;
      const onExternalAbort = () => controller.abort();
      signal?.addEventListener("abort", onExternalAbort);
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs);

      try {
        const upstream = await fetcher(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            messages,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!upstream.ok) {
          throw new DeepSeekUpstreamError(
            `DeepSeek request failed with status ${upstream.status}`,
            upstream.status,
          );
        }
        if (upstream.body === null) {
          throw new DeepSeekUpstreamError("DeepSeek returned an empty body");
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let separator: number;
            while ((separator = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, separator).trim();
              buffer = buffer.slice(separator + 1);
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") return;
              try {
                const chunk = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const delta = chunk.choices?.[0]?.delta?.content ?? "";
                if (delta !== "") yield delta;
              } catch {
                // Ignore malformed chunks from the upstream stream.
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        if (timedOut) throw new DeepSeekTimeoutError();
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onExternalAbort);
      }
    },
  };
}
