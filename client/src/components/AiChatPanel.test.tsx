import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AiChatStreamEvent } from "../../../shared/contracts";
import type { ApiClient } from "../lib/apiClient";
import { AiChatPanel } from "./AiChatPanel";

function fakeApi(events: AiChatStreamEvent[]): ApiClient {
  return {
    chatAi: vi.fn(async function* () {
      for (const event of events) yield event;
    }),
  } as unknown as ApiClient;
}

const latexReply: AiChatStreamEvent[] = [
  { type: "delta", text: "好的，完整内容如下：\n" },
  {
    type: "delta",
    text: "```latex\n% resume\n\\documentclass{article}\n```\n",
  },
  { type: "done" },
];

describe("AiChatPanel", () => {
  it("requires the privacy notice before sending", async () => {
    render(
      <AiChatPanel
        fileContent="% x"
        filePath="a.tex"
        onApply={vi.fn()}
        onClose={vi.fn()}
        open
      />,
    );

    expect(screen.getByText(/发送即表示同意/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "优化" },
    });
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
  });

  it("disables sending until a file is open", async () => {
    render(
      <AiChatPanel
        fileContent=""
        filePath={null}
        onApply={vi.fn()}
        onClose={vi.fn()}
        open
      />,
    );

    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  });

  it("streams user and assistant messages into the list", async () => {
    render(
      <AiChatPanel
        api={fakeApi([{ type: "delta", text: "你好" }, { type: "done" }])}
        fileContent="% x"
        filePath="a.tex"
        onApply={vi.fn()}
        onClose={vi.fn()}
        open
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "优化一下" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("优化一下")).toBeInTheDocument();
    expect(await screen.findByText("你好")).toBeInTheDocument();
  });

  it("applies an extracted latex block to the editor", async () => {
    const onApply = vi.fn();
    render(
      <AiChatPanel
        api={fakeApi(latexReply)}
        fileContent="% x"
        filePath="a.tex"
        onApply={onApply}
        onClose={vi.fn()}
        open
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "改成 article" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const applyButton = await screen.findByRole("button", {
      name: "应用到编辑器",
    });
    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledWith("% resume\n\\documentclass{article}");
    expect(screen.getByText(/已应用到编辑器/)).toBeInTheDocument();
  });

  it("keeps state when closed", async () => {
    const { rerender } = render(
      <AiChatPanel
        api={fakeApi(latexReply)}
        fileContent="% x"
        filePath="a.tex"
        onApply={vi.fn()}
        onClose={vi.fn()}
        open
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "待发送" },
    });

    rerender(
      <AiChatPanel
        api={fakeApi(latexReply)}
        fileContent="% x"
        filePath="a.tex"
        onApply={vi.fn()}
        onClose={vi.fn()}
        open={false}
      />,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    rerender(
      <AiChatPanel
        api={fakeApi(latexReply)}
        fileContent="% x"
        filePath="a.tex"
        onApply={vi.fn()}
        onClose={vi.fn()}
        open
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("待发送");
  });
});
