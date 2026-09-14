/** On or off, with a line saying what it does — read out together with the switch. */
export function Toggle({ id, label, note, checked, onChange, disabled }: { id: string; label: string; note: string; checked: boolean; onChange?(on: boolean): void; disabled?: boolean }) {
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <label className="toggle-label" htmlFor={id}>
          {label}
        </label>
        <span className="toggle-note" id={`${id}-note`}>
          {note}
        </span>
      </div>
      <button id={id} type="button" role="switch" className="switch" aria-checked={checked} aria-describedby={`${id}-note`} disabled={disabled} onClick={() => onChange?.(!checked)} />
    </div>
  );
}
