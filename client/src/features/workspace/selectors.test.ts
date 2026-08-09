import { describe, expect, it } from "vitest";

import { initialWorkspaceState } from "./reducer";
import {
  selectCanCompile,
  selectCanSave,
  selectCurrentDraft,
  selectIsCurrentDraftDirty,
  selectSelectedResume,
} from "./selectors";

describe("workspace selectors", () => {
  it("derives current draft, selected resume, and enabled actions from workspace state", () => {
    const state = {
      ...initialWorkspaceState,
      projectState: "ready" as const,
      project: {
        resumes: [
          {
            id: "backend",
            name: "Backend",
            dir: "backend",
            entryPath: "backend/main.tex",
            pdfPath: "backend/main.pdf",
          },
        ],
        texFiles: [],
      },
      selectedResumeId: "backend",
      selectedTexPath: "backend/main.tex",
      drafts: {
        "backend/main.tex": {
          path: "backend/main.tex",
          content: "changed",
          savedContent: "saved",
          saveState: "idle" as const,
        },
      },
    };

    expect(selectCurrentDraft(state)?.path).toBe("backend/main.tex");
    expect(selectSelectedResume(state)?.id).toBe("backend");
    expect(selectIsCurrentDraftDirty(state)).toBe(true);
    expect(selectCanSave(state)).toBe(true);
    expect(selectCanCompile(state)).toBe(true);
  });
});
