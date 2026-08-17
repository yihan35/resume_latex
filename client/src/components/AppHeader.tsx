interface AppHeaderProps {
  resumeDirectory: string | undefined;
  canCompile: boolean;
  aiOpen: boolean;
  onCompile: () => Promise<void>;
  onToggleAi: () => void;
}

export function AppHeader({
  resumeDirectory,
  canCompile,
  aiOpen,
  onCompile,
  onToggleAi,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Resume LaTeX Editor</h1>
        <span>{resumeDirectory ?? "No resume selected"}</span>
      </div>
      <div className="topbar-actions">
        <button
          aria-pressed={aiOpen}
          className="ai-toggle-button"
          onClick={onToggleAi}
          type="button"
        >
          AI 助手
        </button>
        <button
          className="compile-button"
          disabled={!canCompile}
          onClick={() => void onCompile()}
          type="button"
        >
          编译当前简历
          <span className="sr-only"> Compile</span>
        </button>
      </div>
    </header>
  );
}
