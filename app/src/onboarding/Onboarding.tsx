import { useEffect, useRef, useState } from "react";
import { RestoreView } from "../backup/RestoreView";
import { addDays, localToday, type ISODate } from "../cycle";
import { TYPICAL_CYCLE as CYCLE } from "../data";
import { t } from "../i18n";
import { setLook, useLook } from "../look";
import { LookPicker } from "../look/LookPicker";
import type { Host } from "../platform";
import { DatePicker } from "../ui/DatePicker";
import { Toggle } from "../ui/Toggle";
import type { Vault } from "../vault";
import { finishOnboarding } from "./finish";
import "./onboarding.css";

/** docs/DESIGN.md §3: four screens at most, the look first. */
const STEPS = ["look", "lastPeriod", "cycle", "help"] as const;

export function Onboarding({ host, onDone }: { host: Host; onDone(vault: Vault): void }) {
  const today = localToday();
  const { look } = useLook();
  const [step, setStep] = useState(0);
  const [lastPeriod, setLastPeriod] = useState<ISODate | null>(null);
  const [cycle, setCycle] = useState(CYCLE.start);
  const [typicalCycle, setTypicalCycle] = useState<number | null>(null);
  const [fertility, setFertility] = useState(false);
  const [ttc, setTtc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const opened = useRef(false);

  // Each new step moves focus to its question, so a screen reader starts reading there.
  useEffect(() => {
    if (opened.current) heading.current?.focus();
    opened.current = true;
  }, [step, restoring]);

  if (restoring) return <RestoreView host={host} onDone={onDone} onBack={() => setRestoring(false)} />;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      onDone(await finishOnboarding(host, { lastPeriod, typicalCycle, fertility, ttc }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const id = STEPS[step];
  return (
    <main className="onb">
      <div className="onb-top">
        {step > 0 ? (
          <button type="button" className="icon-button" onClick={() => setStep(step - 1)} aria-label={t("onboarding.back")}>
            ‹
          </button>
        ) : (
          <span className="wordmark">{t("appName")}</span>
        )}
        <p className="onb-progress">
          <span>{t("onboarding.progress", { step: step + 1, total: STEPS.length })}</span>
          <span className="onb-dots" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s} className="onb-dot" data-done={i <= step || undefined} />
            ))}
          </span>
        </p>
      </div>

      <div className="onb-body">
        {step === 0 && <p className="onb-eyebrow">{t("onboarding.welcome")}</p>}
        <h1 className="onb-title" id="onb-title" tabIndex={-1} ref={heading}>
          {t(`onboarding.${id}.title`)}
        </h1>
        <p className="onb-lead">{t(`onboarding.${id}.body`)}</p>

        {id === "look" && <LookPicker value={look} onChange={(l) => void setLook(l).catch(() => {})} labelledBy="onb-title" />}

        {id === "lastPeriod" && <DatePicker value={lastPeriod} onChange={setLastPeriod} min={addDays(today, -365)} max={today} today={today} />}

        {id === "cycle" && (
          <div className="stepper">
            <button type="button" className="icon-button" onClick={() => setCycle((c) => Math.max(CYCLE.min, c - 1))} disabled={cycle <= CYCLE.min} aria-label={t("onboarding.cycle.shorter")}>
              −
            </button>
            <output className="stepper-value" aria-live="polite">
              <span className="stepper-number">{cycle}</span>
              <span className="stepper-unit">{t("onboarding.cycle.days")}</span>
            </output>
            <button type="button" className="icon-button" onClick={() => setCycle((c) => Math.min(CYCLE.max, c + 1))} disabled={cycle >= CYCLE.max} aria-label={t("onboarding.cycle.longer")}>
              +
            </button>
          </div>
        )}

        {id === "help" && (
          <div className="toggles">
            <Toggle id="mode-periods" label={t("onboarding.help.periods")} note={t("onboarding.help.periodsNote")} checked disabled />
            <Toggle id="mode-fertility" label={t("onboarding.help.fertility")} note={t("onboarding.help.fertilityNote")} checked={fertility} onChange={setFertility} />
            <Toggle id="mode-ttc" label={t("onboarding.help.ttc")} note={t("onboarding.help.ttcNote")} checked={ttc} onChange={setTtc} />
          </div>
        )}
      </div>

      <div className="onb-actions">
        {error && (
          <p role="alert" className="onb-error">
            {t("app.failed", { message: error })}
          </p>
        )}
        {id === "look" && (
          <>
            <button type="button" className="button" onClick={next}>
              {t("onboarding.next")}
            </button>
            <button type="button" className="link-button" onClick={() => setRestoring(true)}>
              {t("restore.link")}
            </button>
          </>
        )}
        {id === "lastPeriod" && (
          <>
            <button type="button" className="button" onClick={next} disabled={!lastPeriod}>
              {t("onboarding.next")}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setLastPeriod(null);
                next();
              }}
            >
              {t("onboarding.notSure")}
            </button>
          </>
        )}
        {id === "cycle" && (
          <>
            <button
              type="button"
              className="button"
              onClick={() => {
                setTypicalCycle(cycle);
                next();
              }}
            >
              {t("onboarding.next")}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setTypicalCycle(null);
                next();
              }}
            >
              {t("onboarding.notSure")}
            </button>
          </>
        )}
        {id === "help" && (
          <button type="button" className="button" onClick={() => void finish()} disabled={busy}>
            {busy ? t("onboarding.finishing") : t("onboarding.finish")}
          </button>
        )}
      </div>
    </main>
  );
}
