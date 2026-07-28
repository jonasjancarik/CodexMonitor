import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import type { ThreadContextMenuAnchor } from "./sidebarTypes";

const VIEWPORT_MARGIN = 8;

type ThreadContextMenuProps = {
  anchor: ThreadContextMenuAnchor;
  isPinned: boolean;
  onClose: () => void;
  onRename: (workspaceId: string, threadId: string) => void;
  onSync: (workspaceId: string, threadId: string) => void;
  onPin: (workspaceId: string, threadId: string) => void;
  onUnpin: (workspaceId: string, threadId: string) => void;
  onArchive: (workspaceId: string, threadId: string) => void;
};

export const ThreadContextMenu = forwardRef<HTMLDivElement, ThreadContextMenuProps>(
  function ThreadContextMenu(
    {
      anchor,
      isPinned,
      onClose,
      onRename,
      onSync,
      onPin,
      onUnpin,
      onArchive,
    },
    forwardedRef,
  ) {
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState({
      top: anchor.top,
      left: anchor.left,
    });
    const setSurfaceRef = useCallback(
      (node: HTMLDivElement | null) => {
        surfaceRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    useLayoutEffect(() => {
      const surface = surfaceRef.current;
      if (!surface) {
        return;
      }

      const bounds = surface.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - bounds.width - VIEWPORT_MARGIN);
      const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - bounds.height - VIEWPORT_MARGIN);

      setPosition({
        left: Math.min(Math.max(anchor.left, VIEWPORT_MARGIN), maxLeft),
        top: Math.min(Math.max(anchor.top, VIEWPORT_MARGIN), maxTop),
      });
      surface.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }, [anchor.left, anchor.top]);

    useEffect(() => {
      window.addEventListener("resize", onClose);
      return () => {
        window.removeEventListener("resize", onClose);
      };
    }, [onClose]);

    const runAction = (action: () => void) => {
      onClose();
      action();
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }

      const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not(:disabled)',
        ),
      );
      if (items.length === 0) {
        return;
      }

      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowUp"
              ? (currentIndex - 1 + items.length) % items.length
              : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    };

    return (
      <PopoverSurface
        ref={setSurfaceRef}
        className="thread-context-menu"
        role="menu"
        aria-label="Conversation actions"
        style={position}
        onKeyDown={handleKeyDown}
      >
        <PopoverMenuItem
          role="menuitem"
          onClick={() =>
            runAction(() => onRename(anchor.workspaceId, anchor.threadId))
          }
        >
          Rename
        </PopoverMenuItem>
        <PopoverMenuItem
          role="menuitem"
          onClick={() => runAction(() => onSync(anchor.workspaceId, anchor.threadId))}
        >
          Sync from server
        </PopoverMenuItem>
        {anchor.canPin && (
          <PopoverMenuItem
            role="menuitem"
            onClick={() =>
              runAction(() => {
                if (isPinned) {
                  onUnpin(anchor.workspaceId, anchor.threadId);
                } else {
                  onPin(anchor.workspaceId, anchor.threadId);
                }
              })
            }
          >
            {isPinned ? "Unpin" : "Pin"}
          </PopoverMenuItem>
        )}
        <PopoverMenuItem
          role="menuitem"
          onClick={() => {
            onClose();
            void navigator.clipboard?.writeText(anchor.threadId).catch(() => {
              // Clipboard failures are non-fatal here.
            });
          }}
        >
          Copy ID
        </PopoverMenuItem>
        <PopoverMenuItem
          role="menuitem"
          onClick={() =>
            runAction(() => onArchive(anchor.workspaceId, anchor.threadId))
          }
        >
          Archive
        </PopoverMenuItem>
      </PopoverSurface>
    );
  },
);
