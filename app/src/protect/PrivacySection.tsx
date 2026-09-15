import { isStale } from "../backup/record";
import { t } from "../i18n";
import { dateOf } from "../i18n/format";
import { isLive } from "../sharing/records";
import type { CycleData } from "../shell/useCycle";
import { Row } from "../ui/Row";

export type PrivacyFlow = "pin" | "duress" | "backup" | "sharing" | "erase";

/** docs/DESIGN.md §3: the lock, the duress PIN, the backup, sharing and erase — each in one plain sentence. */
export function PrivacySection({ data, onOpen, onLock }: { data: CycleData; onOpen(flow: PrivacyFlow): void; onLock(): void }) {
  const { pin, duress, backup, shares } = data.privacy;
  const backupStatus = !backup
    ? t("privacy.backupNone")
    : !backup.checked
      ? t("privacy.backupUnchecked")
      : !backup.copiedAt
        ? t("privacy.backupNotCopied")
        : isStale(backup, data.entries)
          ? t("privacy.backupStale", { date: dateOf(backup.copiedAt) })
          : t("privacy.backupCopied", { date: dateOf(backup.copiedAt) });
  const live = shares.filter((r) => isLive(r, Date.now()));
  const sharingStatus = !live.length ? t("sharing.rowNone") : live.length === 1 ? t("sharing.rowOne", { name: live[0].provider.name }) : t("sharing.rowMany", { n: live.length });

  return (
    <section className="settings-group" aria-labelledby="set-privacy">
      <h2 id="set-privacy">{t("privacy.title")}</h2>
      <p className="settings-note">{t("privacy.note")}</p>
      <div className="rows">
        <Row label={t("privacy.pin")} value={pin ? t("privacy.pinOn") : t("privacy.pinOff")} onClick={() => onOpen("pin")} />
        <Row label={t("privacy.duress")} value={!pin ? t("privacy.duressNeedsPin") : duress ? t("privacy.duressOn") : t("privacy.duressOff")} onClick={() => onOpen("duress")} />
        <Row label={t("privacy.backup")} value={backupStatus} onClick={() => onOpen("backup")} />
        <Row label={t("sharing.row")} value={sharingStatus} onClick={() => onOpen("sharing")} />
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
