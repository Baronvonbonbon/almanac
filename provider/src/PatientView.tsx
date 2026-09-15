import { useState } from "react";
import { dateOf } from "@app/i18n/format";
import type { Host } from "@app/platform";
import { FlowBack, Heading } from "@app/protect/FlowParts";
import type { Vault } from "@app/vault";
import { ask, TooManyWaiting } from "./asking";
import { t } from "./i18n";
import { forgetPatient, type Patient } from "./patients";
import { patientStatus } from "./PatientList";
import { patientName } from "./Provider";
import type { Opening } from "./visit";

/** One patient: where their share stands; View while it is open; otherwise, ask to see it again; and forget them. */
export function PatientView({
  host,
  vault,
  patient: p,
  opening,
  now,
  tryout,
  onView,
  onChanged,
  onForgotten,
  onBack,
}: {
  host: Host;
  vault: Vault;
  patient: Patient;
  opening: Opening | null;
  now: number;
  tryout: boolean;
  onView(): void;
  onChanged(): void;
  onForgotten(): void;
  onBack(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);

  async function askAgain() {
    setBusy(true);
    setError(null);
    try {
      await ask(host, vault, p.id);
      onChanged();
    } catch (e) {
      setError(e instanceof TooManyWaiting ? t("patient.tooMany") : t("patient.askFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    setBusy(true);
    try {
      await forgetPatient(vault, p.id);
      onForgotten();
    } catch (e) {
      setError(t("failed", { message: e instanceof Error ? e.message : String(e) }));
      setBusy(false);
    }
  }

  if (forgetting)
    return (
      <section className="confirm">
        <Heading>{t("patient.forgetTitle")}</Heading>
        <p>{t("patient.forgetBody")}</p>
        {error && <p role="alert">{error}</p>}
        <div className="flow-actions">
          <button type="button" className="button" disabled={busy} onClick={() => void forget()}>
            {t("patient.forgetConfirm")}
          </button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setForgetting(false)}>
            {t("patient.keep")}
          </button>
        </div>
      </section>
    );

  return (
    <section className="steps">
      <FlowBack onBack={onBack} />
      <Heading>
        <bdi>{patientName(p)}</bdi>
      </Heading>
      <p className="flow-note">{t("patient.read", { date: dateOf(p.read), ends: dateOf(p.ends) })}</p>
      <p className="patient-status">{patientStatus(p, opening, now)}</p>
      {opening ? (
        <div className="flow-actions">
          <button type="button" className="button" onClick={onView}>
            {t("patient.view")}
          </button>
        </div>
      ) : tryout ? (
        <p className="flow-note">{t("patient.tryoutAsk")}</p>
      ) : (
        <>
          <p className="flow-note">{t("patient.askNote")}</p>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="button" className={p.asking ? "button secondary" : "button"} disabled={busy} onClick={() => void askAgain()}>
              {busy ? t("patient.asking") : p.asking ? t("patient.askAgain") : t("patient.ask")}
            </button>
          </div>
        </>
      )}
      <button type="button" className="link-button flow-back" onClick={() => setForgetting(true)}>
        {t("patient.forget")}
      </button>
    </section>
  );
}
