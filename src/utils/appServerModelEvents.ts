import type { ConversationItem } from "../types";

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

// Payloads verified against codex-cli 0.155.0's experimental JSON schema.
// These are informational notices, not tool or turn lifecycle events.
export function buildModelStatusNotice(
  method: string,
  params: Record<string, unknown>,
): { threadId: string; item: ConversationItem } | null {
  const threadId = text(params.threadId ?? params.thread_id);
  const turnId = text(params.turnId ?? params.turn_id);
  if (!threadId || !turnId) return null;

  let title: string;
  let detail: string;
  if (method === "model/rerouted") {
    const from = text(params.fromModel ?? params.from_model);
    const to = text(params.toModel ?? params.to_model);
    if (!from || !to) return null;
    title = "Model changed for this response";
    detail = `Codex switched from ${from} to ${to}.`;
    if (params.reason === "highRiskCyberActivity") {
      detail += " The request was classified as high-risk cybersecurity activity.";
    }
  } else if (method === "model/safetyBuffering/updated") {
    const showing = params.showBufferingUi ?? params.show_buffering_ui;
    const model = text(params.model);
    if (typeof showing !== "boolean" || !model) return null;
    title = "Response safety checks";
    detail = showing
      ? `${model}'s response is being held while safety checks run.`
      : `Codex is no longer holding ${model}'s response for safety checks.`;
  } else if (method === "model/verification") {
    if (!Array.isArray(params.verifications)) return null;
    const verifications = params.verifications.map(text).filter(Boolean);
    title = "Model verification notice";
    detail = verifications.length
      ? `Codex reported: ${verifications.map(value =>
        value === "trustedAccessForCyber" ? "Trusted Access for Cyber" : value,
      ).join(", ")}.`
      : "Codex reports no model verification notices for this response.";
  } else {
    return null;
  }

  return {
    threadId,
    item: {
      id: `model-status:${turnId}:${method}`,
      kind: "tool",
      toolType: "modelStatus",
      title,
      detail,
      // A notice must not look like an unfinished tool after a turn ends.
      status: "completed",
      output: "",
    },
  };
}
