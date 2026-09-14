import { isStale } from "../backup/record";
import { t } from "../i18n";
import { dateOf } from "../i18n/format";
import type { CycleData } from "../shell/useCycle";

export type PrivacyFlow = "pin" | "duress" | "backup" | "erase";

/** docs/DESIGN.md §3: the lock, the duress PIN, the backup and erase — each in one plain sentence. */
export function PrivacySection({ data, onOpen, onLock }: { data: CycleData; onOpen(flow: PrivacyFlow): void; onLock(): void }) {
  const { pin, duress, backup } = data.privacy;
  const backupStatus = !backup
    ? t("privacy.backupNone")
    : !backup.checked
      ? t("privacy.backupUnchecked")
      : !backup.copiedAt
        ? t("privacy.backupNotCopied")
        : isStale(backup, data.entries)
          ? t("privacy.backupStale", { date: dateOf(backup.copiedAt) })
          : t("privacy.backupCopied", { date: dateOf(backup.copiedAt) });

  return (
    <section className="settings-group" aria-labelledby="set-privacy">
      <h2 id="set-privacy">{t("privacy.title")}</h2>
      <p className="settings-note">{t("privacy.note")}</p>
      <div className="rows">
        <Row label={t("privacy.pin")} value={pin ? t("privacy.pinOn") : t("privacy.pinOff")} onClick={() => onOpen("pin")} />
        <Row label={t("privacy.duress")} value={!pin ? t("privacy.duressNeedsPin") : duress ? t("privacy.duressOn") : t("privacy.duressOff")} onClick={() => onOpen("duress")} />
        <Row label={t("privacy.backup")} value={backupStatus} onClick={() => onOpen("backup")} />
        <Row label={t("privacy.erase")} value={t("privacy.eraseNote")} onClick={() => onOpen("erase")} />
      </div>
      {pin && (
        <button type="button" className="button secondary" onClick={onLock}>
          {t("privacy.lockNow")}
        </button>
      )}
    </section>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick(): void }) {
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className="row-text">
        <span className="row-label">{label}</span>
        <span className="row-value">{value}</span>
      </span>
      <span className="row-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
