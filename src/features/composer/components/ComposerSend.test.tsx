/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobilePlatform } from "../../../utils/platformPaths";
import { Composer } from "./Composer";
import type {
  AppOption,
  AppMention,
  ComposerSendIntent,
  FollowUpMessageBehavior,
  ModelOption,
  ServiceTier,
} from "../../../types";

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("../../../utils/platformPaths", async () => {
  const actual = await vi.importActual<typeof import("../../../utils/platformPaths")>(
    "../../../utils/platformPaths",
  );
  return {
    ...actual,
    isMobilePlatform: vi.fn(() => false),
  };
});

function modelOption(
  model: string,
  displayName = model,
  efforts: string[] = [],
): ModelOption {
  return {
    id: model,
    model,
    displayName,
    description: "",
    supportedReasoningEfforts: efforts.map((reasoningEffort) => ({
      reasoningEffort,
      description: "",
    })),
    defaultReasoningEffort: efforts[0] ?? null,
    isDefault: false,
  };
}

type HarnessProps = {
  onSend: (
    text: string,
    images: string[],
    appMentions?: AppMention[],
    submitIntent?: ComposerSendIntent,
  ) => void;
  apps?: AppOption[];
  isProcessing?: boolean;
  followUpMessageBehavior?: FollowUpMessageBehavior;
  steerAvailable?: boolean;
  models?: ModelOption[];
  selectedModelId?: string | null;
  onSelectModel?: (id: string) => void;
  reasoningOptions?: string[];
  selectedEffort?: string | null;
  onSelectEffort?: (effort: string | null) => void;
  reasoningSupported?: boolean;
  selectedServiceTier?: ServiceTier | null;
  onSelectServiceTier?: (tier: ServiceTier | null) => void;
};

function ComposerHarness({
  onSend,
  apps = [],
  isProcessing = false,
  followUpMessageBehavior = "queue",
  steerAvailable = false,
  models = [],
  selectedModelId = null,
  onSelectModel = () => {},
  reasoningOptions = [],
  selectedEffort = null,
  onSelectEffort = () => {},
  reasoningSupported = false,
  selectedServiceTier = null,
  onSelectServiceTier = () => {},
}: HarnessProps) {
  const [draftText, setDraftText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <Composer
      onSend={onSend}
      onStop={() => {}}
      canStop={false}
      isProcessing={isProcessing}
      appsEnabled={true}
      steerAvailable={steerAvailable}
      followUpMessageBehavior={followUpMessageBehavior}
      composerFollowUpHintEnabled={true}
      collaborationModes={[]}
      selectedCollaborationModeId={null}
      onSelectCollaborationMode={() => {}}
      models={models}
      selectedModelId={selectedModelId}
      onSelectModel={onSelectModel}
      reasoningOptions={reasoningOptions}
      selectedEffort={selectedEffort}
      onSelectEffort={onSelectEffort}
      selectedServiceTier={selectedServiceTier}
      onSelectServiceTier={onSelectServiceTier}
      reasoningSupported={reasoningSupported}
      accessMode="current"
      onSelectAccessMode={() => {}}
      skills={[]}
      apps={apps}
      prompts={[]}
      files={[]}
      draftText={draftText}
      onDraftChange={setDraftText}
      textareaRef={textareaRef}
      dictationEnabled={false}
    />
  );
}

describe("Composer send triggers", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(isMobilePlatform).mockReturnValue(false);
    vi.restoreAllMocks();
  });

  it("sends once on Enter", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello world", [], undefined, "default");
  });

  it("sends once on send-button click", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "from button" } });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("from button", [], undefined, "default");
  });

  it("turns Fast off from the compact speed switch", () => {
    const onSend = vi.fn();
    const onSelectServiceTier = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        models={[modelOption("gpt-5.5", "GPT-5.5")]}
        selectedModelId="gpt-5.5"
        reasoningOptions={["low", "medium", "high", "xhigh"]}
        selectedEffort="medium"
        reasoningSupported={true}
        selectedServiceTier="fast"
        onSelectServiceTier={onSelectServiceTier}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Model settings" }));

    expect(screen.getByText("Speed")).toBeTruthy();
    expect(screen.getByText("1.5x speed, increased usage")).toBeTruthy();
    expect(screen.queryByText("Standard")).toBeNull();

    const fastSwitch = screen.getByRole("switch", { name: /Fast/i });
    expect(fastSwitch.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(fastSwitch);

    expect(onSelectServiceTier).toHaveBeenCalledWith(null);
  });

  it("offers Fast mode for GPT-5.5 even when model metadata omits service tiers", () => {
    const onSend = vi.fn();
    const onSelectServiceTier = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        models={[modelOption("gpt-5.5", "GPT-5.5")]}
        selectedModelId="gpt-5.5"
        reasoningOptions={["medium"]}
        selectedEffort="medium"
        reasoningSupported={true}
        onSelectServiceTier={onSelectServiceTier}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Model settings" }));
    fireEvent.click(screen.getByRole("switch", { name: /Fast/i }));

    expect(onSelectServiceTier).toHaveBeenCalledWith("fast");
  });

  it("marks benchmark-informed model and effort recommendations", () => {
    render(
      <ComposerHarness
        onSend={() => {}}
        models={[
          modelOption("gpt-5.6-luna", "GPT-5.6 Luna", ["low", "high"]),
          modelOption("gpt-5.6-sol", "GPT-5.6 Sol", ["high", "xhigh"]),
          modelOption("gpt-5.6-terra", "GPT-5.6 Terra", ["low", "max"]),
        ]}
        selectedModelId="gpt-5.6-sol"
        reasoningOptions={["high", "xhigh"]}
        selectedEffort="high"
        reasoningSupported={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Model settings" }));

    expect(screen.getByText("Recommended value")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /Why recommended?/i }));
    expect(openUrl).toHaveBeenCalledWith(
      "https://x.com/rasbt/status/2075961865683825141",
    );
    expect(
      screen.getByRole("radio", {
        name: "GPT-5.6 Luna, High reasoning, recommended value",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", {
        name: "GPT-5.6 Sol, High reasoning, recommended value",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", {
        name: "GPT-5.6 Terra, Low reasoning, recommended value",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", {
        name: "GPT-5.6 Terra, Max reasoning, recommended value",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("radio", {
        name: /GPT-5.6 Luna, Low reasoning, recommended value/,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("radio", {
        name: /GPT-5.6 Sol, Extra High reasoning, recommended value/,
      }),
    ).toBeNull();
  });

  it("selects model and reasoning from a grid and keeps older models collapsed", () => {
    const onSelectModel = vi.fn();
    const onSelectEffort = vi.fn();
    render(
      <ComposerHarness
        onSend={() => {}}
        models={[
          modelOption("gpt-5.6-terra", "GPT-5.6 Terra", ["low", "high"]),
          modelOption("gpt-5.5-codex", "GPT-5.5 Codex", ["low", "xhigh"]),
        ]}
        selectedModelId="gpt-5.6-terra"
        onSelectModel={onSelectModel}
        reasoningOptions={["low", "high"]}
        selectedEffort="high"
        onSelectEffort={onSelectEffort}
        reasoningSupported={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Model settings" }));

    expect(
      screen.getByRole("radiogroup", { name: "Model and reasoning effort" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("radio", {
        name: "GPT-5.5 Codex, Low reasoning",
      }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("radio", {
          name: "GPT-5.6 Terra, Extra High reasoning",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Older models/ }));
    fireEvent.click(
      screen.getByRole("radio", {
        name: "GPT-5.5 Codex, Extra High reasoning",
      }),
    );

    expect(onSelectModel).toHaveBeenCalledWith("gpt-5.5-codex");
    expect(onSelectEffort).toHaveBeenCalledWith("xhigh");
    expect(
      screen.queryByRole("dialog", {
        name: "Choose model, reasoning, and speed",
      }),
    ).toBeNull();
  });

  it("blurs the textarea after Enter send on mobile", () => {
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    const onSend = vi.fn();
    const blurSpy = vi.spyOn(HTMLTextAreaElement.prototype, "blur");
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "dismiss keyboard" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      "dismiss keyboard",
      [],
      undefined,
      "default",
    );
    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it("sends explicit app mentions when an app autocomplete item is selected", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        apps={[
          {
            id: "connector_calendar",
            name: "Calendar App",
            description: "Calendar integration",
            isAccessible: true,
          },
        ]}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "$cal" } });
    fireEvent.keyDown(textarea, { key: "Tab" });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      "$calendar-app",
      [],
      [{ name: "Calendar App", path: "app://connector_calendar" }],
      "default",
    );
  });

  it("uses queue by default while processing when follow-up behavior is queue", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={true}
        followUpMessageBehavior="queue"
        steerAvailable={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "queue this" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("queue this", [], undefined, "queue");
  });

  it("uses opposite follow-up behavior on Shift+Ctrl+Enter while processing", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={true}
        followUpMessageBehavior="queue"
        steerAvailable={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "steer this" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true, ctrlKey: true });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("steer this", [], undefined, "steer");
  });

  it("falls back to queue when steer is selected but unavailable", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={true}
        followUpMessageBehavior="steer"
        steerAvailable={false}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "queue fallback" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(
      screen.getByText(
        "Default: Queue (Steer unavailable). Both Enter and Shift+Ctrl+Enter will queue this message.",
      ),
    ).toBeTruthy();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("queue fallback", [], undefined, "queue");
  });

  it("treats Shift+Ctrl+Enter like normal send when not processing", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={false}
        followUpMessageBehavior="queue"
        steerAvailable={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "normal shortcut send" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true, ctrlKey: true });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      "normal shortcut send",
      [],
      undefined,
      "default",
    );
  });

  it("does not queue on Tab while processing", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={true}
        followUpMessageBehavior="queue"
        steerAvailable={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "tab no send" } });
    fireEvent.keyDown(textarea, { key: "Tab" });

    expect(onSend).not.toHaveBeenCalled();
  });
});
