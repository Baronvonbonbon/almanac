import { useState } from "react";
import { t } from "../i18n";
import type { Host } from "../platform";
import type { CycleData } from "../shell/useCycle";
import { Toggle } from "../ui/Toggle";
import { VaultError, type Vault } from "../vault";
import { FlowBack, Heading, message } from "./FlowParts";
import { PinPad } from "./PinPad";
import { decoyRecords, saveProtection } from "./protection";
import { useCurrentPin } from "./useCurrentPin";
import "./protect.css";

type Step = "about" | "current" | "choose" | "again" | "options";

/**
 * The duress PIN (docs/DESIGN.md §6): what it does, then — after the current PIN — choosing it, filling
 * the second almanac, and the separate, plainly worded choice to erase the real one when it is used.
 */
export function DuressFlow({ vault, host, data, onFinish, onBack, onPin }: { vault: Vault; host: Host; data: CycleData; onFinish(message: string): void; onBack(): void; onPin(): void }) {
  const { pin: hasPin, duress: on } = data.privacy;
  const [step, setStep] = useState<Step>("about");
  const [intent, setIntent] = useState<"set" | "off">("set");
  const [chosen, setChosen] = useState("");
  const [fill, setFill] = useState(true);
  const [eraseReal, setEraseReal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useCurrentPin(vault, host);

  const begin = (next: "set" | "off") => {
    setIntent(next);
    setError(null);
    setStep("current");
  };

  async function afterCurrent(pin: string) {
    if (!(await current.check(pin))) return;
    if (intent === "set") return setStep("choose");
    setBusy(true);
    try {
      await vault.removeDuressPin();
      await saveProtection(vault, { duress: false });
      onFinish(t("duress.offDone"));
    } catch (e) {
      setBusy(false);
      setError(message(e));
      setStep("about");
    }
  }

  async function choose(pin: string) {
    setBusy(true);
    try {
      if (await vault.isPin(pin)) return setError(t("duress.isPin"));
      setChosen(pin);
      setError(null);
      setStep("again");
    } finally {
      setBusy(false);
    }
  }

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const usualCycle = data.prediction.cycleLength ?? data.settings.typicalCycle ?? 28;
      await vault.setDuressPin(chosen, { eraseRealOnUse: eraseReal, records: decoyRecords(data.settings, { fill, usualCycle, today: data.today }) });
      await saveProtection(vault, { duress: true });
      onFinish(t("duress.on"));
    } catch (e) {
      setBusy(false);
      setError(e instanceof VaultError && e.code === "pin-in-use" ? t("duress.isPin") : message(e));
      setStep("choose");
    }
  }

  return (
    <section className="steps">
      <FlowBack onBack={onBack} />
      {step === "about" && (
        <>
          <Heading>{t("duress.title")}</Heading>
          <p>{t("duress.about")}</p>
          <p className="flow-note">{t("duress.caution")}</p>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            {!hasPin && (
              <>
                <p className="flow-note">{t("duress.needsPin")}</p>
                <button type="button" className="button" onClick={onPin}>
                  {t("pin.turnOn")}
                </button>
              </>
            )}
            {hasPin && !on && (
              <button type="button" className="button" onClick={() => begin("set")}>
                {t("duress.setUp")}
              </button>
            )}
            {hasPin && on && (
              <>
                <p className="flow-note">{t("duress.changeNote")}</p>
                <button type="button" className="button" onClick={() => begin("set")}>
                  {t("duress.change")}
                </button>
                <button type="button" className="button secondary" onClick={() => begin("off")}>
                  {t("duress.off")}
                </button>
              </>
            )}
          </div>
        </>
      )}
      {step === "current" && (
        <PinPad
          key="current"
          title={t("pin.enter")}
          note={t("pin.enterNote")}
          error={current.error}
          busy={current.busy || busy}
          busyText={t("privacy.working")}
          until={current.until}
          onPin={(pin) => void afterCurrent(pin)}
        />
      )}
      {step === "choose" && (
        <PinPad key="choose" title={t("duress.choose")} note={t("duress.chooseNote")} error={error} busy={busy} busyText={t("privacy.working")} onPin={(pin) => void choose(pin)} />
      )}
      {step === "again" && (
        <PinPad
          key="again"
          title={t("duress.again")}
          onPin={(pin) => {
            if (pin === chosen) return setStep("options");
            setError(t("pin.mismatch"));
            setStep("choose");
          }}
        />
      )}
      {step === "options" && (
        <>
          <Heading>{t("duress.options")}</Heading>
          <div className="toggles">
            <Toggle id="duress-fill" label={t("duress.fill")} note={t("duress.fillNote")} checked={fill} onChange={setFill} />
            <Toggle id="duress-erase" label={t("duress.erase")} note={t("duress.eraseNote")} checked={eraseReal} onChange={setEraseReal} />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void turnOn()}>
              {busy ? t("privacy.working") : t("duress.turnOn")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
