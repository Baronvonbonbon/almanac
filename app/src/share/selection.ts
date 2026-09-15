import { text, utf8 } from "../lib/bytes";
import { ShareError } from "./errors";

/**
 * What a share holds (docs/DESIGN.md §9): the days in a date range, with only the categories the
 * patient chose, and a little worked out from them. It travels as JSON, compressed, inside a sealed
 * share. Kept free of almanac's own types, since the provider app reads it too.
 */

export const CATEGORIES = ["periods", "symptoms", "mood", "notes", "fertileWindow", "ttc", "pregnancy"] as const;
export type Category = (typeof CATEGORIES)[number];

/** On in every new share: periods and symptoms. Everything more personal starts off. */
export const DEFAULT_CATEGORIES: readonly Category[] = ["periods", "symptoms"];

export interface SharedDay {
  flow?: "spotting" | "light" | "medium" | "heavy";
  symptoms?: string[];
  mood?: string[];
  energy?: number;
  note?: string;
  fertility?: { lhTest?: "negative" | "positive"; temperatureC?: number; fluid?: "dry" | "sticky" | "creamy" | "watery" | "eggwhite" };
  intimacy?: { protected?: boolean };
}

export interface Selection {
  v: 1;
  from: string;
  to: string;
  /** The day the share was made. */
  made: string;
  categories: Category[];
  /** Only days with something left in them once the categories not chosen are taken out. */
  days: Record<string, SharedDay>;
  /**
   * Periods: each period that started in the range; how long it lasted, if its days were logged; and
   * the cycle's length, once the next period began in the range too.
   */
  cycles?: { start: string; period?: number; length?: number }[];
  /** Periods: the usual lengths the patient gave, if they gave them. */
  usual?: { cycle?: number; period?: number };
  /** Fertile window: almanac's current estimate — always an estimate. */
  fertile?: { start: string; end: string; ovulation: string };
  /** Pregnancy: the first day of the last period, which the weeks are counted from. */
  pregnancy?: { since: string };
}

/** Far more than any share holds: a share claiming more is refused rather than unpacked. */
const MAX_UNPACKED = 1024 * 1024;

export async function encodeSelection(selection: Selection): Promise<Uint8Array> {
  const stream = new Response(utf8(JSON.stringify(selection)).slice()).body!.pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodeSelection(bytes: Uint8Array): Promise<Selection> {
  let json: string;
  try {
    json = text(await unpack(bytes));
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError("damaged", "the selection does not unpack");
  }
  let s: Partial<Selection> | null;
  try {
    s = JSON.parse(json) as Partial<Selection> | null;
  } catch {
    throw new ShareError("damaged", "the selection is not readable");
  }
  if (typeof s !== "object" || s === null || typeof s.v !== "number") throw new ShareError("damaged", "not a selection");
  if (s.v > 1) throw new ShareError("newer", "a selection from a newer almanac");
  const ok =
    typeof s.from === "string" &&
    typeof s.to === "string" &&
    typeof s.made === "string" &&
    Array.isArray(s.categories) &&
    s.categories.every((c) => (CATEGORIES as readonly string[]).includes(c)) &&
    typeof s.days === "object" &&
    s.days !== null;
  if (!ok) throw new ShareError("damaged", "not a selection");
  return s as Selection;
}

/** Inflates, stopping at MAX_UNPACKED. */
async function unpack(bytes: Uint8Array): Promise<Uint8Array> {
  const reader = new Response(bytes.slice()).body!.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_UNPACKED) {
      await reader.cancel();
      throw new ShareError("too-large", "a selection larger than any share holds");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
