import { Router } from "express";

import type { AiChatStreamEvent } from "../../../../shared/contracts.js";
import {
  DeepSeekTimeoutError,
  DeepSeekUpstreamError,
  type DeepSeekChatMessage,
  type DeepSeekClient,
} from "../../domain/deepseek.js";
import { ApiError } from "../apiError.js";
import { isAiChatRequest } from "../validation.js";

function buildSystemPrompt(filePath: string): string {
  return [
    "You are an expert LaTeX resume assistant.",
    `The user is editing the file "${filePath}".`,
    "When the user asks you to modify the file, reply with the COMPLETE new file content inside a single fenced code block labeled `latex`.",
    "Put any explanation outside the code block.",
    "Do not invent facts, emails, phone numbers, or project details that are not already in the file.",
    "If no change is needed, say so and explain why.",
  ].join(" ");
}

export function createAiRouter(options: {
  apiKey: string;
  deepseek: DeepSeekClient;
}): Router {
  const router = Router();

  router.post("/api/ai/chat", async (request, response) => {
    if (!isAiChatRequest(request.body)) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid AI chat request");
    }
    if (options.apiKey === "") {
      throw new ApiError(503, "AI_NOT_CONFIGURED", "AI is not configured");
    }

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const controller = new AbortController();
    const onClose = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on("close", onClose);

    const send = (event: AiChatStreamEvent) => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const messages: readonly DeepSeekChatMessage[] = [
        { role: "system", content: buildSystemPrompt(request.body.path) },
        ...request.body.messages,
        {
          role: "user",
          content: `Current file content (${request.body.path}):\n\`\`\`latex\n${request.body.content}\n\`\`\``,
        },
      ];

      for await (const delta of options.deepseek.chatStream({
        messages,
        signal: controller.signal,
      })) {
        if (response.destroyed) break;
        send({ type: "delta", text: delta });
      }
      if (!response.destroyed) send({ type: "done" });
    } catch (error) {
      if (!response.destroyed && !controller.signal.aborted) {
        if (error instanceof DeepSeekTimeoutError) {
          send({
            type: "error",
            code: "AI_UPSTREAM_ERROR",
            message: "AI 请求超时，请稍后重试",
          });
        } else if (error instanceof DeepSeekUpstreamError) {
          send({
            type: "error",
            code: "AI_UPSTREAM_ERROR",
            message: "AI 服务暂时不可用，请稍后重试",
          });
        } else {
          send({
            type: "error",
            code: "INTERNAL_ERROR",
            message: "AI 请求失败",
          });
        }
      }
    } finally {
      response.removeListener("close", onClose);
      response.end();
    }
  });

  return router;
}
