import { toDay, type ISODate } from "../cycle";

/** Dates in words. English for now; every string elsewhere is already externalised. */
const LOCALE = "en";

const atNoonUtc = (date: ISODate) => new Date(toDay(date) * 86_400_000 + 43_200_000);
const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" });

/** "Sep 25" */
export const shortDate = (date: ISODate): string => format({ month: "short", day: "numeric" }).format(atNoonUtc(date));

/** "Thursday, September 25" */
export const longDate = (date: ISODate): string =>
  format({ weekday: "long", month: "long", day: "numeric" }).format(atNoonUtc(date));

/** "September 2026"; `month` counts from 0. */
export const monthTitle = (year: number, month: number): string =>
  format({ month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month, 15)));

/** The phone's first day of the week: 1 is Monday, 7 is Sunday. */
export function firstDayOfWeek(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    return (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 1;
  } catch {
    return 1;
  }
}

/** One-letter weekday names, starting from `firstDay` (1 is Monday). */
export function weekdayInitials(firstDay: number): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    format({ weekday: "narrow" }).format(new Date(Date.UTC(2024, 0, 1 + ((firstDay - 1 + i) % 7), 12))),
  );
}
