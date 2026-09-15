import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from "react";
import { BackupFlow } from "../backup/BackupFlow";
import { cycles, periodLengths, periodStarts } from "../cycle";
import { TYPICAL_CYCLE, TYPICAL_PERIOD, withLength, type Settings } from "../data";
import { t } from "../i18n";
import { setLook, useLook } from "../look";
import { LookPicker } from "../look/LookPicker";
import type { Host } from "../platform";
import { DuressFlow } from "../protect/DuressFlow";
import { EraseConfirm } from "../protect/EraseConfirm";
import { PinFlow } from "../protect/PinFlow";
import { PrivacySection, type PrivacyFlow } from "../protect/PrivacySection";
import type { SharingFlow as SharingScreens } from "../sharing/SharingFlow";
import type { CycleData } from "../shell/useCycle";
import { Toggle } from "../ui/Toggle";
import type { Vault } from "../vault";
import "./settings.css";

// Sharing loads when it is opened (docs/DESIGN.md §4): the codes, the share formats and the preview
// are not needed to start almanac, and most days nobody shares anything.
const LazySharing = lazy(() => import("../sharing/SharingFlow").then((m) => ({ default: m.SharingFlow })));
function SharingFlow(props: ComponentProps<typeof SharingScreens>) {
  return (
    <Suspense fallback={<p className="flow-note">{t("privacy.working")}</p>}>
      <LazySharing {...props} />
    </Suspense>
  );
}

type Change = (settings: Settings) => Settings;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * docs/DESIGN.md §3: the look, which changes live; what almanac helps with; the usual lengths it
 * starts from; and Privacy, whose rows open screens of their own. Every change is saved as it is made.
 */
export function SettingsView({
  data,
  vault,
  host,
  flow: opened,
  onChange,
  onChanged,
  onNotice,
  onDone,
  onLock,
  onErased,
}: {
  data: CycleData;
  vault: Vault;
  host: Host;
  /** Open straight into one of Privacy's screens — from home's backup offer. */
  flow: PrivacyFlow | null;
  onChange(change: Change): Promise<void>;
  onChanged(): void;
  onNotice(message: string): void;
  onDone(): void;
  onLock(): void;
  onErased(): void;
}) {
  const { look } = useLook();
  // Shown from here while the screen is open, so quick taps never wait on a save.
  const [settings, setSettings] = useState(data.settings);
  const [flow, setFlow] = useState<PrivacyFlow | null>(opened);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!flow) heading.current?.focus();
  }, [flow]);

  // Opened straight into a screen, leaving it closes Settings too.
  const leave = opened ? onDone : () => setFlow(null);
  const finish = (notice: string) => {
    onChanged();
    onNotice(notice);
    leave();
  };

  function change(fn: Change) {
    setSettings(fn);
    setError(null);
    onChange(fn).catch((e: unknown) => setError(message(e)));
  }
  const mode = (key: keyof Settings["modes"]) => (on: boolean) => change((s) => ({ ...s, modes: { ...s.modes, [key]: on } }));

  if (flow === "pin") return <PinFlow vault={vault} host={host} hasPin={data.privacy.pin} onFinish={finish} onBack={leave} />;
  if (flow === "duress") return <DuressFlow vault={vault} host={host} data={data} onFinish={finish} onBack={leave} onPin={() => setFlow("pin")} />;
  if (flow === "backup") return <BackupFlow vault={vault} host={host} data={data} onBack={leave} onChanged={onChanged} onNotice={onNotice} />;
  if (flow === "sharing") return <SharingFlow vault={vault} data={data} onBack={leave} onChanged={onChanged} onNotice={onNotice} />;
  if (flow === "erase") return <EraseConfirm host={host} onErased={onErased} onCancel={leave} />;

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

      <PrivacySection data={data} onOpen={setFlow} onLock={onLock} />
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
