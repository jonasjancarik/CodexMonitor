import { describe, expect, it } from "vitest";

import type { ModelOption } from "@/types";
import {
  getRecommendedModelEffortAlternative,
  isRecommendedModelEffort,
} from "./modelRecommendations";

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

  it("recommends Medium and Extra High for GPT-5.6 Sol", () => {
    const sol = model("gpt-5.6-sol");

    expect(isRecommendedModelEffort(sol, "medium")).toBe(true);
    expect(isRecommendedModelEffort(sol, "high")).toBe(false);
    expect(isRecommendedModelEffort(sol, "xhigh")).toBe(true);
    expect(isRecommendedModelEffort(sol, "max")).toBe(false);
    expect(isRecommendedModelEffort(sol, "ultra")).toBe(false);
  });

  it("recommends only Max for GPT-5.6 Terra", () => {
    const terra = model("gpt-5.6-terra");

    expect(isRecommendedModelEffort(terra, "low")).toBe(false);
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

describe("getRecommendedModelEffortAlternative", () => {
  it.each([
    ["gpt-5.6-sol", "none", "luna", "medium"],
    ["gpt-5.6-sol", "low", "luna", "xhigh"],
    ["gpt-5.6-sol", "high", "terra", "max"],
    ["gpt-5.6-sol", "max", "sol", "xhigh"],
    ["gpt-5.6-terra", "none", "luna", "low"],
    ["gpt-5.6-terra", "low", "luna", "medium"],
    ["gpt-5.6-terra", "medium", "luna", "high"],
    ["gpt-5.6-terra", "high", "luna", "max"],
    ["gpt-5.6-terra", "xhigh", "luna", "max"],
    ["gpt-5.6-terra", "ultra", "terra", "max"],
  ])(
    "replaces %s at %s with %s at %s",
    (modelId, effort, modelFamily, alternativeEffort) => {
      expect(
        getRecommendedModelEffortAlternative(model(modelId), effort),
      ).toEqual({ modelFamily, effort: alternativeEffort });
    },
  );

  it("does not replace recommended or unrelated values", () => {
    expect(
      getRecommendedModelEffortAlternative(model("gpt-5.6-sol"), "medium"),
    ).toBeNull();
    expect(
      getRecommendedModelEffortAlternative(model("gpt-5.5"), "high"),
    ).toBeNull();
  });
});
