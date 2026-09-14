import { useEffect, useRef, useState } from "react";
import { cycles, periodLengths, periodStarts } from "../cycle";
import { TYPICAL_CYCLE, TYPICAL_PERIOD, withLength, type Settings } from "../data";
import { t } from "../i18n";
import { setLook, useLook } from "../look";
import { LookPicker } from "../look/LookPicker";
import type { CycleData } from "../shell/useCycle";
import { Toggle } from "../ui/Toggle";
import "./settings.css";

type Change = (settings: Settings) => Settings;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * docs/DESIGN.md §3: the look, which changes live; what almanac helps with; the usual lengths it
 * starts from. Every change is saved as it is made — there is nothing to confirm.
 */
export function SettingsView({ data, onChange, onDone }: { data: CycleData; onChange(change: Change): Promise<void>; onDone(): void }) {
  const { look } = useLook();
  // Shown from here while the screen is open, so quick taps never wait on a save.
  const [settings, setSettings] = useState(data.settings);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  function change(fn: Change) {
    setSettings(fn);
    setError(null);
    onChange(fn).catch((e: unknown) => setError(message(e)));
  }
  const mode = (key: keyof Settings["modes"]) => (on: boolean) => change((s) => ({ ...s, modes: { ...s.modes, [key]: on } }));

  // Once almanac has these from what was logged, the usual lengths no longer change its guesses — and it says so.
  const cycleLearned = cycles(periodStarts(data.entries)).filter((c) => c.counted).length >= 2;
  const periodLearned = periodLengths(data.entries).length > 0;

  return (
    <section className="settings" aria-labelledby="settings-title">
      <div className="settings-head">
        <h1 id="settings-title" tabIndex={-1} ref={heading}>
          {t("settings.title")}
        </h1>
        <button type="button" className="link-button" onClick={onDone}>
          {t("settings.done")}
        </button>
      </div>
      {error && (
        <p role="alert" className="settings-error">
          {t("settings.failed", { message: error })}
        </p>
      )}

      <section className="settings-group" aria-labelledby="set-look">
        <h2 id="set-look">{t("settings.look")}</h2>
        <p className="settings-note">{t("settings.lookNote")}</p>
        <LookPicker value={look} onChange={(l) => void setLook(l).catch((e: unknown) => setError(message(e)))} labelledBy="set-look" />
      </section>

      <section className="settings-group" aria-labelledby="set-help">
        <h2 id="set-help">{t("settings.help")}</h2>
        <div className="toggles">
          <Toggle id="set-periods" label={t("onboarding.help.periods")} note={t("onboarding.help.periodsNote")} checked disabled />
          <Toggle id="set-fertility" label={t("onboarding.help.fertility")} note={t("onboarding.help.fertilityNote")} checked={settings.modes.fertility} onChange={mode("fertility")} />
          <Toggle id="set-ttc" label={t("onboarding.help.ttc")} note={t("onboarding.help.ttcNote")} checked={settings.modes.ttc} onChange={mode("ttc")} />
          <Toggle id="set-pregnancy" label={t("settings.pregnancy")} note={t("settings.pregnancyNote")} checked={settings.modes.pregnancy} onChange={mode("pregnancy")} />
        </div>
      </section>

      <section className="settings-group" aria-labelledby="set-cycle">
        <h2 id="set-cycle">{t("settings.cycle")}</h2>
        <Length
          id="set-usual-cycle"
          label={t("settings.usualCycle")}
          note={cycleLearned ? t("settings.usualCycleLearned") : t("settings.usualCycleNote")}
          value={settings.typicalCycle}
          range={TYPICAL_CYCLE}
          shorter={t("settings.cycleShorter")}
          longer={t("settings.cycleLonger")}
          onSet={(days) => change((s) => withLength(s, "typicalCycle", days))}
        />
        <Length
          id="set-usual-period"
          label={t("settings.usualPeriod")}
          note={periodLearned ? t("settings.usualPeriodLearned") : t("settings.usualPeriodNote")}
          value={settings.typicalPeriod}
          range={TYPICAL_PERIOD}
          shorter={t("settings.periodShorter")}
          longer={t("settings.periodLonger")}
          onSet={(days) => change((s) => withLength(s, "typicalPeriod", days))}
        />
      </section>
    </section>
  );
}

/** A usual length in days, a step at a time, or "Not sure". */
function Length(props: {
  id: string;
  label: string;
  note: string;
  value: number | undefined;
  range: { min: number; max: number; start: number };
  shorter: string;
  longer: string;
  onSet(days: number | undefined): void;
}) {
  const { id, value, range, onSet } = props;
  const shown = value ?? range.start;
  return (
    <div className="set-length" role="group" aria-labelledby={id} aria-describedby={`${id}-note`}>
      <span className="set-length-label" id={id}>
        {props.label}
      </span>
      <output className="set-length-value" aria-live="polite">
        {value === undefined ? t("settings.notSure") : value === 1 ? t("settings.dayOne") : t("settings.days", { n: value })}
      </output>
      <span className="set-length-steps">
        <button type="button" className="icon-button" aria-label={props.shorter} disabled={shown <= range.min} onClick={() => onSet(shown - 1)}>
          −
        </button>
        <button type="button" className="icon-button" aria-label={props.longer} disabled={shown >= range.max} onClick={() => onSet(shown + 1)}>
          +
        </button>
      </span>
      <span className="set-length-note" id={`${id}-note`}>
        {props.note}
      </span>
      {/* Always there, pressed while nothing is set, so focus never falls off a button that vanished. */}
      <button type="button" className="link-button set-length-clear" aria-pressed={value === undefined} onClick={() => onSet(undefined)}>
        {t("settings.setNotSure")}
      </button>
    </div>
  );
}
