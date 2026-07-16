/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelOption } from "@/types";
import { WorkspaceHomeRunControls } from "./WorkspaceHomeRunControls";

function modelOption(
  model: string,
  displayName: string,
  efforts: string[],
): ModelOption {
  return {
    id: model,
    model,
    displayName,
    description: "",
    supportedReasoningEfforts: efforts.map((reasoningEffort) => ({
      reasoningEffort,
      description: "",
    })),
    defaultReasoningEffort: efforts[0] ?? null,
    isDefault: false,
  };
}

const models = [
  modelOption("gpt-5.6-terra", "GPT-5.6 Terra", ["low", "high"]),
  modelOption("gpt-5.5", "GPT-5.5", ["low", "xhigh"]),
];

function renderControls(runMode: "local" | "worktree") {
  const onSelectModel = vi.fn();
  const onSelectEffort = vi.fn();
  render(
    <WorkspaceHomeRunControls
      workspaceKind="main"
      runMode={runMode}
      onRunModeChange={() => {}}
      models={models}
      selectedModelId="gpt-5.6-terra"
      onSelectModel={onSelectModel}
      modelSelections={{ "gpt-5.6-terra": 1 }}
      onToggleModel={() => {}}
      onModelCountChange={() => {}}
      collaborationModes={[]}
      selectedCollaborationModeId={null}
      onSelectCollaborationMode={() => {}}
      reasoningOptions={["low", "high"]}
      selectedEffort="high"
      onSelectEffort={onSelectEffort}
      reasoningSupported={true}
      isSubmitting={false}
    />,
  );
  return { onSelectEffort, onSelectModel };
}

describe("WorkspaceHomeRunControls", () => {
  afterEach(cleanup);

  it("uses the combined model and reasoning grid for local runs", () => {
    const { onSelectEffort, onSelectModel } = renderControls("local");

    expect(screen.queryByRole("combobox", { name: "Thinking mode" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Model settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Older models/ }));
    fireEvent.click(
      screen.getByRole("radio", { name: "GPT-5.5, Extra High reasoning" }),
    );

    expect(onSelectModel).toHaveBeenCalledWith("gpt-5.5");
    expect(onSelectEffort).toHaveBeenCalledWith("xhigh");
  });

  it("keeps the multi-model controls for worktree runs", () => {
    renderControls("worktree");

    expect(screen.getByRole("button", { name: "Select models" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Thinking mode" })).toBeTruthy();
  });
});
