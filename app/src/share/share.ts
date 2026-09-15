import { concatBytes, randomBytes, xchachaDecryptPacked, xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import { ShareError } from "./errors";
import { almanacPair, newKeyPair, providerPair, type KeyPair, type PairKeys } from "./keys";
import { ENTRY_BYTES, openEntry, sealApproval, type Approval } from "./messages";
import type { Pairing } from "./pairing";
import { equal, getU32, ID_BYTES, KEY_BYTES, KIND, putU32, SEAL_OVERHEAD, seconds, VERSION } from "./wire";

/**
 * A share, as it goes to the provider app at the visit (docs/DESIGN.md §9):
 *
 *   header           version | kind | share id | almanac's key for this share | end date
 *   first approval   for the opening key in the provider's code
 *   payload          sealed with the share's own key: the header again, the payload's length, the
 *                    payload — the selection, packed by selection.ts — and zeros
 *
 * Always 2, 4, 8 or 16 KiB, so its size says little of how much was chosen. The provider app keeps the
 * header and the sealed payload until the end date, but never the first approval: every later opening
 * needs an approval of its own. The header is sealed inside too, so a changed end date, or a payload
 * moved under another share's header, does not open.
 */

export const SHARE_BUCKETS = [2, 4, 8, 16].map((k) => k * 1024);
const HEADER = 2 + ID_BYTES + KEY_BYTES + 4;
const FIXED = HEADER + ENTRY_BYTES + SEAL_OVERHEAD;

export interface NewShare {
  id: Uint8Array;
  /** The share's own key pair: its public half goes in the share, its secret half stays in the vault. */
  sender: KeyPair;
  /** Seals the payload. Only an approval ever carries it, masked for one opening. */
  shareKey: Uint8Array;
  ends: number;
  payload: Uint8Array;
}

export interface ShareHeader {
  id: Uint8Array;
  senderKey: Uint8Array;
  ends: number;
}

/** almanac: a new share's id and keys, which the vault keeps while the share lasts. */
export const newShare = (ends: number, payload: Uint8Array): NewShare => ({
  id: randomBytes(ID_BYTES),
  sender: newKeyPair(),
  shareKey: randomBytes(KEY_BYTES),
  ends,
  payload,
});

/** The most a payload can be: what the largest share holds. */
export const MAX_PAYLOAD = SHARE_BUCKETS[SHARE_BUCKETS.length - 1] - FIXED - HEADER - 4;

/** almanac: the share for the provider whose code was scanned, open at once until `until`. */
export function sealShare(share: NewShare, pairing: Pairing, until: number): Uint8Array {
  const header = encodeHeader(share);
  const size = SHARE_BUCKETS.find((b) => b >= FIXED + HEADER + 4 + share.payload.length);
  if (!size) throw new ShareError("too-large", "more than a share can hold");
  const plain = new Uint8Array(size - FIXED);
  plain.set(header);
  putU32(plain, HEADER, share.payload.length);
  plain.set(share.payload, HEADER + 4);
  const approval = sealApproval(almanacPair(share.sender, pairing.providerKey), share.sender, share.id, pairing.firstOpeningKey, until, share.shareKey);
  return concatBytes(header, approval, xchachaEncryptPacked(plain, share.shareKey));
}

export interface ReceivedShare {
  header: ShareHeader;
  pair: PairKeys;
  firstApproval: Approval;
  /** What the provider app keeps until the end date: the header and the sealed payload. */
  stored: Uint8Array;
}

/** provider app: reads a share at the visit, with its key pair for this pairing. */
export function readShare(bytes: Uint8Array, provider: KeyPair): ReceivedShare {
  if (bytes.length < FIXED) throw new ShareError("format", "not an almanac share");
  const header = readHeader(bytes);
  const pair = providerPair(provider, header.senderKey);
  const entry = openEntry(pair, bytes.subarray(HEADER, HEADER + ENTRY_BYTES));
  if (entry?.kind !== "approval" || !equal(entry.share, header.id)) throw new ShareError("not-for-you", "this share is for another provider app");
  return { header, pair, firstApproval: entry, stored: concatBytes(bytes.subarray(0, HEADER), bytes.subarray(HEADER + ENTRY_BYTES)) };
}

/** provider app: opens a kept share with the key an approval carried. */
export function openStored(stored: Uint8Array, shareKey: Uint8Array): { header: ShareHeader; payload: Uint8Array } {
  const header = readHeader(stored);
  let plain: Uint8Array;
  try {
    plain = xchachaDecryptPacked(stored.subarray(HEADER), shareKey);
  } catch {
    throw new ShareError("not-for-you", "this key does not open this share");
  }
  if (plain.length < HEADER + 4 || !equal(plain.subarray(0, HEADER), stored.subarray(0, HEADER))) throw new ShareError("damaged", "the share was changed");
  const length = getU32(plain, HEADER);
  if (HEADER + 4 + length > plain.length) throw new ShareError("damaged", "the share was changed");
  return { header, payload: plain.slice(HEADER + 4, HEADER + 4 + length) };
}

function encodeHeader(share: NewShare): Uint8Array {
  const header = new Uint8Array(HEADER);
  header[0] = VERSION;
  header[1] = KIND.share;
  header.set(share.id, 2);
  header.set(share.sender.publicKey, 2 + ID_BYTES);
  putU32(header, 2 + ID_BYTES + KEY_BYTES, seconds(share.ends));
  return header;
}

function readHeader(bytes: Uint8Array): ShareHeader {
  if (bytes.length < HEADER) throw new ShareError("format", "not an almanac share");
  if (bytes[0] > VERSION) throw new ShareError("newer", "a share from a newer almanac");
  if (bytes[0] !== VERSION || bytes[1] !== KIND.share) throw new ShareError("format", "not an almanac share");
  return {
    id: bytes.slice(2, 2 + ID_BYTES),
    senderKey: bytes.slice(2 + ID_BYTES, 2 + ID_BYTES + KEY_BYTES),
    ends: getU32(bytes, 2 + ID_BYTES + KEY_BYTES) * 1000,
  };
}
