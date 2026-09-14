import { toDay, type DayEntry, type ISODate } from "../cycle";
import type { Vault } from "../vault";

/**
 * Logged days, one vault record per calendar month ("m/2026-09"), so logging a day rewrites one small
 * record rather than the whole history (docs/DESIGN.md §5).
 */

type Month = Record<ISODate, DayEntry>;

const PREFIX = "m/";
const MONTH = /^\d{4}-\d{2}$/;

const byDate = (a: DayEntry, b: DayEntry) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

const blank = (v: unknown): boolean =>
  v === undefined ||
  v === "" ||
  (Array.isArray(v) ? v.length === 0 : typeof v === "object" && v !== null && Object.values(v).every(blank));

/** True when an entry holds nothing but its date. Saving one removes the day. */
export const isEmpty = (entry: DayEntry): boolean =>
  Object.entries(entry).every(([key, value]) => key === "date" || key === "updatedAt" || blank(value));

/** Saves one day, replacing whatever was logged for that date. */
export async function saveDay(vault: Vault, entry: DayEntry): Promise<void> {
  toDay(entry.date); // throws on anything that is not a calendar date
  await vault.updateJSON<Month>(`${PREFIX}${entry.date.slice(0, 7)}`, (month) => {
    const next = { ...(month ?? {}) };
    if (isEmpty(entry)) delete next[entry.date];
    else next[entry.date] = entry;
    return next;
  });
}

/** Days as the month records the vault keeps them in — for a vault that starts with them. */
export function monthRecords(entries: DayEntry[]): Record<string, Month> {
  const out: Record<string, Month> = {};
  for (const e of entries) (out[`${PREFIX}${e.date.slice(0, 7)}`] ??= {})[e.date] = e;
  return out;
}

/** One month's days, in date order. `month` is "YYYY-MM". */
export async function readMonth(vault: Vault, month: string): Promise<DayEntry[]> {
  if (!MONTH.test(month)) throw new RangeError(`not a month: "${month}"`);
  return Object.values((await vault.readJSON<Month>(`${PREFIX}${month}`)) ?? {}).sort(byDate);
}

/** Every logged day, in date order. */
export async function allDays(vault: Vault): Promise<DayEntry[]> {
  const months = await Promise.all((await vault.list(PREFIX)).map((name) => vault.readJSON<Month>(name)));
  return months.flatMap((month) => Object.values(month ?? {})).sort(byDate);
}
