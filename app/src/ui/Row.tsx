/**
 * One of a list of rows: a name, a line about it, and a chevron. It opens a screen of its own — or,
 * with `expanded`, shows something below it.
 */
export function Row({ label, value, onClick, expanded }: { label: string; value: string; onClick(): void; expanded?: boolean }) {
  return (
    <button type="button" className="row" onClick={onClick} aria-expanded={expanded}>
      <span className="row-text">
        <span className="row-label">{label}</span>
        <span className="row-value">{value}</span>
      </span>
      <span className="row-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
