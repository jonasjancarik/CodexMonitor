import type { ModelOption } from "@/types";

const RECOMMENDED_EFFORTS = {
  luna: new Set(["low", "medium", "high", "xhigh", "max"]),
  sol: new Set(["xhigh"]),
  terra: new Set(["max"]),
} as const;

type RecommendedModelFamily = keyof typeof RECOMMENDED_EFFORTS;

function modelFamily(model: ModelOption): RecommendedModelFamily | null {
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
  const family = modelFamily(model);
  if (!family) {
    return false;
  }

  return RECOMMENDED_EFFORTS[family].has(effort.trim().toLowerCase());
}
