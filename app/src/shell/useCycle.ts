import { useCallback, useEffect, useState } from "react";
import { localToday, predict, type DayEntry, type ISODate, type Prediction } from "../cycle";
import { cycleShape, type CycleShape } from "../cycle-graphic/shape";
import { allDays, loadSettings, type Settings } from "../data";
import type { Vault } from "../vault";

/** Everything the tabs show, read from the vault in one go. */
export interface CycleData {
  today: ISODate;
  settings: Settings;
  days: Map<ISODate, DayEntry>;
  prediction: Prediction;
  shape: CycleShape | null;
}

export async function loadCycle(vault: Vault, today = localToday()): Promise<CycleData> {
  const [settings, entries] = await Promise.all([loadSettings(vault), allDays(vault)]);
  const prediction = predict(entries, {
    today,
    typicalCycle: settings.typicalCycle,
    fertility: settings.modes.fertility,
    pregnancy: settings.modes.pregnancy,
  });
  return { today, settings, days: new Map(entries.map((e) => [e.date, e])), prediction, shape: cycleShape(prediction, entries, today) };
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
