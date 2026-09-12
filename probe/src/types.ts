import type { Journal } from "./journal";

/**
 * pass — works the way almanac hopes.
 * fail — does not, or a privacy risk is confirmed.
 * info — a measurement to compare across runs or devices.
 * skip — could not run here (usually: outside the Polkadot app).
 */
export type Status = "pass" | "fail" | "info" | "skip";

export interface Outcome {
  status: Status;
  summary: string;
  data?: Record<string, unknown>;
}

export interface Context {
  journal: Journal;
  /** Contents of the check's text input, if it has one. */
  input: string;
  /** Progress lines shown under the check while it runs. */
  log: (line: string) => void;
}

export interface Check {
  id: string;
  /** The question, in plain words. */
  title: string;
  /** What the answer decides for almanac. */
  decides: string;
  /** Steps for the person running the probe, shown before the button. */
  steps?: string[];
  /** Skip outside the Polkadot app — the host API does not exist there. */
  needsHost?: boolean;
  /** Labels for a by-hand confirmation, for things only a person can observe. */
  confirm?: [string, string];
  input?: { label: string; placeholder: string };
  run?: (ctx: Context) => Promise<Outcome>;
}
