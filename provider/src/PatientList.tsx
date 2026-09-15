import { dateOf, timeOf } from "@app/i18n/format";
import { Heading } from "@app/protect/FlowParts";
import { askedAgo } from "@app/sharing/RequestCard";
import { Row } from "@app/ui/Row";
import { t } from "./i18n";
import type { Patient } from "./patients";
import { patientName } from "./Provider";
import type { Opening } from "./visit";

export function patientStatus(p: Patient, opening: Opening | null, now: number): string {
  if (opening) return t("patients.open", { time: timeOf(opening.until) });
  if (p.asking) return t("patients.waiting", { when: askedAgo(p.asking.asked, now) });
  return t("patients.shared", { date: dateOf(p.ends) });
}

/** The patients kept, the newest first, each with where their share stands; and a new one, at a visit. */
export function PatientList({
  patients,
  openingOf,
  now,
  onOpen,
  onNew,
}: {
  patients: Patient[];
  openingOf(id: string): Opening | null;
  now: number;
  onOpen(id: string): void;
  onNew(): void;
}) {
  const sorted = [...patients].sort((a, b) => b.read - a.read);
  return (
    <section className="steps">
      <Heading>{t("patients.title")}</Heading>
      <div className="flow-actions">
        <button type="button" className="button" onClick={onNew}>
          {t("patients.new")}
        </button>
      </div>
      {sorted.length ? (
        <div className="rows">
          {sorted.map((p) => (
            <Row key={p.id} label={patientName(p)} value={patientStatus(p, openingOf(p.id), now)} onClick={() => onOpen(p.id)} />
          ))}
        </div>
      ) : (
        <p className="flow-note">{t("patients.none")}</p>
      )}
    </section>
  );
}
