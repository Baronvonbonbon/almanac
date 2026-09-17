import { useState } from "react";
import { t } from "../i18n";
import { dateOf, timeOf } from "../i18n/format";
import type { Host } from "../platform";
import { FlowBack, Heading, message } from "../protect/FlowParts";
import type { CycleData } from "../shell/useCycle";
import { Row } from "../ui/Row";
import type { Vault } from "../vault";
import { sendSharing } from "./outbox";
import { isLive, openUntil, setOnlineOk, stopShare, type ShareRecord } from "./records";
import { categoriesText, rangeText } from "./SelectionView";
import { ShareFlow, spaced } from "./ShareFlow";
import "../protect/protect.css";
import "./sharing.css";

type View = { at: "list" } | { at: "new" } | { at: "online" } | { at: "one" | "stop"; id: string };

/**
 * Privacy's Sharing (docs/DESIGN.md §9): what almanac can promise, a new share with a provider, and the
 * shares made — each with the openings allowed, and Stop sharing.
 */
export function SharingFlow({
  vault,
  host,
  data,
  onBack,
  onChanged,
  onNotice,
}: {
  vault: Vault;
  host: Host;
  data: CycleData;
  onBack(): void;
  onChanged(): void;
  onNotice(message: string): void;
}) {
  const [view, setView] = useState<View>({ at: "list" });
  const toList = () => setView({ at: "list" });
  const now = Date.now();
  const shares = [...data.privacy.shares].sort((a, b) => b.made - a.made);

  if (view.at === "new")
    return (
      <ShareFlow
        vault={vault}
        host={host}
        data={data}
        onBack={toList}
        onChanged={onChanged}
        onDone={(notice) => {
          onNotice(notice);
          toList();
        }}
      />
    );

  if (view.at === "online")
    return (
      <OnlineNotice
        vault={vault}
        onBack={toList}
        onAgreed={() => {
          onChanged();
          onNotice(t("sharing.onlineDone"));
          toList();
        }}
      />
    );

  const record = view.at === "list" ? undefined : shares.find((r) => r.id === view.id);
  if (view.at === "one" && record) return <OneShare record={record} now={now} onBack={toList} onStop={() => setView({ at: "stop", id: record.id })} />;
  if (view.at === "stop" && record)
    return (
      <StopSharing
        vault={vault}
        host={host}
        record={record}
        now={now}
        onBack={() => setView({ at: "one", id: record.id })}
        onStopped={(sent) => {
          onChanged();
          onNotice(t(sent ? "sharing.stop.done" : "sharing.stop.doneLater", { name: record.provider.name }));
          toList();
        }}
      />
    );

  const open = (id: string) => setView({ at: "one", id });
  return (
    <section className="steps">
      <FlowBack onBack={onBack} />
      <Heading>{t("sharing.title")}</Heading>
      <p>{t("sharing.about")}</p>
      <p className="share-promise">{t("sharing.promise")}</p>
      {/* What stopping cannot do once a copy is public — R2 sharpened by R10 (DESIGN §9). */}
      {data.privacy.onlineOk !== null && <p className="share-promise">{t("sharing.promiseOnline")}</p>}
      <div className="flow-actions">
        <button type="button" className="button" onClick={() => setView({ at: "new" })}>
          {t("sharing.start")}
        </button>
      </div>
      {/* Not offered where there is nowhere to put one — the web tryout has no storage (DESIGN §9). */}
      {host.blobs && (
        <section className="share-group" aria-labelledby="share-online">
          <h2 id="share-online">{t("sharing.online")}</h2>
          <p className="flow-note">{data.privacy.onlineOk ? t("sharing.onlineOn", { date: dateOf(data.privacy.onlineOk) }) : t("sharing.onlineNote")}</p>
          {!data.privacy.onlineOk && (
            <div className="flow-actions">
              <button type="button" className="button secondary" onClick={() => setView({ at: "online" })}>
                {t("sharing.online")}
              </button>
            </div>
          )}
        </section>
      )}
      <ShareList id="share-now" title={t("sharing.now")} records={shares.filter((r) => isLive(r, now))} now={now} onOpen={open} />
      <ShareList id="share-stopped" title={t("sharing.stopped")} records={shares.filter((r) => !isLive(r, now))} now={now} onOpen={open} />
    </section>
  );
}

/**
 * Before anything a patient shares ever goes on Bulletin (docs/DESIGN.md §9): what it does, what
 * stopping cannot undo, and how long it lasts. Shown once. Agreeing is the only thing that sets the
 * gate, so until someone has read this and said yes, no opening ever uploads anything.
 */
function OnlineNotice({ vault, onBack, onAgreed }: { vault: Vault; onBack(): void; onAgreed(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setBusy(true);
    setError(null);
    try {
      await setOnlineOk(vault, Date.now());
      onAgreed();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <section className="confirm">
      <Heading>{t("sharing.onlineAbout")}</Heading>
      <p>{t("sharing.onlineNotice")}</p>
      {error && <p role="alert">{error}</p>}
      <div className="flow-actions">
        <button type="button" className="button" disabled={busy} onClick={() => void agree()}>
          {busy ? t("privacy.working") : t("sharing.onlineAgree")}
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={onBack}>
          {t("sharing.onlineNotNow")}
        </button>
      </div>
    </section>
  );
}

function rowValue(r: ShareRecord, now: number): string {
  if (!isLive(r, now)) return t("sharing.rowStopped", { date: dateOf(r.stopped ?? r.ends) });
  const until = openUntil(r, now);
  return until ? t("sharing.rowOpen", { date: dateOf(r.ends), time: timeOf(until) }) : t("sharing.rowEnds", { date: dateOf(r.ends) });
}

function ShareList({ id, title, records, now, onOpen }: { id: string; title: string; records: ShareRecord[]; now: number; onOpen(id: string): void }) {
  if (!records.length) return null;
  return (
    <section className="share-group" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="rows">
        {records.map((r) => (
          <Row key={r.id} label={r.provider.name} value={rowValue(r, now)} onClick={() => onOpen(r.id)} />
        ))}
      </div>
    </section>
  );
}

function OneShare({ record: r, now, onBack, onStop }: { record: ShareRecord; now: number; onBack(): void; onStop(): void }) {
  const live = isLive(r, now);
  return (
    <section className="steps">
      <FlowBack onBack={onBack} />
      <Heading>
        <bdi>{r.provider.name}</bdi>
      </Heading>
      <p className="flow-note">{t("sharing.one.digits", { digits: spaced(r.provider.check) })}</p>
      <dl className="share-facts">
        <div>
          <dt>{t("sharing.one.what")}</dt>
          <dd>{categoriesText(r.choice.categories)}</dd>
        </div>
        <div>
          <dt>{t("sharing.one.days")}</dt>
          <dd>{rangeText(r.choice.from, r.choice.to)}</dd>
        </div>
        <div>
          <dt>{t("sharing.one.ends")}</dt>
          <dd>{live ? dateOf(r.ends) : t("sharing.one.stoppedOn", { date: dateOf(r.stopped ?? r.ends) })}</dd>
        </div>
      </dl>
      <section className="share-group" aria-labelledby="share-openings">
        <h2 id="share-openings">{t("sharing.one.openings")}</h2>
        <ul className="share-openings">
          {[...r.openings].reverse().map((o) => (
            <li key={o.at}>
              {o.until > now ? t("sharing.one.openNow", { time: timeOf(o.until) }) : t("sharing.one.opening", { date: dateOf(o.at), from: timeOf(o.at), until: timeOf(o.until) })}
            </li>
          ))}
        </ul>
      </section>
      {live && (
        <div className="flow-actions">
          <button type="button" className="button secondary" onClick={onStop}>
            {t("sharing.one.stop")}
          </button>
        </div>
      )}
    </section>
  );
}

function StopSharing({
  vault,
  host,
  record: r,
  now,
  onBack,
  onStopped,
}: {
  vault: Vault;
  host: Host;
  record: ShareRecord;
  now: number;
  onBack(): void;
  /** `sent` is false when the stop couldn't go out yet: it goes the next time almanac opens. */
  onStopped(sent: boolean): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = openUntil(r, now);

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await stopShare(vault, r.id, Date.now());
    } catch (e) {
      setError(message(e));
      setBusy(false);
      return;
    }
    // Stopped here whatever happens next: the key is gone. Telling their app can wait for a connection.
    onStopped(
      await sendSharing(host, vault).then(
        () => true,
        () => false,
      ),
    );
  }

  return (
    <section className="confirm">
      <Heading>{t("sharing.stop.title", { name: r.provider.name })}</Heading>
      <p>{t("sharing.stop.body", { date: dateOf(r.ends) })}</p>
      {/* Only where this share actually has one out there, rather than wherever the setting is on. */}
      {r.openings.some((o) => o.cid) && <p>{t("sharing.stop.bodyOnline")}</p>}
      {open && <p>{t("sharing.stop.openNow", { time: timeOf(open) })}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="flow-actions">
        <button type="button" className="button" disabled={busy} onClick={() => void stop()}>
          {busy ? t("privacy.working") : t("sharing.stop.confirm")}
        </button>
        <button type="button" className="button secondary" onClick={onBack}>
          {t("sharing.stop.keep")}
        </button>
      </div>
    </section>
  );
}
