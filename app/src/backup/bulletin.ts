import { hex } from "../lib/bytes";
import type { Host } from "../platform";
import type { KdfParams, Vault } from "../vault";
import { backupKeys, parseCode } from "./code";
import { BackupError, openBackup, sealBackup } from "./format";
import { BACKUP_CHANNEL, newestPointer, pointerStatement } from "./pointer";
import { saveBackup, type BackupRecord } from "./record";
import { restoreSnapshot, takeSnapshot } from "./snapshot";

/**
 * Backups on Bulletin (docs/DESIGN.md §8) — the same sealed backup that is copied as text, put where
 * a new phone can fetch it, with one statement saying where.
 *
 * **This is a convenience, not the recovery path.** Measured retention is about a fortnight (P7), so
 * a backup here expires long before the failure it exists for — a phone lost and replaced months
 * later. The copied backup stays the only one that does not expire, and every failure below leaves it
 * untouched and says so. §8 lists what this assumes and what must be measured before launch.
 *
 * Nothing here involves an account. The backup code alone gives `KB`, which seals the backup, and
 * `TB`, the topic its pointer goes out on — so a restore works after a devnet reset, on a new
 * account, on a phone that has never seen the old one (R8, and P9b/P9c for the delivery).
 */

/** B2: P6c measured 1 MiB as the largest upload that goes up whole, charged at exactly its own size. */
export const MAX_BULLETIN_BYTES = 1024 * 1024;

/** As long as the store allows (P9), so the pointer outlives the blob it points at rather than the reverse. */
const LIFETIME_MS = 90 * 86_400_000;

/** Long enough for the store to deliver what it already holds, which is where a pointer will be. */
const LISTEN_MS = 20_000;

/**
 * Put everything logged so far on Bulletin, and say where it is. Returns the record to keep.
 *
 * Throws `BackupError` and changes nothing when it cannot: `no-storage` where there is nowhere to put
 * one, `too-large` past what one upload takes, `refused` when the host will not store it — which is
 * also what a spent quota looks like from here (B3). **The pointer is written last**, so a failed
 * backup leaves the previous one pointed at and restorable.
 */
export async function backUpToBulletin(host: Host, vault: Vault, record: BackupRecord, now = Date.now()): Promise<BackupRecord> {
  if (!host.blobs || !host.statements) throw new BackupError("no-storage", "this almanac has nowhere to keep a backup");

  const code = parseCode(record.code);
  if (!("entropy" in code)) throw new BackupError("format", "the saved backup code is damaged");
  const keys = backupKeys(code.entropy);

  // The snapshot carries the record as it stands, without this upload: a restored almanac then makes
  // a backup of its own rather than believing in one made by a phone it is replacing.
  const sealed = sealBackup(code.entropy, await takeSnapshot(vault, now));
  if (sealed.length > MAX_BULLETIN_BYTES) throw new BackupError("too-large", "more than one upload takes");

  let hash: Uint8Array;
  try {
    hash = await host.blobs.put(sealed);
  } catch (e) {
    throw new BackupError("refused", e instanceof Error ? e.message : String(e));
  }

  const { data, topics } = pointerStatement(keys.key, keys.topic, { hash, at: now });
  await host.statements.publish({ channel: BACKUP_CHANNEL, topics, data, expires: now + LIFETIME_MS });

  const next: BackupRecord = { ...record, bulletin: { at: now, hash: hex(hash) } };
  await saveBackup(vault, next);
  return next;
}

/**
 * Restore from Bulletin with the backup code alone: derive `KB` and `TB`, listen for the newest
 * pointer, fetch what it points at, open it.
 *
 * Throws `BackupError`: `wrong-code` for a code that is not one, `not-found` when no pointer arrives
 * or the backup it names is gone — those two are one answer on purpose, since from outside they look
 * the same — and whatever `openBackup` throws for a backup that does not open.
 */
export async function restoreFromBulletin(
  host: Host,
  typed: string,
  options: { ms?: number; kdf?: KdfParams } = {},
): Promise<{ vault: Vault; at: number }> {
  if (!host.blobs || !host.statements) throw new BackupError("no-storage", "this almanac has nowhere to look for a backup");

  const code = parseCode(typed);
  if (!("entropy" in code)) throw new BackupError("wrong-code", "not a backup code");
  const keys = backupKeys(code.entropy);

  const heard = await listenFor(host, keys.topic, options.ms ?? LISTEN_MS);
  const pointer = newestPointer(keys.key, heard);
  if (!pointer) throw new BackupError("not-found", "no backup was found for that code");

  const bytes = await host.blobs.get(pointer.hash);
  if (!bytes) throw new BackupError("not-found", "the backup that points at is gone");

  const vault = await restoreSnapshot(host, openBackup(code.entropy, bytes), options.kdf);
  return { vault, at: pointer.at };
}

/** Everything heard on one topic within `ms`. The newest of them is the pointer; order does not matter. */
function listenFor(host: Host, topic: Uint8Array, ms: number): Promise<Uint8Array[]> {
  return new Promise((resolve) => {
    const seen: Uint8Array[] = [];
    const stop = host.statements!.listen([topic], (data) => seen.push(data));
    setTimeout(() => {
      stop();
      resolve(seen);
    }, ms);
  });
}
