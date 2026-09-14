import { useEffect, useState } from "react";
import { t } from "../i18n";
import type { Host } from "../platform";
import { readTries, rightPin, Vault, wrongPin } from "../vault";
import { EraseConfirm } from "./EraseConfirm";
import { PinPad } from "./PinPad";
import "./protect.css";

/**
 * What almanac shows when a PIN is set: the wordmark and a keypad, nothing else. Whichever vault the
 * PIN opens — the real one or the decoy — opens the same way. Wrong PINs count across launches, with
 * growing waits (docs/DESIGN.md §6).
 */
export function LockScreen({ host, onOpen, onErased }: { host: Host; onOpen(vault: Vault): void; onErased(): void }) {
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
      setError(t("app.failed", { message: e instanceof Error ? e.message : String(e) }));
    }
    setBusy(false);
  }

  return (
    <main className="lock">
      <span className="wordmark">{t("appName")}</span>
      {forgot ? (
        <EraseConfirm host={host} body={t("lock.forgotBody")} confirm={t("lock.eraseAndStart")} cancel={t("lock.back")} onErased={onErased} onCancel={() => setForgot(false)} />
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
