import { useEffect, useState } from "react";
import { DOT_NAME } from "../../product.mjs";
import { t } from "./i18n";
import { detectHost } from "./platform";
import { Vault } from "./vault";

type Status =
  | { kind: "checking" }
  | { kind: "tryout" }
  | { kind: "ready" }
  | { kind: "locked" }
  | { kind: "failed"; message: string };

/**
 * The foundations check: open or create the vault through the real host, and read back a record
 * written just now. The screens themselves come with Phase 2.
 */
async function start(): Promise<Status> {
  const host = await detectHost();
  if (!host) return { kind: "tryout" };
  const opened = await Vault.open(host);
  if (opened.state === "locked") return { kind: "locked" };
  const vault = opened.state === "open" ? opened.vault : await Vault.create(host);
  const stamp = new Date().toISOString();
  await vault.writeJSON("selftest", { stamp });
  if ((await vault.readJSON<{ stamp: string }>("selftest"))?.stamp !== stamp) throw new Error("a record did not read back");
  return { kind: "ready" };
}

// Once per page, even when React runs effects twice in development: two concurrent first launches
// would each create a vault.
let started: Promise<Status> | null = null;

export function App() {
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  useEffect(() => {
    started ??= start().catch((e: unknown) => ({ kind: "failed", message: e instanceof Error ? e.message : String(e) }));
    void started.then(setStatus);
  }, []);

  return (
    <main>
      <h1 className="wordmark">{t("appName")}</h1>
      {status.kind === "tryout" && (
        <section className="banner" role="note">
          <strong>{t("tryout.title")}</strong> {t("tryout.body")}
        </section>
      )}
      {status.kind === "checking" && <p>{t("foundations.checking")}</p>}
      {status.kind === "ready" && <p>{t("foundations.ready")}</p>}
      {status.kind === "locked" && <p>{t("foundations.locked")}</p>}
      {status.kind === "failed" && <p role="alert">{t("foundations.failed", { message: status.message })}</p>}
      <p className="quiet">{t("foundations.early")}</p>
      {status.kind !== "tryout" && <p className="quiet">{t("foundations.identity", { name: DOT_NAME })}</p>}
    </main>
  );
}
