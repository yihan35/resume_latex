import { forwardRef } from "react";
import type { TexFileInfo } from "../../../shared/contracts";

import { TexFileTree } from "./TexFileTree";

interface FilePaneProps {
  collapsed: boolean;
  files: TexFileInfo[];
  selectedPath: string | null;
  onCollapsedChange: (collapsed: boolean) => void;
  onSelect: (path: string) => void;
}

export const FilePane = forwardRef<HTMLElement, FilePaneProps>(
  function FilePane(
    { collapsed, files, selectedPath, onCollapsedChange, onSelect },
    ref,
  ) {
    return (
      <aside
        className={`file-pane${collapsed ? " is-collapsed" : ""}`}
        aria-label="Project files"
        ref={ref}
      >
        <div className="pane-title-row file-pane-title-row">
          {collapsed ? (
            <button
              aria-label="Expand files panel"
              className="file-pane-toggle"
              onClick={() => onCollapsedChange(false)}
              title="Expand files panel"
              type="button"
            >
              <span aria-hidden="true">›</span>
            </button>
          ) : (
            <>
              <h2>Files</h2>
              <div className="pane-actions">
                <span className="file-count">{files.length}</span>
                <button
                  aria-label="Collapse files panel"
                  className="file-pane-toggle"
                  onClick={() => onCollapsedChange(true)}
                  title="Collapse files panel"
                  type="button"
                >
                  <span aria-hidden="true">‹</span>
                </button>
              </div>
            </>
          )}
        </div>
        {collapsed ? null : (
          <TexFileTree
            files={files}
            onSelect={onSelect}
            selectedPath={selectedPath}
          />
        )}
      </aside>
    );
  },
);
