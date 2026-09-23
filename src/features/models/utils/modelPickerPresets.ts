import type { ModelOption } from "@/types";

import {
  getRecommendedModelFamily,
  type RecommendedModelFamily,
} from "./modelRecommendations";

export type ModelPickerPreset = {
  id: string;
  family: RecommendedModelFamily | "gpt-6-luna" | "gpt-6-sol";
  effort: string;
  label: string;
  score: number | null;
  recommended: boolean;
};

const preset = (
  family: ModelPickerPreset["family"],
  effort: string,
  score: number | null,
  recommended: boolean,
): ModelPickerPreset => ({
  id: `${family}:${effort}`,
  family,
  effort,
  label: `GPT-${family.startsWith("gpt-6-") || family === "astra" ? "6" : "5.6"} ${
    (family.startsWith("gpt-6-") ? family.slice(6) : family).replace(/^./, (letter) => letter.toUpperCase())
  } · ${
    effort === "xhigh"
      ? "Extra High"
      : effort.charAt(0).toUpperCase() + effort.slice(1)
  }`,
  score,
  recommended,
});

export const MODEL_PICKER_PRESET_CATALOG: readonly ModelPickerPreset[] = [
  preset("luna", "none", 37.3, false),
  preset("terra", "none", 40.3, false),
  preset("luna", "low", 42.4, true),
  preset("terra", "low", 53.8, false),
  preset("sol", "none", 58.4, false),
  preset("luna", "medium", 58.7, true),
  preset("terra", "medium", 64.2, false),
  preset("luna", "high", 67.9, true),
  preset("sol", "low", 69.1, false),
  preset("luna", "xhigh", 70.8, true),
  preset("terra", "high", 71.8, false),
  preset("terra", "xhigh", 73.2, false),
  preset("luna", "max", 74.6, true),
  preset("sol", "medium", 74.6, true),
  preset("sol", "high", 77.1, false),
  preset("terra", "max", 77.4, true),
  preset("sol", "xhigh", 78.7, true),
  preset("sol", "max", 80, false),
  // GPT-6 models have no comparable scores in the recommendation source.
  ...["none", "low", "medium", "high", "xhigh", "max"].map((effort) =>
    preset("gpt-6-luna", effort, null, false),
  ),
  ...["none", "low", "medium", "high", "xhigh", "max"].map((effort) =>
    preset("gpt-6-sol", effort, null, false),
  ),
  // Astra has no comparable benchmark scores in the recommendation source.
  preset("astra", "low", null, false),
  preset("astra", "medium", null, false),
  preset("astra", "high", null, false),
  preset("astra", "xhigh", null, false),
  preset("astra", "max", null, false),
  preset("luna", "ultra", null, false),
  preset("terra", "ultra", null, false),
  preset("sol", "ultra", null, false),
  preset("gpt-6-luna", "ultra", null, false),
  preset("gpt-6-sol", "ultra", null, false),
  preset("astra", "ultra", null, false),
];

export const DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS = [
  "luna:low",
  "luna:medium",
  "luna:high",
  "luna:xhigh",
  "luna:max",
  "sol:medium",
  "terra:max",
  "sol:xhigh",
  "gpt-6-luna:medium",
  "gpt-6-sol:medium",
  "sol:ultra",
] as const;

const presetById = new Map(
  MODEL_PICKER_PRESET_CATALOG.map((entry) => [entry.id, entry]),
);

export function normalizeSimplifiedModelPresetIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS];
  }

  const selected = new Set(
    value.filter(
      (entry): entry is string =>
        typeof entry === "string" && presetById.has(entry),
    ),
  );
  const normalized = MODEL_PICKER_PRESET_CATALOG.filter((entry) =>
    selected.has(entry.id),
  ).map((entry) => entry.id);

  return normalized.length > 0
    ? normalized
    : [...DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS];
}

export function getModelPickerPreset(id: string): ModelPickerPreset | null {
  return presetById.get(id) ?? null;
}

export function findModelForPreset(
  models: ModelOption[],
  preset: ModelPickerPreset,
): ModelOption | null {
  return (
    models.find((model) =>
      preset.family.startsWith("gpt-6-")
        ? model.model.toLowerCase() === preset.family
        : getRecommendedModelFamily(model) === preset.family,
    ) ??
    null
  );
}
