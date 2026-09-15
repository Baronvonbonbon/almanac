import { fromHex, hex } from "@app/lib/bytes";
import {
  checkDigits,
  decodeSelection,
  joinFrames,
  newKeyPair,
  openStored,
  pairingCode,
  readFrame,
  readShare,
  ShareError,
  unmaskShareKey,
  type Frame,
  type KeyPair,
  type Selection,
} from "@app/share";
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

export function newPairing(name: string): Pairing {
  const provider = newKeyPair();
  const firstOpening = newKeyPair();
  return {
    provider,
    firstOpening,
    code: pairingCode({ providerKey: provider.publicKey, firstOpeningKey: firstOpening.publicKey, name }),
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
}

/** Reads a share at the visit: the patient to keep, and the first opening. Throws ShareError when it can't. */
export function readVisit(bytes: Uint8Array, pairing: Pairing, label: string, now: number): { patient: Patient; opening: Opening } {
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
  };
}

/** What a patient's share holds, opened with the key of an opening. Held only by the screen that shows it. */
export async function openSelection(patient: Patient, shareKey: Uint8Array): Promise<Selection> {
  const { header, payload } = openStored(fromHex(patient.stored), shareKey);
  if (hex(header.id) !== patient.id) throw new ShareError("damaged", "another share");
  return decodeSelection(payload);
}
