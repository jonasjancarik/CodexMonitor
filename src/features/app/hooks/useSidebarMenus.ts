import { useCallback, useState, type MouseEvent } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { WorkspaceInfo } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";
import { fileManagerName } from "../../../utils/platformPaths";
import type { ThreadContextMenuAnchor } from "../components/sidebarTypes";

type SidebarMenuHandlers = {
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  onRestartWorkspaceSession: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
};

export function useSidebarMenus({
  onReloadWorkspaceThreads,
  onRestartWorkspaceSession,
  onDeleteWorkspace,
  onDeleteWorktree,
}: SidebarMenuHandlers) {
  const [threadMenu, setThreadMenu] = useState<ThreadContextMenuAnchor | null>(null);

  const showThreadMenu = useCallback(
    (
      event: MouseEvent,
      workspaceId: string,
      threadId: string,
      canPin: boolean,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setThreadMenu({
        workspaceId,
        threadId,
        canPin,
        top: event.clientY,
        left: event.clientX,
      });
    },
    [],
  );
  const closeThreadMenu = useCallback(() => setThreadMenu(null), []);

  const showWorkspaceMenu = useCallback(
    async (event: MouseEvent, workspaceId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const [reloadItem, restartSessionItem, deleteItem] = await Promise.all([
        MenuItem.new({
          text: "Reload threads",
          action: () => onReloadWorkspaceThreads(workspaceId),
        }),
        MenuItem.new({
          text: "Restart Codex session",
          action: () => onRestartWorkspaceSession(workspaceId),
        }),
        MenuItem.new({
          text: "Delete",
          action: () => onDeleteWorkspace(workspaceId),
        }),
      ]);
      const menu = await Menu.new({ items: [reloadItem, restartSessionItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onReloadWorkspaceThreads, onRestartWorkspaceSession, onDeleteWorkspace],
  );

  const showWorktreeMenu = useCallback(
    async (event: MouseEvent, worktree: WorkspaceInfo) => {
      event.preventDefault();
      event.stopPropagation();
      const fileManagerLabel = fileManagerName();
      const [reloadItem, restartSessionItem, revealItem, deleteItem] = await Promise.all([
        MenuItem.new({
          text: "Reload threads",
          action: () => onReloadWorkspaceThreads(worktree.id),
        }),
        MenuItem.new({
          text: "Restart Codex session",
          action: () => onRestartWorkspaceSession(worktree.id),
        }),
        MenuItem.new({
          text: `Show in ${fileManagerLabel}`,
          action: async () => {
            if (!worktree.path) {
              return;
            }
            try {
              const { revealItemInDir } = await import(
                "@tauri-apps/plugin-opener"
              );
              await revealItemInDir(worktree.path);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              pushErrorToast({
                title: `Couldn't show worktree in ${fileManagerLabel}`,
                message,
              });
              console.warn("Failed to reveal worktree", {
                message,
                workspaceId: worktree.id,
                path: worktree.path,
              });
            }
          },
        }),
        MenuItem.new({
          text: "Delete worktree",
          action: () => onDeleteWorktree(worktree.id),
        }),
      ]);
      const menu = await Menu.new({
        items: [reloadItem, restartSessionItem, revealItem, deleteItem],
      });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onReloadWorkspaceThreads, onRestartWorkspaceSession, onDeleteWorktree],
  );

  const showCloneMenu = useCallback(
    async (event: MouseEvent, clone: WorkspaceInfo) => {
      event.preventDefault();
      event.stopPropagation();
      const fileManagerLabel = fileManagerName();
      const [reloadItem, restartSessionItem, revealItem, deleteItem] = await Promise.all([
        MenuItem.new({
          text: "Reload threads",
          action: () => onReloadWorkspaceThreads(clone.id),
        }),
        MenuItem.new({
          text: "Restart Codex session",
          action: () => onRestartWorkspaceSession(clone.id),
        }),
        MenuItem.new({
          text: `Show in ${fileManagerLabel}`,
          action: async () => {
            if (!clone.path) {
              return;
            }
            try {
              const { revealItemInDir } = await import(
                "@tauri-apps/plugin-opener"
              );
              await revealItemInDir(clone.path);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              pushErrorToast({
                title: `Couldn't show clone in ${fileManagerLabel}`,
                message,
              });
              console.warn("Failed to reveal clone", {
                message,
                workspaceId: clone.id,
                path: clone.path,
              });
            }
          },
        }),
        MenuItem.new({
          text: "Delete clone",
          action: () => onDeleteWorkspace(clone.id),
        }),
      ]);
      const menu = await Menu.new({
        items: [reloadItem, restartSessionItem, revealItem, deleteItem],
      });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onReloadWorkspaceThreads, onRestartWorkspaceSession, onDeleteWorkspace],
  );

  return {
    threadMenu,
    showThreadMenu,
    closeThreadMenu,
    showWorkspaceMenu,
    showWorktreeMenu,
    showCloneMenu,
  };
}
