import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS,
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
