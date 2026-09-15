import { useMemo, useRef, useState, type FormEvent } from "react";
import { FlowBack, Heading } from "@app/protect/FlowParts";
import { QrCode, QrScanner } from "@app/qr";
import { ShareError } from "@app/share";
import { spaced } from "@app/sharing/ShareFlow";
import { t } from "./i18n";
import type { Me } from "./me";
import type { Patient } from "./patients";
import { CodeCollector, newPairing, readVisit, type Opening } from "./visit";

type Step = "label" | "code" | "scan";

const problemText = (e: unknown): string =>
  e instanceof ShareError
    ? e.problem === "not-for-you"
      ? t("newPatient.notForYou")
      : e.problem === "newer"
        ? t("newPatient.newer")
        : e.problem === "damaged"
          ? t("newPatient.damaged")
          : t("newPatient.notShare")
    : t("failed", { message: e instanceof Error ? e.message : String(e) });

/**
 * A new patient, at the visit (docs/DESIGN.md §9): a note to know them by, the code made for them —
 * with the six digits their phone shows too — then the camera, reading the share almanac shows back.
 * The pairing is made when this screen opens and lives only as long as it does.
 */
export function NewPatient({ me, onBack, onRead }: { me: Me; onBack(): void; onRead(patient: Patient, opening: Opening): Promise<void> }) {
  const [step, setStep] = useState<Step>("label");
  const [label, setLabel] = useState("");
  const pairing = useMemo(() => newPairing(me.name), [me.name]);
  const collector = useRef(new CodeCollector());
  const [progress, setProgress] = useState<{ read: number; of: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function heard(code: string) {
    if (done) return;
    let result: ReturnType<CodeCollector["add"]>;
    try {
      result = collector.current.add(code);
    } catch (e) {
      setProgress(null);
      setProblem(problemText(e));
      return;
    }
    if (!("bytes" in result)) {
      setProblem(null);
      setProgress(result);
      return;
    }
    try {
      const read = readVisit(result.bytes, pairing, label, Date.now());
      setDone(true);
      void onRead(read.patient, read.opening).catch((e: unknown) => {
        setDone(false);
        setProblem(problemText(e));
      });
    } catch (e) {
      collector.current = new CodeCollector();
      setProgress(null);
      setProblem(e instanceof ShareError && e.message === "a share that has ended" ? t("newPatient.ended") : problemText(e));
    }
  }

  return (
    <section className="steps">
      {step === "label" && (
        <form
          className="steps"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setStep("code");
          }}
        >
          <FlowBack onBack={onBack} />
          <Heading>{t("newPatient.title")}</Heading>
          <div className="field">
            <label htmlFor="patient-label">{t("newPatient.label")}</label>
            <input id="patient-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} autoComplete="off" aria-describedby="patient-label-note" />
            <p className="flow-note" id="patient-label-note">
              {t("newPatient.labelNote")}
            </p>
          </div>
          <div className="flow-actions">
            <button type="submit" className="button">
              {t("newPatient.show")}
            </button>
          </div>
        </form>
      )}

      {step === "code" && (
        <>
          <FlowBack onBack={() => setStep("label")} />
          <Heading>{t("newPatient.codeTitle")}</Heading>
          <div className="pairing-code">
            <QrCode text={pairing.code} label={t("newPatient.codeLabel")} />
          </div>
          <div className="share-who">
            <p className="share-name" dir="auto">
              {me.name}
            </p>
            <p className="share-digits" role="img" aria-label={t("newPatient.digits", { digits: pairing.check.split("").join(" ") })}>
              {spaced(pairing.check)}
            </p>
          </div>
          <p className="flow-note">{t("newPatient.codeNote")}</p>
          <div className="flow-actions">
            <button type="button" className="button" onClick={() => setStep("scan")}>
              {t("newPatient.ready")}
            </button>
          </div>
        </>
      )}

      {step === "scan" && (
        <>
          <FlowBack onBack={() => setStep("code")} />
          <Heading>{t("newPatient.scanTitle")}</Heading>
          <p className="flow-note">{t("newPatient.scanNote")}</p>
          {!done && <QrScanner onCode={heard} label={t("newPatient.camera")} />}
          <p className="scan-progress" role="status">
            {progress ? t("newPatient.progress", { n: progress.read, of: progress.of }) : ""}
          </p>
          {problem && <p role="alert">{problem}</p>}
        </>
      )}
    </section>
  );
}
