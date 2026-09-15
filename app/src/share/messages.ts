import { xchachaDecryptPacked, xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import { ShareError } from "./errors";
import { dh, openingMask, type KeyPair, type PairKeys } from "./keys";
import { equal, getU32, ID_BYTES, KEY_BYTES, KIND, putU32, SEAL_OVERHEAD, seconds, xor } from "./wire";

/**
 * What passes between almanac and a provider app after the visit (docs/DESIGN.md §9): requests one
 * way, approvals and stops the other. Each is sealed with the pair key, so only the two can read it,
 * and each knows the other sent it — but, unlike a signature, neither can prove that to anyone else.
 * An approval and a stop are the same size, so a statement holding them shows nothing of which is
 * which.
 */

// kind | share id | opening key | until | the share's key, masked
const ENTRY_PLAIN = 1 + ID_BYTES + KEY_BYTES + 4 + KEY_BYTES;
export const ENTRY_BYTES = ENTRY_PLAIN + SEAL_OVERHEAD;

// kind | share id | opening key | asked at
const REQUEST_PLAIN = 1 + ID_BYTES + KEY_BYTES + 4;
export const REQUEST_BYTES = REQUEST_PLAIN + SEAL_OVERHEAD;

const AT_OPENING = 1 + ID_BYTES;
const AT_TIME = AT_OPENING + KEY_BYTES;
const AT_KEY = AT_TIME + 4;

export interface Approval {
  kind: "approval";
  share: Uint8Array;
  openingKey: Uint8Array;
  /** When this opening ends, as the patient chose. */
  until: number;
  maskedKey: Uint8Array;
}

export interface Stop {
  kind: "stop";
  share: Uint8Array;
  at: number;
}

export interface Request {
  share: Uint8Array;
  openingKey: Uint8Array;
  asked: number;
}

/** almanac: allows one opening of a share, until a time the patient chose, for the key the provider app asked with. */
export function sealApproval(pair: PairKeys, sender: KeyPair, share: Uint8Array, openingKey: Uint8Array, until: number, shareKey: Uint8Array): Uint8Array {
  const mask = openingMask(dh(sender.secretKey, openingKey), sender.publicKey, openingKey);
  const plain = new Uint8Array(ENTRY_PLAIN);
  plain[0] = KIND.approval;
  plain.set(share, 1);
  plain.set(openingKey, AT_OPENING);
  putU32(plain, AT_TIME, seconds(until));
  plain.set(xor(shareKey, mask), AT_KEY);
  return xchachaEncryptPacked(plain, pair.toProvider);
}

/** almanac: tells the provider app that a share has stopped, so it deletes its copy. */
export function sealStop(pair: PairKeys, share: Uint8Array, at: number): Uint8Array {
  const plain = new Uint8Array(ENTRY_PLAIN);
  plain[0] = KIND.stop;
  plain.set(share, 1);
  putU32(plain, AT_OPENING, seconds(at));
  return xchachaEncryptPacked(plain, pair.toProvider);
}

/**
 * provider app: an approval or a stop sealed for this pairing — or `null` for one sealed for someone
 * else, or for the random bytes between them.
 */
export function openEntry(pair: PairKeys, sealed: Uint8Array): Approval | Stop | null {
  const plain = tryOpen(sealed, pair.toProvider);
  if (!plain) return null;
  if (plain.length !== ENTRY_PLAIN) throw new ShareError("damaged", "an entry of the wrong size");
  const share = plain.slice(1, AT_OPENING);
  if (plain[0] === KIND.approval) {
    return { kind: "approval", share, openingKey: plain.slice(AT_OPENING, AT_TIME), until: getU32(plain, AT_TIME) * 1000, maskedKey: plain.slice(AT_KEY) };
  }
  if (plain[0] === KIND.stop) return { kind: "stop", share, at: getU32(plain, AT_OPENING) * 1000 };
  throw new ShareError("newer", "an entry from a newer almanac");
}

/** provider app: the share's key, from an approval — which takes the secret half of the key it asked with. */
export function unmaskShareKey(approval: Approval, opening: KeyPair, senderKey: Uint8Array): Uint8Array {
  if (!equal(approval.openingKey, opening.publicKey)) throw new ShareError("not-for-you", "this approval is for another opening");
  return xor(approval.maskedKey, openingMask(dh(opening.secretKey, senderKey), senderKey, opening.publicKey));
}

/** provider app: asks to open a share again, with a key made for this opening alone. */
export function sealRequest(pair: PairKeys, share: Uint8Array, openingKey: Uint8Array, asked: number): Uint8Array {
  const plain = new Uint8Array(REQUEST_PLAIN);
  plain[0] = KIND.request;
  plain.set(share, 1);
  plain.set(openingKey, AT_OPENING);
  putU32(plain, AT_TIME, seconds(asked));
  return xchachaEncryptPacked(plain, pair.toAlmanac);
}

/** almanac: a request sealed for this share — or `null` for anything else. */
export function openRequest(pair: PairKeys, sealed: Uint8Array): Request | null {
  const plain = tryOpen(sealed, pair.toAlmanac);
  if (!plain) return null;
  if (plain.length !== REQUEST_PLAIN) throw new ShareError("damaged", "a request of the wrong size");
  if (plain[0] !== KIND.request) throw new ShareError("newer", "a request from a newer provider app");
  return { share: plain.slice(1, AT_OPENING), openingKey: plain.slice(AT_OPENING, AT_TIME), asked: getU32(plain, AT_TIME) * 1000 };
}

function tryOpen(sealed: Uint8Array, key: Uint8Array): Uint8Array | null {
  try {
    return xchachaDecryptPacked(sealed, key);
  } catch {
    return null;
  }
}
