import { useEffect, useRef, type ReactNode } from "react";
import { formatCode } from "../backup/code";
import { t } from "../i18n";

/** A step's heading, which takes focus as the step appears, so a screen reader starts reading there. */
export function Heading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 className={className} tabIndex={-1} ref={ref}>
      {children}
    </h1>
  );
}

export function FlowBack({ onBack }: { onBack(): void }) {
  return (
    <button type="button" className="link-button flow-back" onClick={onBack}>
      ‹ {t("onboarding.back")}
    </button>
  );
}

/** The backup code in seven groups of four, spelled out for a screen reader. */
export function CodeBox({ code }: { code: string }) {
  return (
    <p className="backup-code" role="img" aria-label={code.split("").join(" ")}>
      {formatCode(code)
        .split(" ")
        .map((group, i) => (
          <span key={i}>{group}</span>
        ))}
    </p>
  );
}

export const message = (e: unknown): string => t("app.failed", { message: e instanceof Error ? e.message : String(e) });
