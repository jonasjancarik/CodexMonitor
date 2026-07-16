import { describe, expect, it } from "vitest";
import type { ConversationItem } from "@/types";
import { buildResumeHydrationPlan } from "./threadActionHelpers";

describe("buildResumeHydrationPlan", () => {
  it("checks resumed item overlap with one local id read per item", () => {
    const itemCount = 250;
    let localIdReads = 0;
    const localItems = Array.from({ length: itemCount }, (_, index) => {
      const item = {
        kind: "message",
        role: "assistant",
        text: `Local ${index}`,
      } as ConversationItem;
      Object.defineProperty(item, "id", {
        enumerable: true,
        get() {
          localIdReads += 1;
          return `local-${index}`;
        },
      });
      return item;
    });
    const remoteItems = Array.from({ length: itemCount }, (_, index) => ({
      id: `remote-${index}`,
      type: "agentMessage",
      text: `Remote ${index}`,
    }));

    const plan = buildResumeHydrationPlan({
      getCustomName: () => undefined,
      localActiveTurnId: null,
      localItems,
      localStatus: undefined,
      replaceLocal: true,
      thread: {
        id: "thread-1",
        preview: "Resume hydration",
        turns: [{ id: "turn-1", status: "completed", items: remoteItems }],
      },
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });

    expect(plan.mergedItems).toHaveLength(itemCount);
    expect(localIdReads).toBe(itemCount);
  });
});
