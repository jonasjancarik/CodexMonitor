import type { AppServerEvent } from "../types";

export const SUPPORTED_APP_SERVER_METHODS = [
  "app/list/updated",
  "account/login/completed",
  "account/rateLimits/updated",
  "account/updated",
  "codex/backgroundThread",
  "codex/connected",
  "codex/event/skills_update_available",
  "error",
  "hook/completed",
  "hook/started",
  "item/agentMessage/delta",
  "item/autoApprovalReview/completed",
  "item/autoApprovalReview/started",
  "item/commandExecution/outputDelta",
  "item/commandExecution/terminalInteraction",
  "item/completed",
  "item/fileChange/outputDelta",
  "item/plan/delta",
  "item/reasoning/summaryPartAdded",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/textDelta",
  "item/started",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
  "thread/archived",
  "thread/closed",
  "thread/name/updated",
  "thread/status/changed",
  "thread/started",
  "thread/tokenUsage/updated",
  "thread/unarchived",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "turn/started",
] as const;

export type SupportedAppServerMethod = (typeof SUPPORTED_APP_SERVER_METHODS)[number];

export const METHODS_HANDLED_OUTSIDE_USE_APP_SERVER_EVENTS = [
  "app/list/updated",
  "codex/event/skills_update_available",
] as const satisfies readonly SupportedAppServerMethod[];

const SUPPORTED_METHOD_SET = new Set<string>(SUPPORTED_APP_SERVER_METHODS);

function getAppServerMessageObject(
  event: AppServerEvent,
): Record<string, unknown> | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  const message = (event as { message?: unknown }).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  return message as Record<string, unknown>;
}

export function getAppServerRawMethod(event: AppServerEvent): string | null {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return null;
  }
  const method = message.method;
  if (typeof method !== "string") {
    return null;
  }
  const trimmed = method.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isSupportedAppServerMethod(
  method: string,
): method is SupportedAppServerMethod {
  return SUPPORTED_METHOD_SET.has(method);
}

export function getAppServerParams(event: AppServerEvent): Record<string, unknown> {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return {};
  }
  const params = message.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return {};
  }
  return params as Record<string, unknown>;
}

export function getAppServerRequestId(event: AppServerEvent): string | number | null {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return null;
  }
  const requestId = message.id;
  if (typeof requestId === "number" || typeof requestId === "string") {
    return requestId;
  }
  return null;
}

export function buildAutoApprovalReviewItem(
  params: Record<string, unknown>,
  phase: "started" | "completed",
): Record<string, unknown> | null {
  const reviewId = String(params.reviewId ?? params.review_id ?? "").trim();
  const reviewRaw = params.review;
  const actionRaw = params.action;
  if (
    !reviewId ||
    !reviewRaw ||
    typeof reviewRaw !== "object" ||
    Array.isArray(reviewRaw) ||
    !actionRaw ||
    typeof actionRaw !== "object" ||
    Array.isArray(actionRaw)
  ) {
    return null;
  }

  const review = reviewRaw as Record<string, unknown>;
  return {
    type: "autoApprovalReview",
    id: reviewId,
    turnId: params.turnId ?? params.turn_id ?? null,
    targetItemId: params.targetItemId ?? params.target_item_id ?? null,
    decisionSource: params.decisionSource ?? params.decision_source ?? null,
    status: review.status ?? (phase === "started" ? "inProgress" : "completed"),
    riskLevel: review.riskLevel ?? review.risk_level ?? null,
    userAuthorization:
      review.userAuthorization ?? review.user_authorization ?? null,
    rationale: review.rationale ?? null,
    action: actionRaw,
  };
}

export function isApprovalRequestMethod(method: string): boolean {
  return method.endsWith("requestApproval");
}

export function isMcpElicitationRequestMethod(method: string): boolean {
  return method === "mcpServer/elicitation/request";
}

export function isSkillsUpdateAvailableEvent(event: AppServerEvent): boolean {
  return getAppServerRawMethod(event) === "codex/event/skills_update_available";
}

export function isAppListUpdatedEvent(event: AppServerEvent): boolean {
  return getAppServerRawMethod(event) === "app/list/updated";
}
