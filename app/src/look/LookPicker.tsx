import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { CycleGraphic } from "../cycle-graphic/CycleGraphic";
import type { CycleShape } from "../cycle-graphic/shape";
import { t } from "../i18n";
import { cssVariables, LOOK_IDS, previewFonts, useLook, type LookId } from ".";
import "./look-picker.css";

/** The cycle every preview draws — an example, and the screen says so. */
const EXAMPLE: CycleShape = { day: 12, length: 28, periodDays: 5, fertile: [10, 16], likely: [28, 30] };

/**
 * The three looks as live previews, each drawn in its own colours and fonts whatever look the page is
 * in. A radio group: arrow keys move the choice, as they do between radio buttons.
 */
export function LookPicker({ value, onChange, labelledBy }: { value: LookId; onChange(look: LookId): void; labelledBy: string }) {
  const { variant } = useLook();
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(previewFonts, []);

  function onKeyDown(e: KeyboardEvent) {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = (LOOK_IDS.indexOf(value) + delta + LOOK_IDS.length) % LOOK_IDS.length;
    onChange(LOOK_IDS[i]);
    cards.current[i]?.focus();
  }

  return (
    <div className="looks" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {LOOK_IDS.map((id, i) => (
        <button
          key={id}
          ref={(el) => {
            cards.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={id === value}
          tabIndex={id === value ? 0 : -1}
          className="look-card"
          style={cssVariables(id, variant) as CSSProperties}
          onClick={() => onChange(id)}
        >
          <span className="look-graphic" aria-hidden="true">
            <CycleGraphic look={id} shape={EXAMPLE} compact />
          </span>
          <span className="look-text">
            <span className="look-name">{t(`looks.${id}.name`)}</span>
            <span className="look-about">{t(`looks.${id}.about`)}</span>
            <span className="button look-sample" aria-hidden="true">
              {t("home.logToday")}
            </span>
          </span>
          {id === value && (
            <span className="look-chosen" aria-hidden="true">
              ✓ {t("looks.chosen")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
