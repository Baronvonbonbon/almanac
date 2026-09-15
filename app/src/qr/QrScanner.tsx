import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { ScanError, startScanner, type ScanProblem } from "./scanner";
import "./qr.css";

const PROBLEMS = { noCamera: "qr.noCamera", denied: "qr.denied", unavailable: "qr.unavailable" } as const satisfies Record<ScanProblem, string>;

/** The camera, reading codes: `onCode` hears each new one while this is on screen. */
export function QrScanner({ onCode, label }: { onCode(text: string): void; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const heard = useRef(onCode);
  const [problem, setProblem] = useState<ScanProblem | null>(null);

  useEffect(() => {
    heard.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const abort = new AbortController();
    startScanner(video.current!, (text) => heard.current(text), abort.signal).catch((e: unknown) => {
      if (!abort.signal.aborted) setProblem(e instanceof ScanError ? e.problem : "unavailable");
    });
    return () => abort.abort();
  }, []);

  return (
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
  );
}
