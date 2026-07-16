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
  it.each(["low", "medium", "high", "xhigh", "max"])(
    "recommends GPT-5.6 Luna at %s effort",
    (effort) => {
      expect(isRecommendedModelEffort(model("gpt-5.6-luna"), effort)).toBe(true);
    },
  );

  it("recommends only Extra High for GPT-5.6 Sol", () => {
    const sol = model("gpt-5.6-sol");

    expect(isRecommendedModelEffort(sol, "xhigh")).toBe(true);
    expect(isRecommendedModelEffort(sol, "medium")).toBe(false);
    expect(isRecommendedModelEffort(sol, "high")).toBe(false);
    expect(isRecommendedModelEffort(sol, "max")).toBe(false);
    expect(isRecommendedModelEffort(sol, "ultra")).toBe(false);
  });

  it("uses the corrected Max label for the Terra recommendation", () => {
    const terra = model("gpt-5.6-terra");

    expect(isRecommendedModelEffort(terra, "max")).toBe(true);
    expect(isRecommendedModelEffort(terra, "ultra")).toBe(false);
  });

  it("does not recommend unrelated or older models", () => {
    expect(isRecommendedModelEffort(model("gpt-5.5"), "high")).toBe(false);
    expect(isRecommendedModelEffort(model("gpt-5.6"), "high")).toBe(false);
    expect(isRecommendedModelEffort(model("claude-sol"), "high")).toBe(false);
  });
});
