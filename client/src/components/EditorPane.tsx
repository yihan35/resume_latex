import { useState } from "react";

import { TexEditor } from "../features/editor/TexEditor";

const MIN_TEX_FONT_SIZE = 8;
const MAX_TEX_FONT_SIZE = 20;

interface EditorPaneProps {
  content: string;
  isLoading: boolean;
  lineCount: number | null;
  path: string | null;
  title: string;
  targetLine: number | null;
  targetLineRequestId: number;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (content: string) => void;
  onSave: () => Promise<boolean>;
}

function clampFontSize(value: number) {
  return Math.min(MAX_TEX_FONT_SIZE, Math.max(MIN_TEX_FONT_SIZE, value));
}

export function EditorPane({
  content,
  isLoading,
  isDirty,
  isSaving,
  lineCount,
  onChange,
  onSave,
  path,
  targetLine,
  targetLineRequestId,
  title,
}: EditorPaneProps) {
  const [fontSize, setFontSize] = useState(13);
  return (
    <section className="editor-pane" aria-label="Editor">
      <div className="pane-title-row">
        <h2>{title}</h2>
        <div className="pane-actions">
          {lineCount === null ? null : (
            <span className="line-count">{lineCount} lines</span>
          )}
          <button
            aria-label="Save TeX file"
            className="pane-action-button"
            disabled={!isDirty || isSaving}
            onClick={() => void onSave()}
            type="button"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <div
            aria-label="TeX font size"
            className="font-size-controls"
            role="group"
          >
            <button
              aria-label="Decrease TeX font size"
              className="font-size-button"
              disabled={fontSize <= MIN_TEX_FONT_SIZE}
              onClick={() =>
                setFontSize((current) => clampFontSize(current - 1))
              }
              title="Decrease TeX font size"
              type="button"
            >
              <span aria-hidden="true">-</span>
            </button>
            <span className="font-size-value">{fontSize}px</span>
            <button
              aria-label="Increase TeX font size"
              className="font-size-button"
              disabled={fontSize >= MAX_TEX_FONT_SIZE}
              onClick={() =>
                setFontSize((current) => clampFontSize(current + 1))
              }
              title="Increase TeX font size"
              type="button"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <span className="selected-path">{path ?? "Select a TeX file"}</span>
        </div>
      </div>
      {isLoading ? (
        <div className="editor-placeholder" aria-live="polite">
          Loading TeX file...
        </div>
      ) : (
        <TexEditor
          content={content}
          fontSize={fontSize}
          onChange={onChange}
          path={path}
          targetLine={targetLine}
          targetLineRequestId={targetLineRequestId}
        />
      )}
    </section>
  );
}
