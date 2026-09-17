import { useRef, useState, type FormEvent } from "react";
import { t } from "../i18n";
import type { Host } from "../platform";
import { Heading, message } from "../protect/FlowParts";
import type { Vault } from "../vault";
import { restoreFromBulletin } from "./bulletin";
import { parseCode } from "./code";
import { BackupError, openBackup, readBackupText } from "./format";
import { backupProblemText, codeProblemText } from "./messages";
import { restoreSnapshot } from "./snapshot";
import "../protect/protect.css";

/**
 * Onboarding's other way in (docs/DESIGN.md §8): a copied backup — pasted, or read from a file the
 * user picks (P4) — and the backup code. It works on any phone and any account.
 *
 * With nothing pasted, the code alone is enough where backups were kept online: it gives `TB`, the
 * newest pointer on it names the backup, and `KB` opens it. Same code, same answer, no copy to find.
 */
export function RestoreView({ host, onDone, onBack }: { host: Host; onDone(vault: Vault): void; onBack(): void }) {
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const canGoOnline = !!host.blobs && !!host.statements;

  async function restore(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parseCode(code);
    if ("problem" in parsed) return setError(codeProblemText(parsed.problem));
    const copied = (file?.text ?? pasted).trim();
    setBusy(true);
    setLooking(!copied);
    try {
      if (!copied) {
        onDone((await restoreFromBulletin(host, code)).vault);
        return;
      }
      const snapshot = openBackup(parsed.entropy, readBackupText(copied));
      onDone(await restoreSnapshot(host, snapshot));
    } catch (err) {
      setError(err instanceof BackupError ? backupProblemText(err.kind) : message(err));
      setBusy(false);
      setLooking(false);
    }
  }

  return (
    <form className="onb" onSubmit={(e) => void restore(e)}>
      <div className="onb-top">
        <button type="button" className="icon-button" onClick={onBack} aria-label={t("restore.back")}>
          ‹
        </button>
      </div>
      <div className="onb-body">
        <Heading className="onb-title">{t("restore.title")}</Heading>
        <p className="onb-lead">{t("restore.body")}</p>
        <div className="field">
          <label htmlFor="restore-backup">{t("restore.backup")}</label>
          {file ? (
            <p className="flow-note">{t("restore.fileRead", { name: file.name })}</p>
          ) : (
            <textarea id="restore-backup" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={t("restore.backupPlaceholder")} spellCheck={false} />
          )}
          <button type="button" className="link-button flow-back" onClick={() => picker.current?.click()}>
            {t("restore.file")}
          </button>
          {canGoOnline && (
            <p className="flow-note">
              <strong>{t("restore.online")}</strong> {t("restore.onlineNote")}
            </p>
          )}
          <input
            ref={picker}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void picked.text().then((text) => setFile({ name: picked.name, text }));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="restore-code">{t("restore.code")}</label>
          <input id="restore-code" className="code-input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="onb-actions">
        <button type="submit" className="button" disabled={busy || !code.trim() || (!canGoOnline && !(file || pasted.trim()))}>
          {looking ? t("restore.looking") : busy ? t("restore.restoring") : t("restore.restore")}
        </button>
      </div>
    </form>
  );
}
