import { fromBase32, toBase32 } from "../lib/base32";
import { utf8 } from "../lib/bytes";
import { ShareError } from "./errors";
import { checkDigits } from "./keys";
import { KEY_BYTES, KIND, VERSION } from "./wire";

/**
 * The code a provider app shows at the visit (docs/DESIGN.md §9):
 *
 *   version | kind | the provider's key for this pairing | a key for the first opening | name length | name
 *
 * The first opening's key is separate from the pairing key so that the provider app can drop it as
 * soon as that opening ends, while it keeps the pairing key to ask again later.
 */

export const PAIRING_PREFIX = "ALMANAC:P:";
/** Room for "Dr Okafor, Riverside Clinic" and a little more. */
export const NAME_BYTES = 40;
const FIXED = 2 + 2 * KEY_BYTES + 1;

// Control characters, and the invisible ones that reorder text — a name that reads "Dr Okafor" on
// screen could otherwise be something else underneath.
const MISLEADING = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

export interface Pairing {
  providerKey: Uint8Array;
  firstOpeningKey: Uint8Array;
  name: string;
}

export function pairingCode(pairing: Pairing): string {
  const name = utf8(pairing.name.trim());
  if (!name.length || name.length > NAME_BYTES || MISLEADING.test(pairing.name.trim())) throw new ShareError("format", "a provider's name almanac cannot show");
  const bytes = new Uint8Array(FIXED + name.length);
  bytes[0] = VERSION;
  bytes[1] = KIND.pairing;
  bytes.set(pairing.providerKey, 2);
  bytes.set(pairing.firstOpeningKey, 2 + KEY_BYTES);
  bytes[FIXED - 1] = name.length;
  bytes.set(name, FIXED);
  return PAIRING_PREFIX + toBase32(bytes);
}

/** What almanac read from the provider's screen, and the six digits to compare with it. */
export function readPairingCode(code: string): Pairing & { check: string } {
  if (!code.startsWith(PAIRING_PREFIX)) throw new ShareError("format", "not a provider's code");
  let bytes: Uint8Array;
  try {
    bytes = fromBase32(code.slice(PAIRING_PREFIX.length));
  } catch {
    throw new ShareError("format", "not a provider's code");
  }
  if (bytes.length < FIXED + 1) throw new ShareError("format", "not a provider's code");
  if (bytes[0] > VERSION) throw new ShareError("newer", "a code from a newer provider app");
  if (bytes[0] !== VERSION || bytes[1] !== KIND.pairing) throw new ShareError("format", "not a provider's code");
  const length = bytes[FIXED - 1];
  if (length > NAME_BYTES || bytes.length !== FIXED + length) throw new ShareError("format", "not a provider's code");
  let name: string;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(FIXED));
  } catch {
    throw new ShareError("format", "not a provider's code");
  }
  if (!name.trim() || MISLEADING.test(name)) throw new ShareError("format", "a provider's name almanac cannot show");
  const providerKey = bytes.slice(2, 2 + KEY_BYTES);
  return { providerKey, firstOpeningKey: bytes.slice(2 + KEY_BYTES, FIXED - 1), name, check: checkDigits(providerKey) };
}
