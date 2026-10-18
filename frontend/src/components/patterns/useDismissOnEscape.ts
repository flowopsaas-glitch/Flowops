import { useEffect } from 'react';

/**
 * Closes an overlay when Escape is pressed.
 *
 * This exists because every modal in the codebase was reachable but not
 * dismissable by keyboard: they are plain divs whose only dismissal paths are a
 * click on the backdrop and a click on a Close button. A keyboard user who
 * tabs into one and wants out has to find the button, and in several of them
 * the button is not reachable either.
 *
 * Escape is the contract users expect from a dialog. Adding it here, once, is
 * what makes it honest for a modal to declare `aria-modal="true"` - that
 * attribute promises assistive technology that the dialog owns the keyboard
 * until it is dismissed, and until now none of them could keep that promise.
 *
 * The listener is attached on the document so it fires regardless of where
 * focus sits inside the overlay, which is the common case: an overlay that has
 * not moved focus cannot hear keydown from its own subtree.
 */
let nextOverlayId = 0;
const activeOverlays = new Map<number, number>();

export function useDismissOnEscape(
  /** Pass `false` while dismissal would discard work, e.g. mid-save. */
  enabled: boolean,
  onDismiss: () => void,
  /** Nested dialogs should pass a higher priority than their parent drawer. */
  priority = 0,
): void {
  useEffect(() => {
    if (!enabled) return;
    const id = ++nextOverlayId;
    activeOverlays.set(id, priority);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const top = [...activeOverlays.entries()].reduce<[number, number] | null>(
        (current, candidate) => !current || candidate[1] > current[1] || (candidate[1] === current[1] && candidate[0] > current[0])
          ? candidate
          : current,
        null,
      );
      if (top?.[0] !== id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onDismiss();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      activeOverlays.delete(id);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, onDismiss, priority]);
}

export default useDismissOnEscape;
