import { useMemo } from "react";
import { addDays } from "../cycle";
import { t } from "../i18n";
import { shortDate } from "../i18n/format";
import { symptomName } from "../log/entry";
import type { CycleData } from "../shell/useCycle";
import { insightsOf } from "./insights";
import "./insights.css";

/** Your cycles, drawn to scale, and what almanac has learned from them. */
export function InsightsView({ data }: { data: CycleData }) {
  const ins = useMemo(() => insightsOf(data.entries), [data]);
  // One scale for every bar, in whole weeks, and ticks only at values it reaches.
  const scale = Math.ceil(Math.max(35, ...ins.cycles.map((c) => c.length)) / 7) * 7;
  const ticks = scale <= 42 ? Array.from({ length: scale / 7 + 1 }, (_, i) => i * 7) : [0, Math.round(scale / 2), scale];

  return (
    <section className="ins" aria-labelledby="ins-title">
      <h2 id="ins-title" className="ins-title">
        {t("insights.title")}
      </h2>
      {ins.cycles.length === 0 ? (
        <p className="ins-quiet">{t("insights.empty")}</p>
      ) : (
        <>
          <p className="ins-quiet">{ins.cycles.length === 1 ? t("insights.cyclesOne") : t("insights.cycles", { n: ins.cycles.length })}</p>
          <ul className="ins-bars">
            {ins.cycles.map((c) => (
              <li key={c.start} data-set-aside={!c.counted || undefined}>
                <span>{t("insights.dates", { from: shortDate(c.start), to: shortDate(addDays(c.start, c.length - 1)) })}</span>
                <span className="ins-value">{t("insights.days", { n: c.length })}</span>
                <span className="ins-track" aria-hidden="true">
                  <span className="ins-bar" style={{ width: `${(c.length / scale) * 100}%` }} />
                </span>
                {!c.counted && <span className="ins-aside">{t("insights.setAside")}</span>}
              </li>
            ))}
          </ul>
          <div className="ins-scale" aria-hidden="true">
            {ticks.map((v) => (
              <span key={v} style={{ left: `${(v / scale) * 100}%` }}>
                {v}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="ins-facts">
        {ins.usual && (
          <Fact label={t("insights.usualCycle")} value={ins.usual[0] === ins.usual[1] ? t("insights.days", { n: ins.usual[0] }) : t("insights.range", { low: ins.usual[0], high: ins.usual[1] })} />
        )}
        {ins.periodDays !== null && <Fact label={t("insights.usualPeriod")} value={t("insights.days", { n: ins.periodDays })} />}
        {ins.topSymptoms.length > 0 && <Fact label={t("insights.topSymptoms")} value={ins.topSymptoms.map((s) => symptomName(s.id)).join(", ")} />}
      </div>
      <p className="ins-note">{t("insights.note")}</p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <p className="ins-fact">
      <span className="ins-quiet">{label}</span>
      <b>{value}</b>
    </p>
  );
}
