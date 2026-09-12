/** A calendar date, "YYYY-MM-DD". Cycle maths works on calendar days only — no times, no time zones. */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const fromDay = (day: number): ISODate => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

/** Days since 1970-01-01. Throws for anything that is not a real calendar date. */
export function toDay(date: ISODate): number {
  const m = PATTERN.exec(date);
  const day = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY : NaN;
  if (Number.isNaN(day) || fromDay(day) !== date) throw new RangeError(`not a calendar date: "${date}"`);
  return day;
}

export const addDays = (date: ISODate, n: number): ISODate => fromDay(toDay(date) + n);

export const daysBetween = (from: ISODate, to: ISODate): number => toDay(to) - toDay(from);

/** Today on the phone's own calendar. */
export function localToday(now = new Date()): ISODate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
