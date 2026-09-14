import { useEffect, useState } from "react";
import { t } from "./i18n";
import { resetLook } from "./look";
import { Onboarding } from "./onboarding/Onboarding";
import { memoryHost, type Host } from "./platform";
import { LockScreen } from "./protect/LockScreen";
import { Shell } from "./shell/Shell";
import { Starting } from "./ui/Starting";
import { Vault } from "./vault";
import "./ui/ui.css";

type Screen =
  | { kind: "starting" }
  | { kind: "onboarding"; host: Host }
  | { kind: "home"; vault: Vault; host: Host }
  | { kind: "locked"; host: Host }
  | { kind: "failed"; message: string };

type Started = { screen: Screen; tryout: boolean };

/** docs/DESIGN.md §6: with a PIN set, almanac locks once it has been out of sight this long. */
export const AUTO_LOCK_MS = 60_000;

/**
 * Where almanac opens: onboarding on the first launch, the lock screen when a PIN is set, home
 * otherwise. Outside the Polkadot app, or on a host almanac can't use (startup.ts) — the tryout — the
 * same flow runs on a host that keeps everything in memory, so nothing is saved. The first screen
 * waits for the saved look, so it already appears in it.
 */
async function start(hostReady: Promise<Host | null>, lookReady: Promise<void>): Promise<Started> {
  const inApp = await hostReady;
  const host = inApp ?? memoryHost(crypto.randomUUID());
  const opened = await Vault.open(host);
  await lookReady;
  const screen: Screen =
    opened.state === "new" ? { kind: "onboarding", host } : opened.state === "open" ? { kind: "home", vault: opened.vault, host } : { kind: "locked", host };
  return { screen, tryout: !inApp };
}

// Once per page, even when React runs effects twice in development: two concurrent first launches
// would each create a vault.
let started: Promise<Started> | null = null;

export function App({ host, lookReady }: { host: Promise<Host | null>; lookReady: Promise<void> }) {
  const [screen, setScreen] = useState<Screen>({ kind: "starting" });
  const [tryout, setTryout] = useState(false);
  useEffect(() => {
    started ??= start(host, lookReady).catch((e: unknown): Started => ({
      screen: { kind: "failed", message: e instanceof Error ? e.message : String(e) },
      tryout: false,
    }));
    void started.then((r) => {
      setScreen(r.screen);
      setTryout(r.tryout);
    });
  }, [host, lookReady]);

  // Auto-lock: checked when almanac comes back, since nothing runs while it is out of sight. Whether a
  // PIN is set is read then too, so a PIN turned on a moment ago counts.
  useEffect(() => {
    if (screen.kind !== "home") return;
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && screen.vault.locked && Date.now() - hiddenAt >= AUTO_LOCK_MS) setScreen({ kind: "locked", host: screen.host });
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [screen]);

  const erased = (host: Host) => {
    resetLook();
    setScreen({ kind: "onboarding", host });
  };

  return (
    <>
      {tryout && (
        <aside className="banner tryout" role="note">
          <strong>{t("tryout.title")}</strong> {t("tryout.body")}
        </aside>
      )}
      {screen.kind === "onboarding" && <Onboarding host={screen.host} onDone={(vault) => setScreen({ kind: "home", vault, host: screen.host })} />}
      {screen.kind === "home" && (
        <Shell vault={screen.vault} host={screen.host} tryout={tryout} onLock={() => setScreen({ kind: "locked", host: screen.host })} onErased={() => erased(screen.host)} />
      )}
      {screen.kind === "locked" && <LockScreen host={screen.host} onOpen={(vault) => setScreen({ kind: "home", vault, host: screen.host })} onErased={() => erased(screen.host)} />}
      {screen.kind === "starting" && <Starting />}
      {screen.kind === "failed" && (
        <main>
          <p role="alert">{t("app.failed", { message: screen.message })}</p>
        </main>
      )}
    </>
  );
}
