import { blake2b256, concatBytes } from "@parity/product-sdk-crypto";
import { fromBase32, toBase32 } from "../lib/base32";
import { ShareError } from "./errors";

/**
 * A share at the visit, as a loop of codes (docs/DESIGN.md §9). Each code says where it goes, how many
 * there are, and carries a tag worked out from the whole share, so codes from two shares never mix and
 * a share put back together wrongly is caught. Only digits, capital letters, ":" and "/": the
 * characters a QR code packs most tightly.
 *
 *   ALMANAC:S:3/6:K7Q29XMA:<base32>
 */

export const FRAME_PREFIX = "ALMANAC:S:";
/** Bytes per code: 640 characters of base32, about a version 20 code, which a phone reads off a screen. */
export const FRAME_BYTES = 400;
const MAX_FRAMES = 99;
const FRAME = /^ALMANAC:S:(\d{1,2})\/(\d{1,2}):([0-9A-Z]{8}):([0-9A-Z]+)$/;

export interface Frame {
  index: number;
  total: number;
  tag: string;
  chunk: Uint8Array;
}

const tagOf = (bytes: Uint8Array): string => toBase32(blake2b256(bytes).subarray(0, 5));

export function toFrames(bytes: Uint8Array, per = FRAME_BYTES): string[] {
  const total = Math.ceil(bytes.length / per);
  if (total > MAX_FRAMES) throw new ShareError("too-large", "more than a loop of codes can carry");
  const tag = tagOf(bytes);
  return Array.from({ length: total }, (_, i) => `${FRAME_PREFIX}${i + 1}/${total}:${tag}:${toBase32(bytes.subarray(i * per, (i + 1) * per))}`);
}

export function readFrame(code: string): Frame {
  const m = FRAME.exec(code);
  const index = Number(m?.[1]);
  const total = Number(m?.[2]);
  if (!m || index < 1 || index > total) throw new ShareError("format", "not a share's code");
  try {
    return { index, total, tag: m[3], chunk: fromBase32(m[4]) };
  } catch {
    throw new ShareError("format", "not a share's code");
  }
}

/**
 * The share, once every code of it has been read — or `null` while some are missing. Codes may come
 * in any order and more than once; those of another share than the last code read are left out.
 */
export function joinFrames(frames: Frame[]): Uint8Array | null {
  const last = frames.at(-1);
  if (!last) return null;
  const chunks = new Map<number, Uint8Array>();
  for (const f of frames) if (f.tag === last.tag && f.total === last.total) chunks.set(f.index, f.chunk);
  if (chunks.size < last.total) return null;
  const bytes = concatBytes(...Array.from({ length: last.total }, (_, i) => chunks.get(i + 1)!));
  if (tagOf(bytes) !== last.tag) throw new ShareError("damaged", "the codes did not go back together");
  return bytes;
}
