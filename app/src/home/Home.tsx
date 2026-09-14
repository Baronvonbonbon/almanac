import type { ISODate } from "../cycle";
import { CycleGraphic } from "../cycle-graphic/CycleGraphic";
import { t } from "../i18n";
import { summary } from "../log/entry";
import { useLook } from "../look";
import type { CycleData } from "../shell/useCycle";
import { homeText } from "./text";
import "./home.css";

/**
 * docs/DESIGN.md §3: one cycle graphic and one button. Below it, once three days are logged and until
 * a backup is copied, the offer of one — and in the web tryout, until a few cycles are logged, an
 * offer of example months.
 */
export function Home({
  data,
  onLog,
  onBackup,
  examples,
}: {
  data: CycleData;
  onLog(date: ISODate): void;
  onBackup?: (() => void) | null;
  examples?: { busy: boolean; onAdd(): void } | null;
}) {
  const { look } = useLook();
  const { prediction, shape, today } = data;
  const text = homeText(prediction, today);
  const todays = data.days.get(today);
  const logged = todays ? summary(todays) : "";

  return (
    <section className="home" aria-labelledby="home-primary">
      {shape && <CycleGraphic look={look} shape={shape} />}
      <p className="home-primary" id="home-primary">
        {text.primary}
      </p>
      {text.secondary && <p className="home-secondary">{text.secondary}</p>}
      {text.notes.map((note) => (
        <p key={note} className="home-note">
          {note}
        </p>
      ))}
      {logged && (
        <p className="home-logged">
          <span className="home-logged-label">{t("home.loggedToday")}</span> {logged}
        </p>
      )}
      <button type="button" className="button home-log" onClick={() => onLog(today)}>
        {logged ? t("home.editToday") : t("home.logToday")}
      </button>
      {onBackup && (
        <aside className="home-card" aria-labelledby="home-backup-title">
          <h2 id="home-backup-title">{t("backup.offerTitle")}</h2>
          <p>{t("backup.offerBody")}</p>
          <button type="button" className="button secondary" onClick={onBackup}>
            {t("backup.offerButton")}
          </button>
        </aside>
      )}
      {examples && (
        <aside className="home-card home-examples" aria-labelledby="home-examples-title">
          <h2 id="home-examples-title">{t("tryout.examplesTitle")}</h2>
          <p>{t("tryout.examplesBody")}</p>
          <button type="button" className="button secondary" disabled={examples.busy} onClick={examples.onAdd}>
            {examples.busy ? t("tryout.adding") : t("tryout.addExamples")}
          </button>
        </aside>
      )}
    </section>
  );
}
