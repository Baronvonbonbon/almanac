/**
 * How long things last in a share (docs/DESIGN.md §9): the share itself, a week unless the patient
 * picks otherwise and never more than 90 days; and each opening, which the patient picks every time.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

export const SHARE_DAYS = [1, 7, 30, 90] as const;
export type ShareDays = (typeof SHARE_DAYS)[number];
export const DEFAULT_SHARE_DAYS: ShareDays = 7;

export const shareEnds = (now: number, days: ShareDays): number => now + days * DAY;

/** The days a new share can start from: three months back, six, or a year. */
export const RANGES = [
  { months: 3, back: 91 },
  { months: 6, back: 182 },
  { months: 12, back: 365 },
] as const;

export const OPENINGS = ["quarter", "hour", "day"] as const;
export type Opening = (typeof OPENINGS)[number];

/** Midnight at the end of the day `now` falls in, on this phone's clock. */
export function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** When an opening allowed now ends: 15 minutes, an hour or the rest of the day — never after the share. */
export function openingUntil(opening: Opening, now: number, ends: number): number {
  const until = opening === "quarter" ? now + 15 * MINUTE : opening === "hour" ? now + 60 * MINUTE : endOfDay(now);
  return Math.min(until, ends);
}
