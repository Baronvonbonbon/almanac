import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { ScanError, startScanner, type ScanProblem } from "./scanner";
import "./qr.css";

const PROBLEMS = { noCamera: "qr.noCamera", denied: "qr.denied", unavailable: "qr.unavailable" } as const satisfies Record<ScanProblem, string>;

/**
 * What the line under the camera says as time passes, and when (ms). A camera that is looking and a
 * camera that will never read anything look the same, so it says which as far as it can tell — and
 * after a while, what to try. As `Starting.tsx` does while the host is slow.
 */
const LOOKING = ["qr.looking", "qr.stillLooking", "qr.slowLooking"] as const;
const STAGES = [0, 6000, 15000] as const;

/** The camera, reading codes: `onCode` hears each new one while this is on screen. */
export function QrScanner({ onCode, label }: { onCode(text: string): void; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const heard = useRef(onCode);
  const [problem, setProblem] = useState<ScanProblem | null>(null);
  const [trouble, setTrouble] = useState(false);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    heard.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const timers = STAGES.slice(1).map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    startScanner(
      video.current!,
      (text) => heard.current(text),
      abort.signal,
      () => !abort.signal.aborted && setTrouble(true),
    ).catch((e: unknown) => {
      if (!abort.signal.aborted) setProblem(e instanceof ScanError ? e.problem : "unavailable");
    });
    return () => abort.abort();
  }, []);

  return (
    <>
      <div className="qr-scanner">
        <video ref={video} className="qr-video" muted playsInline aria-label={label} hidden={problem !== null} />
        {problem ? (
          <p className="qr-problem" role="alert">
            {t(PROBLEMS[problem])}
          </p>
        ) : (
          <span className="qr-aim" aria-hidden="true" />
        )}
      </div>
      {/* Kept in the page whether or not it has words, so each new one is announced. */}
      <p className="qr-looking" role="status">
        {problem ? "" : trouble ? t("qr.trouble") : t(LOOKING[stage])}
      </p>
    </>
  );
}
