import { fromBase32, toBase32 } from "../lib/base32";
import { utf8 } from "../lib/bytes";
import { ATTESTATION_BYTES, verifyAttestation, verifyPairing, type Attestation } from "./attest";
import { ShareError } from "./errors";
import { checkDigits } from "./keys";
import { KEY_BYTES, KIND, VERSION } from "./wire";

/**
 * The code a provider app shows at the visit (docs/DESIGN.md §9):
 *
 *   version | kind | the provider's key for this pairing | a key for the first opening
 *           | the registry's attestation | the clinic's signature over those two keys
 *           | name length | name
 *
 * The first opening's key is separate from the pairing key so that the provider app can drop it as
 * soon as that opening ends, while it keeps the pairing key to ask again later.
 *
 * The attestation says a registry vouched for this clinic (attest.ts), and the signature says this
 * clinic made this code — without it, an attestation could be lifted from a real clinic's code into
 * anyone else's. A clinic with no attestation cannot show a code at all, which is the point: almanac
 * makes no share for a provider nobody has vouched for.
 *
 * Reading and believing are separate. `readPairingCode` says what a code claims; `verifyProvider`
 * says whether to believe it, and which of "nobody vouched for this" and "it has run out" is true.
 */

export const PAIRING_PREFIX = "ALMANAC:P:";
/** Room for "Dr Okafor, Riverside Clinic" and a little more. */
export const NAME_BYTES = 40;
const SIGNATURE_BYTES = 64;
const AT_PROVIDER = 2;
const AT_OPENING = AT_PROVIDER + KEY_BYTES;
const AT_ATTESTATION = AT_OPENING + KEY_BYTES;
const AT_SIGNATURE = AT_ATTESTATION + ATTESTATION_BYTES;
const AT_NAME_LENGTH = AT_SIGNATURE + SIGNATURE_BYTES;
const FIXED = AT_NAME_LENGTH + 1;

// Control characters, and the invisible ones that reorder text — a name that reads "Dr Okafor" on
// screen could otherwise be something else underneath.
const MISLEADING = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

export interface Pairing {
  providerKey: Uint8Array;
  firstOpeningKey: Uint8Array;
  /** What the registry signed about this clinic — 110 bytes, read with `readAttestation`. */
  attestation: Uint8Array;
  /** The clinic's signature over the two keys above, by the identity key its attestation names. */
  signature: Uint8Array;
  name: string;
}

/**
 * The name, if it is one almanac can show — trimmed. Throws otherwise.
 *
 * Separate from building a code so that the provider app can check a name as it is typed, which it
 * used to do by making a throwaway code. It cannot any more: without an attestation there is no code
 * to make.
 */
export function checkName(name: string): string {
  const trimmed = name.trim();
  const bytes = utf8(trimmed);
  if (!bytes.length || bytes.length > NAME_BYTES || MISLEADING.test(trimmed)) {
    throw new ShareError("format", "a provider's name almanac cannot show");
  }
  return trimmed;
}

export function pairingCode(pairing: Pairing): string {
  const name = utf8(checkName(pairing.name));
  if (pairing.attestation.length !== ATTESTATION_BYTES) throw new ShareError("format", "not an attestation");
  if (pairing.signature.length !== SIGNATURE_BYTES) throw new ShareError("format", "not a signature");
  const bytes = new Uint8Array(FIXED + name.length);
  bytes[0] = VERSION;
  bytes[1] = KIND.pairing;
  bytes.set(pairing.providerKey, AT_PROVIDER);
  bytes.set(pairing.firstOpeningKey, AT_OPENING);
  bytes.set(pairing.attestation, AT_ATTESTATION);
  bytes.set(pairing.signature, AT_SIGNATURE);
  bytes[AT_NAME_LENGTH] = name.length;
  bytes.set(name, FIXED);
  return PAIRING_PREFIX + toBase32(bytes);
}

/** What almanac read from the provider's screen, and the six digits to compare with it. */
export function readPairingCode(code: string): Pairing & { check: string } {
  // Trimmed and case-folded before anything else: a camera hands over whatever the code encodes, and
  // a stray newline or a lowercased prefix used to fail here as "not a provider's code" — while the
  // same text pasted in worked, because the paste box normalised it first. `fromBase32` already
  // upper-cases, so only this check ever cared.
  const text = code.trim();
  if (!text.toUpperCase().startsWith(PAIRING_PREFIX)) throw new ShareError("format", "not a provider's code");
  let bytes: Uint8Array;
  try {
    bytes = fromBase32(text.slice(PAIRING_PREFIX.length));
  } catch {
    throw new ShareError("format", "not a provider's code");
  }
  if (bytes.length < FIXED + 1) throw new ShareError("format", "not a provider's code");
  if (bytes[0] > VERSION) throw new ShareError("newer", "a code from a newer provider app");
  if (bytes[0] !== VERSION || bytes[1] !== KIND.pairing) throw new ShareError("format", "not a provider's code");
  const length = bytes[AT_NAME_LENGTH];
  if (length > NAME_BYTES || bytes.length !== FIXED + length) throw new ShareError("format", "not a provider's code");
  let name: string;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(FIXED));
  } catch {
    throw new ShareError("format", "not a provider's code");
  }
  if (!name.trim() || MISLEADING.test(name)) throw new ShareError("format", "a provider's name almanac cannot show");
  const providerKey = bytes.slice(AT_PROVIDER, AT_OPENING);
  return {
    providerKey,
    firstOpeningKey: bytes.slice(AT_OPENING, AT_ATTESTATION),
    attestation: bytes.slice(AT_ATTESTATION, AT_SIGNATURE),
    signature: bytes.slice(AT_SIGNATURE, AT_NAME_LENGTH),
    name,
    check: checkDigits(providerKey),
  };
}

/**
 * almanac: whether to make a share for the provider this code claims to be from.
 *
 * Throws `untrusted` when no registry vouched for them, when the attestation was issued to another
 * name, or when this code was not made by the clinic it names; `expired` when what the registry
 * signed has run out. Returns what the registry said, so the screen can tell a free tier from a paid
 * one — both may take patients; only a lapsed one may not take new ones.
 */
export function verifyProvider(pairing: Pairing, against: { registryKey: Uint8Array; now: number }): Attestation {
  const attestation = verifyAttestation(pairing.attestation, { registryKey: against.registryKey, name: pairing.name, now: against.now });
  verifyPairing(pairing.signature, attestation.identityKey, pairing.providerKey, pairing.firstOpeningKey);
  return attestation;
}
