import type { ModelOption } from "@/types";

export type RecommendedModelFamily = "luna" | "sol" | "terra";

export type ModelEffortAlternative = {
  modelFamily: RecommendedModelFamily;
  effort: string;
};

const RECOMMENDED_EFFORTS: Record<
  RecommendedModelFamily,
  ReadonlySet<string>
> = {
  luna: new Set(["low", "medium", "high", "xhigh", "max"]),
  sol: new Set(["medium", "xhigh"]),
  terra: new Set(["max"]),
};

const RECOMMENDED_ALTERNATIVES: Record<
  RecommendedModelFamily,
  Readonly<Record<string, ModelEffortAlternative>>
> = {
  luna: {
    none: { modelFamily: "luna", effort: "low" },
    ultra: { modelFamily: "luna", effort: "max" },
  },
  sol: {
    none: { modelFamily: "luna", effort: "low" },
    low: { modelFamily: "luna", effort: "medium" },
    high: { modelFamily: "terra", effort: "max" },
    max: { modelFamily: "sol", effort: "xhigh" },
    ultra: { modelFamily: "sol", effort: "xhigh" },
  },
  terra: {
    none: { modelFamily: "luna", effort: "low" },
    low: { modelFamily: "luna", effort: "medium" },
    medium: { modelFamily: "luna", effort: "high" },
    high: { modelFamily: "luna", effort: "xhigh" },
    xhigh: { modelFamily: "luna", effort: "max" },
    ultra: { modelFamily: "terra", effort: "max" },
  },
};

export function getRecommendedModelFamily(
  model: ModelOption,
): RecommendedModelFamily | null {
  const identity = [model.id, model.model, model.displayName]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

  if (!/\bgpt 5 6\b/.test(identity)) {
    return null;
  }

  if (/\bluna\b/.test(identity)) return "luna";
  if (/\bsol\b/.test(identity)) return "sol";
  if (/\bterra\b/.test(identity)) return "terra";
  return null;
}

export function isRecommendedModelEffort(
  model: ModelOption,
  effort: string,
): boolean {
  const family = getRecommendedModelFamily(model);
  if (!family) {
    return false;
  }

  return RECOMMENDED_EFFORTS[family].has(effort.trim().toLowerCase());
}

export function getRecommendedModelEffortAlternative(
  model: ModelOption,
  effort: string,
): ModelEffortAlternative | null {
  const family = getRecommendedModelFamily(model);
  if (!family) {
    return null;
  }

  const normalizedEffort = effort.trim().toLowerCase();
  if (RECOMMENDED_EFFORTS[family].has(normalizedEffort)) {
    return null;
  }

  return RECOMMENDED_ALTERNATIVES[family][normalizedEffort] ?? null;
}
