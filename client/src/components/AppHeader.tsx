interface AppHeaderProps {
  resumeDirectory: string | undefined;
  canCompile: boolean;
  onCompile: () => Promise<void>;
}

export function AppHeader({
  resumeDirectory,
  canCompile,
  onCompile,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Resume LaTeX Editor</h1>
        <span>{resumeDirectory ?? "No resume selected"}</span>
      </div>
      <button
        className="compile-button"
        disabled={!canCompile}
        onClick={() => void onCompile()}
        type="button"
      >
        编译当前简历
        <span className="sr-only"> Compile</span>
      </button>
    </header>
  );
}
