import type { AppSettings } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import {
  DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS,
  MODEL_PICKER_PRESET_CATALOG,
  normalizeSimplifiedModelPresetIds,
} from "@/features/models/utils/modelPickerPresets";

type ComposerPreset = AppSettings["composerEditorPreset"];

type SettingsComposerSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  followUpShortcutLabel: string;
  composerPresetLabels: Record<ComposerPreset, string>;
  onComposerPresetChange: (preset: ComposerPreset) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsComposerSection({
  appSettings,
  optionKeyLabel,
  followUpShortcutLabel,
  composerPresetLabels,
  onComposerPresetChange,
  onUpdateAppSettings,
}: SettingsComposerSectionProps) {
  const steerUnavailable = !appSettings.steerEnabled;
  const selectedSimplifiedPresets = new Set(
    appSettings.composerSimplifiedModelPresets,
  );
  const updateSimplifiedPreset = (id: string, included: boolean) => {
    const next = new Set(selectedSimplifiedPresets);
    if (included) next.add(id);
    else if (next.size > 1) next.delete(id);
    void onUpdateAppSettings({
      ...appSettings,
      composerSimplifiedModelPresets: normalizeSimplifiedModelPresetIds(
        Array.from(next),
      ),
    });
  };

  return (
    <SettingsSection
      title="Composer"
      subtitle="Control helpers and formatting behavior inside the message editor."
    >
      <div className="settings-subsection-title">Model picker</div>
      <div className="settings-subsection-subtitle">
        Choose a focused slider or the complete model grid.
      </div>
      <div className="settings-field">
        <div className="settings-field-label">Default view</div>
        <div
          className={`settings-segmented${
            appSettings.composerModelPickerMode === "all"
              ? " is-second-active"
              : ""
          }`}
          aria-label="Default model picker view"
        >
          {(["simplified", "all"] as const).map((mode) => (
            <label
              key={mode}
              className={`settings-segmented-option${
                appSettings.composerModelPickerMode === mode ? " is-active" : ""
              }`}
            >
              <input
                className="settings-segmented-input"
                type="radio"
                name="model-picker-mode"
                value={mode}
                checked={appSettings.composerModelPickerMode === mode}
                onChange={() =>
                  void onUpdateAppSettings({
                    ...appSettings,
                    composerModelPickerMode: mode,
                  })
                }
              />
              <span className="settings-segmented-option-label">
                {mode === "simplified" ? "Simplified" : "All models"}
              </span>
            </label>
          ))}
        </div>
      </div>
      <SettingsToggleRow
        title="Show recommended options"
        subtitle="Highlights strong value choices in the complete model grid."
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerModelRecommendationHighlightsEnabled}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerModelRecommendationHighlightsEnabled:
                !appSettings.composerModelRecommendationHighlightsEnabled,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-field settings-model-picker-options">
        <div className="settings-model-picker-options-header">
          <div>
            <div className="settings-field-label">Simplified options</div>
            <div className="settings-help">
              Select the model and effort combinations shown on the slider. They
              stay ordered by measured capability, with Ultra last.
            </div>
          </div>
          <button
            type="button"
            className="ghost settings-model-picker-reset"
            onClick={() =>
              void onUpdateAppSettings({
                ...appSettings,
                composerSimplifiedModelPresets: [
                  ...DEFAULT_SIMPLIFIED_MODEL_PRESET_IDS,
                ],
              })
            }
          >
            Reset to recommended
          </button>
        </div>
        <div className="settings-model-picker-preset-list">
          {MODEL_PICKER_PRESET_CATALOG.map((preset) => (
            <label key={preset.id} className="settings-model-picker-preset">
              <input
                type="checkbox"
                checked={selectedSimplifiedPresets.has(preset.id)}
                onChange={(event) =>
                  updateSimplifiedPreset(preset.id, event.target.checked)
                }
              />
              <span className="settings-model-picker-preset-label">
                {preset.label}
              </span>
              {preset.recommended && (
                <span className="settings-model-picker-preset-badge">
                  Recommended
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Messages</div>
      <div className="settings-field">
        <div className="settings-field-label">Follow-up behavior</div>
        <div className={`settings-segmented${appSettings.followUpMessageBehavior === "steer" ? " is-second-active" : ""}`} aria-label="Follow-up behavior">
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "queue" ? " is-active" : ""
            }`}
          >
            <input
              className="settings-segmented-input"
              type="radio"
              name="follow-up-behavior"
              value="queue"
              checked={appSettings.followUpMessageBehavior === "queue"}
              onChange={() =>
                void onUpdateAppSettings({
                  ...appSettings,
                  followUpMessageBehavior: "queue",
                })
              }
            />
            <span className="settings-segmented-option-label">Queue</span>
          </label>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "steer" ? " is-active" : ""
            }${steerUnavailable ? " is-disabled" : ""}`}
            title={steerUnavailable ? "Steer is unavailable in the current Codex config." : ""}
          >
            <input
              className="settings-segmented-input"
              type="radio"
              name="follow-up-behavior"
              value="steer"
              checked={appSettings.followUpMessageBehavior === "steer"}
              disabled={steerUnavailable}
              onChange={() => {
                if (steerUnavailable) {
                  return;
                }
                void onUpdateAppSettings({
                  ...appSettings,
                  followUpMessageBehavior: "steer",
                });
              }}
            />
            <span className="settings-segmented-option-label">Steer</span>
          </label>
        </div>
        <div className="settings-help">
          Choose the default while a run is active. Press {followUpShortcutLabel} to send the
          opposite behavior for one message.
        </div>
        <SettingsToggleRow
          title="Show follow-up hint while processing"
          subtitle="Displays queue/steer shortcut guidance above the composer."
        >
          <SettingsToggleSwitch
            pressed={appSettings.composerFollowUpHintEnabled}
            onClick={() =>
              void onUpdateAppSettings({
                ...appSettings,
                composerFollowUpHintEnabled: !appSettings.composerFollowUpHintEnabled,
              })
            }
          />
        </SettingsToggleRow>
        {steerUnavailable && (
          <div className="settings-help">
            Steer is unavailable in the current Codex config. Follow-ups will queue.
          </div>
        )}
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Presets</div>
      <div className="settings-subsection-subtitle">
        Choose a starting point and fine-tune the toggles below.
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          Preset
        </label>
        <select
          id="composer-preset"
          className="settings-select"
          value={appSettings.composerEditorPreset}
          onChange={(event) =>
            onComposerPresetChange(event.target.value as ComposerPreset)
          }
        >
          {Object.entries(composerPresetLabels).map(([preset, label]) => (
            <option key={preset} value={preset}>
              {label}
            </option>
          ))}
        </select>
        <div className="settings-help">
          Presets update the toggles below. Customize any setting after selecting.
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Code fences</div>
      <SettingsToggleRow
        title="Expand fences on Space"
        subtitle="Typing ``` then Space inserts a fenced block."
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnSpace}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnSpace: !appSettings.composerFenceExpandOnSpace,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="Expand fences on Enter"
        subtitle="Use Enter to expand ``` lines when enabled."
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnEnter}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnEnter: !appSettings.composerFenceExpandOnEnter,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="Support language tags"
        subtitle="Allows ```lang + Space to include a language."
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceLanguageTags}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceLanguageTags: !appSettings.composerFenceLanguageTags,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="Wrap selection in fences"
        subtitle="Wraps selected text when creating a fence."
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceWrapSelection}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceWrapSelection: !appSettings.composerFenceWrapSelection,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="Copy blocks without fences"
        subtitle={
          <>
            When enabled, Copy is plain text. Hold {optionKeyLabel} to include ``` fences.
          </>
        }
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerCodeBlockCopyUseModifier}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerCodeBlockCopyUseModifier:
                !appSettings.composerCodeBlockCopyUseModifier,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Pasting</div>
      <SettingsToggleRow
        title="Auto-wrap multi-line paste"
        subtitle="Wraps multi-line paste inside a fenced block."
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteMultiline}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteMultiline:
                !appSettings.composerFenceAutoWrapPasteMultiline,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="Auto-wrap code-like single lines"
        subtitle="Wraps long single-line code snippets on paste."
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteCodeLike}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteCodeLike:
                !appSettings.composerFenceAutoWrapPasteCodeLike,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">Lists</div>
      <SettingsToggleRow
        title="Continue lists on Shift+Enter"
        subtitle="Continues numbered and bulleted lists when the line has content."
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerListContinuation}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerListContinuation: !appSettings.composerListContinuation,
            })
          }
        />
      </SettingsToggleRow>
    </SettingsSection>
  );
}
