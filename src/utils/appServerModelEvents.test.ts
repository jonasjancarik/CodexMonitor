import { describe, expect, it } from "vitest";
import { buildModelStatusNotice } from "./appServerModelEvents";

const base = { threadId: "thread-1", turnId: "turn-1" };

describe("model status notifications", () => {
  it("explains reroutes without changing a model selection", () => {
    expect(buildModelStatusNotice("model/rerouted", {
      ...base, fromModel: "gpt-6-astra", toModel: "other-model", reason: "highRiskCyberActivity",
    })).toMatchObject({ threadId: "thread-1", item: {
      id: "model-status:turn-1:model/rerouted", kind: "tool", status: "completed",
      title: "Model changed for this response",
      detail: "Codex switched from gpt-6-astra to other-model. The request was classified as high-risk cybersecurity activity.",
    } });
  });

  it("updates the same safety notice when buffering ends, with separate IDs per turn", () => {
    const started = buildModelStatusNotice("model/safetyBuffering/updated", {
      ...base, model: "gpt-6-astra", showBufferingUi: true,
    })!;
    const ended = buildModelStatusNotice("model/safetyBuffering/updated", {
      thread_id: "thread-1", turn_id: "turn-1", model: "gpt-6-astra", show_buffering_ui: false,
    })!;
    expect(ended.item.id).toBe(started.item.id);
    expect(ended.item).toMatchObject({ detail: "Codex is no longer holding gpt-6-astra's response for safety checks." });
    const next = buildModelStatusNotice("model/safetyBuffering/updated", {
      ...base, turnId: "turn-2", model: "gpt-6-astra", showBufferingUi: true,
    })!;
    expect(next.item.id).not.toBe(started.item.id);
  });

  it("reports verification notices without claiming verification succeeded or demanding action", () => {
    expect(buildModelStatusNotice("model/verification", {
      ...base, verifications: ["trustedAccessForCyber"],
    })?.item).toMatchObject({ detail: "Codex reported: Trusted Access for Cyber." });
    expect(buildModelStatusNotice("model/verification", {
      ...base, verifications: [],
    })?.item).toMatchObject({ detail: "Codex reports no model verification notices for this response." });
  });

  it.each([
    ["model/rerouted", { ...base, fromModel: "astra" }],
    ["model/rerouted", { ...base, threadId: {}, fromModel: "astra", toModel: "other" }],
    ["model/safetyBuffering/updated", { ...base, model: "astra", showBufferingUi: "false" }],
    ["model/verification", { ...base, verifications: null }],
    ["model/verification", { threadId: "thread-1", verifications: [] }],
    ["model/unknown", base],
  ])("ignores malformed or unknown %s notices", (method, params) => {
    expect(buildModelStatusNotice(method, params)).toBeNull();
  });
});
