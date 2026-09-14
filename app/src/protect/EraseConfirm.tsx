import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type { Host } from "../platform";
import { Vault } from "../vault";
import "./protect.css";

/** Erase everything, after one plain question. Used from Privacy, and from the lock screen for a forgotten PIN. */
export function EraseConfirm({
  host,
  body = t("erase.body"),
  confirm = t("erase.confirm"),
  cancel = t("erase.keep"),
  onErased,
  onCancel,
}: {
  host: Host;
  body?: string;
  confirm?: string;
  cancel?: string;
  onErased(): void;
  onCancel(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await Vault.erase(host);
      onErased();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section className="confirm" aria-labelledby="erase-title">
      <h1 id="erase-title" tabIndex={-1} ref={heading}>
        {t("erase.title")}
      </h1>
      <p>{body}</p>
      {error && <p role="alert">{t("app.failed", { message: error })}</p>}
      <div className="flow-actions">
        <button type="button" className="button" disabled={busy} onClick={() => void erase()}>
          {busy ? t("erase.erasing") : confirm}
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
          {cancel}
        </button>
      </div>
    </section>
  );
}
