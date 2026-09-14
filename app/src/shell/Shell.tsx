import { useCallback, useRef, useState } from "react";
import { CalendarView } from "../calendar/CalendarView";
import type { DayEntry, ISODate } from "../cycle";
import { saveDay, updateSettings, type Settings } from "../data";
import { Home } from "../home/Home";
import { t } from "../i18n";
import { InsightsView } from "../insights/InsightsView";
import { LogSheet } from "../log/LogSheet";
import { SettingsView } from "../settings/SettingsView";
import { exampleDays } from "../tryout/examples";
import { Toast } from "../ui/Toast";
import type { Vault } from "../vault";
import { useCycle } from "./useCycle";
import "./shell.css";

const TABS = ["today", "calendar", "insights"] as const;
type Tab = (typeof TABS)[number];

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The app once set up: the top bar, the section on screen or Settings, the tabs, and the log sheet over them. */
export function Shell({ vault, tryout }: { vault: Vault; tryout: boolean }) {
  const [tab, setTab] = useState<Tab>("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<ISODate | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [examples, setExamples] = useState<"offered" | "adding" | "added">("offered");
  const settingsButton = useRef<HTMLButtonElement>(null);
  const cycle = useCycle(vault);
  const clearToast = useCallback(() => setToast(null), []);
  const data = cycle.data;

  async function save(entry: DayEntry) {
    await saveDay(vault, entry);
    cycle.reload();
    setToast(tryout ? t("log.savedTryout") : t("log.saved"));
  }

  async function changeSettings(change: (settings: Settings) => Settings) {
    await updateSettings(vault, change);
    cycle.reload();
  }

  function closeSettings() {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  }

  // The web tryout only: example months, so a tester can see the calendar and insights filled in.
  async function addExamples() {
    if (!data) return;
    setExamples("adding");
    setFailure(null);
    try {
      for (const entry of exampleDays(data.entries, data.today, data.settings.typicalCycle)) await saveDay(vault, entry);
      setExamples("added");
      setToast(t("tryout.examplesAdded"));
    } catch (e) {
      setExamples("offered");
      setFailure(message(e));
    }
    cycle.reload();
  }
  const offerExamples = tryout && examples !== "added" && data?.prediction.status !== "ready" && !data?.settings.modes.pregnancy;

  return (
    <div className="shell">
      <header className="topbar shell-top">
        <span className="wordmark">{t("appName")}</span>
        <span className="shell-top-end">
          <span className="pill">{t("preview")}</span>
          <button ref={settingsButton} type="button" className="icon-button" aria-label={t("settings.open")} aria-pressed={settingsOpen} onClick={() => (settingsOpen ? closeSettings() : setSettingsOpen(true))}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
              <circle cx="16" cy="7" r="2.6" />
              <circle cx="10" cy="17" r="2.6" />
            </svg>
          </button>
        </span>
      </header>

      <main className="shell-main">
        {cycle.error && <p role="alert">{t("app.failed", { message: cycle.error })}</p>}
        {failure && <p role="alert">{t("app.failed", { message: failure })}</p>}
        {!data && !cycle.error && <p className="shell-soon">{t("app.starting")}</p>}
        {data && settingsOpen && <SettingsView data={data} onChange={changeSettings} onDone={closeSettings} />}
        {data && !settingsOpen && tab === "today" && (
          <Home data={data} onLog={setEditing} examples={offerExamples ? { busy: examples === "adding", onAdd: () => void addExamples() } : null} />
        )}
        {data && !settingsOpen && tab === "calendar" && <CalendarView data={data} onLog={setEditing} onSave={save} />}
        {data && !settingsOpen && tab === "insights" && <InsightsView data={data} />}
      </main>

      <nav className="tabs" aria-label={t("shell.sections")}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            aria-current={!settingsOpen && tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setSettingsOpen(false);
            }}
          >
            {t(`shell.${id}`)}
          </button>
        ))}
      </nav>

      {editing && data && (
        <LogSheet
          date={editing}
          today={data.today}
          entry={data.days.get(editing)}
          ttc={data.settings.modes.ttc}
          onDate={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
