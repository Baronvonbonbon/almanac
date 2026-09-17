import { useEffect, useState } from "react";
import { timeOf } from "@app/i18n/format";
import { FlowBack, Heading } from "@app/protect/FlowParts";
import type { Selection } from "@app/share";
import { SelectionView } from "@app/sharing/SelectionView";
import { t } from "./i18n";
import type { Patient } from "./patients";
import { patientName } from "./Provider";
import { openSelection, type Opening } from "./visit";

/** "14:32", or "2 h 14 min" past an hour. */
export function leftText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return t("view.hours", { h, m });
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A patient's share, open (docs/DESIGN.md §9): exactly what almanac's preview showed them, with how
 * long is left. What it holds is opened when this screen shows and dropped when it closes or the time
 * is up — it is never written anywhere.
 */
export function Viewer({ patient, opening, now, onDone }: { patient: Patient; opening: Opening | null; now: number; onDone(): void }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = opening !== null && opening.until > now;

  useEffect(() => {
    if (!opening) return;
    let live = true;
    openSelection(patient, opening).then(
      (s) => live && setSelection(s),
      (e: unknown) => live && setError(t("failed", { message: e instanceof Error ? e.message : String(e) })),
    );
    return () => {
      live = false;
      setSelection(null);
    };
  }, [patient, opening]);

  useEffect(() => {
    if (!open) setSelection(null);
  }, [open]);

  if (!open)
    return (
      <section className="steps">
        <FlowBack onBack={onDone} />
        <Heading>{t("view.closed")}</Heading>
        <p className="flow-note">{t("view.closedNote")}</p>
        <div className="flow-actions">
          <button type="button" className="button secondary" onClick={onDone}>
            {t("view.done")}
          </button>
        </div>
      </section>
    );

  return (
    <section className="steps viewer">
      <FlowBack onBack={onDone} />
      <Heading>
        <bdi>{patientName(patient)}</bdi>
      </Heading>
      <p className="viewer-left" role="timer">
        {t("view.left", { left: leftText(opening.until - now) })}
      </p>
      <p className="flow-note">{t("view.closesAt", { time: timeOf(opening.until) })}</p>
      {error && <p role="alert">{error}</p>}
      {selection && <SelectionView selection={selection} />}
      <div className="flow-actions">
        <button type="button" className="button secondary" onClick={onDone}>
          {t("view.done")}
        </button>
      </div>
    </section>
  );
}
