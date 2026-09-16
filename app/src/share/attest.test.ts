import { describe, expect, it } from "vitest";
import { hex } from "../lib/bytes";
import { ShareError, type ShareProblem } from "./errors";
import {
  ATTESTATION_BYTES,
  attest,
  newSigningKeyPair,
  readAttestation,
  signPairing,
  verifyAttestation,
  verifyPairing,
} from "./attest";
import { newKeyPair } from "./keys";

const NOW = Date.UTC(2026, 8, 16, 9, 0);
const DAY = 24 * 60 * 60 * 1000;
const NAME = "Dr Okafor, Riverside Clinic";

function problem(fn: () => unknown): ShareProblem | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof ShareError) return e.problem;
    throw e;
  }
  return null;
}

/** A registry, a clinic it has vouched for, and the two keys in the code the clinic is showing. */
function registered(tier: "free" | "licensed" = "licensed", expires = NOW + 30 * DAY) {
  const registry = newSigningKeyPair();
  const identity = newSigningKeyPair();
  const provider = newKeyPair();
  const firstOpening = newKeyPair();
  const attestation = attest({ tier, expires, identityKey: identity.publicKey, name: NAME }, registry.secretKey);
  const signature = signPairing(identity.secretKey, provider.publicKey, firstOpening.publicKey);
  return { registry, identity, provider, firstOpening, attestation, signature };
}

describe("an attestation", () => {
  it("says what the registry vouched for, and is always the same size", () => {
    const r = registered();
    expect(r.attestation).toHaveLength(ATTESTATION_BYTES);
    expect(ATTESTATION_BYTES).toBe(110);
    const read = readAttestation(r.attestation);
    expect(read.tier).toBe("licensed");
    expect(read.expires).toBe(NOW + 30 * DAY);
    expect(hex(read.identityKey)).toBe(hex(r.identity.publicKey));
    // A free tier is the same shape: approved, not paying. Only the tier byte differs.
    expect(registered("free").attestation).toHaveLength(ATTESTATION_BYTES);
  });

  it("verifies against the registry that signed it, and no other", () => {
    const r = registered();
    expect(verifyAttestation(r.attestation, { registryKey: r.registry.publicKey, name: NAME, now: NOW }).tier).toBe("licensed");
    const other = newSigningKeyPair();
    expect(problem(() => verifyAttestation(r.attestation, { registryKey: other.publicKey, name: NAME, now: NOW }))).toBe("untrusted");
  });

  it("cannot be shown under another clinic's name, nor with anything changed", () => {
    const r = registered();
    const against = { registryKey: r.registry.publicKey, name: NAME, now: NOW };
    expect(problem(() => verifyAttestation(r.attestation, { ...against, name: "Dr Someone Else" }))).toBe("untrusted");
    // Promoting yourself from free to licensed, or giving yourself longer, breaks the signature.
    for (const at of [1, 2, 5]) {
      const changed = r.attestation.slice();
      changed[at] ^= 1;
      expect(problem(() => verifyAttestation(changed, against))).toBe("untrusted");
    }
  });

  it("runs out, and says so rather than saying it was never vouched for", () => {
    const r = registered("licensed", NOW + DAY);
    const against = { registryKey: r.registry.publicKey, name: NAME, now: NOW };
    expect(verifyAttestation(r.attestation, against).expires).toBe(NOW + DAY);
    expect(problem(() => verifyAttestation(r.attestation, { ...against, now: NOW + DAY }))).toBe("expired");
    expect(problem(() => verifyAttestation(r.attestation, { ...against, now: NOW + 2 * DAY }))).toBe("expired");
  });

  it("refuses what is not an attestation at all, and one from a newer registry", () => {
    expect(problem(() => readAttestation(new Uint8Array(ATTESTATION_BYTES - 1)))).toBe("format");
    const r = registered();
    const newer = r.attestation.slice();
    newer[0] = 2;
    expect(problem(() => readAttestation(newer))).toBe("newer");
    const noTier = r.attestation.slice();
    noTier[1] = 9;
    expect(problem(() => readAttestation(noTier))).toBe("format");
  });
});

describe("the signature over a pairing code's keys", () => {
  it("shows the attested clinic made this code", () => {
    const r = registered();
    expect(() => verifyPairing(r.signature, r.identity.publicKey, r.provider.publicKey, r.firstOpening.publicKey)).not.toThrow();
  });

  it("stops an attestation being copied into somebody else's code", () => {
    const honest = registered();
    // A second clinic shows its own keys with the first one's attestation: it verifies, and the
    // signature over the keys does not — which is the whole point of having it.
    const impostor = { provider: newKeyPair(), firstOpening: newKeyPair() };
    expect(
      problem(() => verifyPairing(honest.signature, honest.identity.publicKey, impostor.provider.publicKey, impostor.firstOpening.publicKey)),
    ).toBe("untrusted");
    // Nor can they sign those keys themselves: the identity key is the one the registry vouched for.
    const theirs = newSigningKeyPair();
    const signed = signPairing(theirs.secretKey, impostor.provider.publicKey, impostor.firstOpening.publicKey);
    expect(problem(() => verifyPairing(signed, honest.identity.publicKey, impostor.provider.publicKey, impostor.firstOpening.publicKey))).toBe("untrusted");
  });

  it("refuses a signature of the wrong size", () => {
    const r = registered();
    expect(problem(() => verifyPairing(r.signature.slice(0, 63), r.identity.publicKey, r.provider.publicKey, r.firstOpening.publicKey))).toBe("format");
  });
});
