import { daysBetween, type ISODate, type Prediction } from "../cycle";
import { t } from "../i18n";
import { shortDate } from "../i18n/format";

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
  if (p.status === "paused") return { primary: t("home.paused"), secondary: null, notes: [] };
  if (p.status === "none" || !p.next) return { primary: t("home.none"), secondary: null, notes: [] };

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
