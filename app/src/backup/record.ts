import type { DayEntry } from "../cycle";
import type { Vault } from "../vault";
import { newCode, parseCode } from "./code";
import { backupText, sealBackup } from "./format";
import { takeSnapshot } from "./snapshot";

/**
 * The backup code, kept in the vault so every backup uses the same one and it can be shown again —
 * and how far it has got: checked against what was written down, and when a backup was last copied.
 */
export interface BackupRecord {
  code: string;
  checked: boolean;
  copiedAt?: number;
  /** The newest backup on Bulletin, if there is one: its content hash, and when it was made. */
  bulletin?: { at: number; hash: string };
}

/** DESIGN §8: on open, when the last Bulletin backup is at least this old — and never on a log. */
export const BULLETIN_EVERY_MS = 5 * 86_400_000;

/**
 * Whether to put a backup on Bulletin now.
 *
 * Only once the code has been **checked**. Before that nobody has written it down, and a backup
 * nobody can open is worse than no backup: it is a blob on a public network that will outlive its
 * purpose (R7) while helping no one. The copied backup has the same rule for the same reason.
 */
export const bulletinDue = (record: BackupRecord | null, now: number): boolean =>
  !!record?.checked && (record.bulletin === undefined || now - record.bulletin.at >= BULLETIN_EVERY_MS);

const BACKUP = "backup";

export const readBackup = (vault: Vault): Promise<BackupRecord | null> => vault.readJSON<BackupRecord>(BACKUP);

export const saveBackup = (vault: Vault, record: BackupRecord): Promise<void> => vault.writeJSON(BACKUP, record);

/** The code, made the first time it is asked for. */
export async function startBackup(vault: Vault): Promise<BackupRecord> {
  const existing = await readBackup(vault);
  if (existing) return existing;
  const record: BackupRecord = { code: newCode(), checked: false };
  await saveBackup(vault, record);
  return record;
}

/** Whether anything was logged after the last copy — which that copy then lacks. */
export const isStale = (record: BackupRecord, entries: DayEntry[]): boolean =>
  record.copiedAt !== undefined && entries.some((e) => e.updatedAt > record.copiedAt!);

/** Everything logged so far, sealed with the backup code, as text to copy. */
export async function backupAsText(vault: Vault, record: BackupRecord, heading: string, now = Date.now()): Promise<string> {
  const code = parseCode(record.code);
  if (!("entropy" in code)) throw new Error("the saved backup code is damaged");
  const snapshot = await takeSnapshot(vault, now);
  // The copy knows it was copied: an almanac restored from it should not ask for a backup straight away.
  snapshot.records[BACKUP] = { ...record, copiedAt: now };
  return backupText(sealBackup(code.entropy, snapshot), heading);
}
