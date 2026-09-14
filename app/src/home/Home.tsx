import { useEffect, useState } from "react";
import { localToday, predict, type Prediction } from "../cycle";
import { CycleGraphic } from "../cycle-graphic/CycleGraphic";
import { cycleShape, type CycleShape } from "../cycle-graphic/shape";
import { allDays, loadSettings } from "../data";
import { t } from "../i18n";
import { shortDate } from "../i18n/format";
import { useLook } from "../look";
import type { Vault } from "../vault";
import "./home.css";

type Loaded = { prediction: Prediction; shape: CycleShape | null } | { error: string };

/** Home, as far as it goes before logging arrives (step 3): where you are in your cycle. */
export function Home({ vault }: { vault: Vault }) {
  const { look } = useLook();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [settings, days] = await Promise.all([loadSettings(vault), allDays(vault)]);
        const today = localToday();
        const prediction = predict(days, {
          today,
          typicalCycle: settings.typicalCycle,
          fertility: settings.modes.fertility,
          pregnancy: settings.modes.pregnancy,
        });
        if (live) setLoaded({ prediction, shape: cycleShape(prediction, days, today) });
      } catch (e) {
        if (live) setLoaded({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [vault]);

  return (
    <main className="home">
      <header className="topbar">
        <span className="wordmark">{t("appName")}</span>
        <span className="pill">{t("preview")}</span>
      </header>
      {loaded && "error" in loaded && <p role="alert">{t("app.failed", { message: loaded.error })}</p>}
      {loaded && "prediction" in loaded && (
        <section className="home-cycle">
          {loaded.shape ? <CycleGraphic look={look} shape={loaded.shape} /> : <p className="home-quiet">{t("prediction.none")}</p>}
          {loaded.prediction.late ? (
            <p className="home-likely">{t("prediction.late", { days: loaded.prediction.late })}</p>
          ) : (
            loaded.prediction.next && (
              <p className="home-likely">
                {t("prediction.likely", { earliest: shortDate(loaded.prediction.next.earliest), latest: shortDate(loaded.prediction.next.latest) })}
              </p>
            )
          )}
          {loaded.prediction.status === "learning" && <p className="home-quiet">{t("prediction.learning")}</p>}
          <p className="home-quiet">{t("home.soon")}</p>
        </section>
      )}
    </main>
  );
}
