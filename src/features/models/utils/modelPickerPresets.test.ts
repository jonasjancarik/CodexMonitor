import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS,
  getModelPickerPreset,
  findModelForPreset,
  normalizeSimplifiedModelPresetIds,
} from "./modelPickerPresets";

describe("normalizeSimplifiedModelPresetIds", () => {
  it("uses the recommendation-based defaults for missing or empty values", () => {
    expect(normalizeSimplifiedModelPresetIds(undefined)).toEqual(
      DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS,
    );
    expect(normalizeSimplifiedModelPresetIds([])).toEqual(
      DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS,
    );
  });

  it("removes unknown and duplicate presets and restores capability order", () => {
    expect(
      normalizeSimplifiedModelPresetIds([
        "sol:xhigh",
        "unknown:max",
        "luna:medium",
        "sol:xhigh",
      ]),
    ).toEqual(["luna:medium", "sol:xhigh"]);
  });

  it("keeps Ultra after scored configurations", () => {
    expect(
      normalizeSimplifiedModelPresetIds([
        "sol:ultra",
        "terra:max",
        "luna:low",
      ]),
    ).toEqual(["luna:low", "terra:max", "sol:ultra"]);
  });
});

it("recognizes Astra presets without inventing benchmark recommendations", () => {
  const preset = getModelPickerPreset("astra:high")!;
  expect(preset.label).toBe("GPT-6 Astra · High");
  expect(preset.score).toBeNull();
  expect(preset.recommended).toBe(false);
  expect(getModelPickerPreset("astra:none")).toBeNull();
  expect(normalizeSimplifiedModelPresetIds(["astra:ultra", "astra:high"])).toEqual(["astra:high", "astra:ultra"]);
  const astra = { id: "provider-astra", model: "gpt-6-astra", displayName: "Astra", description: "", supportedReasoningEfforts: [], defaultReasoningEffort: "medium", isDefault: false };
  expect(findModelForPreset([astra], preset)).toBe(astra);
});

it("matches GPT-6 Sol and Luna presets to their exact models", () => {
  const models = ["gpt-5.6-sol", "gpt-6-sol", "gpt-5.6-luna", "gpt-6-luna"].map((model) => ({
    id: `provider-${model}`,
    model,
    displayName: model,
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: "medium",
    isDefault: false,
  }));

  for (const family of ["gpt-6-sol", "gpt-6-luna"] as const) {
    const option = getModelPickerPreset(`${family}:medium`)!;
    expect(option.label).toBe(`GPT-6 ${family === "gpt-6-sol" ? "Sol" : "Luna"} · Medium`);
    expect(option.score).toBeNull();
    expect(option.recommended).toBe(false);
    expect(findModelForPreset(models, option)?.model).toBe(family);
    expect(DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS).toContain(option.id);
  }
  expect(findModelForPreset(models, getModelPickerPreset("sol:medium")!)?.model).toBe("gpt-5.6-sol");
});
