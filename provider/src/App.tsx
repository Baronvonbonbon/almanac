import { useEffect, useState } from "react";
import { memoryHost, type Host } from "@app/platform";
import { Starting } from "@app/ui/Starting";
import { Vault } from "@app/vault";
import { t } from "./i18n";
import { Lock } from "./Lock";
import { readMe } from "./me";
import { Provider } from "./Provider";
import { Setup, type SetupStart } from "./Setup";
import "@app/ui/ui.css";
import "@app/protect/protect.css";
import "./provider.css";

type Screen =
  | { kind: "starting" }
  | { kind: "setup"; host: Host; vault: Vault | null; from: SetupStart }
  | { kind: "home"; host: Host; vault: Vault }
  | { kind: "locked"; host: Host }
  | { kind: "failed"; message: string };

type Started = { screen: Screen; tryout: boolean };

/** As almanac (docs/DESIGN.md §6): locked once it has been out of sight this long. */
export const AUTO_LOCK_MS = 60_000;

/**
 * Where the provider app opens: setup on the first launch — and where setup was left off, if the app
 * closed part way — the lock screen once a PIN is set, and the patients after it. Outside the Polkadot
 * app, the tryout: the same, with no PIN, on a host that keeps everything in memory.
 */
async function start(hostReady: Promise<Host | null>, lookReady: Promise<void>): Promise<Started> {
  const inApp = await hostReady;
  const tryout = !inApp;
  const host = inApp ?? memoryHost(crypto.randomUUID());
  const opened = await Vault.open(host);
  await lookReady;
  if (opened.state === "locked") return { screen: { kind: "locked", host }, tryout };
  if (opened.state === "new") return { screen: { kind: "setup", host, vault: null, from: "welcome" }, tryout };
  const vault = opened.vault;
  if (!(await readMe(vault))) return { screen: { kind: "setup", host, vault, from: "welcome" }, tryout };
  if (!tryout && !vault.locked) return { screen: { kind: "setup", host, vault, from: "pin" }, tryout };
  return { screen: { kind: "home", host, vault }, tryout };
}

// Once per page, even when React runs effects twice in development.
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

  // Auto-lock, checked when the app comes back into sight. Locking closes every opening: they live in memory only.
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

  const erased = (host: Host) => setScreen({ kind: "setup", host, vault: null, from: "welcome" });

  return (
    <>
      {tryout && (
        <aside className="banner tryout" role="note">
          <strong>{t("tryout.title")}</strong> {t("tryout.body")}
        </aside>
      )}
      {screen.kind === "setup" && (
        <Setup host={screen.host} vault={screen.vault} from={screen.from} tryout={tryout} onDone={(vault) => setScreen({ kind: "home", vault, host: screen.host })} />
      )}
      {screen.kind === "home" && (
        <Provider vault={screen.vault} host={screen.host} tryout={tryout} onLock={() => setScreen({ kind: "locked", host: screen.host })} onErased={() => erased(screen.host)} />
      )}
      {screen.kind === "locked" && <Lock host={screen.host} onOpen={(vault) => setScreen({ kind: "home", vault, host: screen.host })} onErased={() => erased(screen.host)} />}
      {screen.kind === "starting" && <Starting name={t("appName")} messages={[t("starting.starting"), t("starting.still"), t("starting.slow")]} />}
      {screen.kind === "failed" && (
        <main>
          <p role="alert">{t("failed", { message: screen.message })}</p>
        </main>
      )}
    </>
  );
}
