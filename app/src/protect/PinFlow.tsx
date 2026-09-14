import { useState } from "react";
import { t } from "../i18n";
import type { Host } from "../platform";
import { VaultError, type Vault } from "../vault";
import { FlowBack, Heading, message } from "./FlowParts";
import { PinPad } from "./PinPad";
import { saveProtection } from "./protection";
import { useCurrentPin } from "./useCurrentPin";
import "./protect.css";

type Step = "intro" | "current" | "menu" | "choose" | "again" | "off";

/** Turning the PIN on — or, after the current PIN, changing it or turning it off. */
export function PinFlow({ vault, host, hasPin, onFinish, onBack }: { vault: Vault; host: Host; hasPin: boolean; onFinish(message: string): void; onBack(): void }) {
  const [step, setStep] = useState<Step>(hasPin ? "current" : "intro");
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useCurrentPin(vault, host);

  async function confirm(pin: string) {
    if (pin !== chosen) {
      setError(t("pin.mismatch"));
      return setStep("choose");
    }
    setBusy(true);
    try {
      await vault.setPin(pin);
      onFinish(hasPin ? t("pin.changed") : t("pin.on"));
    } catch (e) {
      setBusy(false);
      setError(e instanceof VaultError && e.code === "pin-in-use" ? t("pin.isDuress") : message(e));
      setStep("choose");
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await vault.setPin(null);
      await saveProtection(vault, { duress: false });
      onFinish(t("pin.offDone"));
    } catch (e) {
      setBusy(false);
      setError(message(e));
    }
  }

  return (
    <section className="steps">
      <FlowBack onBack={onBack} />
      {step === "intro" && (
        <>
          <Heading>{t("privacy.pin")}</Heading>
          <p>{t("pin.turnOnNote")}</p>
          <p className="flow-note">{t("pin.forgetNote")}</p>
          <div className="flow-actions">
            <button type="button" className="button" onClick={() => setStep("choose")}>
              {t("pin.turnOn")}
            </button>
          </div>
        </>
      )}
      {step === "current" && (
        <PinPad
          key="current"
          title={t("pin.enter")}
          note={t("pin.enterNote")}
          error={current.error}
          busy={current.busy}
          busyText={t("privacy.working")}
          until={current.until}
          onPin={async (pin) => {
            if (await current.check(pin)) setStep("menu");
          }}
        />
      )}
      {step === "menu" && (
        <>
          <Heading>{t("privacy.pin")}</Heading>
          <p>{t("privacy.pinOn")}</p>
          <div className="flow-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                setError(null);
                setStep("choose");
              }}
            >
              {t("pin.change")}
            </button>
            <button type="button" className="button secondary" onClick={() => setStep("off")}>
              {t("pin.off")}
            </button>
          </div>
        </>
      )}
      {step === "choose" && (
        <PinPad
          key="choose"
          title={t("pin.choose")}
          note={t("pin.chooseNote")}
          error={error}
          onPin={(pin) => {
            setChosen(pin);
            setError(null);
            setStep("again");
          }}
        />
      )}
      {step === "again" && <PinPad key="again" title={t("pin.again")} busy={busy} busyText={t("privacy.working")} onPin={(pin) => void confirm(pin)} />}
      {step === "off" && (
        <>
          <Heading>{t("pin.off")}</Heading>
          <p>{t("pin.offNote")}</p>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void turnOff()}>
              {busy ? t("privacy.working") : t("pin.off")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
