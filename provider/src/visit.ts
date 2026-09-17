import { fromHex, hex } from "@app/lib/bytes";
import {
  checkDigits,
  decodeSelection,
  joinFrames,
  newKeyPair,
  openStored,
  pairDigits,
  pairingCode,
  readFrame,
  readShare,
  ShareError,
  signPairing,
  unmaskShareKey,
  type Frame,
  type KeyPair,
  type Selection,
} from "@app/share";
import { meKeys, type Me } from "./me";
import type { Patient } from "./patients";

/**
 * At the visit (docs/DESIGN.md §9): the provider app shows a code made for this one patient, almanac
 * scans it and shows the share back as a loop of codes, and the provider app reads them — then opens
 * the share for the first opening, as long as the patient chose.
 */

/** One pairing, made for the patient in front of the provider. In memory only, until their share is read. */
export interface Pairing {
  provider: KeyPair;
  firstOpening: KeyPair;
  code: string;
  check: string;
}

/**
 * A code for the patient in front of us, signed with the clinic's identity key and carrying the
 * registry's attestation for it. Both are needed: almanac will not make a share for a clinic it
 * cannot verify, so an app with no attestation can show no code.
 */
export function newPairing(me: Me): Pairing {
  const provider = newKeyPair();
  const firstOpening = newKeyPair();
  const { identitySecret, attestation } = meKeys(me);
  return {
    provider,
    firstOpening,
    code: pairingCode({
      providerKey: provider.publicKey,
      firstOpeningKey: firstOpening.publicKey,
      attestation,
      signature: signPairing(identitySecret, provider.publicKey, firstOpening.publicKey),
      name: me.name,
    }),
    check: checkDigits(provider.publicKey),
  };
}

/** The codes of almanac's loop, as the camera reads them — in any order, and as often as they come round. */
export class CodeCollector {
  private frames: Frame[] = [];

  /**
   * The share once every code of it is read, or how many are so far. Throws ShareError "format" for a
   * code that isn't a share's, and "damaged" for codes that don't go back together — then starts over.
   */
  add(code: string): { bytes: Uint8Array } | { read: number; of: number } {
    const frame = readFrame(code);
    this.frames.push(frame);
    let bytes: Uint8Array | null;
    try {
      bytes = joinFrames(this.frames);
    } catch (e) {
      this.frames = [];
      throw e;
    }
    if (bytes) return { bytes };
    const read = new Set(this.frames.filter((f) => f.tag === frame.tag && f.total === frame.total).map((f) => f.index));
    return { read: read.size, of: frame.total };
  }
}

/** An opening: the share's key while the patient allows it. In memory only, and never past `until`. */
export interface Opening {
  shareKey: Uint8Array;
  until: number;
  /**
   * The blob this opening is for, fetched when the approval named one (docs/DESIGN.md §9) — what the
   * patient chose to share as it stood when they allowed it. Without one, the copy read at the visit
   * is opened instead. In memory like the key, and never written anywhere.
   */
  payload?: Uint8Array;
}

/**
 * Reads a share at the visit: the patient to keep, the first opening, and the six digits of the
 * second check — over the pair key, which only exists once this app holds almanac's key and almanac
 * holds this app's. Both screens show it, and they differ if anything came between them.
 *
 * Throws ShareError when it can't.
 */
export function readVisit(bytes: Uint8Array, pairing: Pairing, label: string, now: number): { patient: Patient; opening: Opening; check: string } {
  const received = readShare(bytes, pairing.provider);
  if (received.header.ends <= now) throw new ShareError("format", "a share that has ended");
  const shareKey = unmaskShareKey(received.firstApproval, pairing.firstOpening, received.header.senderKey);
  // Opened once here, and let go, so a share that doesn't open is refused at the visit, not later.
  openStored(received.stored, shareKey);
  return {
    patient: {
      id: hex(received.header.id),
      label: label.trim(),
      read: now,
      ends: received.header.ends,
      pairing: hex(pairing.provider.secretKey),
      sender: hex(received.header.senderKey),
      stored: hex(received.stored),
    },
    opening: { shareKey, until: received.firstApproval.until },
    check: pairDigits(received.pair),
  };
}

/** What a patient's share holds, opened with the key of an opening. Held only by the screen that shows it. */
export async function openSelection(patient: Patient, opening: Opening): Promise<Selection> {
  const { header, payload } = openStored(opening.payload ?? fromHex(patient.stored), opening.shareKey);
  if (hex(header.id) !== patient.id) throw new ShareError("damaged", "another share");
  return decodeSelection(payload);
}
