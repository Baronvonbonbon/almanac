import { blake2b256, deriveKey, xchachaDecryptPacked, xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import { utf8 } from "../lib/bytes";
import { packSlots, slots, topicsFor } from "../share";

/**
 * Where the newest Bulletin backup is (docs/DESIGN.md §8).
 *
 *   kind | the backup's content hash | when it was made      sealed under a key from KB
 *
 * A backup on Bulletin is only findable by its content hash, and the hash is not derived from
 * anything — so something has to carry it. That something is one statement, on a topic `TB` derived
 * from the backup code, replaced whole each time a backup is made: last-write-wins on its own
 * channel, so the newest statement *is* the pointer.
 *
 * It is sealed under a key from `KB`, so the backup code alone opens it. Nothing else about it can be
 * read: whoever is watching the statement store sees 512 bytes on four topics, exactly like almanac's
 * sharing statement (share/statement.ts) — same size, same shape, same random filler in the empty
 * slots. That is the point of building it out of the same parts rather than a smaller format of its
 * own: a statement that announced itself as a backup pointer would say that this account keeps
 * backups, and roughly how often.
 *
 * The hash is the 32 bytes a BLAKE2b-256 CID carries, not a CID string — the host's lookup takes the
 * digest alone (P7).
 */

const SALT = "almanac/v1";
export const BACKUP_CHANNEL = blake2b256(utf8("almanac/v1/backup"));

const KIND = 1;
const HASH_BYTES = 32;
const AT_HASH = 1;
const AT_TIME = AT_HASH + HASH_BYTES;
const PLAIN_BYTES = AT_TIME + 4;
/** A nonce and a tag: what XChaCha20-Poly1305 adds. */
const SEAL_OVERHEAD = 24 + 16;
export const POINTER_BYTES = PLAIN_BYTES + SEAL_OVERHEAD;

export interface Pointer {
  /** The backup's content hash on Bulletin. */
  hash: Uint8Array;
  /** When the backup was made, in ms. */
  at: number;
}

/** KB seals the backup itself; this key seals the pointer, so neither stands in for the other. */
const pointerKey = (kb: Uint8Array): Uint8Array => deriveKey(kb, SALT, "backup/pointer");

export function sealPointer(kb: Uint8Array, pointer: Pointer): Uint8Array {
  if (pointer.hash.length !== HASH_BYTES) throw new RangeError("not a content hash");
  const seconds = Math.floor(pointer.at / 1000);
  if (!(seconds >= 0 && seconds <= 0xffffffff)) throw new RangeError("a time almanac cannot send");
  const plain = new Uint8Array(PLAIN_BYTES);
  plain[0] = KIND;
  plain.set(pointer.hash, AT_HASH);
  new DataView(plain.buffer).setUint32(AT_TIME, seconds);
  return xchachaEncryptPacked(plain, pointerKey(kb));
}

/** The pointer a slot holds, or `null` — which is what every random slot gives, and every other key. */
export function openPointer(kb: Uint8Array, sealed: Uint8Array): Pointer | null {
  if (sealed.length !== POINTER_BYTES) return null;
  let plain: Uint8Array;
  try {
    plain = xchachaDecryptPacked(sealed, pointerKey(kb));
  } catch {
    return null;
  }
  if (plain.length !== PLAIN_BYTES || plain[0] !== KIND) return null;
  return {
    hash: plain.slice(AT_HASH, AT_TIME),
    at: new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(AT_TIME) * 1000,
  };
}

/** The statement that says where the newest backup is: one real slot among random ones, four topics. */
export function pointerStatement(kb: Uint8Array, topic: Uint8Array, pointer: Pointer): { data: Uint8Array; topics: Uint8Array[] } {
  return { data: packSlots([sealPointer(kb, pointer)], POINTER_BYTES), topics: topicsFor([topic]) };
}

/**
 * The newest backup among everything heard on `TB`.
 *
 * More than one can arrive: the store delivers what it already holds as well as what comes next, and
 * a statement from a phone that has since been restored elsewhere may still be live. The newest wins,
 * which is also what the chain's last-write-wins gives — this just does not depend on the order they
 * arrive in.
 */
export function newestPointer(kb: Uint8Array, statements: Uint8Array[]): Pointer | null {
  let newest: Pointer | null = null;
  for (const data of statements) {
    let entries: Uint8Array[];
    try {
      entries = slots(data, POINTER_BYTES);
    } catch {
      continue; // not an almanac statement, or from a newer almanac
    }
    for (const entry of entries) {
      const pointer = openPointer(kb, entry);
      if (pointer && (!newest || pointer.at > newest.at)) newest = pointer;
    }
  }
  return newest;
}
