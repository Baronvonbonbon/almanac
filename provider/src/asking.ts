import { hex } from "@app/lib/bytes";
import type { Host } from "@app/platform";
import { newKeyPair, packSlots, REQUEST_BYTES, REQUESTS_CHANNEL, sealRequest, TOPICS, topicsFor } from "@app/share";
import type { Vault } from "@app/vault";
import { patientKeys, readPatients, setAsking, type Patient } from "./patients";

/**
 * Asking a patient to open their share again (docs/DESIGN.md §9). Each request has an opening key of
 * its own and goes out in the provider app's one requests statement — always 512 bytes, replaced whole
 * — on the patient's own request topic. A statement has four topics, so the app waits on four patients
 * at most at once.
 */

export const MAX_WAITING = TOPICS;
/** As long as the store allows (P9): the patient answers whenever they next open almanac. */
const LIFETIME_MS = 90 * 86_400_000;

export class TooManyWaiting extends Error {
  constructor() {
    super("waiting on four patients already");
  }
}

/** The requests statement: one request for each patient asked and not yet answered, the newest first. */
export function requestsStatement(patients: Patient[], now: number): { data: Uint8Array; topics: Uint8Array[] } {
  const asking = patients
    .filter((p) => p.asking && p.ends > now)
    .sort((a, b) => b.asking!.asked - a.asking!.asked)
    .slice(0, MAX_WAITING);
  const sealed: Uint8Array[] = [];
  const topics: Uint8Array[] = [];
  for (const p of asking) {
    const keys = patientKeys(p);
    sealed.push(sealRequest(keys.pair, keys.id, keys.asking!.publicKey, p.asking!.asked));
    topics.push(keys.pair.requestTopic);
  }
  return { data: packSlots(sealed, REQUEST_BYTES), topics: topicsFor(topics) };
}

/** Asks a patient to open their share again, with a new opening key — replacing any earlier ask of theirs. */
export async function ask(host: Host, vault: Vault, id: string, now = Date.now()): Promise<void> {
  if (!host.statements) throw new Error("the statement store isn't available here");
  const others = (await readPatients(vault)).filter((p) => p.id !== id && p.asking && p.ends > now);
  if (others.length >= MAX_WAITING) throw new TooManyWaiting();
  await setAsking(vault, id, { key: hex(newKeyPair().secretKey), asked: now });
  const { data, topics } = requestsStatement(await readPatients(vault), now);
  await host.statements.publish({ channel: REQUESTS_CHANNEL, topics, data, expires: now + LIFETIME_MS });
}
