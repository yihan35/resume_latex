import { useCallback, useRef, type PointerEvent, type RefObject } from "react";

interface PaneResizerProps {
  filePaneRef: RefObject<HTMLElement | null>;
  paneSplit: number;
  workspaceRef: RefObject<HTMLElement | null>;
  onPaneSplitChange: (split: number) => void;
}

function clampPaneSplit(value: number) {
  return Math.min(0.75, Math.max(0.25, value));
}

export function PaneResizer({
  filePaneRef,
  paneSplit,
  workspaceRef,
  onPaneSplitChange,
}: PaneResizerProps) {
  const resizerRef = useRef<HTMLDivElement | null>(null);
  const updateFromPointer = useCallback(
    (clientX: number) => {
      const workspace = workspaceRef.current;
      const filePane = filePaneRef.current;
      if (!Number.isFinite(clientX) || workspace === null || filePane === null)
        return;
      const workspaceRect = workspace.getBoundingClientRect();
      const resizerWidth =
        resizerRef.current?.getBoundingClientRect().width ?? 8;
      const availableWidth =
        workspaceRect.width -
        filePane.getBoundingClientRect().width -
        resizerWidth;
      if (availableWidth <= 0) return;
      onPaneSplitChange(
        Number(
          clampPaneSplit(
            (clientX -
              workspaceRect.left -
              filePane.getBoundingClientRect().width) /
              availableWidth,
          ).toFixed(3),
        ),
      );
    },
    [filePaneRef, onPaneSplitChange, workspaceRef],
  );
  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    updateFromPointer(event.clientX);
    const handlePointerMove = (moveEvent: globalThis.PointerEvent) =>
      updateFromPointer(moveEvent.clientX);
    const handlePointerUp = () =>
      window.removeEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }
  return (
    <div
      aria-label="Resize editor and PDF panes"
      aria-orientation="vertical"
      aria-valuemax={75}
      aria-valuemin={25}
      aria-valuenow={Math.round(paneSplit * 100)}
      className="pane-resizer"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onPaneSplitChange(
            Number(
              clampPaneSplit(
                paneSplit + (event.key === "ArrowRight" ? 0.05 : -0.05),
              ).toFixed(3),
            ),
          );
        }
      }}
      onPointerDown={handlePointerDown}
      ref={resizerRef}
      role="separator"
      tabIndex={0}
    />
  );
}
