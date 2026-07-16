import { describe, expect, it } from "vitest";

import type { ModelOption } from "@/types";
import { isRecommendedModelEffort } from "./modelRecommendations";

function model(modelId: string, displayName = modelId): ModelOption {
  return {
    id: modelId,
    model: modelId,
    displayName,
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
  };
}

describe("isRecommendedModelEffort", () => {
  it.each(["medium", "high", "xhigh", "max"])(
    "recommends GPT-5.6 Luna at %s effort",
    (effort) => {
      expect(isRecommendedModelEffort(model("gpt-5.6-luna"), effort)).toBe(true);
    },
  );

  it("does not recommend GPT-5.6 Luna at Low effort", () => {
    expect(isRecommendedModelEffort(model("gpt-5.6-luna"), "low")).toBe(false);
  });

  it("recommends only High for GPT-5.6 Sol", () => {
    const sol = model("gpt-5.6-sol");

    expect(isRecommendedModelEffort(sol, "high")).toBe(true);
    expect(isRecommendedModelEffort(sol, "medium")).toBe(false);
    expect(isRecommendedModelEffort(sol, "xhigh")).toBe(false);
    expect(isRecommendedModelEffort(sol, "max")).toBe(false);
    expect(isRecommendedModelEffort(sol, "ultra")).toBe(false);
  });

  it("recommends Low and corrected-label Max for GPT-5.6 Terra", () => {
    const terra = model("gpt-5.6-terra");

    expect(isRecommendedModelEffort(terra, "low")).toBe(true);
    expect(isRecommendedModelEffort(terra, "medium")).toBe(false);
    expect(isRecommendedModelEffort(terra, "high")).toBe(false);
    expect(isRecommendedModelEffort(terra, "xhigh")).toBe(false);
    expect(isRecommendedModelEffort(terra, "max")).toBe(true);
    expect(isRecommendedModelEffort(terra, "ultra")).toBe(false);
  });

  it("does not recommend unrelated or older models", () => {
    expect(isRecommendedModelEffort(model("gpt-5.5"), "high")).toBe(false);
    expect(isRecommendedModelEffort(model("gpt-5.6"), "high")).toBe(false);
    expect(isRecommendedModelEffort(model("claude-sol"), "high")).toBe(false);
  });
});
