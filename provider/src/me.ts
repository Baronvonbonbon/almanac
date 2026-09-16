import { fromHex } from "@app/lib/bytes";
import { checkName, readAttestation, REGISTRY_KEY, ShareError, verifyAttestation, type Attestation } from "@app/share";
import type { Vault } from "@app/vault";

/**
 * The clinic this app belongs to (docs/DESIGN.md §9, provider registration).
 *
 * Three things, and two of them are new since registration: the name patients see, the clinic's
 * long-lived identity key, and the registry's attestation for it. The identity key signs every
 * pairing code this app shows, and the attestation is what almanac checks before it will make a
 * share at all — so without both, this app can take no patients.
 *
 * The identity key is the one key here that outlives a patient, which makes it the thing worth
 * stealing (THREAT-MODEL R13). It lives in the vault under the device key, behind the PIN, and is
 * never shown, copied or exported.
 */
export interface Me {
  name: string;
  /** The clinic's Ed25519 secret key, hex. Signs pairing codes; never leaves this vault. */
  identity: string;
  /** What the registry signed about this clinic, hex — 110 bytes. */
  attestation: string;
}

const ME = "me";

export const readMe = (vault: Vault): Promise<Me | null> => vault.readJSON<Me>(ME);

export const writeMe = (vault: Vault, me: Me): Promise<void> =>
  vault.writeJSON(ME, { name: me.name.trim(), identity: me.identity, attestation: me.attestation });

/** The identity key and attestation as bytes, for signing a code and putting it in one. */
export const meKeys = (me: Me): { identitySecret: Uint8Array; attestation: Uint8Array } => ({
  identitySecret: fromHex(me.identity),
  attestation: fromHex(me.attestation),
});

export type NameProblem = "empty" | "long" | "unshowable";

/** Why a name can't go into a pairing code, if it can't: almanac shows it to the patient as it is. */
export function nameProblem(name: string): NameProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  if (new TextEncoder().encode(trimmed).length > 40) return "long";
  try {
    checkName(trimmed);
  } catch {
    return "unshowable";
  }
  return null;
}

export type AttestationProblem = "format" | "newer" | "untrusted" | "expired" | "key";

/**
 * What is wrong with a registration the provider was given, if anything.
 *
 * This asks exactly what a patient's almanac will ask at the visit, against the same registry key —
 * which is public, and in this bundle too. That is not this app vouching for itself: it cannot sign
 * an attestation, only check one. The point is that a clinic finds out the registry issued it under
 * the wrong name, or for another device's key, here — and not in front of a patient.
 */
export function attestationProblem(text: string, against: { identityKey: Uint8Array; name: string; now: number }): AttestationProblem | null {
  let bytes: Uint8Array;
  try {
    bytes = fromHex(text.trim().toLowerCase().replace(/\s+/g, ""));
  } catch {
    return "format";
  }
  let read: Attestation;
  try {
    read = verifyAttestation(bytes, { registryKey: REGISTRY_KEY, name: against.name, now: against.now });
  } catch (e) {
    if (!(e instanceof ShareError)) return "format";
    return e.problem === "newer" || e.problem === "untrusted" || e.problem === "expired" ? e.problem : "format";
  }
  return equalBytes(read.identityKey, against.identityKey) ? null : "key";
}

const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** What a registration says, for the settings screen: which tier, and until when. */
export function meAttestation(me: Me): Attestation {
  return readAttestation(fromHex(me.attestation));
}
