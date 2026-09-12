import type { ISODate } from "./dates";

export type Flow = "spotting" | "light" | "medium" | "heavy";

/** One logged day (docs/DESIGN.md §5). */
export interface DayEntry {
  date: ISODate;
  flow?: Flow;
  /** The user's override: `true` marks a period start, `false` says "not a new period". */
  periodStart?: boolean;
  symptoms?: string[];
  mood?: string[];
  energy?: 1 | 2 | 3 | 4 | 5;
  /** Trying-to-conceive mode only. */
  fertility?: {
    lhTest?: "negative" | "positive";
    temperatureC?: number;
    fluid?: "dry" | "sticky" | "creamy" | "watery" | "eggwhite";
  };
  /** Trying-to-conceive mode only; sensitive. */
  intimacy?: { protected?: boolean };
  note?: string;
  updatedAt: number;
}
