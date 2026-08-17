import { useCallback, useEffect, useRef, useState } from "react";

import type { AiChatMessage } from "../../../../shared/contracts";
import { createApiClient, type ApiClient } from "../../lib/apiClient";

export type AiChatStatus = "idle" | "streaming" | "error";

export interface UseAiChatOptions {
  api?: ApiClient;
}

export function useAiChat(options: UseAiChatOptions = {}) {
  const apiRef = useRef<ApiClient>(options.api ?? createApiClient());
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<AiChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(status);
  const messagesRef = useRef(messages);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const finishPartial = useCallback((partial: string) => {
    if (partial !== "") {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: partial },
      ]);
    }
    setStreamingText("");
    setStatus("idle");
  }, []);

  const send = useCallback(
    async (input: { path: string; content: string; prompt: string }) => {
      const prompt = input.prompt.trim();
      if (statusRef.current === "streaming" || prompt === "") return;

      const history = messagesRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      setMessages([...history, { role: "user", content: prompt }]);
      setStreamingText("");
      setError(null);
      setStatus("streaming");

      let accumulated = "";
      try {
        const stream = await apiRef.current.chatAi(
          { path: input.path, content: input.content, messages: history },
          controller.signal,
        );
        for await (const event of stream) {
          if (event.type === "delta") {
            accumulated += event.text;
            setStreamingText(accumulated);
          } else if (event.type === "error") {
            setError(event.message);
            setStatus("error");
            if (accumulated !== "") {
              setMessages((current) => [
                ...current,
                { role: "assistant", content: accumulated },
              ]);
            }
            setStreamingText("");
            return;
          }
        }
        if (controller.signal.aborted) {
          finishPartial(accumulated);
          return;
        }
        finishPartial(accumulated);
      } catch (caught) {
        if (controller.signal.aborted) {
          finishPartial(accumulated);
          return;
        }
        setError(caught instanceof Error ? caught.message : "AI 请求失败");
        setStatus("error");
        if (accumulated !== "") {
          setMessages((current) => [
            ...current,
            { role: "assistant", content: accumulated },
          ]);
        }
        setStreamingText("");
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [finishPartial],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setMessages([]);
    setStreamingText("");
    setError(null);
    setStatus("idle");
  }, []);

  return { messages, streamingText, status, error, send, stop, reset };
}
