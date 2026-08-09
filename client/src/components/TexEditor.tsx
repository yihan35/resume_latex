import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";

interface TexEditorProps {
  path: string | null;
  content: string;
  fontSize?: number;
  targetLine: number | null;
  targetLineRequestId: number;
  onChange: (content: string) => void;
}

function revealTargetLine(
  editor: MonacoEditor.IStandaloneCodeEditor,
  targetLine: number
) {
  const targetPosition = { lineNumber: targetLine, column: 1 };

  editor.setPosition(targetPosition);
  editor.revealPositionInCenter(targetPosition);
  editor.focus();
}

export function TexEditor({
  path,
  content,
  fontSize = 13,
  targetLine,
  targetLineRequestId,
  onChange
}: TexEditorProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const lastRevealedRequestRef = useRef<number | null>(null);

  function revealPendingTarget(editor: MonacoEditor.IStandaloneCodeEditor) {
    if (
      targetLine === null ||
      lastRevealedRequestRef.current === targetLineRequestId
    ) {
      return;
    }

    lastRevealedRequestRef.current = targetLineRequestId;
    revealTargetLine(editor, targetLine);
  }

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    revealPendingTarget(editor);
  };

  useEffect(() => {
    if (editorRef.current === null) {
      return;
    }

    revealPendingTarget(editorRef.current);
  }, [targetLine, targetLineRequestId]);

  if (path === null) {
    return (
      <div className="editor-placeholder" aria-live="polite">
        Select a TeX file to begin editing.
      </div>
    );
  }

  return (
    <div className="tex-editor">
      <Editor
        defaultLanguage="latex"
        onChange={(value) => onChange(value ?? "")}
        onMount={handleMount}
        options={{
          ariaLabel: "LaTeX editor",
          automaticLayout: true,
          fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          fontSize,
          lineNumbersMinChars: 4,
          minimap: { enabled: false },
          renderLineHighlight: "line",
          scrollBeyondLastLine: false,
          wordWrap: "on"
        }}
        path={path}
        theme="vs"
        value={content}
      />
    </div>
  );
}
