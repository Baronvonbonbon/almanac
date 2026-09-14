import type { ISODate } from "../cycle";
import { CycleGraphic } from "../cycle-graphic/CycleGraphic";
import { t } from "../i18n";
import { summary } from "../log/entry";
import { useLook } from "../look";
import type { CycleData } from "../shell/useCycle";
import { homeText } from "./text";
import "./home.css";

/**
 * docs/DESIGN.md §3: one cycle graphic and one button. In the web tryout, until a few cycles are
 * logged, an offer of example months below it.
 */
export function Home({ data, onLog, examples }: { data: CycleData; onLog(date: ISODate): void; examples?: { busy: boolean; onAdd(): void } | null }) {
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
      {examples && (
        <aside className="home-examples" aria-labelledby="home-examples-title">
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
