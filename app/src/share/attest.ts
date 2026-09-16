import { blake2b256, nacl } from "@parity/product-sdk-crypto";
import { utf8 } from "../lib/bytes";
import { ShareError } from "./errors";
import { getU32, putU32, seconds } from "./wire";

/**
 * What says a provider is a provider (docs/DESIGN.md §9, provider registration).
 *
 * A registry vouches for a clinic by signing a short statement about them, and the provider app puts
 * that signature in the code it shows at the visit. almanac checks it against a registry key built
 * into this bundle — **no chain call, no network, nothing at all leaves the phone.** That matters
 * twice over: a clinic room may have no signal, and asking a chain "is this provider licensed?"
 * would tell whoever answered which provider the patient is sitting with.
 *
 *   attestation   version | tier | expiry | the clinic's identity key | the first 8 bytes of H(name)
 *                 signature by the registry over all of that                        (Ed25519, 64 bytes)
 *
 * The name is bound in so that a real attestation cannot be shown under someone else's name, and the
 * identity key is bound in so that only the clinic it names can use it. The identity key is long
 * lived, unlike every other key here: one per clinic, not one per patient. That makes it the thing
 * worth stealing (THREAT-MODEL R13), which is why an attestation expires within weeks — a revoked
 * clinic stops being able to pair when its attestation lapses and the registry will not sign another.
 *
 * Signatures, here and nowhere else. Everything between almanac and a provider app is sealed rather
 * than signed, so neither can prove to anyone what passed between them (§9). That is about the
 * *patient*, and it is untouched: the registry signs a statement about a clinic, and the clinic signs
 * its own pairing code. The patient signs nothing, and nothing here is evidence that anyone sought
 * care — an attestation says a clinic exists, not that it has any patients.
 */

/** What the registry is willing to say about a clinic. Approval comes first; a licence sits on top. */
export const TIER = { free: 1, licensed: 2 } as const;
export type Tier = keyof typeof TIER;

const TIER_NAME: Record<number, Tier> = { 1: "free", 2: "licensed" };

export const VERSION = 1;
const NAME_HASH_BYTES = 8;
const KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;
/** version | tier | expiry | identity key | H(name) */
export const BODY_BYTES = 1 + 1 + 4 + KEY_BYTES + NAME_HASH_BYTES;
export const ATTESTATION_BYTES = BODY_BYTES + SIGNATURE_BYTES;

const AT_EXPIRY = 2;
const AT_KEY = AT_EXPIRY + 4;
const AT_NAME = AT_KEY + KEY_BYTES;

export interface Attestation {
  tier: Tier;
  /** When the registry stops standing behind this, in milliseconds. */
  expires: number;
  /** The clinic's long-lived key, which signs the pairing codes it shows. */
  identityKey: Uint8Array;
}

/** The 8 bytes of a name that an attestation carries, so it cannot be shown under another. */
const nameHash = (name: string): Uint8Array => blake2b256(utf8(name.trim())).subarray(0, NAME_HASH_BYTES);

/**
 * The registry: vouch for a clinic until `expires`.
 *
 * `registrySecret` is the registry's Ed25519 secret key, which lives wherever attestations are
 * issued and never on a phone.
 */
export function attest(attestation: Attestation & { name: string }, registrySecret: Uint8Array): Uint8Array {
  if (attestation.identityKey.length !== KEY_BYTES) throw new ShareError("format", "not an identity key");
  const body = new Uint8Array(BODY_BYTES);
  body[0] = VERSION;
  body[1] = TIER[attestation.tier];
  putU32(body, AT_EXPIRY, seconds(attestation.expires));
  body.set(attestation.identityKey, AT_KEY);
  body.set(nameHash(attestation.name), AT_NAME);
  const out = new Uint8Array(ATTESTATION_BYTES);
  out.set(body);
  out.set(nacl.sign.detached(body, registrySecret), BODY_BYTES);
  return out;
}

/** What an attestation says, before asking whether to believe it. */
export function readAttestation(bytes: Uint8Array): Attestation {
  if (bytes.length !== ATTESTATION_BYTES) throw new ShareError("format", "not an attestation");
  if (bytes[0] > VERSION) throw new ShareError("newer", "an attestation from a newer registry");
  const tier = TIER_NAME[bytes[1]];
  if (bytes[0] !== VERSION || !tier) throw new ShareError("format", "not an attestation");
  return {
    tier,
    expires: getU32(bytes, AT_EXPIRY) * 1000,
    identityKey: bytes.slice(AT_KEY, AT_KEY + KEY_BYTES),
  };
}

/**
 * almanac: whether to believe an attestation — the registry's signature, the name it was issued for,
 * and whether it has run out. Throws `untrusted` or `expired` rather than answering false, so the
 * screen can say which of the two it is.
 */
export function verifyAttestation(bytes: Uint8Array, against: { registryKey: Uint8Array; name: string; now: number }): Attestation {
  // The signature first, and only then what the bytes say. Reading fields out of something nobody has
  // vouched for is acting on a stranger's bytes, and it answers the wrong question besides: a flipped
  // tier byte is tampering, not a bad shape, and "nobody vouched for this" is the truthful answer.
  // Only the length is checked before the signature, because verifying needs it.
  if (bytes.length !== ATTESTATION_BYTES) throw new ShareError("format", "not an attestation");
  if (!nacl.sign.detached.verify(bytes.subarray(0, BODY_BYTES), bytes.subarray(BODY_BYTES), against.registryKey)) {
    throw new ShareError("untrusted", "no registry vouched for this provider");
  }
  const attestation = readAttestation(bytes);
  const named = nameHash(against.name);
  if (!bytes.subarray(AT_NAME, BODY_BYTES).every((b, i) => b === named[i])) {
    throw new ShareError("untrusted", "vouched for under a different name");
  }
  if (attestation.expires <= against.now) throw new ShareError("expired", "this provider's registration has run out");
  return attestation;
}

/**
 * The clinic: sign the two keys in a pairing code with the identity key the registry vouched for.
 *
 * Without this an attestation could be copied from one clinic's code into another's: it would still
 * verify, and the patient would be sharing with whoever made the second code. The signature ties one
 * attested clinic to the one pair of keys in front of the patient.
 */
export const signPairing = (identitySecret: Uint8Array, providerKey: Uint8Array, firstOpeningKey: Uint8Array): Uint8Array =>
  nacl.sign.detached(pairingBody(providerKey, firstOpeningKey), identitySecret);

/** almanac: whether the attested clinic really made this code. */
export function verifyPairing(signature: Uint8Array, identityKey: Uint8Array, providerKey: Uint8Array, firstOpeningKey: Uint8Array): void {
  if (signature.length !== SIGNATURE_BYTES) throw new ShareError("format", "not a signature");
  if (!nacl.sign.detached.verify(pairingBody(providerKey, firstOpeningKey), signature, identityKey)) {
    throw new ShareError("untrusted", "this code was not made by the provider it names");
  }
}

const pairingBody = (providerKey: Uint8Array, firstOpeningKey: Uint8Array): Uint8Array => {
  const body = new Uint8Array(KEY_BYTES * 2);
  body.set(providerKey);
  body.set(firstOpeningKey, KEY_BYTES);
  return body;
};

/** A registry or a clinic key pair. Ed25519 — the only signatures in almanac. */
export const newSigningKeyPair = (): { publicKey: Uint8Array; secretKey: Uint8Array } => nacl.sign.keyPair();
