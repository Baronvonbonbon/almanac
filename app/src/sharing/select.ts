import { addDays, byDate, daysBetween, periodStarts, predict, type DayEntry, type ISODate } from "../cycle";
import type { Settings } from "../data";
import { CATEGORIES, DEFAULT_CATEGORIES, type Category, type Selection, type SharedDay } from "../share";
import type { ShareChoice } from "./records";

/**
 * What a share holds, worked out from what was logged (docs/DESIGN.md §9): the days in the range, with
 * only the fields of the categories chosen, and nothing from after the range — not even how long a
 * period that ran past its end went on for.
 */

/** A new share: periods and symptoms, over the last six months. Everything more personal starts off. */
export const defaultChoice = (today: ISODate): ShareChoice => ({ categories: [...DEFAULT_CATEGORIES], from: addDays(today, -182), to: today });

/** The categories worth offering: the modes' own only when those modes are on. */
export const offeredCategories = (settings: Settings): Category[] =>
  CATEGORIES.filter((c) => (c === "fertileWindow" ? settings.modes.fertility : c === "ttc" ? settings.modes.ttc : c === "pregnancy" ? settings.modes.pregnancy : true));

// As in cycle/periods.ts: spotting alone neither starts a period nor keeps one going.
const counts = (e: DayEntry) => e.flow === "light" || e.flow === "medium" || e.flow === "heavy";

export function selectForShare(entries: DayEntry[], settings: Settings, choice: ShareChoice, today: ISODate): Selection {
  const has = (c: Category) => choice.categories.includes(c);
  const upToEnd = byDate(entries).filter((e) => e.date <= choice.to);

  const days: Selection["days"] = {};
  for (const e of upToEnd) {
    if (e.date < choice.from) continue;
    const day: SharedDay = {};
    if (has("periods") && e.flow) day.flow = e.flow;
    if (has("symptoms") && e.symptoms?.length) day.symptoms = [...e.symptoms];
    if (has("mood") && e.mood?.length) day.mood = [...e.mood];
    if (has("mood") && e.energy) day.energy = e.energy;
    if (has("notes") && e.note?.trim()) day.note = e.note.trim();
    if (has("ttc") && e.fertility && Object.keys(e.fertility).length) day.fertility = { ...e.fertility };
    if (has("ttc") && e.intimacy) day.intimacy = { ...e.intimacy };
    if (Object.keys(day).length) days[e.date] = day;
  }

  const selection: Selection = { v: 1, from: choice.from, to: choice.to, made: today, categories: CATEGORIES.filter(has), days };

  if (has("periods")) {
    // Starts are worked out from days before the range too, so a period already under way when the
    // range begins is not taken for a new one.
    const starts = periodStarts(upToEnd);
    const flowing = new Set(upToEnd.filter(counts).map((e) => e.date));
    selection.cycles = starts.flatMap((start, i) => {
      if (start < choice.from) return [];
      const cycle: { start: string; period?: number; length?: number } = { start };
      if (flowing.has(start)) {
        let n = 1;
        while (flowing.has(addDays(start, n))) n++;
        cycle.period = n;
      }
      if (starts[i + 1]) cycle.length = daysBetween(start, starts[i + 1]);
      return [cycle];
    });
    const usual = { ...(settings.typicalCycle ? { cycle: settings.typicalCycle } : {}), ...(settings.typicalPeriod ? { period: settings.typicalPeriod } : {}) };
    if (Object.keys(usual).length) selection.usual = usual;
  }

  const wantsFertile = has("fertileWindow") && settings.modes.fertility;
  const wantsPregnancy = has("pregnancy") && settings.modes.pregnancy;
  if (wantsFertile || wantsPregnancy) {
    const p = predict(entries, { today, typicalCycle: settings.typicalCycle, fertility: settings.modes.fertility, pregnancy: settings.modes.pregnancy });
    if (wantsFertile && p.fertile) selection.fertile = { ...p.fertile };
    if (wantsPregnancy && p.since) selection.pregnancy = { since: p.since };
  }
  return selection;
}
