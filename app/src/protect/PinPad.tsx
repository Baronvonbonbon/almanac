import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import "./protect.css";

export const PIN_LENGTH = 6;

/** A wait in words: "30 seconds", "5 minutes". */
export function waitText(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return s === 1 ? t("pin.secondOne") : t("pin.seconds", { n: s });
  const m = Math.ceil(s / 60);
  return m === 1 ? t("pin.minuteOne") : t("pin.minutes", { n: m });
}

/** The time, ticking each second until `until` has passed. */
function useNow(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (until <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return now;
}

/**
 * Six digits on a keypad, as a phone's own lock screen asks for them. The PIN is handed over as the
 * sixth digit goes in, and the dots clear for the next try. A keyboard works too.
 */
export function PinPad({
  title,
  note,
  error,
  busy,
  busyText,
  until = 0,
  onPin,
}: {
  title: string;
  note?: string;
  error?: string | null;
  busy?: boolean;
  busyText?: string;
  /** No tries until then (ms since 1970): too many wrong PINs. */
  until?: number;
  onPin(pin: string): void;
}) {
  const [digits, setDigits] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const now = useNow(until);
  const waiting = now < until;
  const disabled = !!busy || waiting;

  useEffect(() => heading.current?.focus(), []);

  function press(d: string) {
    if (disabled) return;
    const next = digits + d;
    if (next.length < PIN_LENGTH) return setDigits(next);
    setDigits("");
    onPin(next);
  }
  const back = () => !disabled && setDigits((d) => d.slice(0, -1));

  // Bound again on every render, so it always sees the digits so far.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const message = waiting ? t("pin.wait", { time: waitText(until - now) }) : busy ? busyText : error;
  return (
    <div className="pin">
      <h1 className="pin-title" tabIndex={-1} ref={heading}>
        {title}
      </h1>
      {note && <p className="pin-note">{note}</p>}
      <div className="pin-dots" role="img" aria-label={t("pin.entered", { n: digits.length })}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className="pin-dot" data-on={i < digits.length || undefined} />
        ))}
      </div>
      <p className="pin-message" role="status" aria-live="polite">
        {message}
      </p>
      <div className="pin-keys">
        {"123456789".split("").map((d) => (
          <button key={d} type="button" className="pin-key" disabled={disabled} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" className="pin-key" disabled={disabled} onClick={() => press("0")}>
          0
        </button>
        <button type="button" className="pin-key pin-back" aria-label={t("pin.delete")} disabled={disabled || !digits} onClick={back}>
          ⌫
        </button>
      </div>
    </div>
  );
}
