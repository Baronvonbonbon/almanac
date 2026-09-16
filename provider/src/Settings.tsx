import { useState, type FormEvent } from "react";
import type { Host } from "@app/platform";
import { FlowBack, Heading } from "@app/protect/FlowParts";
import { PinPad } from "@app/protect/PinPad";
import { useCurrentPin } from "@app/protect/useCurrentPin";
import { Row } from "@app/ui/Row";
import type { Vault } from "@app/vault";
import { ConfirmErase } from "./ConfirmErase";
import { t } from "./i18n";
import { nameProblem, writeMe, type Me } from "./me";

type Step = "list" | "current" | "new" | "again" | "erase";

/** The provider's name, Lock now, Change PIN and Erase everything. The tryout, with no PIN, has the name and Erase. */
export function Settings({
  host,
  vault,
  tryout,
  me,
  onMe,
  onNotice,
  onLock,
  onErased,
  onDone,
}: {
  host: Host;
  vault: Vault;
  tryout: boolean;
  me: Me;
  onMe(me: Me): void;
  onNotice(message: string): void;
  onLock(): void;
  onErased(): void;
  onDone(): void;
}) {
  const [step, setStep] = useState<Step>("list");
  const [name, setName] = useState(me.name);
  const [error, setError] = useState<string | null>(null);
  const [first, setFirst] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useCurrentPin(vault, host);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const problem = nameProblem(name);
    if (problem) return setError(t(`setup.${problem}`));
    setError(null);
    // Only the name changes here. The identity key and the attestation are what the registry vouched
    // for, and rewriting `me` without them would unregister the clinic by way of renaming it.
    await writeMe(vault, { ...me, name });
    onMe({ ...me, name: name.trim() });
    onNotice(t("settings.saved"));
  }

  async function newPin(pin: string) {
    if (pin !== first) {
      setError(t("setup.mismatch"));
      setStep("new");
      return;
    }
    setBusy(true);
    try {
      await vault.setPin(pin);
      onNotice(t("settings.changed"));
      setStep("list");
    } catch (e) {
      setError(t("failed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  if (step === "erase") return <ConfirmErase host={host} onErased={onErased} onCancel={() => setStep("list")} />;
  if (step === "current")
    return (
      <section className="steps">
        <FlowBack onBack={() => setStep("list")} />
        <PinPad
          key="current"
          title={t("settings.current")}
          error={current.error}
          busy={current.busy}
          until={current.until}
          onPin={async (pin) => {
            if (!(await current.check(pin))) return;
            setError(null);
            setStep("new");
          }}
        />
      </section>
    );
  if (step === "new")
    return (
      <section className="steps">
        <FlowBack onBack={() => setStep("list")} />
        <PinPad
          key="new"
          title={t("settings.newPin")}
          error={error}
          onPin={(pin) => {
            setFirst(pin);
            setError(null);
            setStep("again");
          }}
        />
      </section>
    );
  if (step === "again")
    return (
      <section className="steps">
        <FlowBack onBack={() => setStep("list")} />
        <PinPad key="again" title={t("settings.again")} error={error} busy={busy} onPin={(pin) => void newPin(pin)} />
      </section>
    );

  return (
    <section className="settings" aria-labelledby="provider-settings">
      <div className="settings-head">
        <Heading>
          <span id="provider-settings">{t("settings.title")}</span>
        </Heading>
        <button type="button" className="link-button" onClick={onDone}>
          {t("settings.done")}
        </button>
      </div>
      <form className="settings-group" onSubmit={(e) => void saveName(e)}>
        <div className="field">
          <label htmlFor="settings-name">{t("settings.name")}</label>
          <input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-describedby="settings-name-note" />
          <p className="settings-note" id="settings-name-note">
            {t("settings.nameNote")}
          </p>
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="button secondary" disabled={name.trim() === me.name}>
          {t("settings.save")}
        </button>
      </form>
      <div className="rows">
        {!tryout && vault.locked && <Row label={t("settings.changePin")} value="" onClick={() => setStep("current")} />}
        <Row label={t("settings.erase")} value={t("settings.eraseNote")} onClick={() => setStep("erase")} />
      </div>
      {!tryout && vault.locked && (
        <button type="button" className="button secondary" onClick={onLock}>
          {t("settings.lock")}
        </button>
      )}
    </section>
  );
}
