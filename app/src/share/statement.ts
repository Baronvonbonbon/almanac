import { blake2b256, randomBytes } from "@parity/product-sdk-crypto";
import { utf8 } from "../lib/bytes";
import { ShareError } from "./errors";
import { ENTRY_BYTES, REQUEST_BYTES } from "./messages";
import { VERSION } from "./wire";

/**
 * The one statement each side keeps (docs/DESIGN.md §9): almanac's sharing statement, with approvals
 * and stops for every provider, and a provider app's requests statement, with requests for all its
 * patients. Each is always the full 512 bytes: a version, then fixed-size slots in a random order,
 * with random bytes in the empty ones — so neither the size nor the layout says how many entries it
 * holds, or which is new. It goes out on four topics, the real ones and random ones, for the same
 * reason. Each is replaced whole, on its own channel.
 */

export const STATEMENT_BYTES = 512;
export const TOPICS = 4;
export const APPROVAL_SLOTS = Math.floor((STATEMENT_BYTES - 1) / ENTRY_BYTES);
export const REQUEST_SLOTS = Math.floor((STATEMENT_BYTES - 1) / REQUEST_BYTES);

export const SHARING_CHANNEL = blake2b256(utf8("almanac/v1/sharing"));
export const REQUESTS_CHANNEL = blake2b256(utf8("almanac/v1/provider-requests"));

/** A statement's data: these entries, each `size` bytes, among random ones. */
export function packSlots(entries: Uint8Array[], size: number): Uint8Array {
  const count = Math.floor((STATEMENT_BYTES - 1) / size);
  if (entries.length > count) throw new ShareError("too-large", "more than one statement holds");
  if (entries.some((e) => e.length !== size)) throw new RangeError("an entry of the wrong size");
  const out = randomBytes(STATEMENT_BYTES);
  out[0] = VERSION;
  const order = shuffled(count);
  entries.forEach((entry, i) => out.set(entry, 1 + order[i] * size));
  return out;
}

/** Every slot of a statement, to try each with a pair key; the random ones open with none. */
export function slots(data: Uint8Array, size: number): Uint8Array[] {
  if (data.length !== STATEMENT_BYTES) throw new ShareError("format", "not an almanac statement");
  if (data[0] > VERSION) throw new ShareError("newer", "a statement from a newer almanac");
  if (data[0] !== VERSION) throw new ShareError("format", "not an almanac statement");
  const count = Math.floor((STATEMENT_BYTES - 1) / size);
  return Array.from({ length: count }, (_, i) => data.subarray(1 + i * size, 1 + (i + 1) * size));
}

/** Always four topics: the real ones, filled out with random ones, in a random order. */
export function topicsFor(real: Uint8Array[]): Uint8Array[] {
  if (real.length > TOPICS) throw new ShareError("too-large", "more topics than a statement holds");
  const all = [...real, ...Array.from({ length: TOPICS - real.length }, () => randomBytes(32))];
  return shuffled(TOPICS).map((i) => all[i]);
}

/** 0 … n−1 in a random order (Fisher–Yates). */
function shuffled(n: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const r = randomBytes(4);
    const j = (((r[0] << 24) | (r[1] << 16) | (r[2] << 8) | r[3]) >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
