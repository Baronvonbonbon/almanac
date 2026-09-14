import { COUNTED_LENGTHS, daysBetween, type ISODate, type Prediction } from "../cycle";
import { t } from "../i18n";
import { shortDate } from "../i18n/format";

/** Weeks of pregnancy are counted up to here; past it, almanac doesn't guess. */
const PREGNANCY_DAYS = 44 * 7;

export interface HomeText {
  /** The main line: when the next period is likely, or why there is no guess yet. */
  primary: string;
  /** How far away that is, in days. */
  secondary: string | null;
  /** Quieter lines: the fertile window, and why a guess is rough. */
  notes: string[];
}

/**
 * What home says, in plain words and never as an alarm (docs/DESIGN.md §7): "likely between", a range
 * rather than a date, and a late period described as common.
 */
export function homeText(p: Prediction, today: ISODate): HomeText {
  if (p.status === "paused") return pausedText(p, today);
  if (p.status === "none" || !p.next) return { primary: t("home.none"), secondary: null, notes: [] };
  // Months without a period — after a pregnancy, say, or a gap in logging — is not a late period.
  if (p.cycleDay && p.cycleDay > COUNTED_LENGTHS.max) return { primary: t("home.longGap"), secondary: t("home.longGapNote"), notes: [] };

  const notes: string[] = [];
  if (p.fertile) {
    if (today >= p.fertile.start && today <= p.fertile.end) notes.push(t("home.fertileNow"));
    else if (today < p.fertile.start) notes.push(t("home.fertileSoon", { start: shortDate(p.fertile.start), end: shortDate(p.fertile.end) }));
  }
  if (p.status === "learning") notes.push(t("prediction.learning"));
  if (p.irregular) notes.push(t("home.irregular"));
  if (p.setAside.length) notes.push(t("home.setAside"));

  if (p.late) {
    return { primary: p.late === 1 ? t("prediction.lateOne") : t("prediction.late", { days: p.late }), secondary: t("home.lateNote"), notes };
  }
  const from = daysBetween(today, p.next.earliest);
  const to = daysBetween(today, p.next.latest);
  const secondary = from <= 0 ? t("home.anyDay") : to === 1 ? t("home.tomorrow") : from === to ? t("home.inExactly", { n: from }) : t("home.inDays", { from, to });
  return { primary: t("prediction.likely", { earliest: shortDate(p.next.earliest), latest: shortDate(p.next.latest) }), secondary, notes };
}

/** Pregnancy mode: the weeks, counted from the last period's first day, as midwives and doctors count them. */
function pausedText(p: Prediction, today: ISODate): HomeText {
  const days = p.since ? daysBetween(p.since, today) : -1;
  if (days < 0 || days > PREGNANCY_DAYS) return { primary: t("home.paused"), secondary: null, notes: [] };
  return { primary: weeksAndDays(days), secondary: t("pregnancy.counted"), notes: [t("home.paused")] };
}

/** "9 weeks, 3 days" */
export function weeksAndDays(total: number): string {
  const w = Math.floor(total / 7);
  const d = total % 7;
  const weeks = w === 1 ? t("pregnancy.weekOne") : t("pregnancy.weeks", { n: w });
  const days = d === 1 ? t("pregnancy.dayOne") : t("pregnancy.days", { n: d });
  return w === 0 ? days : d === 0 ? weeks : t("pregnancy.weeksAndDays", { weeks, days });
}
