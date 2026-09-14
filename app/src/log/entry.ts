import type { DayEntry, Flow, ISODate } from "../cycle";
import { t } from "../i18n";

/** What the log sheet offers (docs/DESIGN.md §3, §5). Stored by these ids, shown in words from i18n. */
export const FLOWS = ["none", "spotting", "light", "medium", "heavy"] as const;
export const SYMPTOMS = ["cramps", "headache", "bloating", "tender", "backache", "fatigue", "acne", "nausea"] as const;
export const MOODS = ["calm", "happy", "energetic", "low", "irritable", "anxious"] as const;
export const LH_RESULTS = ["negative", "positive"] as const;
export const FLUIDS = ["dry", "sticky", "creamy", "watery", "eggwhite"] as const;
export const INTIMACY = ["none", "protected", "unprotected"] as const;

type Fluid = (typeof FLUIDS)[number];

/** The fields the log sheet edits. Anything else a day holds — a period-start override, energy — is kept as it was. */
export interface DayForm {
  flow: Flow | null;
  symptoms: string[];
  mood: string[];
  note: string;
  lhTest: (typeof LH_RESULTS)[number] | null;
  temperatureC: number | null;
  fluid: Fluid | null;
  intimacy: (typeof INTIMACY)[number];
}

export function formOf(entry?: DayEntry): DayForm {
  const protectedSex = entry?.intimacy?.protected;
  return {
    flow: entry?.flow ?? null,
    symptoms: [...(entry?.symptoms ?? [])],
    mood: [...(entry?.mood ?? [])],
    note: entry?.note ?? "",
    lhTest: entry?.fertility?.lhTest ?? null,
    temperatureC: entry?.fertility?.temperatureC ?? null,
    fluid: entry?.fertility?.fluid ?? null,
    intimacy: protectedSex === true ? "protected" : protectedSex === false ? "unprotected" : "none",
  };
}

/**
 * The day to save. Trying-to-conceive fields are only written while that mode is on; with it off they
 * are hidden, not erased. A form left blank gives an entry `saveDay` removes.
 */
export function entryOf(date: ISODate, form: DayForm, existing: DayEntry | undefined, now: number, ttc: boolean): DayEntry {
  const entry: DayEntry = { ...existing, date, updatedAt: now };
  delete entry.flow;
  delete entry.symptoms;
  delete entry.mood;
  delete entry.note;
  if (form.flow) entry.flow = form.flow;
  if (form.symptoms.length) entry.symptoms = [...form.symptoms];
  if (form.mood.length) entry.mood = [...form.mood];
  const note = form.note.trim();
  if (note) entry.note = note;
  if (ttc) {
    delete entry.fertility;
    delete entry.intimacy;
    const fertility: NonNullable<DayEntry["fertility"]> = {};
    if (form.lhTest) fertility.lhTest = form.lhTest;
    if (form.temperatureC !== null) fertility.temperatureC = form.temperatureC;
    if (form.fluid) fertility.fluid = form.fluid;
    if (Object.keys(fertility).length) entry.fertility = fertility;
    if (form.intimacy !== "none") entry.intimacy = { protected: form.intimacy === "protected" };
  }
  return entry;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A temperature typed in `unit`, in °C. */
export const celsius = (value: number, unit: "C" | "F"): number => round2(unit === "F" ? ((value - 32) * 5) / 9 : value);

/** A stored °C temperature, shown in `unit`. */
export const inUnit = (c: number, unit: "C" | "F"): number => round2(unit === "F" ? (c * 9) / 5 + 32 : c);

/** Anything outside this is a typing slip, not a waking temperature. */
export const plausible = (c: number): boolean => Number.isFinite(c) && c >= 34 && c <= 43;

const isSymptom = (s: string): s is (typeof SYMPTOMS)[number] => (SYMPTOMS as readonly string[]).includes(s);
const isMood = (s: string): s is (typeof MOODS)[number] => (MOODS as readonly string[]).includes(s);

/**
 * A day in a few words — "Light flow · Cramps · Calm". Trying-to-conceive details show only as "More
 * details": home is often on screen where others can see it.
 */
export function summary(entry: DayEntry): string {
  const parts = [
    entry.flow && t(`log.flowSummary.${entry.flow}`),
    ...(entry.symptoms ?? []).map((s) => (isSymptom(s) ? t(`log.symptomNames.${s}`) : s)),
    ...(entry.mood ?? []).map((m) => (isMood(m) ? t(`log.moodNames.${m}`) : m)),
    entry.note && t("log.hasNote"),
    (entry.fertility && Object.keys(entry.fertility).length) || entry.intimacy ? t("log.moreDetails") : "",
  ].filter((p): p is string => !!p);
  return parts.length > 4 ? `${parts.slice(0, 3).join(" · ")} · ${t("home.more", { n: parts.length - 3 })}` : parts.join(" · ");
}
