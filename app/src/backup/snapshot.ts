import type { Host } from "../platform";
import { Vault, type KdfParams } from "../vault";
import { BackupError } from "./format";

/** What a backup holds: every record of the vault, by name, apart from what belongs to one phone. */
export interface Snapshot {
  v: 1;
  created: number;
  records: Record<string, unknown>;
}

/** The PIN and duress PIN are set on each phone; a restored almanac starts without them. */
export const PHONE_ONLY = new Set(["protection"]);

export async function takeSnapshot(vault: Vault, now = Date.now()): Promise<Snapshot> {
  const records: Record<string, unknown> = {};
  for (const name of await vault.list()) if (!PHONE_ONLY.has(name)) records[name] = await vault.readJSON(name);
  return { v: 1, created: now, records };
}

/** A new vault on this phone holding what the snapshot held. Written in one go: no half-restored vault is left behind. */
export async function restoreSnapshot(host: Host, snapshot: unknown, kdf?: KdfParams): Promise<Vault> {
  const s = snapshot as Partial<Snapshot> | null;
  if (typeof s !== "object" || s === null || typeof s.v !== "number" || typeof s.records !== "object" || s.records === null) {
    throw new BackupError("format", "not an almanac backup");
  }
  if (s.v > 1) throw new BackupError("newer", "made by a newer version of almanac");
  const records = Object.fromEntries(Object.entries(s.records).filter(([name]) => !PHONE_ONLY.has(name) && !name.startsWith("_")));
  return Vault.create(host, kdf, records);
}
