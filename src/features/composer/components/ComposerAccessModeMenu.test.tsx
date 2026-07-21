/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerAccessModeMenu } from "./ComposerAccessModeMenu";

describe("ComposerAccessModeMenu", () => {
  afterEach(cleanup);

  it("selects an access mode from a persistent custom menu", () => {
    const onChange = vi.fn();
    render(
      <ComposerAccessModeMenu
        disabled={false}
        value="auto-review"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Agent access" });
    expect(trigger.textContent).toContain("Auto-review");
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.click(trigger);

    const selectedOption = screen.getByRole("menuitemradio", {
      name: /Auto-review/,
    });
    expect(selectedOption.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByText(
        "Can edit files and reviews sensitive actions automatically.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitemradio", { name: /Full access/ }));

    expect(onChange).toHaveBeenCalledWith("full-access");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("supports arrow-key navigation and returns focus on Escape", () => {
    render(
      <ComposerAccessModeMenu
        disabled={false}
        value="current"
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Agent access" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const currentOption = screen.getByRole("menuitemradio", {
      name: /On request/,
    });
    const autoReviewOption = screen.getByRole("menuitemradio", {
      name: /Auto-review/,
    });
    expect(document.activeElement).toBe(currentOption);

    fireEvent.keyDown(currentOption, { key: "ArrowDown" });
    expect(document.activeElement).toBe(autoReviewOption);

    fireEvent.keyDown(autoReviewOption, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("dismisses the menu when clicking elsewhere", () => {
    render(
      <ComposerAccessModeMenu
        disabled={false}
        value="read-only"
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Agent access" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
