import { useState } from "react";
import type { Host } from "@app/platform";
import { Heading } from "@app/protect/FlowParts";
import { Vault } from "@app/vault";
import { t } from "./i18n";

/** Before erasing everything on this device — which can't be undone. */
export function ConfirmErase({
  host,
  title = t("settings.erase"),
  body = t("settings.eraseBody"),
  confirm = t("settings.eraseConfirm"),
  cancel = t("settings.keep"),
  onErased,
  onCancel,
}: {
  host: Host;
  title?: string;
  body?: string;
  confirm?: string;
  cancel?: string;
  onErased(): void;
  onCancel(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await Vault.erase(host);
      onErased();
    } catch (e) {
      setError(t("failed", { message: e instanceof Error ? e.message : String(e) }));
      setBusy(false);
    }
  }

  return (
    <section className="confirm">
      <Heading>{title}</Heading>
      <p>{body}</p>
      {error && <p role="alert">{error}</p>}
      <div className="flow-actions">
        <button type="button" className="button" disabled={busy} onClick={() => void erase()}>
          {busy ? t("settings.erasing") : confirm}
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
          {cancel}
        </button>
      </div>
    </section>
  );
}
