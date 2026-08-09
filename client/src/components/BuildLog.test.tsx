import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BuildLog } from "./BuildLog";

const componentStyles = readFileSync(
  resolve(__dirname, "../styles/components.css"),
  "utf8",
);

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = componentStyles.match(
    new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  return match?.[1] ?? "";
}

describe("BuildLog styles", () => {
  it("keeps long compile output inside a constrained flex column", () => {
    render(
      <BuildLog
        result={{
          elapsedMs: 120,
          logSummary: "compiled",
          ok: true,
          pdfPath: "resume.pdf",
          stderr: "",
          stdout: "long compile output".repeat(100),
        }}
        status="success"
      />,
    );

    const output = screen.getByText(/long compile output/);
    const buildLogRule = cssRule(".build-log");

    expect(buildLogRule).toContain("display: flex");
    expect(buildLogRule).toContain("flex-direction: column");
    expect(buildLogRule).toContain("min-height: 0");
    expect(buildLogRule).toContain("overflow: hidden");
    expect(output).toHaveClass("build-output");
    expect(cssRule(".build-output")).toContain("overflow: auto");
  });
});
