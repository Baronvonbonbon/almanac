import { useState, type FormEvent } from "react";
import type { Host } from "@app/platform";
import { Heading } from "@app/protect/FlowParts";
import { PinPad } from "@app/protect/PinPad";
import { Vault } from "@app/vault";
import { t } from "./i18n";
import { nameProblem, writeMe } from "./me";

export type SetupStart = "welcome" | "pin";
type Step = SetupStart | "name" | "again";

const failed = (e: unknown) => t("failed", { message: e instanceof Error ? e.message : String(e) });

/**
 * The first launch: what the app is for, the provider's name as patients will see it, and a PIN —
 * which the tryout, keeping nothing, goes without.
 */
export function Setup({ host, vault: existing, from, tryout, onDone }: { host: Host; vault: Vault | null; from: SetupStart; tryout: boolean; onDone(vault: Vault): void }) {
  const [step, setStep] = useState<Step>(from);
  const [vault, setVault] = useState<Vault | null>(existing);
  const [name, setName] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const problem = nameProblem(name);
    if (problem) return setError(t(`setup.${problem}`));
    setBusy(true);
    setError(null);
    try {
      const v = vault ?? (await Vault.create(host));
      await writeMe(v, { name });
      setVault(v);
      if (tryout) onDone(v);
      else setStep("pin");
    } catch (e) {
      setError(failed(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPin(pin: string) {
    if (pin !== first) {
      setError(t("setup.mismatch"));
      setStep("pin");
      return;
    }
    setBusy(true);
    try {
      await vault!.setPin(pin);
      onDone(vault!);
    } catch (e) {
      setError(failed(e));
      setBusy(false);
    }
  }

  return (
    <main>
      {step === "welcome" && (
        <section className="steps">
          <Heading>{t("setup.title")}</Heading>
          <p>{t("setup.about")}</p>
          <div className="flow-actions">
            <button type="button" className="button" onClick={() => setStep("name")}>
              {t("setup.start")}
            </button>
          </div>
        </section>
      )}
      {step === "name" && (
        <form className="steps" onSubmit={(e) => void saveName(e)}>
          <Heading>{t("setup.name")}</Heading>
          <p className="flow-note">{t("setup.nameNote")}</p>
          <div className="field">
            <label htmlFor="setup-name">{t("setup.nameLabel")}</label>
            <input id="setup-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="submit" className="button" disabled={busy}>
              {busy ? t("setup.working") : t("setup.next")}
            </button>
          </div>
        </form>
      )}
      {step === "pin" && (
        <PinPad
          key="pin"
          title={t("setup.pin")}
          note={t("setup.pinNote")}
          error={error}
          onPin={(pin) => {
            setFirst(pin);
            setError(null);
            setStep("again");
          }}
        />
      )}
      {step === "again" && <PinPad key="again" title={t("setup.again")} error={error} busy={busy} busyText={t("setup.working")} onPin={(pin) => void confirmPin(pin)} />}
    </main>
  );
}
