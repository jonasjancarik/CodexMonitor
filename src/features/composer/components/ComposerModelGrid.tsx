import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  ChevronDown,
  Circle,
  ExternalLink,
  Minus,
  Sparkles,
} from "lucide-react";
import { useId, useState, type CSSProperties } from "react";

import {
  getRecommendedModelEffortAlternative,
  getRecommendedModelFamily,
  isRecommendedModelEffort,
  type ModelEffortAlternative,
} from "@/features/models/utils/modelRecommendations";
import { formatReasoningEffortLabel } from "@/features/models/utils/reasoningEffort";
import type { ModelOption } from "@/types";

const DEFAULT_EFFORT_ID = "__default__";
const EFFORT_ORDER = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];
const RECOMMENDATION_SOURCE_URL =
  "https://x.com/rasbt/status/2075961865683825141";

type ComposerModelGridProps = {
  disabled: boolean;
  models: ModelOption[];
  selectedModelId: string | null;
  selectedEffort: string | null;
  selectedModelEfforts: string[];
  onSelect: (modelId: string, effort: string | null) => void;
};

function modelLabel(model: ModelOption): string {
  return model.displayName || model.model || model.id;
}

function shortModelLabel(model: ModelOption): string {
  const withoutGptPrefix = modelLabel(model).trim().replace(/^gpt-/i, "");
  return withoutGptPrefix.replace(/-codex$/i, "");
}

function alternativeLabel(alternative: ModelEffortAlternative): string {
  const family =
    alternative.modelFamily.charAt(0).toUpperCase() +
    alternative.modelFamily.slice(1);
  return `${family} ${formatReasoningEffortLabel(alternative.effort)}`;
}

function isOlderThanGpt56(model: ModelOption): boolean {
  const version = model.model.match(/gpt[-_ ]?(\d+)(?:\.(\d+))?/i);
  if (!version) {
    return false;
  }

  const major = Number(version[1]);
  const minor = Number(version[2] ?? 0);
  return major < 5 || (major === 5 && minor < 6);
}

function modelEfforts(
  model: ModelOption,
  selectedModelId: string | null,
  selectedModelEfforts: string[],
): string[] {
  const advertised = model.supportedReasoningEfforts.flatMap((effort) => {
    const reasoningEffort = effort.reasoningEffort.trim();
    return reasoningEffort ? [reasoningEffort] : [];
  });
  if (advertised.length > 0) {
    return advertised;
  }

  if (model.id === selectedModelId && selectedModelEfforts.length > 0) {
    return selectedModelEfforts;
  }

  const defaultEffort = model.defaultReasoningEffort?.trim();
  return defaultEffort ? [defaultEffort] : [DEFAULT_EFFORT_ID];
}

function collectEfforts(
  models: ModelOption[],
  selectedModelId: string | null,
  selectedModelEfforts: string[],
): string[] {
  const efforts = new Set<string>();
  models.forEach((model) => {
    modelEfforts(model, selectedModelId, selectedModelEfforts).forEach((effort) =>
      efforts.add(effort),
    );
  });

  return Array.from(efforts).sort((left, right) => {
    if (left === DEFAULT_EFFORT_ID) return -1;
    if (right === DEFAULT_EFFORT_ID) return 1;
    const leftIndex = EFFORT_ORDER.indexOf(left);
    const rightIndex = EFFORT_ORDER.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

export function ComposerModelGrid({
  disabled,
  models,
  selectedModelId,
  selectedEffort,
  selectedModelEfforts,
  onSelect,
}: ComposerModelGridProps) {
  const radioGroupName = useId();
  const [showOlderModels, setShowOlderModels] = useState(false);
  const [hoveredAlternative, setHoveredAlternative] =
    useState<ModelEffortAlternative | null>(null);
  const [focusedAlternative, setFocusedAlternative] =
    useState<ModelEffortAlternative | null>(null);
  const currentModels = models.filter((model) => !isOlderThanGpt56(model));
  const olderModels = models.filter(isOlderThanGpt56);
  const efforts = collectEfforts(models, selectedModelId, selectedModelEfforts);
  const hasRecommendations = models.some((model) =>
    modelEfforts(model, selectedModelId, selectedModelEfforts).some((effort) =>
      isRecommendedModelEffort(model, effort),
    ),
  );
  const gridStyle = {
    "--composer-model-columns": efforts.length,
  } as CSSProperties;
  const previewedAlternative = hoveredAlternative ?? focusedAlternative;

  if (models.length === 0) {
    return <div className="composer-model-grid-empty">No models available</div>;
  }

  return (
    <div className="composer-model-grid-picker">
      <div
        className="composer-model-grid composer-model-grid--header"
        style={gridStyle}
      >
        <span className="composer-model-grid-heading composer-model-grid-model-heading">
          Model
        </span>
        {efforts.map((effort) => (
          <span key={effort} className="composer-model-grid-heading">
            {effort === DEFAULT_EFFORT_ID
              ? "Default"
              : formatReasoningEffortLabel(effort)}
          </span>
        ))}
      </div>

      {currentModels.length > 0 && (
        <ModelRows
          ariaLabel="Model and reasoning effort"
          disabled={disabled}
          efforts={efforts}
          gridStyle={gridStyle}
          models={currentModels}
          onSelect={onSelect}
          onFocusAlternative={setFocusedAlternative}
          onHoverAlternative={setHoveredAlternative}
          previewedAlternative={previewedAlternative}
          radioGroupName={radioGroupName}
          selectedEffort={selectedEffort}
          selectedModelEfforts={selectedModelEfforts}
          selectedModelId={selectedModelId}
        />
      )}

      {olderModels.length > 0 && (
        <div className="composer-model-grid-older">
          <button
            type="button"
            className="composer-model-grid-older-toggle"
            aria-expanded={showOlderModels}
            onClick={() => setShowOlderModels((visible) => !visible)}
          >
            <span>Older models</span>
            <span className="composer-model-grid-older-count">
              {olderModels.length}
            </span>
            <ChevronDown
              className={showOlderModels ? "is-open" : undefined}
              size={13}
              strokeWidth={1.8}
              aria-hidden
            />
          </button>
          {showOlderModels && (
            <ModelRows
              ariaLabel="Older models and reasoning effort"
              disabled={disabled}
              efforts={efforts}
              gridStyle={gridStyle}
              models={olderModels}
              onSelect={onSelect}
              onFocusAlternative={setFocusedAlternative}
              onHoverAlternative={setHoveredAlternative}
              previewedAlternative={previewedAlternative}
              radioGroupName={radioGroupName}
              selectedEffort={selectedEffort}
              selectedModelEfforts={selectedModelEfforts}
              selectedModelId={selectedModelId}
            />
          )}
        </div>
      )}

      {hasRecommendations && (
        <div
          className="composer-model-grid-recommendation-legend"
          title="Recommended for cost and performance based on independent coding benchmarks"
        >
          <Sparkles size={11} strokeWidth={1.8} aria-hidden />
          <span>Recommended value</span>
          <span className="composer-model-grid-recommendation-separator" aria-hidden>
            ·
          </span>
          <a
            className="composer-model-grid-recommendation-link"
            href={RECOMMENDATION_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              void openUrl(RECOMMENDATION_SOURCE_URL);
            }}
          >
            Why recommended?
            <ExternalLink size={9} strokeWidth={1.8} aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}

type ModelRowsProps = {
  ariaLabel: string;
  disabled: boolean;
  efforts: string[];
  gridStyle: CSSProperties;
  models: ModelOption[];
  onSelect: (modelId: string, effort: string | null) => void;
  onFocusAlternative: (alternative: ModelEffortAlternative | null) => void;
  onHoverAlternative: (alternative: ModelEffortAlternative | null) => void;
  previewedAlternative: ModelEffortAlternative | null;
  radioGroupName: string;
  selectedEffort: string | null;
  selectedModelEfforts: string[];
  selectedModelId: string | null;
};

function ModelRows({
  ariaLabel,
  disabled,
  efforts,
  gridStyle,
  models,
  onSelect,
  onFocusAlternative,
  onHoverAlternative,
  previewedAlternative,
  radioGroupName,
  selectedEffort,
  selectedModelEfforts,
  selectedModelId,
}: ModelRowsProps) {
  return (
    <div
      className="composer-model-grid composer-model-grid--rows"
      style={gridStyle}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {models.map((model, modelIndex) => {
        const supportedEfforts = new Set(
          modelEfforts(model, selectedModelId, selectedModelEfforts),
        );
        return (
          <ModelRow
            key={model.id}
            disabled={disabled}
            efforts={efforts}
            model={model}
            modelIndex={modelIndex}
            onSelect={onSelect}
            onFocusAlternative={onFocusAlternative}
            onHoverAlternative={onHoverAlternative}
            previewedAlternative={previewedAlternative}
            radioGroupName={radioGroupName}
            selectedEffort={selectedEffort}
            selectedModelId={selectedModelId}
            supportedEfforts={supportedEfforts}
          />
        );
      })}
    </div>
  );
}

type ModelRowProps = {
  disabled: boolean;
  efforts: string[];
  model: ModelOption;
  modelIndex: number;
  onSelect: (modelId: string, effort: string | null) => void;
  onFocusAlternative: (alternative: ModelEffortAlternative | null) => void;
  onHoverAlternative: (alternative: ModelEffortAlternative | null) => void;
  previewedAlternative: ModelEffortAlternative | null;
  radioGroupName: string;
  selectedEffort: string | null;
  selectedModelId: string | null;
  supportedEfforts: ReadonlySet<string>;
};

function ModelRow({
  disabled,
  efforts,
  model,
  modelIndex,
  onSelect,
  onFocusAlternative,
  onHoverAlternative,
  previewedAlternative,
  radioGroupName,
  selectedEffort,
  selectedModelId,
  supportedEfforts,
}: ModelRowProps) {
  const fullModelLabel = modelLabel(model);
  const family = getRecommendedModelFamily(model);
  return (
    <>
      <span
        className={`composer-model-grid-model${
          model.id === selectedModelId ? " is-active" : ""
        }`}
        title={fullModelLabel}
      >
        {shortModelLabel(model)}
      </span>
      {efforts.map((effort, effortIndex) => {
        const supported = supportedEfforts.has(effort);
        const selected =
          model.id === selectedModelId &&
          (effort === DEFAULT_EFFORT_ID
            ? selectedEffort === null
            : effort === selectedEffort);
        const recommended =
          supported && isRecommendedModelEffort(model, effort);
        const alternative = supported
          ? getRecommendedModelEffortAlternative(model, effort)
          : null;
        const isRecommendationTarget =
          supported &&
          family === previewedAlternative?.modelFamily &&
          effort === previewedAlternative.effort;
        const recommendedAlternativeLabel = alternative
          ? alternativeLabel(alternative)
          : null;
        const effortLabel =
          effort === DEFAULT_EFFORT_ID
            ? "Default"
            : formatReasoningEffortLabel(effort);
        const inputId = `${radioGroupName}-${modelIndex}-${effortIndex}-${model.id}`;

        return (
          <span key={effort} className="composer-model-grid-cell">
            <input
              id={inputId}
              className="composer-model-grid-input"
              type="radio"
              name={radioGroupName}
              value={`${model.id}:${effort}`}
              aria-label={`${fullModelLabel}, ${effortLabel} reasoning${
                recommended ? ", recommended value" : ""
              }${
                recommendedAlternativeLabel
                  ? `, recommended alternative: ${recommendedAlternativeLabel}`
                  : ""
              }`}
              checked={selected}
              disabled={disabled || !supported}
              onChange={() =>
                onSelect(
                  model.id,
                  effort === DEFAULT_EFFORT_ID ? null : effort,
                )
              }
              onBlur={() => onFocusAlternative(null)}
              onFocus={() => onFocusAlternative(alternative)}
            />
            <label
              className={`composer-model-grid-cell-label${
                selected ? " is-active" : ""
              }${recommended ? " is-recommended" : ""}${
                isRecommendationTarget ? " is-recommendation-target" : ""
              }${
                !supported ? " is-disabled" : ""
              }`}
              htmlFor={inputId}
              aria-hidden
              title={
                recommended
                  ? "Recommended value"
                  : recommendedAlternativeLabel
                    ? `Recommended instead: ${recommendedAlternativeLabel}`
                    : undefined
              }
              onMouseEnter={() => onHoverAlternative(alternative)}
              onMouseLeave={() => onHoverAlternative(null)}
            >
              {!supported ? (
                <Minus size={12} strokeWidth={1.8} />
              ) : selected ? (
                <Check size={14} strokeWidth={2} />
              ) : recommended ? (
                <Sparkles size={11} strokeWidth={1.9} />
              ) : (
                <Circle size={7} strokeWidth={2.2} fill="currentColor" />
              )}
            </label>
          </span>
        );
      })}
    </>
  );
}
