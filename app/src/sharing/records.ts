import type { ISODate } from "../cycle";
import { fromHex, hex } from "../lib/bytes";
import { keyPairFrom, type Category, type KeyPair, type NewShare, type Pairing } from "../share";
import type { Vault } from "../vault";

/**
 * The shares almanac has made, kept in the vault (docs/DESIGN.md §9) as one record, "shares" — so a
 * backup carries them, and the decoy, a vault of its own, has none. A share's keys stay only while
 * they are needed: stopping it forgets the key that opens it, at once, so no opening can be allowed
 * again; the rest goes at the end date, after which there is nothing left to answer.
 */

export interface ShareChoice {
  categories: Category[];
  from: ISODate;
  to: ISODate;
}

export interface ShareRecord {
  id: string;
  provider: { name: string; key: string; check: string };
  made: number;
  ends: number;
  choice: ShareChoice;
  /** The secret half of the share's own key pair: it seals approvals, and the stop. */
  secret: string;
  /** Opens what was shared. Gone once the share stops. */
  shareKey?: string;
  stopped?: number;
  /** Each opening allowed, and until when: the sharing history in Privacy. */
  openings: { at: number; until: number }[];
}

const SHARES = "shares";

export const readShares = async (vault: Vault): Promise<ShareRecord[]> => (await vault.readJSON<ShareRecord[]>(SHARES)) ?? [];

/** The record for a share just made at the visit, whose first opening lasts until `until`. */
export const shareRecord = (share: NewShare, pairing: Pairing & { check: string }, choice: ShareChoice, now: number, until: number): ShareRecord => ({
  id: hex(share.id),
  provider: { name: pairing.name, key: hex(pairing.providerKey), check: pairing.check },
  made: now,
  ends: share.ends,
  choice,
  secret: hex(share.sender.secretKey),
  shareKey: hex(share.shareKey),
  openings: [{ at: now, until }],
});

export const addShare = (vault: Vault, record: ShareRecord): Promise<void> => vault.updateJSON<ShareRecord[]>(SHARES, (all) => [...(all ?? []), record]);

const change = (vault: Vault, id: string, f: (r: ShareRecord) => ShareRecord): Promise<void> =>
  vault.updateJSON<ShareRecord[]>(SHARES, (all) => (all ?? []).map((r) => (r.id === id ? f(r) : r)));

/** Stops a share: its key is forgotten, so almanac can never allow another opening. */
export const stopShare = (vault: Vault, id: string, now: number): Promise<void> =>
  change(vault, id, (r) => {
    const next: ShareRecord = { ...r, stopped: now };
    delete next.shareKey;
    return next;
  });

/** Notes an opening the patient allowed, for the sharing history. */
export const recordOpening = (vault: Vault, id: string, at: number, until: number): Promise<void> =>
  change(vault, id, (r) => ({ ...r, openings: [...r.openings, { at, until }] }));

/** Forgets shares past their end date, keys and all. */
export const pruneShares = (vault: Vault, now: number): Promise<void> => vault.updateJSON<ShareRecord[]>(SHARES, (all) => (all ?? []).filter((r) => r.ends > now));

/** Whether a provider can still be allowed to open it. */
export const isLive = (r: ShareRecord, now: number): boolean => r.shareKey !== undefined && r.stopped === undefined && r.ends > now;

/** A record's keys, as the share formats take them. */
export function shareKeys(r: ShareRecord): { id: Uint8Array; sender: KeyPair; providerKey: Uint8Array; shareKey?: Uint8Array } {
  return {
    id: fromHex(r.id),
    sender: keyPairFrom(fromHex(r.secret)),
    providerKey: fromHex(r.provider.key),
    ...(r.shareKey ? { shareKey: fromHex(r.shareKey) } : {}),
  };
}
