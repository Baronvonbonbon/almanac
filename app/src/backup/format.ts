import { randomBytes, xchachaDecryptPacked, xchachaEncryptPacked } from "@parity/product-sdk-crypto";
import { fromBase64Url, text, toBase64Url, utf8 } from "../lib/bytes";
import { SEAL_OVERHEAD, unwrapKey, wrapKey, WRAPPED_KEY_BYTES } from "../vault/codec";
import { backupKeys } from "./code";

/**
 * A backup (docs/DESIGN.md §8) — the same whether it goes to Bulletin or is copied as text:
 *
 *   "ALM1" | version | key source | the backup's key, wrapped under KB | sealed snapshot
 *
 * Each backup has a fresh random key, wrapped under KB from the backup code, so the vault's own key
 * never leaves the phone. The whole backup is exactly one of the bucket sizes, so its size says only
 * roughly how much it holds.
 */

const MAGIC = [0x41, 0x4c, 0x4d, 0x31]; // "ALM1"
const VERSION = 1;
/** KB comes from the backup code through HKDF. The code is 128 random bits, so it needs no stretching. */
const FROM_CODE = 1;
const HEADER = 6;
const FIXED = HEADER + WRAPPED_KEY_BYTES + SEAL_OVERHEAD + 4;

export const BUCKETS = [16, 64, 256, 1024].map((k) => k * 1024);

export type BackupProblem = "format" | "newer" | "wrong-code" | "too-large";

export class BackupError extends Error {
  constructor(
    readonly kind: BackupProblem,
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

export function sealBackup(codeEntropy: Uint8Array, snapshot: unknown): Uint8Array {
  const json = utf8(JSON.stringify(snapshot));
  const size = BUCKETS.find((b) => b >= FIXED + json.length);
  if (!size) throw new BackupError("too-large", "more than a backup can hold");
  // The snapshot's length, the snapshot, then zeros up to the bucket.
  const plain = new Uint8Array(size - HEADER - WRAPPED_KEY_BYTES - SEAL_OVERHEAD);
  new DataView(plain.buffer).setUint32(0, json.length, true);
  plain.set(json, 4);
  const key = randomBytes(32);
  const out = new Uint8Array(size);
  out.set(MAGIC);
  out[4] = VERSION;
  out[5] = FROM_CODE;
  out.set(wrapKey(backupKeys(codeEntropy).key, key), HEADER);
  out.set(xchachaEncryptPacked(plain, key), HEADER + WRAPPED_KEY_BYTES);
  return out;
}

export function openBackup(codeEntropy: Uint8Array, bytes: Uint8Array): unknown {
  if (bytes.length < FIXED || MAGIC.some((b, i) => bytes[i] !== b) || bytes[4] < 1) throw new BackupError("format", "not an almanac backup");
  if (bytes[4] > VERSION || bytes[5] !== FROM_CODE) throw new BackupError("newer", "made by a newer version of almanac");
  const key = unwrapKey(backupKeys(codeEntropy).key, bytes.subarray(HEADER, HEADER + WRAPPED_KEY_BYTES));
  if (!key) throw new BackupError("wrong-code", "this backup code does not open this backup");
  let plain: Uint8Array;
  try {
    plain = xchachaDecryptPacked(bytes.subarray(HEADER + WRAPPED_KEY_BYTES), key);
  } catch {
    throw new BackupError("format", "the backup is damaged");
  }
  const length = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0, true);
  if (4 + length > plain.length) throw new BackupError("format", "the backup is damaged");
  return JSON.parse(text(plain.subarray(4, 4 + length)));
}

/**
 * Mark where the backup starts and ends in whatever it was pasted into. The full stop matters: words
 * after the backup — "Sent from my phone" — are made of the same letters, and without it would be read
 * as part of the backup.
 */
const PREFIX = "almanac1:";
const END = ".";

/** The backup as text to copy: a line saying what it is, then the backup itself. */
export const backupText = (bytes: Uint8Array, heading: string): string => `${heading}\n${PREFIX}${toBase64Url(bytes)}${END}\n`;

/** Finds the backup in pasted text — a note, an email — whatever line breaks and words surround it. */
export function readBackupText(input: string): Uint8Array {
  const at = input.indexOf(PREFIX);
  if (at < 0) throw new BackupError("format", "no almanac backup in that text");
  // Up to the full stop; line breaks and spaces a note or an email added in between are dropped.
  const body = /^[A-Za-z0-9_\-\s]*/.exec(input.slice(at + PREFIX.length))![0].replace(/\s/g, "");
  try {
    return fromBase64Url(body);
  } catch {
    throw new BackupError("format", "the backup is damaged");
  }
}
