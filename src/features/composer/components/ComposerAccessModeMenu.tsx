import { useEffect, useId, useRef } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import {
  Check,
  ChevronDown,
  Eye,
  MousePointerClick,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AccessMode } from "../../../types";
import { useMenuController } from "../../app/hooks/useMenuController";
import {
  MenuTrigger,
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";

type AccessModeOption = {
  value: AccessMode;
  label: string;
  description: string;
  icon: LucideIcon;
};

const ACCESS_MODE_OPTIONS: AccessModeOption[] = [
  {
    value: "read-only",
    label: "Read only",
    description: "Can inspect files, but can't change them.",
    icon: Eye,
  },
  {
    value: "current",
    label: "On request",
    description: "Can edit files and asks before sensitive actions.",
    icon: MousePointerClick,
  },
  {
    value: "auto-review",
    label: "Auto-review",
    description: "Can edit files and reviews sensitive actions automatically.",
    icon: ShieldCheck,
  },
  {
    value: "full-access",
    label: "Full access",
    description: "Can change anything and run commands without asking.",
    icon: ShieldOff,
  },
];

type ComposerAccessModeMenuProps = {
  disabled: boolean;
  value: AccessMode;
  onChange: (mode: AccessMode) => void;
};

export function ComposerAccessModeMenu({
  disabled,
  value,
  onChange,
}: ComposerAccessModeMenuProps) {
  const menu = useMenuController();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption =
    ACCESS_MODE_OPTIONS.find((option) => option.value === value) ??
    ACCESS_MODE_OPTIONS[0];
  const SelectedIcon = selectedOption.icon;

  useEffect(() => {
    if (!menu.isOpen) {
      return;
    }
    menuRef.current
      ?.querySelector<HTMLButtonElement>(`[data-access-mode="${value}"]`)
      ?.focus();
  }, [menu.isOpen, value]);

  const focusTrigger = () => {
    menu.containerRef.current
      ?.querySelector<HTMLButtonElement>(".composer-access-menu-trigger")
      ?.focus();
  };

  const handleSelect = (mode: AccessMode) => {
    onChange(mode);
    menu.close();
    focusTrigger();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    menu.open();
  };

  const handleContainerBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget as Node | null;
    if (nextFocus && event.currentTarget.contains(nextFocus)) {
      return;
    }
    menu.close();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ) ?? [],
    );
    const currentIndex = options.indexOf(event.target as HTMLButtonElement);

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      menu.close();
      focusTrigger();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      options[event.key === "Home" ? 0 : options.length - 1]?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (Math.max(currentIndex, 0) + direction + options.length) %
        options.length;
      options[nextIndex]?.focus();
    }
  };

  return (
    <div
      className="composer-access-menu"
      ref={menu.containerRef}
      onBlur={handleContainerBlur}
    >
      <MenuTrigger
        isOpen={menu.isOpen}
        className="composer-access-menu-trigger"
        activeClassName="is-open"
        aria-label="Agent access"
        aria-controls={menuId}
        title={`Agent access: ${selectedOption.label}`}
        disabled={disabled}
        data-access-mode={value}
        onClick={menu.toggle}
        onKeyDown={handleTriggerKeyDown}
      >
        <SelectedIcon
          className="composer-access-menu-trigger-icon"
          size={14}
          strokeWidth={1.8}
          aria-hidden
        />
        <span className="composer-access-menu-trigger-label">
          {selectedOption.label}
        </span>
        <ChevronDown
          className="composer-access-menu-chevron"
          size={12}
          strokeWidth={1.8}
          aria-hidden
        />
      </MenuTrigger>
      {menu.isOpen && (
        <PopoverSurface
          ref={menuRef}
          id={menuId}
          className="composer-access-menu-popover"
          role="menu"
          aria-label="Agent access"
          onKeyDown={handleMenuKeyDown}
        >
          {ACCESS_MODE_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            const isSelected = option.value === value;
            return (
              <PopoverMenuItem
                key={option.value}
                className="composer-access-menu-option"
                role="menuitemradio"
                aria-checked={isSelected}
                active={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-access-mode={option.value}
                icon={<OptionIcon strokeWidth={1.8} />}
                onClick={() => handleSelect(option.value)}
              >
                <span className="composer-access-menu-option-copy">
                  <span className="composer-access-menu-option-title">
                    {option.label}
                  </span>
                  <span className="composer-access-menu-option-description">
                    {option.description}
                  </span>
                </span>
                <span
                  className="composer-access-menu-check"
                  aria-hidden
                  data-visible={isSelected}
                >
                  <Check size={14} strokeWidth={2.2} />
                </span>
              </PopoverMenuItem>
            );
          })}
        </PopoverSurface>
      )}
    </div>
  );
}
