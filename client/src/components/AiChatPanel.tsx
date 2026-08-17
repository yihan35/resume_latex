import { useEffect, useRef, useState } from "react";

import type { AiChatMessage } from "../../../shared/contracts";
import type { ApiClient } from "../lib/apiClient";
import { useAiChat } from "../features/ai/useAiChat";

export function extractLatexBlock(content: string): string | null {
  const match = content.match(/```latex\s*\r?\n([\s\S]*?)```/i);
  if (match === null) return null;
  return match[1]?.replace(/\r?\n$/, "") ?? null;
}

interface AiChatPanelProps {
  api?: ApiClient;
  fileContent: string;
  filePath: string | null;
  onApply: (content: string) => void;
  onClose: () => void;
  open: boolean;
}

export function AiChatPanel({
  api,
  fileContent,
  filePath,
  onApply,
  onClose,
  open,
}: AiChatPanelProps) {
  const chat = useAiChat(api === undefined ? {} : { api });
  const [draft, setDraft] = useState("");
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [chat.messages, chat.streamingText]);

  if (!open) return null;

  const canSend =
    privacyAcknowledged &&
    filePath !== null &&
    fileContent !== "" &&
    chat.status !== "streaming" &&
    draft.trim() !== "";
  const lastAssistant = [...chat.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const pendingBlock =
    chat.status === "idle" && lastAssistant !== undefined
      ? extractLatexBlock(lastAssistant.content)
      : null;

  function handleSubmit() {
    if (!canSend || filePath === null) return;
    setApplied(null);
    void chat.send({ path: filePath, content: fileContent, prompt: draft });
    setDraft("");
  }

  return (
    <aside className="ai-chat-panel">
      <header className="ai-chat-header">
        <h2>AI 助手</h2>
        <span className="ai-chat-model">DeepSeek</span>
        <button
          aria-label="关闭 AI 助手"
          className="ai-chat-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      {!privacyAcknowledged && (
        <div className="ai-chat-notice">
          <span>对话内容将发送至 DeepSeek API，发送即表示同意。</span>
          <button onClick={() => setPrivacyAcknowledged(true)} type="button">
            知道了
          </button>
        </div>
      )}

      <div className="ai-chat-messages" ref={listRef}>
        {chat.messages.map((message, index) => (
          <ChatBubble key={index} message={message} />
        ))}
        {chat.status === "streaming" && (
          <div className="ai-chat-message is-assistant">
            {chat.streamingText}
            <span className="ai-chat-cursor">▍</span>
          </div>
        )}
        {chat.status === "error" && chat.error !== null && (
          <div className="ai-chat-error" role="alert">
            {chat.error}
          </div>
        )}
        {pendingBlock !== null && (
          <div className="ai-chat-actions">
            <button
              onClick={() => {
                onApply(pendingBlock);
                setApplied("已应用到编辑器，请检查后保存。");
              }}
              type="button"
            >
              应用到编辑器
            </button>
            {applied !== null && (
              <span className="ai-chat-applied">{applied}</span>
            )}
          </div>
        )}
      </div>

      <form
        className="ai-chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <textarea
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              handleSubmit();
            }
          }}
          placeholder={
            filePath === null
              ? "请先打开一个 TeX 文件"
              : "告诉 AI 你想怎么改简历…"
          }
          rows={3}
          value={draft}
        />
        <div className="ai-chat-input-actions">
          {chat.status === "streaming" ? (
            <button onClick={chat.stop} type="button">
              停止
            </button>
          ) : (
            <button disabled={!canSend} type="submit">
              发送
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}

function ChatBubble({ message }: { message: AiChatMessage }) {
  return (
    <div className={`ai-chat-message is-${message.role}`}>
      {message.content}
    </div>
  );
}
