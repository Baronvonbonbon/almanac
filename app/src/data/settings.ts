import type { Vault } from "../vault";

/**
 * The data format version. Any change to what almanac stores — settings or month records — bumps it
 * and adds a migration below.
 */
export const SCHEMA = 1;

/** docs/DESIGN.md §5. */
export interface Settings {
  schema: typeof SCHEMA;
  modes: { fertility: boolean; ttc: boolean; pregnancy: boolean };
  typicalCycle?: number;
  typicalPeriod?: number;
  reminders: { enabled: boolean; wording: "discreet" | "plain" };
}

export const DEFAULT_SETTINGS: Settings = {
  schema: SCHEMA,
  modes: { fertility: false, ttc: false, pregnancy: false },
  reminders: { enabled: false, wording: "discreet" },
};

/** The usual lengths someone can give, in days, and where a stepper starts before they give one. */
export const TYPICAL_CYCLE = { min: 15, max: 60, start: 28 };
export const TYPICAL_PERIOD = { min: 1, max: 14, start: 5 };

export type Stored = { schema: number } & Record<string, unknown>;
type Migration = (old: Stored) => Stored;

/** Each entry upgrades stored data from version n to n + 1. None yet: version 1 is the first. */
const MIGRATIONS: Record<number, Migration> = {};

export class NewerDataError extends Error {
  constructor(
    readonly found: number,
    readonly known: number,
  ) {
    super(`saved by a newer version of almanac (format ${found}; this one knows up to ${known})`);
    this.name = "NewerDataError";
  }
}

export function runMigrations(stored: Stored, migrations: Record<number, Migration>, target: number): Stored {
  // Fail closed: rewriting data from a newer almanac would drop whatever this version does not know.
  if (stored.schema > target) throw new NewerDataError(stored.schema, target);
  let current = stored;
  while (current.schema < target) {
    const step = migrations[current.schema];
    if (!step) throw new Error(`no migration from format ${current.schema}`);
    current = { ...step(current), schema: current.schema + 1 };
  }
  return current;
}

export const migrate = (stored: Stored): Settings => runMigrations(stored, MIGRATIONS, SCHEMA) as unknown as Settings;

export async function loadSettings(vault: Vault): Promise<Settings> {
  const stored = await vault.readJSON<Stored>("settings");
  return stored ? migrate(stored) : structuredClone(DEFAULT_SETTINGS);
}

export const saveSettings = (vault: Vault, settings: Settings): Promise<void> => vault.writeJSON("settings", settings);

/** A usual length set, or with `undefined` forgotten — "Not sure". */
export function withLength(settings: Settings, key: "typicalCycle" | "typicalPeriod", days: number | undefined): Settings {
  const next = { ...settings };
  if (days === undefined) delete next[key];
  else next[key] = days;
  return next;
}

/** Reads, changes and saves the settings as one step, so changes made in quick succession are all kept. */
export const updateSettings = (vault: Vault, change: (settings: Settings) => Settings): Promise<void> =>
  vault.updateJSON<Stored>("settings", (stored) => change(stored ? migrate(stored) : structuredClone(DEFAULT_SETTINGS)) as unknown as Stored);
