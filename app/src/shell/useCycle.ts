import { useCallback, useEffect, useState } from "react";
import { readBackup, type BackupRecord } from "../backup/record";
import { localToday, predict, type DayEntry, type ISODate, type Prediction } from "../cycle";
import { cycleShape, type CycleShape } from "../cycle-graphic/shape";
import { allDays, loadSettings, type Settings } from "../data";
import { readProtection } from "../protect/protection";
import type { Vault } from "../vault";

/** Everything the tabs show, read from the vault in one go. */
export interface CycleData {
  today: ISODate;
  settings: Settings;
  /** Every logged day, in date order. */
  entries: DayEntry[];
  days: Map<ISODate, DayEntry>;
  prediction: Prediction;
  shape: CycleShape | null;
  privacy: { pin: boolean; duress: boolean; backup: BackupRecord | null };
}

export async function loadCycle(vault: Vault, today = localToday()): Promise<CycleData> {
  const [settings, entries, protection, backup] = await Promise.all([loadSettings(vault), allDays(vault), readProtection(vault), readBackup(vault)]);
  const prediction = predict(entries, {
    today,
    typicalCycle: settings.typicalCycle,
    fertility: settings.modes.fertility,
    pregnancy: settings.modes.pregnancy,
  });
  return {
    today,
    settings,
    entries,
    days: new Map(entries.map((e) => [e.date, e])),
    prediction,
    shape: cycleShape(prediction, entries, today),
    privacy: { pin: vault.locked, duress: vault.locked && protection.duress, backup },
  };
}

/**
 * The cycle data, reloaded after every change and whenever almanac comes back to the screen — so
 * "today" moves on when the app was left open overnight.
 */
export function useCycle(vault: Vault) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ data: CycleData | null; error: string | null }>({ data: null, error: null });
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    loadCycle(vault).then(
      (data) => live && setState({ data, error: null }),
      (e: unknown) => live && setState({ data: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [vault, version]);

  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [reload]);

  return { ...state, reload };
}
