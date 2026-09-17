import { useCallback, useEffect, useRef, useState } from "react";
import { backUpToBulletin } from "../backup/bulletin";
import { BackupError } from "../backup/format";
import { backupProblemText } from "../backup/messages";
import { bulletinDue } from "../backup/record";
import { CalendarView } from "../calendar/CalendarView";
import type { DayEntry, ISODate } from "../cycle";
import { saveDay, updateSettings, type Settings } from "../data";
import { Home } from "../home/Home";
import { t } from "../i18n";
import { timeOf } from "../i18n/format";
import { InsightsView } from "../insights/InsightsView";
import { LogSheet } from "../log/LogSheet";
import type { Host } from "../platform";
import type { PrivacyFlow } from "../protect/PrivacySection";
import { SettingsView } from "../settings/SettingsView";
import type { ShareRecord } from "../sharing/records";
import type { Opening } from "../sharing/times";
import { useShareRequests, type ShareRequest } from "../sharing/useShareRequests";
import { exampleDays } from "../tryout/examples";
import { Toast } from "../ui/Toast";
import type { Vault } from "../vault";
import { useCycle } from "./useCycle";
import "./shell.css";

const TABS = ["today", "calendar", "insights"] as const;
type Tab = (typeof TABS)[number];

/** docs/DESIGN.md §3: the backup code is offered once this many days have been logged. */
const BACKUP_AFTER_DAYS = 3;
const NO_SHARES: ShareRecord[] = [];

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The app once open: the top bar, the section on screen or Settings, the tabs, and the log sheet over them. */
export function Shell({ vault, host, tryout, onLock, onErased }: { vault: Vault; host: Host; tryout: boolean; onLock(): void; onErased(): void }) {
  const [tab, setTab] = useState<Tab>("today");
  const [settings, setSettings] = useState<false | "list" | PrivacyFlow>(false);
  const [editing, setEditing] = useState<ISODate | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [examples, setExamples] = useState<"offered" | "adding" | "added">("offered");
  const [answering, setAnswering] = useState(false);
  const [answerFailed, setAnswerFailed] = useState<string | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const cycle = useCycle(vault);
  const clearToast = useCallback(() => setToast(null), []);
  const data = cycle.data;
  const settingsOpen = settings !== false;
  const requests = useShareRequests(vault, host, data?.privacy.shares ?? NO_SHARES);

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
    setSettings(false);
    settingsButton.current?.focus();
  }

  // docs/DESIGN.md §9: a provider app's request, answered from Today.
  async function answer(request: ShareRequest, opening: Opening | null) {
    setAnswering(true);
    setAnswerFailed(null);
    try {
      const until = await requests.answer(request, opening);
      if (until) setToast(t("sharing.ask.allowed", { name: request.name, time: timeOf(until) }));
    } catch (e) {
      setAnswerFailed(t("sharing.ask.failed", { message: message(e) }));
    } finally {
      setAnswering(false);
      cycle.reload();
    }
  }

  /**
   * A backup goes online when almanac opens and the last one is five days old (docs/DESIGN.md §8) —
   * never on a log, so neither its timing nor its size says how much was logged.
   *
   * `bulletinDue` requires that someone agreed to it first (R7), so this can never be what starts
   * putting copies on a public network. Once a session: a 1 MiB upload took 41 s on a phone (P6c),
   * and a second one while the first is still going would spend quota for nothing.
   */
  const backingUp = useRef(false);
  useEffect(() => {
    if (backingUp.current || !data || !host.blobs) return;
    const record = data.privacy.backup ?? null;
    if (!bulletinDue(record, Date.now())) return;
    backingUp.current = true;
    void (async () => {
      try {
        await backUpToBulletin(host, vault, record!);
        cycle.reload();
      } catch (e) {
        // Visible, not silent: a claim with nothing left in it looks exactly like this (§8, B3).
        setToast(e instanceof BackupError ? backupProblemText(e.kind) : message(e));
      }
    })();
  }, [data, host, vault, cycle]);

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
  const offerBackup = !!data && data.entries.length >= BACKUP_AFTER_DAYS && !data.privacy.backup?.copiedAt;
  const request = requests.waiting[0];

  return (
    <div className="shell">
      <header className="topbar shell-top">
        <span className="wordmark">{t("appName")}</span>
        <span className="shell-top-end">
          <span className="pill">{t("preview")}</span>
          <button ref={settingsButton} type="button" className="icon-button" aria-label={t("settings.open")} aria-pressed={settingsOpen} onClick={() => (settingsOpen ? closeSettings() : setSettings("list"))}>
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
        {answerFailed && <p role="alert">{answerFailed}</p>}
        {!data && !cycle.error && <p className="shell-soon">{t("app.starting")}</p>}
        {data && settingsOpen && (
          <SettingsView
            key={String(settings)}
            data={data}
            vault={vault}
            host={host}
            flow={settings === "list" ? null : settings}
            onChange={changeSettings}
            onChanged={cycle.reload}
            onNotice={setToast}
            onDone={closeSettings}
            onLock={onLock}
            onErased={onErased}
          />
        )}
        {data && !settingsOpen && tab === "today" && (
          <Home
            data={data}
            onLog={setEditing}
            request={request ? { request, busy: answering, onAnswer: (opening) => void answer(request, opening) } : null}
            onBackup={offerBackup ? () => setSettings("backup") : null}
            examples={offerExamples ? { busy: examples === "adding", onAdd: () => void addExamples() } : null}
          />
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
              setSettings(false);
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
