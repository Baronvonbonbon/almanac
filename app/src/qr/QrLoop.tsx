import { useEffect, useState } from "react";
import { t } from "../i18n";
import { QrCode } from "./QrCode";

/** How long each code stays up. A phone's reader catches a code in a frame or two; this leaves room for a slow one. */
export const LOOP_MS = 350;

/**
 * A share as a loop of codes (share/frames.ts), each shown in turn, round and round, until the other
 * phone has read them all. The loop keeps going with reduced motion too: it carries the share, it does
 * not decorate it. The label stays the same from code to code, so a screen reader is not interrupted.
 */
export function QrLoop({ codes, label }: { codes: string[]; label: string }) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    setAt(0);
    if (codes.length < 2) return;
    const timer = setInterval(() => setAt((n) => (n + 1) % codes.length), LOOP_MS);
    return () => clearInterval(timer);
  }, [codes]);
  const shown = at % codes.length;
  return (
    <figure className="qr-loop">
      <QrCode text={codes[shown]} label={label} />
      {codes.length > 1 && <figcaption aria-hidden="true">{t("qr.part", { n: shown + 1, of: codes.length })}</figcaption>}
    </figure>
  );
}
