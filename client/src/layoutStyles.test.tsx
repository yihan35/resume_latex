import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "styles.css"), "utf8");

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(
    new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  return match?.[1] ?? "";
}

describe("workspace layout CSS", () => {
  it("keeps the editor workspace inside the viewport so inner panes own scrolling", () => {
    expect(cssRule(".app-shell")).toContain("height: 100vh");
    expect(cssRule(".app-shell")).toContain(
      "grid-template-rows: 52px minmax(0, 1fr)",
    );
    expect(cssRule(".tex-editor")).toContain("height: 100%");
    expect(cssRule(".tex-editor")).toContain("overflow: hidden");
  });

  it("reserves most right-rail height for the PDF preview instead of the build panel", () => {
    expect(cssRule(".pdf-pane")).toContain("flex: 1 1 auto");
    expect(cssRule(".build-pane")).toContain("flex: 0 0");
    expect(cssRule(".build-pane")).not.toContain("42%");
  });

  it("uses equal editor and PDF columns when the file pane is collapsed", () => {
    const collapsedWorkspaceRule = cssRule(".workspace.is-file-pane-collapsed");

    expect(collapsedWorkspaceRule).toContain("44px");
    expect(collapsedWorkspaceRule).toContain("8px");
    expect(collapsedWorkspaceRule).toContain(
      "minmax(0, var(--editor-pane-fr, 0.5fr))",
    );
    expect(collapsedWorkspaceRule).toContain(
      "minmax(0, var(--preview-pane-fr, 0.5fr))",
    );
  });
});
