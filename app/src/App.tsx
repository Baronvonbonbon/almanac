import { useEffect, useState } from "react";
import { Home } from "./home/Home";
import { t } from "./i18n";
import { Onboarding } from "./onboarding/Onboarding";
import { memoryHost, type Host } from "./platform";
import { Vault } from "./vault";
import "./ui/ui.css";

type Screen =
  | { kind: "starting" }
  | { kind: "onboarding"; host: Host }
  | { kind: "home"; vault: Vault }
  | { kind: "locked" }
  | { kind: "failed"; message: string };

type Started = { screen: Screen; tryout: boolean };

/**
 * Where almanac opens: onboarding on the first launch, home after it. Outside the Polkadot app — the
 * web tryout — the same flow runs on a host that keeps everything in memory, so nothing is saved.
 */
async function start(hostReady: Promise<Host | null>): Promise<Started> {
  const inApp = await hostReady;
  const host = inApp ?? memoryHost(crypto.randomUUID());
  const opened = await Vault.open(host);
  const screen: Screen =
    opened.state === "new" ? { kind: "onboarding", host } : opened.state === "open" ? { kind: "home", vault: opened.vault } : { kind: "locked" };
  return { screen, tryout: !inApp };
}

// Once per page, even when React runs effects twice in development: two concurrent first launches
// would each create a vault.
let started: Promise<Started> | null = null;

export function App({ host }: { host: Promise<Host | null> }) {
  const [screen, setScreen] = useState<Screen>({ kind: "starting" });
  const [tryout, setTryout] = useState(false);
  useEffect(() => {
    started ??= start(host).catch((e: unknown): Started => ({
      screen: { kind: "failed", message: e instanceof Error ? e.message : String(e) },
      tryout: false,
    }));
    void started.then((r) => {
      setScreen(r.screen);
      setTryout(r.tryout);
    });
  }, [host]);

  return (
    <>
      {tryout && (
        <aside className="banner tryout" role="note">
          <strong>{t("tryout.title")}</strong> {t("tryout.body")}
        </aside>
      )}
      {screen.kind === "onboarding" && <Onboarding host={screen.host} onDone={(vault) => setScreen({ kind: "home", vault })} />}
      {screen.kind === "home" && <Home vault={screen.vault} />}
      {screen.kind === "starting" && (
        <main>
          <p>{t("app.starting")}</p>
        </main>
      )}
      {screen.kind === "locked" && (
        <main>
          <p>{t("app.locked")}</p>
        </main>
      )}
      {screen.kind === "failed" && (
        <main>
          <p role="alert">{t("app.failed", { message: screen.message })}</p>
        </main>
      )}
    </>
  );
}
