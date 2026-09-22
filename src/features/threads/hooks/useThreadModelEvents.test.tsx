// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { buildModelStatusNotice } from "@/utils/appServerModelEvents";
import { useThreadModelEvents } from "./useThreadModelEvents";

it("upserts model notices without changing the turn's processing state", () => {
  const dispatch = vi.fn();
  const { result } = renderHook(() => useThreadModelEvents({
    dispatch, isThreadHidden: () => false, getCustomName: () => undefined,
  }));
  const notice = buildModelStatusNotice("model/verification", {
    threadId: "t", turnId: "turn", verifications: ["trustedAccessForCyber"],
  })!;
  act(() => result.current("ws", "t", notice.item));
  expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual(["ensureThread", "upsertItem"]);
  expect(dispatch).toHaveBeenLastCalledWith({
    type: "upsertItem", workspaceId: "ws", threadId: "t", item: notice.item, hasCustomName: false,
  });
});

it("does not resurrect hidden threads for model notices", () => {
  const dispatch = vi.fn();
  const { result } = renderHook(() => useThreadModelEvents({
    dispatch, isThreadHidden: () => true, getCustomName: () => undefined,
  }));
  const notice = buildModelStatusNotice("model/verification", {
    threadId: "t", turnId: "turn", verifications: [],
  })!;
  act(() => result.current("ws", "t", notice.item));
  expect(dispatch).not.toHaveBeenCalled();
});
