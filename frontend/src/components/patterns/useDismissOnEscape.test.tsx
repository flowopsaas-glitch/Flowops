import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useDismissOnEscape } from "./useDismissOnEscape";

function Overlay({ enabled, priority, onDismiss, label }: {
  enabled: boolean;
  priority: number;
  onDismiss: () => void;
  label: string;
}) {
  useDismissOnEscape(enabled, onDismiss, priority);
  return <div>{label}</div>;
}

afterEach(cleanup);

describe("useDismissOnEscape", () => {
  it("dismisses only the highest-priority active overlay", () => {
    const parentDismiss = vi.fn();
    const dialogDismiss = vi.fn();
    render(
      <>
        <Overlay enabled priority={0} onDismiss={parentDismiss} label="drawer" />
        <Overlay enabled priority={1} onDismiss={dialogDismiss} label="dialog" />
      </>,
    );

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(dialogDismiss).toHaveBeenCalledTimes(1);
    expect(parentDismiss).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not close a disabled overlay", () => {
    const dismiss = vi.fn();
    render(<Overlay enabled={false} priority={0} onDismiss={dismiss} label="busy dialog" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dismiss).not.toHaveBeenCalled();
  });
});
