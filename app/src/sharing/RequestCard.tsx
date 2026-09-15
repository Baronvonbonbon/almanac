import { t } from "../i18n";
import { OPENINGS, type Opening } from "./times";
import type { ShareRequest } from "./useShareRequests";
import "./request.css";

const MINUTE = 60_000;

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago". */
export function askedAgo(asked: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - asked) / MINUTE));
  if (minutes < 1) return t("sharing.ask.justNow");
  if (minutes < 60) return minutes === 1 ? t("sharing.ask.minuteOne") : t("sharing.ask.minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? t("sharing.ask.hourOne") : t("sharing.ask.hours", { n: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("sharing.ask.yesterday") : t("sharing.ask.days", { n: days });
}

/**
 * docs/DESIGN.md §9, on Today: a provider app asks to see a share again, and the patient allows it —
 * for 15 minutes, an hour or the rest of the day, none picked in advance — or not now.
 */
export function RequestCard({ request, busy, onAnswer }: { request: ShareRequest; busy: boolean; onAnswer(opening: Opening | null): void }) {
  return (
    <aside className="home-card home-request" aria-labelledby="home-request-title">
      <h2 id="home-request-title">{t("sharing.ask.title", { name: request.name })}</h2>
      <p>
        {t("sharing.ask.asked", { when: askedAgo(request.asked, Date.now()) })} {t("sharing.ask.note")}
      </p>
      <div className="home-request-actions">
        {OPENINGS.map((o) => (
          <button key={o} type="button" className="button secondary" disabled={busy} onClick={() => onAnswer(o)}>
            {t(`sharing.preview.for.${o}`)}
          </button>
        ))}
        <button type="button" className="link-button" disabled={busy} onClick={() => onAnswer(null)}>
          {t("sharing.ask.notNow")}
        </button>
      </div>
    </aside>
  );
}
