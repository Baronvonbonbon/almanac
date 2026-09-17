import type { ISODate } from "../cycle";
import { hex } from "../lib/bytes";
import type { Category, NewShare, Pairing } from "../share";
import type { Vault } from "../vault";

/**
 * The shares almanac has made, kept in the vault (docs/DESIGN.md §9) as one record, "shares" — so a
 * backup carries them, and the decoy, a vault of its own, has none. A share's keys stay only while
 * they are needed: stopping it forgets the key that opens it, at once, so no opening can be allowed
 * again; the rest goes at the end date, after which there is nothing left to answer.
 *
 * Read at every start, so this imports only types from the share formats: they load with the
 * sharing screens.
 */

export interface ShareChoice {
  categories: Category[];
  from: ISODate;
  to: ISODate;
}

export interface ShareOpening {
  at: number;
  until: number;
  /** The key the provider app asked with — absent for the first, which went with the share. */
  key?: string;
  /**
   * The blob on Bulletin this opening opens, and the key that opens it — both absent when it opens
   * the payload from the visit instead (docs/DESIGN.md §9). Each upload has a key of its own, so the
   * key for one opening opens that upload and no other.
   */
  cid?: string;
  payloadKey?: string;
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
  openings: ShareOpening[];
  /** The keys of requests answered, allowed or not — the last 32 — so none is asked about twice. */
  answered?: string[];
}

const SHARES = "shares";
const ANSWERED_KEPT = 32;
const ONLINE_OK = "sharing-online";

/**
 * When the patient agreed that a later opening may put a copy on Bulletin — `null` until they have
 * been told (docs/DESIGN.md §9, the same gate backups have at §8, R7). **Nothing uploads before this
 * is set.** Kept in the vault, so the decoy has its own and inherits no agreement from the real one.
 */
export const readOnlineOk = async (vault: Vault): Promise<number | null> => (await vault.readJSON<number>(ONLINE_OK)) ?? null;

export const setOnlineOk = (vault: Vault, at: number): Promise<void> => vault.writeJSON(ONLINE_OK, at);

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

/**
 * Answers the provider app's requests to open a share: with the opening allowed, or with none for
 * "Not now". Either way they are not asked about again; the provider app can always ask anew.
 */
export const answerRequests = (vault: Vault, id: string, keys: string[], opening?: ShareOpening & { key: string }): Promise<void> =>
  change(vault, id, (r) => ({
    ...r,
    openings: opening ? [...r.openings, opening] : r.openings,
    answered: [...(r.answered ?? []).filter((k) => !keys.includes(k)), ...keys].slice(-ANSWERED_KEPT),
  }));

/** Forgets shares past their end date, keys and all. */
export const pruneShares = (vault: Vault, now: number): Promise<void> => vault.updateJSON<ShareRecord[]>(SHARES, (all) => (all ?? []).filter((r) => r.ends > now));

/** Whether a provider can still be allowed to open it. */
export const isLive = (r: ShareRecord, now: number): boolean => r.shareKey !== undefined && r.stopped === undefined && r.ends > now;

/**
 * Until when an opening the patient allowed is still open on the provider's screen, if one is.
 * Stopping the share cannot close it: the provider app already holds the key for that long.
 */
export function openUntil(r: ShareRecord, now: number): number | null {
  const open = r.openings.map((o) => o.until).filter((until) => until > now);
  return open.length ? Math.max(...open) : null;
}

/** The shares kept, once any past their end date are forgotten — keys and all. */
export async function keptShares(vault: Vault, now: number): Promise<ShareRecord[]> {
  const all = await readShares(vault);
  if (all.every((r) => r.ends > now)) return all;
  await pruneShares(vault, now);
  return all.filter((r) => r.ends > now);
}
