import { deriveKey, randomBytes } from "@parity/product-sdk-crypto";

/**
 * The backup code (docs/DESIGN.md §6, §8): 128 random bits and a 12-bit check, written as 28
 * characters in seven groups of four — "K7Q2 9XMA 3JDE W4PN RT6H B8CZ 51VF". Letters and digits rather
 * than words, so it can never be mistaken for a wallet's recovery words. The alphabet is Crockford's:
 * no I, L, O or U. Reading it ignores case, spaces and dashes, and takes I and L as 1 and O as 0.
 *
 * Every derivation here is load-bearing: changing one means no existing backup opens, which is why
 * code.test.ts pins them to vectors computed independently.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_BYTES = 16;
const CHARS = 28;
const SALT = "almanac/v1";

export type CodeProblem = "character" | "length" | "check";

/** 12 bits, so a mistyped character is caught 4095 times in 4096. */
function check(entropy: Uint8Array): number {
  const h = deriveKey(entropy, SALT, "backup/check");
  return (h[0] << 4) | (h[1] >> 4);
}

export function encodeCode(entropy: Uint8Array): string {
  if (entropy.length !== CODE_BYTES) throw new RangeError(`a backup code holds ${CODE_BYTES} bytes`);
  // 128 bits of randomness, then 12 of check: 140 bits, which is 28 characters of 5 bits.
  let bits = 0n;
  for (const b of entropy) bits = (bits << 8n) | BigInt(b);
  bits = (bits << 12n) | BigInt(check(entropy));
  let out = "";
  for (let i = CHARS - 1; i >= 0; i--) out += ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)];
  return out;
}

export const newCode = (): string => encodeCode(randomBytes(CODE_BYTES));

/** "K7Q2 9XMA 3JDE W4PN RT6H B8CZ 51VF" */
export const formatCode = (code: string): string => code.match(/.{1,4}/g)?.join(" ") ?? "";

/** What someone typed or pasted, as a code — or what is wrong with it. */
export function parseCode(input: string): { code: string; entropy: Uint8Array } | { problem: CodeProblem } {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (/[^0-9A-TV-Z]/.test(cleaned)) return { problem: "character" };
  if (cleaned.length !== CHARS) return { problem: "length" };
  let bits = 0n;
  for (const c of cleaned) bits = (bits << 5n) | BigInt(ALPHABET.indexOf(c));
  const sum = Number(bits & 0xfffn);
  bits >>= 12n;
  const entropy = new Uint8Array(CODE_BYTES);
  for (let i = CODE_BYTES - 1; i >= 0; i--) {
    entropy[i] = Number(bits & 0xffn);
    bits >>= 8n;
  }
  return check(entropy) === sum ? { code: cleaned, entropy } : { problem: "check" };
}

/**
 * KB, which locks each backup's own key; TB, the topic a backup's pointer goes out on; and the channel
 * that pointer is published on (Phase 4).
 *
 * The channel is derived per code rather than fixed, because the store replaces a statement per
 * *account and channel* (P9) and one account holds two vaults — this one and the duress decoy. On a
 * shared constant, a decoy's backup would replace the real vault's pointer, leaving the real backup
 * sitting on Bulletin with nothing pointing at it. Separate codes, separate channels, neither evicts
 * the other.
 *
 * Unlike `key` and `topic`, the channel is not load-bearing for opening a backup: a restore matches on
 * the topic and never looks at the channel, so changing it strands nothing.
 */
export function backupKeys(entropy: Uint8Array): { key: Uint8Array; topic: Uint8Array; channel: Uint8Array } {
  return {
    key: deriveKey(entropy, SALT, "backup/key"),
    topic: deriveKey(entropy, SALT, "backup/topic"),
    channel: deriveKey(entropy, SALT, "backup/channel"),
  };
}
