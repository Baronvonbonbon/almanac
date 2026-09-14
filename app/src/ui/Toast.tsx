import { useEffect } from "react";

/**
 * A short confirmation — "Saved". The live region stays in the page, empty between messages, so
 * screen readers announce each one.
 */
export function Toast({ message, onDone }: { message: string | null; onDone(): void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  return (
    <div className="toast" role="status" aria-live="polite">
      {message && <span className="toast-text">{message}</span>}
    </div>
  );
}
