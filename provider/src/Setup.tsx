import { useState, type FormEvent } from "react";
import { hex } from "@app/lib/bytes";
import type { Host } from "@app/platform";
import { FlowBack, Heading } from "@app/protect/FlowParts";
import { PinPad } from "@app/protect/PinPad";
import { newSigningKeyPair } from "@app/share";
import { Vault } from "@app/vault";
import { t } from "./i18n";
import { attestationProblem, nameProblem, writeMe, type AttestationProblem } from "./me";

/** Spelled out rather than built from the problem, so a new problem without words for it won't compile. */
const ATTESTATION_TEXT: Record<AttestationProblem, "setup.attestationFormat" | "setup.attestationNewer" | "setup.attestationUntrusted" | "setup.attestationExpired" | "setup.attestationKey"> = {
  format: "setup.attestationFormat",
  newer: "setup.attestationNewer",
  untrusted: "setup.attestationUntrusted",
  expired: "setup.attestationExpired",
  key: "setup.attestationKey",
};

export type SetupStart = "welcome" | "pin";
type Step = SetupStart | "name" | "identity" | "registration" | "again";

const failed = (e: unknown) => t("failed", { message: e instanceof Error ? e.message : String(e) });

/**
 * The first launch: what the app is for, the provider's name as patients will see it, the clinic's
 * own key and the registration a registry issues for it, and a PIN — which the tryout, keeping
 * nothing, goes without.
 *
 * The key is made here, before the registration, because a registration is issued *for* a key: the
 * registry vouches for this clinic on this device, so an attestation cannot be passed to another
 * (docs/DESIGN.md §9, provider registration). Without one, this app can show no pairing code at all,
 * which is the point — almanac makes no share for a provider nobody has vouched for.
 */
export function Setup({ host, vault: existing, from, tryout, onDone }: { host: Host; vault: Vault | null; from: SetupStart; tryout: boolean; onDone(vault: Vault): void }) {
  const [step, setStep] = useState<Step>(from);
  const [vault, setVault] = useState<Vault | null>(existing);
  const [name, setName] = useState("");
  // Made once, when this screen first opens, and written to the vault with the registration for it.
  const [identity] = useState(() => newSigningKeyPair());
  const [registration, setRegistration] = useState("");
  const [copied, setCopied] = useState(false);
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function saveName(e: FormEvent) {
    e.preventDefault();
    const problem = nameProblem(name);
    if (problem) return setError(t(`setup.${problem}`));
    setError(null);
    setStep("identity");
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(hex(identity.publicKey));
      setCopied(true);
    } catch {
      // No clipboard: the key is on screen to be copied by hand, which still works.
      setCopied(false);
    }
  }

  async function saveRegistration(e: FormEvent) {
    e.preventDefault();
    const problem = attestationProblem(registration, { identityKey: identity.publicKey, name: name.trim(), now: Date.now() });
    if (problem) return setError(t(ATTESTATION_TEXT[problem]));
    setBusy(true);
    setError(null);
    try {
      const v = vault ?? (await Vault.create(host));
      await writeMe(v, { name, identity: hex(identity.secretKey), attestation: registration.trim().toLowerCase().replace(/\s+/g, "") });
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
        <form className="steps" onSubmit={saveName}>
          <Heading>{t("setup.name")}</Heading>
          <p className="flow-note">{t("setup.nameNote")}</p>
          <div className="field">
            <label htmlFor="setup-name">{t("setup.nameLabel")}</label>
            <input id="setup-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="submit" className="button">
              {t("setup.next")}
            </button>
          </div>
        </form>
      )}
      {step === "identity" && (
        <section className="steps">
          <FlowBack onBack={() => setStep("name")} />
          <Heading>{t("setup.identity")}</Heading>
          <p className="flow-note">{t("setup.identityNote")}</p>
          <div className="field">
            <label htmlFor="setup-identity">{t("setup.identityLabel")}</label>
            <output id="setup-identity" className="identity-key">
              {hex(identity.publicKey)}
            </output>
          </div>
          <div className="flow-actions">
            <button type="button" className="button secondary" onClick={() => void copyKey()}>
              {copied ? t("setup.copied") : t("setup.copy")}
            </button>
            <button type="button" className="button" onClick={() => setStep("registration")}>
              {t("setup.next")}
            </button>
          </div>
        </section>
      )}
      {step === "registration" && (
        <form className="steps" onSubmit={(e) => void saveRegistration(e)}>
          <FlowBack onBack={() => setStep("identity")} />
          <Heading>{t("setup.registration")}</Heading>
          <p className="flow-note">{t("setup.registrationNote")}</p>
          <div className="field">
            <label htmlFor="setup-registration">{t("setup.attestationLabel")}</label>
            <textarea
              id="setup-registration"
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="submit" className="button" disabled={busy || !registration.trim()}>
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
