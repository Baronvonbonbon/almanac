import { useState, type FormEvent } from "react";
import { addDays, type ISODate } from "../cycle";
import { t } from "../i18n";
import { dateOf, shortDate } from "../i18n/format";
import type { Host } from "../platform";
import { FlowBack, Heading, message } from "../protect/FlowParts";
import { QrLoop, QrScanner } from "../qr";
import {
  CATEGORIES,
  decodeSelection,
  encodeSelection,
  MAX_PAYLOAD,
  newShare,
  readPairingCode,
  REGISTRY_KEY,
  sealShare,
  ShareError,
  toFrames,
  verifyProvider,
  type Category,
  type Pairing,
  type Selection,
} from "../share";
import type { CycleData } from "../shell/useCycle";
import { DatePicker } from "../ui/DatePicker";
import { Row } from "../ui/Row";
import { Toggle } from "../ui/Toggle";
import type { Vault } from "../vault";
import { sendSharing } from "./outbox";
import { addShare, shareRecord, stopShare, type ShareChoice } from "./records";
import { defaultChoice, offeredCategories, selectForShare } from "./select";
import { SelectionView } from "./SelectionView";
import { DEFAULT_SHARE_DAYS, OPENINGS, openingUntil, RANGES, SHARE_DAYS, shareEnds, type Opening, type ShareDays } from "./times";

type Step = "scan" | "check" | "choose" | "preview" | "show";

/** The six digits in two groups of three, as the provider app shows them. */
export const spaced = (check: string): string => `${check.slice(0, 3)} ${check.slice(3)}`;

const isEmpty = (s: Selection) => !Object.keys(s.days).length && !s.cycles?.length && !s.fertile && !s.pregnancy;

/**
 * Why a scanned code was refused. "Nobody vouched for them" and "their registration has run out" are
 * kept apart on purpose: the first is a reason to stop, the second is something their clinic can fix
 * in a minute, and telling a patient the wrong one of the two sends them away for no reason.
 */
function scanNoteFor(e: unknown): "sharing.scan.notProvider" | "sharing.scan.newer" | "sharing.scan.untrusted" | "sharing.scan.expired" {
  if (!(e instanceof ShareError)) return "sharing.scan.notProvider";
  if (e.problem === "newer") return "sharing.scan.newer";
  if (e.problem === "untrusted") return "sharing.scan.untrusted";
  if (e.problem === "expired") return "sharing.scan.expired";
  return "sharing.scan.notProvider";
}

/**
 * A share with a provider, at the visit (docs/DESIGN.md §9): scan their code, check the name and six
 * digits against their screen, choose what to share, see exactly what they will, and pick how long this
 * first opening lasts — then the share, as a loop of codes for their app to read.
 */
export function ShareFlow({
  vault,
  host,
  data,
  onBack,
  onChanged,
  onDone,
}: {
  vault: Vault;
  host: Host;
  data: CycleData;
  onBack(): void;
  onChanged(): void;
  onDone(notice: string): void;
}) {
  const today = data.today;
  const [step, setStep] = useState<Step>("scan");
  const [pairing, setPairing] = useState<(Pairing & { check: string }) | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [choice, setChoice] = useState<ShareChoice>(() => defaultChoice(today));
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [days, setDays] = useState<ShareDays>(DEFAULT_SHARE_DAYS);
  const [preview, setPreview] = useState<{ payload: Uint8Array; selection: Selection } | null>(null);
  const [shown, setShown] = useState<{ id: string; codes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const earliest = data.entries[0]?.date ?? today;
  const name = pairing?.name ?? "";

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  function heard(code: string) {
    try {
      const read = readPairingCode(code);
      // Before the name and digits are shown, and so before the patient is asked to vouch for them
      // by eye: almanac makes no share for a provider no registry has vouched for. Nothing leaves
      // the phone to check it — the registry's key is in this bundle (share/attest.ts).
      verifyProvider(read, { registryKey: REGISTRY_KEY, now: Date.now() });
      setPairing(read);
      setScanNote(null);
      go("check");
    } catch (e) {
      setScanNote(t(scanNoteFor(e)));
    }
  }

  function usePasted(e: FormEvent) {
    e.preventDefault();
    heard(pasted.replace(/\s+/g, "").toUpperCase());
  }

  const toggle = (c: Category) => (on: boolean) => setChoice((ch) => ({ ...ch, categories: CATEGORIES.filter((x) => (x === c ? on : ch.categories.includes(x))) }));
  const range = (from: ISODate) => {
    setChoice((ch) => ({ ...ch, from, to: today }));
    setPicking(null);
  };
  const presets = [
    ...RANGES.map((r) => ({ from: addDays(today, -r.back), label: r.months === 12 ? t("sharing.choose.year") : t("sharing.choose.months", { n: r.months }) })),
    { from: earliest, label: t("sharing.choose.everything") },
  ];
  const dateText = (d: ISODate) => (d === today ? t("common.today") : shortDate(d, true));

  const offered = offeredCategories(data.entries, data.settings, choice);

  async function review() {
    // A category switched on for other days, then left behind by a change of dates, is not shared.
    const chosen: ShareChoice = { ...choice, categories: choice.categories.filter((c) => offered.includes(c)) };
    if (!chosen.categories.length) return setError(t("sharing.choose.nothingChosen"));
    setChoice(chosen);
    setBusy(true);
    setError(null);
    try {
      const selection = selectForShare(data.entries, data.settings, chosen, today);
      if (isEmpty(selection)) return setError(t("sharing.choose.nothingThere"));
      const payload = await encodeSelection(selection);
      if (payload.length > MAX_PAYLOAD) return setError(t("sharing.choose.tooMuch"));
      // Shown from the packed bytes, unpacked again: the preview is what the provider app will read.
      setPreview({ payload, selection: await decodeSelection(payload) });
      go("preview");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function seal(opening: Opening) {
    setBusy(true);
    setError(null);
    try {
      const now = Date.now();
      const ends = shareEnds(now, days);
      const share = newShare(ends, preview!.payload);
      const until = openingUntil(opening, now, ends);
      const codes = toFrames(sealShare(share, pairing!, until));
      // Kept before it is shown, so it can be stopped from the moment their app might have it.
      const record = shareRecord(share, pairing!, choice, now, until);
      await addShare(vault, record);
      onChanged();
      setShown({ id: record.id, codes });
      go("show");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await stopShare(vault, shown!.id, Date.now());
      // Stopped here whatever happens next; telling their app can wait for a connection.
      const sent = await sendSharing(host, vault).then(
        () => true,
        () => false,
      );
      onChanged();
      onDone(t(sent ? "sharing.stop.done" : "sharing.stop.doneLater", { name }));
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <section className="steps">
      {step === "scan" && (
        <>
          <FlowBack onBack={onBack} />
          <Heading>{t("sharing.scan.title")}</Heading>
          <p className="flow-note">{t("sharing.scan.note")}</p>
          {pasting ? (
            <form className="steps" onSubmit={usePasted}>
              <div className="field">
                <label htmlFor="share-paste">{t("sharing.scan.pasteLabel")}</label>
                <textarea id="share-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
              </div>
              {scanNote && <p role="alert">{scanNote}</p>}
              <div className="flow-actions">
                <button type="submit" className="button" disabled={!pasted.trim()}>
                  {t("sharing.scan.use")}
                </button>
                <button type="button" className="link-button" onClick={() => setPasting(false)}>
                  {t("sharing.scan.camera2")}
                </button>
              </div>
            </form>
          ) : (
            <>
              <QrScanner onCode={heard} label={t("sharing.scan.camera")} />
              {scanNote && <p role="alert">{scanNote}</p>}
              <button
                type="button"
                className="link-button flow-back"
                onClick={() => {
                  setScanNote(null);
                  setPasting(true);
                }}
              >
                {t("sharing.scan.paste")}
              </button>
            </>
          )}
        </>
      )}

      {step === "check" && pairing && (
        <>
          <FlowBack onBack={() => go("scan")} />
          <Heading>{t("sharing.check.title")}</Heading>
          <div className="share-who">
            <p className="share-name" dir="auto">
              {pairing.name}
            </p>
            <p className="share-digits" role="img" aria-label={t("sharing.check.digits", { digits: pairing.check.split("").join(" ") })}>
              {spaced(pairing.check)}
            </p>
          </div>
          <p className="flow-note">{t("sharing.check.note")}</p>
          <div className="flow-actions">
            <button type="button" className="button" onClick={() => go("choose")}>
              {t("sharing.check.match")}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setPairing(null);
                setScanNote(t("sharing.check.noMatchNote"));
                go("scan");
              }}
            >
              {t("sharing.check.noMatch")}
            </button>
          </div>
        </>
      )}

      {step === "choose" && (
        <>
          <FlowBack onBack={() => go("check")} />
          <Heading>{t("sharing.choose.title")}</Heading>

          <section className="share-group" aria-labelledby="share-what">
            <h2 id="share-what">{t("sharing.choose.what")}</h2>
            <div className="toggles">
              {offered.map((c) => (
                <Toggle key={c} id={`share-${c}`} label={t(`sharing.categories.${c}`)} note={t(`sharing.categoryNotes.${c}`)} checked={choice.categories.includes(c)} onChange={toggle(c)} />
              ))}
            </div>
          </section>

          <section className="share-group" aria-labelledby="share-days">
            <h2 id="share-days">{t("sharing.choose.days")}</h2>
            <div className="chips" role="group" aria-labelledby="share-days">
              {presets.map((p) => (
                <button key={p.label} type="button" className="chip" aria-pressed={choice.to === today && choice.from === p.from} onClick={() => range(p.from)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="rows">
              <Row label={t("sharing.choose.from")} value={dateText(choice.from)} expanded={picking === "from"} onClick={() => setPicking(picking === "from" ? null : "from")} />
              <Row label={t("sharing.choose.until")} value={dateText(choice.to)} expanded={picking === "to"} onClick={() => setPicking(picking === "to" ? null : "to")} />
            </div>
            {picking === "from" && (
              <DatePicker
                value={choice.from}
                min={earliest < choice.from ? earliest : choice.from}
                max={choice.to}
                today={today}
                onChange={(from) => {
                  setChoice((ch) => ({ ...ch, from }));
                  setPicking(null);
                }}
              />
            )}
            {picking === "to" && (
              <DatePicker
                value={choice.to}
                min={choice.from}
                max={today}
                today={today}
                onChange={(to) => {
                  setChoice((ch) => ({ ...ch, to }));
                  setPicking(null);
                }}
              />
            )}
          </section>

          <section className="share-group" aria-labelledby="share-ends">
            <h2 id="share-ends">{t("sharing.choose.ends")}</h2>
            <div className="chips" role="group" aria-labelledby="share-ends">
              {SHARE_DAYS.map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>
                  {t(`sharing.choose.endsIn.d${d}`)}
                </button>
              ))}
            </div>
            <p className="flow-note">{t("sharing.choose.endsOn", { date: dateOf(shareEnds(Date.now(), days)) })}</p>
          </section>

          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void review()}>
              {busy ? t("privacy.working") : t("sharing.choose.review")}
            </button>
          </div>
        </>
      )}

      {step === "preview" && preview && (
        <>
          <FlowBack onBack={() => go("choose")} />
          <Heading>{t("sharing.preview.title", { name })}</Heading>
          <p className="flow-note">{t("sharing.preview.note")}</p>
          <SelectionView selection={preview.selection} />
          <section className="share-group" aria-labelledby="share-how-long">
            <h2 id="share-how-long">{t("sharing.preview.howLong")}</h2>
            <p className="flow-note">{t("sharing.preview.howLongNote")}</p>
            {error && <p role="alert">{error}</p>}
            <div className="flow-actions">
              {OPENINGS.map((o) => (
                <button key={o} type="button" className="button secondary" disabled={busy} onClick={() => void seal(o)}>
                  {t(`sharing.preview.for.${o}`)}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {step === "show" && shown && (
        <>
          <Heading>{t("sharing.show.title")}</Heading>
          <p className="flow-note">{t("sharing.show.note")}</p>
          <QrLoop codes={shown.codes} label={t("sharing.show.codes", { name })} />
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button type="button" className="button" onClick={() => onDone(t("sharing.show.shared", { name }))}>
              {t("sharing.show.done")}
            </button>
            <button type="button" className="link-button" disabled={busy} onClick={() => void cancel()}>
              {t("sharing.show.cancel")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
