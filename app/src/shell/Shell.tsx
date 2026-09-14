import { useCallback, useState } from "react";
import type { DayEntry, ISODate } from "../cycle";
import { saveDay } from "../data";
import { Home } from "../home/Home";
import { t } from "../i18n";
import { LogSheet } from "../log/LogSheet";
import { Toast } from "../ui/Toast";
import type { Vault } from "../vault";
import { useCycle } from "./useCycle";
import "./shell.css";

const TABS = ["today", "calendar", "insights"] as const;
type Tab = (typeof TABS)[number];

/** The app once set up: the top bar, the section on screen, the tabs, and the log sheet over them. */
export function Shell({ vault, tryout }: { vault: Vault; tryout: boolean }) {
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState<ISODate | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const cycle = useCycle(vault);
  const clearToast = useCallback(() => setToast(null), []);

  async function save(entry: DayEntry) {
    await saveDay(vault, entry);
    cycle.reload();
    setToast(tryout ? t("log.savedTryout") : t("log.saved"));
  }

  return (
    <div className="shell">
      <header className="topbar shell-top">
        <span className="wordmark">{t("appName")}</span>
        <span className="pill">{t("preview")}</span>
      </header>

      <main className="shell-main">
        {cycle.error && <p role="alert">{t("app.failed", { message: cycle.error })}</p>}
        {!cycle.data && !cycle.error && <p className="shell-soon">{t("app.starting")}</p>}
        {cycle.data && tab === "today" && <Home data={cycle.data} onLog={setEditing} />}
        {cycle.data && tab !== "today" && <p className="shell-soon">{t("shell.soon")}</p>}
      </main>

      <nav className="tabs" aria-label={t("shell.sections")}>
        {TABS.map((id) => (
          <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
            {t(`shell.${id}`)}
          </button>
        ))}
      </nav>

      {editing && cycle.data && (
        <LogSheet
          date={editing}
          today={cycle.data.today}
          entry={cycle.data.days.get(editing)}
          ttc={cycle.data.settings.modes.ttc}
          onDate={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
