import type { TexFileInfo } from "../../../shared/contracts";

interface TexFileTreeProps {
  files: TexFileInfo[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function TexFileTree({
  files,
  selectedPath,
  onSelect,
}: TexFileTreeProps) {
  if (files.length === 0) {
    return <p className="pane-empty">No TeX files found.</p>;
  }

  return (
    <div className="tex-file-tree" role="tree" aria-label="TeX files">
      {files.map((file) => {
        const isSelected = file.path === selectedPath;

        return (
          <button
            aria-selected={isSelected}
            className={`tex-file-item${isSelected ? " is-selected" : ""}`}
            key={file.path}
            onClick={() => onSelect(file.path)}
            role="treeitem"
            type="button"
          >
            <span className="tex-file-name">{file.name}</span>
            <span className="tex-file-path">{file.path}</span>
          </button>
        );
      })}
    </div>
  );
}
