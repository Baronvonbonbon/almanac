import { useEffect, useState } from "react";
import { t } from "../i18n";
import { sizeOf } from "../i18n/format";
import type { BackupStage } from "./bulletin";

/** After this many seconds, say that a long wait is normal rather than leaving it to be guessed at. */
const SLOW_AFTER = 20;

export interface Uploading {
  at: BackupStage;
  bytes?: number;
  since: number;
}

/**
 * How far a Bulletin backup has got, and for how long (docs/DESIGN.md §8).
 *
 * The host's upload is a single call with no progress in it — `PreimageManager.submit` resolves once,
 * with the key — so this names the stage it has reached rather than inventing a percentage that would
 * only be a guess dressed up as a measurement. The seconds are real, and they matter: P6c measured
 * 1 MiB at 41 s on a phone, and a screen that says nothing for that long reads as broken.
 */
export function UploadStatus({ at, bytes, since }: Uploading) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  const text = at === "sealing" ? t("backup.stageSealing") : at === "sending" ? t("backup.stageSending", { size: sizeOf(bytes ?? 0) }) : t("backup.stagePointing");
  return (
    <p className="flow-note" role="status">
      {text} {t("backup.stageFor", { n: seconds })}
      {seconds >= SLOW_AFTER && ` ${t("backup.stageSlow")}`}
    </p>
  );
}
