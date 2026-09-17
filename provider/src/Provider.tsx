import { useCallback, useEffect, useRef, useState } from "react";
import { dateOf, timeOf } from "@app/i18n/format";
import type { Host } from "@app/platform";
import { Toast } from "@app/ui/Toast";
import type { Vault } from "@app/vault";
import { listenForAnswers, type Heard } from "./answers";
import { t } from "./i18n";
import { readMe, type Me } from "./me";
import { NewPatient } from "./NewPatient";
import { PatientList } from "./PatientList";
import { PatientView } from "./PatientView";
import { addPatient, forgetPatient, keptPatients, nameOf, setAsking, type Patient } from "./patients";
import { Settings } from "./Settings";
import { useNow } from "./useNow";
import { Viewer } from "./Viewer";
import type { Opening } from "./visit";

type View = { at: "list" } | { at: "new" } | { at: "patient" | "view"; id: string } | { at: "settings" };

export const patientName = (p: Patient): string => nameOf(p, (read) => t("patients.unnamed", { date: dateOf(read) }));

/**
 * The provider app once open: the patients kept, a new one at a visit, one patient's share, the share
 * itself while it is open, and Settings. Openings — the keys that open shares — live here, in memory:
 * each is dropped when its time is up, and all of them when the app locks or closes.
 */
export function Provider({ host, vault, tryout, onLock, onErased }: { host: Host; vault: Vault; tryout: boolean; onLock(): void; onErased(): void }) {
  const [view, setView] = useState<View>({ at: "list" });
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [openings, setOpenings] = useState<ReadonlyMap<string, Opening>>(new Map());
  const [me, setMe] = useState<Me | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const now = useNow();
  const clearToast = useCallback(() => setToast(null), []);

  const reload = useCallback(async () => {
    try {
      setPatients(await keptPatients(vault, Date.now()));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }, [vault]);
  useEffect(() => {
    void reload();
    void readMe(vault).then(setMe);
  }, [reload, vault]);

  // Each opening goes when its time is up; each patient when their share ends.
  useEffect(() => {
    if ([...openings.values()].some((o) => o.until <= now)) setOpenings((all) => new Map([...all].filter(([, o]) => o.until > now)));
    if (patients?.some((p) => p.ends <= now)) void reload();
  }, [now, openings, patients, reload]);

  // almanac's answers and stops, while the app is open — and those that came while it was closed.
  const listening = (patients ?? []).map((p) => `${p.id}/${p.asking?.key ?? ""}`).join(" ");
  useEffect(() => {
    if (!patients?.length) return;
    const kept = patients;
    return listenForAnswers(host, kept, (heard) => void hear(heard, kept));
    // `patients` is read as it is when `listening` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, listening]);

  async function hear(heard: Heard, kept: Patient[]) {
    const patient = kept.find((p) => p.id === heard.id);
    if (!patient) return;
    if (heard.kind === "allowed") {
      const opening = await openingFrom(heard, patient);
      await setAsking(vault, patient.id, undefined);
      if (opening) {
        setOpenings((all) => new Map(all).set(patient.id, opening));
        setToast(t("patients.allowed", { name: patientName(patient), time: timeOf(heard.opening.until) }));
      }
    } else {
      setOpenings((all) => new Map([...all].filter(([id]) => id !== patient.id)));
      await forgetPatient(vault, patient.id);
      setToast(t("patients.stopped", { name: patientName(patient) }));
      setView((v) => ("id" in v && v.id === patient.id ? { at: "list" } : v));
    }
    await reload();
  }

  /**
   * An approval that names a blob opens that blob — what the patient chose as it stood when they
   * allowed it (docs/DESIGN.md §9) — rather than the copy read at the visit. Fetched here, where the
   * answer arrives, so it is held in memory with the opening and never written anywhere.
   *
   * There is no falling back to the visit's copy. Each upload has a key of its own, so the key this
   * approval carries opens that one blob and nothing else — the copy from the visit would not open
   * with it. Unreachable means asking again: `null`, and the provider is told.
   */
  async function openingFrom(heard: Extract<Heard, { kind: "allowed" }>, patient: Patient): Promise<Opening | null> {
    if (!heard.cid) return heard.opening;
    let payload: Uint8Array | null = null;
    try {
      payload = (await host.blobs?.get(heard.cid)) ?? null;
    } catch {
      // Told below, like one that simply was not found.
    }
    if (payload) return { ...heard.opening, payload };
    setToast(t("patients.unreachable", { name: patientName(patient) }));
    return null;
  }

  const openingOf = (id: string): Opening | null => {
    const o = openings.get(id);
    return o && o.until > now ? o : null;
  };
  const settingsOpen = view.at === "settings";
  const patient = "id" in view ? patients?.find((p) => p.id === view.id) : undefined;

  return (
    <div className="shell">
      <header className="topbar shell-top">
        <span className="wordmark">{t("wordmark")}</span>
        <span className="shell-top-end">
          <span className="pill">{t("badge")}</span>
          <button
            ref={settingsButton}
            type="button"
            className="icon-button"
            aria-label={t("settingsOpen")}
            aria-pressed={settingsOpen}
            onClick={() => {
              setView(settingsOpen ? { at: "list" } : { at: "settings" });
              if (settingsOpen) settingsButton.current?.focus();
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
              <circle cx="16" cy="7" r="2.6" />
              <circle cx="10" cy="17" r="2.6" />
            </svg>
          </button>
        </span>
      </header>

      <main className="shell-main">
        {failure && <p role="alert">{t("failed", { message: failure })}</p>}
        {view.at === "settings" && me && (
          <Settings
            host={host}
            vault={vault}
            tryout={tryout}
            me={me}
            onMe={setMe}
            onNotice={setToast}
            onLock={onLock}
            onErased={onErased}
            onDone={() => {
              setView({ at: "list" });
              settingsButton.current?.focus();
            }}
          />
        )}
        {view.at === "new" && me && (
          <NewPatient
            me={me}
            onBack={() => setView({ at: "list" })}
            onRead={async (read, opening) => {
              await addPatient(vault, read);
              setOpenings((all) => new Map(all).set(read.id, opening));
              await reload();
              setView({ at: "view", id: read.id });
            }}
          />
        )}
        {view.at === "patient" && patient && (
          <PatientView
            host={host}
            vault={vault}
            patient={patient}
            opening={openingOf(patient.id)}
            now={now}
            tryout={tryout}
            onView={() => setView({ at: "view", id: patient.id })}
            onChanged={() => void reload()}
            onForgotten={() => {
              setOpenings((all) => new Map([...all].filter(([id]) => id !== patient.id)));
              setToast(t("patient.forgotten"));
              setView({ at: "list" });
              void reload();
            }}
            onBack={() => setView({ at: "list" })}
          />
        )}
        {view.at === "view" && patient && <Viewer patient={patient} opening={openingOf(patient.id)} now={now} onDone={() => setView({ at: "patient", id: patient.id })} />}
        {view.at === "list" && patients && (
          <PatientList patients={patients} openingOf={openingOf} now={now} onOpen={(id) => setView({ at: "patient", id })} onNew={() => setView({ at: "new" })} />
        )}
      </main>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
