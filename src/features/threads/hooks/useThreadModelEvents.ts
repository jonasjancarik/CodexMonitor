import { useCallback, type Dispatch } from "react";
import type { ConversationItem } from "@/types";
import type { ThreadAction } from "./useThreadsReducer";

export function useThreadModelEvents({
  dispatch,
  isThreadHidden,
  getCustomName,
}: {
  dispatch: Dispatch<ThreadAction>;
  isThreadHidden: (workspaceId: string, threadId: string) => boolean;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
}) {
  return useCallback((workspaceId: string, threadId: string, item: ConversationItem) => {
    if (isThreadHidden(workspaceId, threadId)) return;
    dispatch({ type: "ensureThread", workspaceId, threadId });
    dispatch({
      type: "upsertItem", workspaceId, threadId, item,
      hasCustomName: Boolean(getCustomName(workspaceId, threadId)),
    });
  }, [dispatch, getCustomName, isThreadHidden]);
}
