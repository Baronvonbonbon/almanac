import { useState, type FormEvent } from "react";
import { t } from "../i18n";
import { dateOf } from "../i18n/format";
import type { Host } from "../platform";
import { CodeBox, FlowBack, Heading, message } from "../protect/FlowParts";
import { PinPad } from "../protect/PinPad";
import { useCurrentPin } from "../protect/useCurrentPin";
import type { CycleData } from "../shell/useCycle";
import type { Vault } from "../vault";
import { backUpToBulletin } from "./bulletin";
import { parseCode } from "./code";
import { BackupError } from "./format";
import { backupProblemText, codeProblemText } from "./messages";
import { backupAsText, isStale, saveBackup, startBackup, type BackupRecord } from "./record";
import "../protect/protect.css";

type Step = "intro" | "code" | "check" | "main" | "current" | "online";

/**
 * The copied backup (docs/DESIGN.md §8): a backup code, shown once and checked against what was
 * written down, then the backup itself copied as text — and copied again when it falls behind.
 */
export function BackupFlow({ vault, host, data, onBack, onChanged, onNotice }: { vault: Vault; host: Host; data: CycleData; onBack(): void; onChanged(): void; onNotice(message: string): void }) {
  const [record, setRecord] = useState<BackupRecord | null>(data.privacy.backup);
  const [step, setStep] = useState<Step>(!record ? "intro" : !record.checked ? "code" : "main");
  const [typed, setTyped] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [byHand, setByHand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useCurrentPin(vault, host);

  async function keep(next: BackupRecord) {
    await saveBackup(vault, next);
    setRecord(next);
    onChanged();
  }

  async function start() {
    setBusy(true);
    try {
      setRecord(await startBackup(vault));
      onChanged();
      setStep("code");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function check(e: FormEvent) {
    e.preventDefault();
    const r = parseCode(typed);
    if ("problem" in r) return setError(codeProblemText(r.problem));
    if (r.code !== record!.code) return setError(t("backup.mismatch"));
    setError(null);
    await keep({ ...record!, checked: true });
    setStep("main");
  }

  async function copy() {
    setBusy(true);
    setError(null);
    setByHand(null);
    try {
      const now = Date.now();
      const text = await backupAsText(vault, record!, t("backup.heading", { date: dateOf(now, true) }), now);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // P4 found copying works inside the app; where it doesn't, the text is shown to copy by hand.
        return setByHand(text);
      }
      await keep({ ...record!, copiedAt: now });
      onNotice(t("backup.copied"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Keeping it online (DESIGN §8). The notice comes first and only once: agreeing is what sets
   * `bulletinOk`, and nothing — not this button, not the schedule — uploads before it is set (R7).
   */
  async function backUpOnline() {
    setBusy(true);
    setError(null);
    try {
      const now = Date.now();
      const agreed: BackupRecord = record!.bulletinOk ? record! : { ...record!, bulletinOk: now };
      await keep(await backUpToBulletin(host, vault, agreed, now));
      onNotice(t("backup.onlineDone"));
    } catch (e) {
      setError(e instanceof BackupError ? backupProblemText(e.kind) : message(e));
    } finally {
      setBusy(false);
      setStep("main");
    }
  }

  const status = !record?.copiedAt
    ? t("backup.notCopied")
    : `${t("backup.copiedOn", { date: dateOf(record.copiedAt) })} ${isStale(record, data.entries) ? t("backup.stale") : t("backup.fresh")}`;
  // Not offered where there is nowhere to put one — the web tryout has neither.
  const canGoOnline = !!host.blobs && !!host.statements;
  const onlineStatus = record?.bulletin ? t("backup.onlineOn", { date: dateOf(record.bulletin.at) }) : t("backup.onlineNever");

  return (
    <section className="steps">
      <FlowBack onBack={onBack} />
      {step === "intro" && (
        <>
          <Heading>{t("backup.title")}</Heading>
          <p>{t("backup.about")}</p>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void start()}>
              {t("backup.start")}
            </button>
          </div>
        </>
      )}
      {step === "code" && record && (
        <>
          <Heading>{t("backup.code")}</Heading>
          <CodeBox code={record.code} />
          <p className="flow-note">{t("backup.codeNote")}</p>
          <div className="flow-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                setTyped("");
                setError(null);
                setStep("check");
              }}
            >
              {t("backup.written")}
            </button>
          </div>
        </>
      )}
      {step === "check" && (
        <form onSubmit={(e) => void check(e)} className="steps">
          <Heading>{t("backup.check")}</Heading>
          <p className="flow-note">{t("backup.checkNote")}</p>
          <div className="field">
            <label htmlFor="backup-check">{t("restore.code")}</label>
            <input id="backup-check" className="code-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="submit" className="button">
              {t("backup.checkButton")}
            </button>
            <button type="button" className="button secondary" onClick={() => setStep("code")}>
              {t("backup.lookAgain")}
            </button>
          </div>
        </form>
      )}
      {step === "main" && record && (
        <>
          <Heading>{t("backup.copy")}</Heading>
          <p>{t("backup.copyNote")}</p>
          <p className="flow-note">{status}</p>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void copy()}>
              {busy ? t("privacy.working") : t("backup.copyButton")}
            </button>
          </div>
          {byHand && (
            <div className="field">
              <p role="alert">{t("backup.copyFailed")}</p>
              <textarea id="backup-text" readOnly value={byHand} onFocus={(e) => e.currentTarget.select()} aria-label={t("backup.copy")} />
              <button type="button" className="button secondary" onClick={() => void keep({ ...record, copiedAt: Date.now() }).then(() => setByHand(null))}>
                {t("backup.copiedByHand")}
              </button>
            </div>
          )}
          {canGoOnline && (
            <section className="settings-group" aria-labelledby="backup-online">
              <h2 id="backup-online">{t("backup.online")}</h2>
              {record.bulletinOk ? (
                <>
                  <p className="flow-note">{onlineStatus}</p>
                  <p className="flow-note">{t("backup.onlineLasts")}</p>
                  <div className="flow-actions">
                    <button type="button" className="button secondary" disabled={busy} onClick={() => void backUpOnline()}>
                      {busy ? t("privacy.working") : t("backup.onlineNow")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="flow-note">{t("backup.onlineNote")}</p>
                  <div className="flow-actions">
                    <button type="button" className="button secondary" onClick={() => setStep("online")}>
                      {t("backup.online")}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          <button
            type="button"
            className="link-button flow-back"
            onClick={() => (showCode ? setShowCode(false) : data.privacy.pin ? setStep("current") : setShowCode(true))}
          >
            {showCode ? t("backup.hideCode") : t("backup.showCode")}
          </button>
          {showCode && <CodeBox code={record.code} />}
        </>
      )}
      {step === "online" && record && (
        <>
          <Heading>{t("backup.onlineAbout")}</Heading>
          <p>{t("backup.onlineNotice")}</p>
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void backUpOnline()}>
              {busy ? t("privacy.working") : t("backup.onlineAgree")}
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => setStep("main")}>
              {t("backup.onlineNotNow")}
            </button>
          </div>
        </>
      )}
      {step === "current" && (
        <PinPad
          key="current"
          title={t("pin.enter")}
          error={current.error}
          busy={current.busy}
          busyText={t("privacy.working")}
          until={current.until}
          onPin={async (pin) => {
            if (!(await current.check(pin))) return;
            setShowCode(true);
            setStep("main");
          }}
        />
      )}
    </section>
  );
}
