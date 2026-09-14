import { useEffect, useRef, useState, type ReactNode } from "react";
import { addDays, type DayEntry, type ISODate } from "../cycle";
import { t } from "../i18n";
import { longDate, temperatureUnit } from "../i18n/format";
import { celsius, entryOf, FLOWS, FLUIDS, formOf, inUnit, INTIMACY, LH_RESULTS, MOODS, plausible, SYMPTOMS, type DayForm } from "./entry";
import "./log.css";

interface Props {
  date: ISODate;
  today: ISODate;
  entry: DayEntry | undefined;
  /** Trying-to-conceive mode: shows its fields. */
  ttc: boolean;
  onDate(date: ISODate): void;
  onSave(entry: DayEntry): Promise<void>;
  onClose(): void;
}

const LEVEL = { none: 0, spotting: 0.2, light: 0.42, medium: 0.66, heavy: 1 };
const DROP = "M12 3C12 3 4 13.5 4 20.5a8 8 0 0 0 16 0C20 13.5 12 3 12 3Z";

/** A drop filled to the flow's level: the level carries the meaning, not only the colour. */
function Drop({ flow }: { flow: (typeof FLOWS)[number] }) {
  const top = 3 + 26 * (1 - LEVEL[flow]);
  return (
    <svg viewBox="0 0 24 32" aria-hidden="true">
      <defs>
        <clipPath id={`drop-${flow}`}>
          <rect x="0" y={top.toFixed(1)} width="24" height="32" />
        </clipPath>
      </defs>
      <path className="drop-fill" d={DROP} clipPath={`url(#drop-${flow})`} />
      <path className="drop-line" d={DROP} />
    </svg>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * Logging a day — three taps at most: Log today, a flow, Save (docs/DESIGN.md §3). A native modal
 * dialog, so the page behind it is out of reach, Escape closes it, and focus returns where it was.
 */
export function LogSheet({ date, today, entry, ttc, onDate, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Where focus goes back to on closing. A tap does not always focus the button it lands on, so home's
  // log button stands in when nothing else was focused.
  const opener = useRef(document.activeElement);
  const unit = temperatureUnit();
  const temperatureText = (e?: DayEntry) => (e?.fertility?.temperatureC !== undefined ? String(inUnit(e.fertility.temperatureC, unit)) : "");
  const [form, setForm] = useState<DayForm>(() => formOf(entry));
  const [temperature, setTemperature] = useState(() => temperatureText(entry));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  // Another day, chosen with ‹ or ›: start from what that day already holds.
  useEffect(() => {
    setForm(formOf(entry));
    setTemperature(temperatureText(entry));
    setError(null);
    // Only a change of day resets the form; `entry` is that day's, and a reload must not undo typing.
  }, [date]);

  const close = () => {
    dialog.current?.close();
    onClose();
    const back = opener.current instanceof HTMLElement && opener.current !== document.body ? opener.current : null;
    requestAnimationFrame(() => (back?.isConnected ? back : document.querySelector<HTMLElement>(".home-log"))?.focus());
  };

  const typed = temperature.trim() === "" ? null : celsius(Number(temperature.replace(",", ".")), unit);
  const badTemperature = ttc && typed !== null && !plausible(typed);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(entryOf(date, { ...form, temperatureC: ttc ? typed : form.temperatureC }, entry, Date.now(), ttc));
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const toggle = (key: "symptoms" | "mood", id: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const title = date === today ? t("log.today") : date === addDays(today, -1) ? t("log.yesterday") : longDate(date);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="log-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close(); // a tap on the dimmed page around the sheet
      }}
    >
      <div className="sheet-body">
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <button type="button" className="icon-button" onClick={() => onDate(addDays(date, -1))} aria-label={t("log.earlierDay")}>
            ‹
          </button>
          <h2 id="log-title">{title}</h2>
          <button type="button" className="icon-button" onClick={() => onDate(addDays(date, 1))} disabled={date >= today} aria-label={t("log.laterDay")}>
            ›
          </button>
          <button type="button" className="icon-button" onClick={close} aria-label={t("log.close")}>
            ×
          </button>
        </div>

        <fieldset className="log-group">
          <legend>{t("log.flow")}</legend>
          <div className="flows">
            {FLOWS.map((f) => (
              <button key={f} type="button" className="flow" aria-pressed={(form.flow ?? "none") === f} onClick={() => setForm((s) => ({ ...s, flow: f === "none" ? null : f }))}>
                <Drop flow={f} />
                <span>{t(`log.flows.${f}`)}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="log-group">
          <legend>{t("log.symptoms")}</legend>
          <div className="chips">
            {SYMPTOMS.map((s) => (
              <Chip key={s} pressed={form.symptoms.includes(s)} onClick={() => toggle("symptoms", s)}>
                {t(`log.symptomNames.${s}`)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="log-group">
          <legend>{t("log.mood")}</legend>
          <div className="chips">
            {MOODS.map((m) => (
              <Chip key={m} pressed={form.mood.includes(m)} onClick={() => toggle("mood", m)}>
                {t(`log.moodNames.${m}`)}
              </Chip>
            ))}
          </div>
        </fieldset>

        {ttc && (
          <fieldset className="log-group ttc">
            <legend>{t("log.ttc.title")}</legend>
            <p className="log-label" id="log-lh">
              {t("log.ttc.lhTest")}
            </p>
            <div className="chips" role="group" aria-labelledby="log-lh">
              {LH_RESULTS.map((v) => (
                <Chip key={v} pressed={form.lhTest === v} onClick={() => setForm((s) => ({ ...s, lhTest: s.lhTest === v ? null : v }))}>
                  {t(`log.ttc.lh.${v}`)}
                </Chip>
              ))}
            </div>
            <label className="log-label" htmlFor="log-temperature">
              {t("log.ttc.temperature")}
            </label>
            <div className="log-temperature">
              <input
                id="log-temperature"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                aria-invalid={badTemperature}
                aria-describedby={badTemperature ? "log-temperature-hint" : undefined}
              />
              <span aria-hidden="true">°{unit}</span>
            </div>
            {badTemperature && (
              <p className="log-hint" id="log-temperature-hint">
                {t("log.ttc.temperatureHint")}
              </p>
            )}
            <p className="log-label" id="log-fluid">
              {t("log.ttc.fluid")}
            </p>
            <div className="chips" role="group" aria-labelledby="log-fluid">
              {FLUIDS.map((v) => (
                <Chip key={v} pressed={form.fluid === v} onClick={() => setForm((s) => ({ ...s, fluid: s.fluid === v ? null : v }))}>
                  {t(`log.ttc.fluids.${v}`)}
                </Chip>
              ))}
            </div>
            <p className="log-label" id="log-intimacy">
              {t("log.ttc.intimacy")}
            </p>
            <div className="chips" role="group" aria-labelledby="log-intimacy">
              {INTIMACY.map((v) => (
                <Chip key={v} pressed={form.intimacy === v} onClick={() => setForm((s) => ({ ...s, intimacy: v }))}>
                  {t(`log.ttc.intimacyOptions.${v}`)}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}

        <label className="log-label log-note-label" htmlFor="log-note">
          {t("log.note")}
        </label>
        <textarea id="log-note" className="log-note" rows={2} placeholder={t("log.notePlaceholder")} value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />
      </div>

      <div className="sheet-actions">
        {error && (
          <p role="alert" className="sheet-error">
            {t("app.failed", { message: error })}
          </p>
        )}
        <button type="button" className="button" onClick={() => void save()} disabled={busy || badTemperature}>
          {busy ? t("log.saving") : t("log.save")}
        </button>
      </div>
    </dialog>
  );
}
