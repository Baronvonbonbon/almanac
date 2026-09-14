import { useEffect, useState } from "react";
import { t } from "../i18n";
import type { Host } from "../platform";
import { readTries, rightPin, wrongPin, type Vault } from "../vault";

/**
 * Asking for the current PIN before protection changes — so someone who picks up an unlocked phone
 * can't turn the PIN off. Wrong answers count with those on the lock screen.
 */
export function useCurrentPin(vault: Vault, host: Host) {
  const [until, setUntil] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void readTries(host).then((tries) => setUntil(tries.until));
  }, [host]);

  async function check(pin: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      if (await vault.isPin(pin)) {
        await rightPin(host);
        return true;
      }
      setUntil((await wrongPin(host)).until);
      setError(t("pin.wrong"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { until, error, busy, check };
}
