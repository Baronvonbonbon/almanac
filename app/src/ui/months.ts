import type { ISODate } from "../cycle";

/** A calendar month; `m` counts from 0. */
export type Month = { y: number; m: number };

export const monthOf = (date: ISODate): Month => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 });

export const monthIndex = ({ y, m }: Month): number => y * 12 + m;

export const addMonths = (month: Month, n: number): Month => {
  const i = monthIndex(month) + n;
  return { y: Math.floor(i / 12), m: ((i % 12) + 12) % 12 };
};

export const dateIn = ({ y, m }: Month, day: number): ISODate => `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const daysIn = ({ y, m }: Month): number => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Empty cells before the 1st, in a week starting on `firstDay` (1 is Monday, 7 is Sunday). */
export const leadingBlanks = ({ y, m }: Month, firstDay: number): number => ((new Date(Date.UTC(y, m, 1)).getUTCDay() || 7) - firstDay + 7) % 7;
