import { nacl } from "@parity/product-sdk-crypto";
import { hex } from "../lib/bytes";
import { attest, signPairing, type Tier } from "./attest";
import type { Pairing } from "./pairing";

/**
 * A registry and a clinic, for tests (docs/DESIGN.md §9, provider registration).
 *
 * Every pairing code now carries an attestation and a signature, so a test that wants a code needs a
 * registry to have vouched for somebody. This makes one — deterministically, from fixed seeds, so the
 * same test gives the same bytes every run.
 *
 * **This file is imported only by tests and is deliberately absent from `index.ts`.** A demo registry
 * secret is exactly what must never reach a patient's bundle: anything holding it can vouch for any
 * clinic it likes, which is the one thing almanac's check rests on (THREAT-MODEL R13). Keeping it off
 * the barrel means no screen can reach it even by accident.
 */

const seed = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

/** The registry these helpers sign with. Not the real one — `REGISTRY_KEY` is that. */
export const demoRegistry = nacl.sign.keyPair.fromSeed(seed(7));
/** A clinic the demo registry has vouched for. */
export const demoClinic = nacl.sign.keyPair.fromSeed(seed(9));

const YEAR = 365 * 24 * 3600_000;

export interface DemoOver {
  tier?: Tier;
  expires?: number;
  clinic?: { publicKey: Uint8Array; secretKey: Uint8Array };
  registrySecret?: Uint8Array;
  /** The name to vouch for, when it should differ from the name in the code. */
  vouchedName?: string;
}

/** What the demo registry says about a clinic. */
export const demoAttestation = (name: string, over: DemoOver = {}): Uint8Array =>
  attest(
    {
      tier: over.tier ?? "licensed",
      expires: over.expires ?? Date.now() + YEAR,
      identityKey: (over.clinic ?? demoClinic).publicKey,
      name: over.vouchedName ?? name,
    },
    over.registrySecret ?? demoRegistry.secretKey,
  );

/** A whole pairing — keys, attestation and the clinic's signature — ready for `pairingCode`. */
export function demoPairing(of: { providerKey: Uint8Array; firstOpeningKey: Uint8Array; name: string }, over: DemoOver = {}): Pairing {
  const clinic = over.clinic ?? demoClinic;
  return {
    ...of,
    attestation: demoAttestation(of.name, over),
    signature: signPairing(clinic.secretKey, of.providerKey, of.firstOpeningKey),
  };
}

/** A registered clinic as the provider app stores it — the shape of provider/src/me.ts's `Me`. */
export function demoMe(name: string, over: DemoOver = {}): { name: string; identity: string; attestation: string } {
  const clinic = over.clinic ?? demoClinic;
  return { name, identity: hex(clinic.secretKey), attestation: hex(demoAttestation(name, over)) };
}
