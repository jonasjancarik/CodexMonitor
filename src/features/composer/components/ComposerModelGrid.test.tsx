// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposerModelGrid } from "./ComposerModelGrid";
import { parseModelListResponse } from "@/features/models/utils/modelListResponse";
import { modelSupportsFastServiceTier } from "@/features/models/utils/serviceTiers";

const models = parseModelListResponse({ data: [{
  id: "astra-provider-id",
  model: "gpt-6-astra",
  displayName: "GPT-6 Astra",
  supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"].map(
    reasoningEffort => ({ reasoningEffort, description: "" }),
  ),
  defaultReasoningEffort: "medium",
  additionalSpeedTiers: ["fast"],
}] });

const props = {
  disabled: false,
  models,
  selectedModelId: "astra-provider-id",
  selectedEffort: "medium",
  selectedModelEfforts: ["low", "medium", "high", "xhigh", "max"],
};

describe("Astra model picker", () => {
  it("selects Astra in the simplified picker and omits unsupported Ultra", () => {
    const onSelect = vi.fn();
    render(<ComposerModelGrid {...props} mode="simplified"
      simplifiedPresetIds={["astra:medium", "astra:high", "astra:ultra"]}
      onSelect={onSelect} />);
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("max")).toBe("1");
    expect(slider.getAttribute("aria-valuetext")).toBe("GPT-6 Astra · Medium");
    fireEvent.change(slider, { target: { value: "1" } });
    expect(onSelect).toHaveBeenCalledWith("astra-provider-id", "high", false);
  });

  it("shows Astra in the current-model grid with advertised efforts and Fast", () => {
    const onSelect = vi.fn();
    render(<ComposerModelGrid {...props} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: "GPT-6 Astra, Max reasoning" }));
    expect(onSelect).toHaveBeenCalledWith("astra-provider-id", "max");
    expect(screen.queryByRole("button", { name: /Older models/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /None reasoning/ })).toBeNull();
    expect(modelSupportsFastServiceTier(models[0])).toBe(true);
    expect(modelSupportsFastServiceTier({ ...models[0], serviceTiers: [] })).toBe(false);
  });
});
