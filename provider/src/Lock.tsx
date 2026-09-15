import { useEffect, useState } from "react";
import type { Host } from "@app/platform";
import { PinPad } from "@app/protect/PinPad";
import { readTries, rightPin, Vault, wrongPin } from "@app/vault";
import { ConfirmErase } from "./ConfirmErase";
import { t } from "./i18n";

/** The lock screen, as almanac's: the name and a keypad, and a way out for a forgotten PIN. Wrong PINs count across launches, with growing waits. */
export function Lock({ host, onOpen, onErased }: { host: Host; onOpen(vault: Vault): void; onErased(): void }) {
  const [until, setUntil] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    void readTries(host).then((tries) => setUntil(tries.until));
  }, [host]);

  async function unlock(pin: string) {
    setBusy(true);
    setError(null);
    try {
      const vault = await Vault.unlock(host, pin);
      if (vault) {
        await rightPin(host);
        onOpen(vault);
        return;
      }
      setUntil((await wrongPin(host)).until);
      setError(t("lock.wrong"));
    } catch (e) {
      setError(t("failed", { message: e instanceof Error ? e.message : String(e) }));
    }
    setBusy(false);
  }

  return (
    <main className="lock">
      <span className="wordmark">{t("wordmark")}</span>
      {forgot ? (
        <ConfirmErase host={host} title={t("lock.forgot")} body={t("lock.forgotBody")} confirm={t("lock.eraseAndStart")} cancel={t("lock.back")} onErased={onErased} onCancel={() => setForgot(false)} />
      ) : (
        <>
          <PinPad title={t("lock.title")} error={error} busy={busy} busyText={t("lock.opening")} until={until} onPin={(pin) => void unlock(pin)} />
          <button type="button" className="link-button" onClick={() => setForgot(true)}>
            {t("lock.forgot")}
          </button>
        </>
      )}
    </main>
  );
}
